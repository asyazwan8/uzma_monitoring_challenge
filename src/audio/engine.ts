import type { CueName, CueParams, MusicMode } from "./cues";
import { clamp, prng, rampTo, registerFx } from "./dsp";
import { Sequencer } from "./music";
import { CUE_VOICES, STING_SECONDS } from "./sfx";

/**
 * The display's sound system: one AudioContext, one master chain, a music
 * sequencer and phase-scoped cue scheduling. It plays on the big screen only.
 *
 * The context is created as soon as the display mounts, not on a gesture: the
 * booth kiosk runs Chrome with --autoplay-policy=no-user-gesture-required, so it
 * starts 'running' with nobody touching the screen. Elsewhere it starts
 * suspended and the first click, tap or key press resumes it.
 *
 * While the context is not running every cue and music step is dropped, never
 * queued, so nothing bursts out on unlock; music then starts fresh.
 *
 *   music voices (+ music reverb, delay) -> music bus -> duck -+
 *   cues -> phase gain (+ phase reverb send) -> sfx bus -------+-> sum
 *   sum -> highpass 35 Hz -> compressor (glue) -> master (volume, mute)
 *       -> soft clip -> out
 *
 * Audio errors never escape: a broken sound must not break a game.
 */

export type AudioStatus = "off" | "locked" | "running";

export interface MasterChain {
  /** Music input (bus gain ~0.3, then the duck gain). */
  music: GainNode;
  /** Sound-effect input (bus gain ~0.6). */
  sfx: GainNode;
  /** Unity send into the sound-effect reverb (its return joins the sfx bus). */
  sfxReverb: GainNode;
  duck: GainNode;
  /** Volume and mute. */
  master: GainNode;
  /** Every node the chain made, for teardown. */
  nodes: AudioNode[];
}

const MUSIC_BUS = 0.42;
const SFX_BUS = 0.6;
const DEFAULT_VOLUME = 0.9;
/** Duck levels by reason; the music sits at the minimum of the active ones. */
const DUCK = { reveal: 0.5, sting: 0.5 };
/**
 * How late a cue may be and still play (clamped to now). A normal transition
 * gets a generous allowance, because the hook schedules after React commits and
 * paints, and a slow frame must not swallow the 'go' sting. Catching up on a
 * phase already under way (a reload mid-phase) uses the tight one, so stale cues
 * are dropped rather than bunched up.
 */
export const LATE_ALLOW_S = 1;
export const CATCH_UP_ALLOW_S = 0.15;
const LOG_SIZE = 64;

/**
 * Linear up to 0.7, then a tanh knee that never passes 0.92. The WaveShaper
 * clamps its input to [-1, 1], so the output peak is bounded whatever arrives.
 */
function softClipCurve(points = 2049): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(points);
  const knee = 0.7;
  const room = 0.3;
  for (let i = 0; i < points; i++) {
    const x = (i / (points - 1)) * 2 - 1;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    curve[i] = Math.sign(x) * Math.min(0.92, y);
  }
  return curve;
}

/** About 2 s of stereo noise with an exponential (-60 dB) decay. */
function reverbImpulse(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    const rnd = prng(0xec40 + ch);
    for (let i = 0; i < len; i++) {
      const fadeIn = Math.min(1, i / (ctx.sampleRate * 0.005));
      data[i] = (rnd() * 2 - 1) * Math.exp((-6.9 * i) / len) * fadeIn;
    }
  }
  return buf;
}

/**
 * Build the whole output chain into `dest` and register the shared reverb and
 * delay for this context. Used by the realtime engine and by offline renders.
 */
export function buildMasterChain(ctx: BaseAudioContext, dest: AudioNode): MasterChain {
  const nodes: AudioNode[] = [];
  const gain = (value: number) => {
    const g = ctx.createGain();
    g.gain.value = value;
    nodes.push(g);
    return g;
  };
  const filter = (type: BiquadFilterType, freq: number, q = Math.SQRT1_2) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    nodes.push(f);
    return f;
  };

  const sum = gain(1);
  const music = gain(MUSIC_BUS);
  const duck = gain(1);
  const sfx = gain(SFX_BUS);
  music.connect(duck).connect(sum);
  sfx.connect(sum);

  const hp = filter("highpass", 35);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 6;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.2;
  nodes.push(comp);
  const master = gain(DEFAULT_VOLUME);
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = "2x";
  nodes.push(clip);
  sum.connect(hp).connect(comp).connect(master).connect(clip).connect(dest);

  // Shared reverb: one impulse, two high-passed convolvers. The music return
  // feeds the music bus (so it sits under the bus gain and the duck like the dry
  // music) and the sfx return feeds the sfx bus.
  const impulse = reverbImpulse(ctx);
  const reverbBus = (returnTo: AudioNode, level: number) => {
    const input = gain(1);
    const conv = ctx.createConvolver();
    conv.buffer = impulse;
    nodes.push(conv);
    input.connect(filter("highpass", 300)).connect(conv).connect(gain(level)).connect(returnTo);
    return input;
  };
  const reverbIn = reverbBus(sfx, 0.6);
  const musicReverbIn = reverbBus(music, 1);

  // Ping-pong dotted-8th delay (0.375 s at 120 bpm), wet into the music bus.
  const delayIn = gain(1);
  delayIn.channelCount = 1;
  delayIn.channelCountMode = "explicit";
  const left = ctx.createDelay(1);
  const right = ctx.createDelay(1);
  left.delayTime.value = 0.375;
  right.delayTime.value = 0.375;
  const merge = ctx.createChannelMerger(2);
  nodes.push(left, right, merge);
  const feedback = gain(0.35);
  const tone = filter("lowpass", 3500);
  delayIn.connect(left);
  left.connect(merge, 0, 0);
  left.connect(right);
  right.connect(merge, 0, 1);
  right.connect(tone).connect(feedback).connect(left);
  merge.connect(gain(0.25)).connect(music);

  registerFx(ctx, { reverb: reverbIn, musicReverb: musicReverbIn, delay: delayIn });
  return { music, sfx, sfxReverb: reverbIn, duck, master, nodes };
}

export interface CueLogEntry {
  cue: CueName;
  /** Audio time it was scheduled for. */
  at: number;
  /** The same moment on the wall clock. */
  wallMs: number;
  params?: CueParams;
}

type AudioCtor = typeof AudioContext;

function audioContextCtor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;

function quiet(fn: () => void): void {
  try {
    fn();
  } catch {
    // Audio must never take the game down.
  }
}

export class GameAudio {
  /** Recently scheduled cues, newest last; filled only when `debug` is on. */
  readonly log: CueLogEntry[] = [];
  debug = false;

  private ctx: AudioContext | null = null;
  private meter: AnalyserNode | null = null;
  private meterBuf: Float32Array<ArrayBuffer> | null = null;
  private chain: MasterChain | null = null;
  private seq: Sequencer | null = null;
  private mode: MusicMode = { kind: "silent" };
  private phaseGain: GainNode | null = null;
  /** The current phase's reverb send, faded with phaseGain on a phase change. */
  private phaseSend: GainNode | null = null;
  private phaseId: string | null = null;
  private phaseSources: AudioScheduledSourceNode[] = [];
  private stings: Array<[number, number]> = [];
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  private duckReveal = false;
  private duckLevel = 1;
  private _muted = false;
  private _volume = DEFAULT_VOLUME;
  private unlockArmed = false;
  private disposed = false;
  private listeners = new Set<() => void>();

  get status(): AudioStatus {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "closed") return "off";
    return ctx.state === "running" ? "running" : "locked";
  }

  get muted(): boolean {
    return this._muted;
  }

  get volume(): number {
    return this._volume;
  }

  /** Current audio clock, or 0 with no context. */
  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** RMS of the output right now (0 when silent, locked or muted). */
  level(): number {
    if (!this.meter || !this.meterBuf || this.ctx?.state !== "running") return 0;
    this.meter.getFloatTimeDomainData(this.meterBuf);
    let sum = 0;
    for (const v of this.meterBuf) sum += v * v;
    return Math.sqrt(sum / this.meterBuf.length);
  }

  /** Primitive snapshot for useSyncExternalStore. */
  get snapshot(): string {
    return `${this.status}|${this._muted ? 1 : 0}|${this._volume}`;
  }

  /** Create the context now (not on a gesture). Idempotent; safe under StrictMode. */
  init(): void {
    if (this.disposed) return;
    if (this.ctx && this.ctx.state !== "closed") {
      if (this.status !== "running") this.armUnlock();
      return;
    }
    const Ctor = audioContextCtor();
    if (!Ctor) return;
    quiet(() => {
      const ctx = new Ctor({ latencyHint: "interactive" });
      this.ctx = ctx;
      this.chain = buildMasterChain(ctx, ctx.destination);
      this.chain.master.gain.value = this._muted ? 0 : this._volume;
      // Output meter (a passive tap) so tests and staff can confirm sound is really playing.
      this.meter = ctx.createAnalyser();
      this.meter.fftSize = 2048;
      this.meterBuf = new Float32Array(this.meter.fftSize);
      this.chain.master.connect(this.meter);
      this.seq = new Sequencer(ctx, this.chain.music);
      this.seq.setMode(this.mode);
      this.beginPhase("boot");
      ctx.addEventListener("statechange", this.onStateChange);
      this.onStateChange();
    });
  }

  /** Resume on the next click, tap or key press (capture phase, fire-and-forget). */
  armUnlock(): void {
    if (this.unlockArmed || typeof window === "undefined" || !this.ctx) return;
    this.unlockArmed = true;
    for (const ev of UNLOCK_EVENTS) window.addEventListener(ev, this.unlock, { capture: true, passive: true });
  }

  /** Subscribe to status, mute and volume changes. Returns the unsubscribe. */
  onStatusChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  setMuted(muted: boolean): void {
    if (muted === this._muted) return;
    this._muted = muted;
    this.applyMaster();
  }

  toggleMute(): void {
    this.setMuted(!this._muted);
  }

  setVolume(volume: number): void {
    const v = clamp(Number.isFinite(volume) ? volume : DEFAULT_VOLUME, 0, 1);
    if (v === this._volume) return;
    this._volume = v;
    this.applyMaster();
  }

  /**
   * Start a new phase: cues already scheduled for the previous phase fade out in
   * ~10 ms and their sources stop, so an early answer cancels pending ticks.
   */
  beginPhase(key: string): void {
    if (!this.ctx || !this.chain || key === this.phaseId) return;
    this.phaseId = key;
    quiet(() => this.freshPhaseNodes());
  }

  /**
   * Play `cue` at audio time `at` in the current phase, never earlier than now.
   * Dropped while not running, or when it is more than `allowLateS` overdue.
   */
  schedule(cue: CueName, at: number, params?: CueParams, allowLateS = LATE_ALLOW_S): void {
    const ctx = this.ctx;
    const dest = this.phaseGain;
    if (!ctx || !dest || ctx.state !== "running") return;
    quiet(() => {
      const now = ctx.currentTime;
      if (!Number.isFinite(at) || at < now - allowLateS) return;
      const t = Math.max(at, now);
      this.phaseSources.push(...CUE_VOICES[cue](ctx, dest, t, params, this.phaseSend));
      const sting = STING_SECONDS[cue];
      if (sting) this.addSting(t, t + sting);
      if (this.debug) {
        this.log.push({ cue, at: t, wallMs: Date.now() + (t - now) * 1000, params });
        if (this.log.length > LOG_SIZE) this.log.splice(0, this.log.length - LOG_SIZE);
      }
    });
  }

  /** Play a cue right now (audio lab, ad-hoc sounds). */
  play(cue: CueName, params?: CueParams): void {
    this.schedule(cue, this.currentTime + 0.01, params);
  }

  /** Convert a Date.now()-based time (the game's clock) to audio time. */
  wallToAudioTime(wallMs: number): number {
    return this.currentTime + (wallMs - Date.now()) / 1000;
  }

  /** Requested background music; the sequencer switches at the next bar line. */
  setMusic(mode: MusicMode): void {
    this.mode = mode;
    quiet(() => this.seq?.setMode(mode));
  }

  /** Move the music's bar grid so a bar line falls at audio time `at` (the live window's start). */
  alignMusic(at: number): void {
    if (Number.isFinite(at)) quiet(() => this.seq?.realign(at));
  }

  /** Hold the music down for a reason (the reveal); stings duck on their own. */
  duck(reason: "reveal", on: boolean): void {
    if (reason === "reveal" && on !== this.duckReveal) {
      this.duckReveal = on;
      quiet(() => this.applyDuck());
    }
  }

  /** Tear everything down (HMR). The instance is unusable afterwards. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    quiet(() => this.seq?.stop());
    this.clearDuckTimer();
    this.disarmUnlock();
    const ctx = this.ctx;
    if (ctx) {
      ctx.removeEventListener("statechange", this.onStateChange);
      quiet(() => void ctx.close().catch(() => undefined));
    }
    this.ctx = null;
    this.chain = null;
    this.seq = null;
    this.phaseGain = null;
    this.phaseSend = null;
    this.emit();
    this.listeners.clear();
  }

  private readonly onStateChange = (): void => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "running") {
      this.disarmUnlock();
      quiet(() => {
        this.seq?.setMode(this.mode);
        this.seq?.start(ctx.currentTime + 0.05);
      });
    } else {
      quiet(() => this.seq?.stop());
      // Cues already placed on the (now frozen) audio clock would fire late after
      // a resume, out of step with the visuals: flush them, keeping the phase id.
      if (ctx.state !== "closed") {
        quiet(() => this.freshPhaseNodes());
        this.armUnlock();
      }
    }
    this.emit();
  };

  private readonly unlock = (): void => {
    const ctx = this.ctx;
    if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
    // Fire and forget: resume() can stay pending for ever without a gesture.
    quiet(() => void ctx.resume().catch(() => undefined));
  };

  private disarmUnlock(): void {
    if (!this.unlockArmed || typeof window === "undefined") return;
    this.unlockArmed = false;
    for (const ev of UNLOCK_EVENTS) window.removeEventListener(ev, this.unlock, { capture: true });
  }

  private applyMaster(): void {
    const ctx = this.ctx;
    const chain = this.chain;
    if (ctx && chain) quiet(() => rampTo(ctx, chain.master.gain, this._muted ? 0 : this._volume, 0.03));
    this.emit();
  }

  /**
   * Fade out and stop everything scheduled on the current phase nodes (dry and
   * reverb send together, ~10 ms) and put fresh ones in their place.
   */
  private freshPhaseNodes(): void {
    const ctx = this.ctx;
    const chain = this.chain;
    if (!ctx || !chain) return;
    const now = ctx.currentTime;
    for (const old of [this.phaseGain, this.phaseSend]) {
      if (!old) continue;
      old.gain.cancelScheduledValues(now);
      old.gain.setTargetAtTime(0, now, 0.003);
      setTimeout(() => quiet(() => old.disconnect()), 120);
    }
    // Stop only once the fade has done its work, so nothing is cut mid-wave.
    for (const s of this.phaseSources) quiet(() => s.stop(now + 0.03));
    const g = ctx.createGain();
    g.connect(chain.sfx);
    const send = ctx.createGain();
    send.connect(chain.sfxReverb);
    this.phaseGain = g;
    this.phaseSend = send;
    this.phaseSources = [];
    this.stings = [];
    this.applyDuck();
  }

  private addSting(start: number, end: number): void {
    this.stings.push([start, end]);
    this.applyDuck();
  }

  private clearDuckTimer(): void {
    if (this.duckTimer !== null) clearTimeout(this.duckTimer);
    this.duckTimer = null;
  }

  /**
   * Set the duck to the minimum over the active reasons, then re-arm one timer
   * for the next sting boundary. currentTime advances in audio-callback steps, so
   * a timer can wake just before a boundary; re-arming every time means the duck
   * always catches up instead of sticking.
   */
  private applyDuck(): void {
    this.clearDuckTimer();
    const ctx = this.ctx;
    const chain = this.chain;
    if (!ctx || !chain) return;
    const now = ctx.currentTime;
    const lead = 0.05;
    this.stings = this.stings.filter(([, b]) => b > now);
    let target = 1;
    if (this.duckReveal) target = Math.min(target, DUCK.reveal);
    if (this.stings.some(([a]) => a <= now + lead)) target = Math.min(target, DUCK.sting);
    if (target !== this.duckLevel) {
      const tau = target < this.duckLevel ? 0.03 : 0.3;
      this.duckLevel = target;
      rampTo(ctx, chain.duck.gain, target, tau);
    }
    if (!this.stings.length || ctx.state !== "running") return;
    const next = Math.min(...this.stings.map(([a, b]) => (a > now + lead ? a - lead : b)));
    this.duckTimer = setTimeout(
      () => {
        this.duckTimer = null;
        quiet(() => this.applyDuck());
      },
      Math.max(0, (next - now) * 1000) + 20,
    );
  }

  private emit(): void {
    for (const cb of this.listeners) quiet(cb);
  }
}

declare global {
  interface Window {
    /** The display's audio engine (tests read `status` and `log`). */
    __mcAudio?: GameAudio;
  }
}

type AudioGlobal = typeof globalThis & { __mcAudio?: GameAudio };

// A re-evaluated module (Turbopack HMR) disposes the previous instance first, so
// an edit never leaves two contexts playing.
if (typeof window !== "undefined") {
  const g = globalThis as AudioGlobal;
  if (g.__mcAudio) quiet(() => g.__mcAudio!.dispose());
  g.__mcAudio = undefined;
}

/** The shared engine; null on the server or where Web Audio is unavailable. */
export function getGameAudio(): GameAudio | null {
  if (!audioContextCtor()) return null;
  const g = globalThis as AudioGlobal;
  if (!g.__mcAudio) g.__mcAudio = new GameAudio();
  return g.__mcAudio;
}

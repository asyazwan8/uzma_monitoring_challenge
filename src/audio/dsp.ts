/**
 * Small Web Audio building blocks shared by the cues and the music. Everything
 * takes a BaseAudioContext so the same code renders in realtime and offline.
 *
 * A Voice owns the nodes of one note or one cue: it creates only what that sound
 * needs, returns its sources (so a phase change can stop them) and disconnects
 * every node once the last source has ended.
 */

/** Floor for exponential ramps, which cannot reach 0. About -80 dB. */
export const FLOOR = 0.0001;

export function midiHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Tiny deterministic PRNG (mulberry32), so offline renders are repeatable. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic 0..1 from two integers (bar, step), for sparse generative choices. */
export function hash01(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** One second of white noise per context, shared by every noisy sound. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rnd = prng(0x5eed);
    for (let i = 0; i < data.length; i++) data[i] = rnd() * 2 - 1;
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Shared effect sends, created by buildMasterChain. */
export interface Fx {
  /**
   * Unity send into the sound-effect reverb, whose return feeds the sfx bus. The
   * realtime engine hands cues a per-phase send in front of it instead, so a
   * phase change fades the wet path together with the dry one.
   */
  reverb: AudioNode;
  /** Unity send into the music reverb, whose return feeds the music bus (so it ducks). */
  musicReverb: AudioNode;
  /** Ping-pong dotted-8th delay; its wet return feeds the music bus. */
  delay: AudioNode;
}

const fxCache = new WeakMap<BaseAudioContext, Fx>();

export function registerFx(ctx: BaseAudioContext, fx: Fx): void {
  fxCache.set(ctx, fx);
}

/** The context's shared effects, or null when no master chain was built (sends are skipped). */
export function fxFor(ctx: BaseAudioContext): Fx | null {
  return fxCache.get(ctx) ?? null;
}

/**
 * Move a param smoothly from wherever it is now. cancelScheduledValues alone can
 * make Chrome jump back to the last set value, so hold the current value first.
 */
export function rampTo(ctx: BaseAudioContext, param: AudioParam, target: number, tau: number): void {
  const now = ctx.currentTime;
  if (typeof param.cancelAndHoldAtTime === "function") {
    param.cancelAndHoldAtTime(now);
  } else {
    const v = param.value;
    param.cancelScheduledValues(now);
    param.setValueAtTime(v, now);
  }
  param.setTargetAtTime(target, now, tau);
}

/** Exponential attack then exponential decay to FLOOR. Returns the end time. */
export function pluck(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  p.setValueAtTime(FLOOR, t);
  p.exponentialRampToValueAtTime(Math.max(FLOOR, peak), t + attack);
  p.exponentialRampToValueAtTime(FLOOR, t + attack + decay);
  return t + attack + decay;
}

/** Swell to peak, hold, then release with time constant tau. Returns when it is inaudible. */
export function swell(p: AudioParam, t: number, peak: number, attack: number, holdUntil: number, tau: number): number {
  const top = Math.max(FLOOR, peak);
  const hold = Math.max(holdUntil, t + attack);
  p.setValueAtTime(FLOOR, t);
  p.exponentialRampToValueAtTime(top, t + attack);
  p.setValueAtTime(top, hold);
  p.setTargetAtTime(FLOOR, hold, tau);
  return hold + tau * 6;
}

export class Voice {
  readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private live = 0;

  constructor(readonly ctx: BaseAudioContext) {}

  gain(dest: AudioNode, value = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    g.connect(dest);
    this.nodes.push(g);
    return g;
  }

  /** A gain feeding an AudioParam, e.g. an LFO depth. */
  modulate(param: AudioParam, depth: number): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = depth;
    g.connect(param);
    this.nodes.push(g);
    return g;
  }

  filter(dest: AudioNode, type: BiquadFilterType, freq: number, q = Math.SQRT1_2): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    f.connect(dest);
    this.nodes.push(f);
    return f;
  }

  /** Stereo placement; falls back to the destination where StereoPanner is missing. */
  pan(dest: AudioNode, pan: number): AudioNode {
    if (typeof this.ctx.createStereoPanner !== "function") return dest;
    const p = this.ctx.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    p.connect(dest);
    this.nodes.push(p);
    return p;
  }

  osc(dest: AudioNode, type: OscillatorType, freq: number, start: number, stop: number, detune = 0): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(dest);
    this.track(o, start, stop);
    return o;
  }

  /** Looping shared noise; `offset` picks where in the buffer it starts. */
  noise(dest: AudioNode, start: number, stop: number, offset = 0): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    s.buffer = noiseBuffer(this.ctx);
    s.loop = true;
    s.connect(dest);
    this.track(s, start, stop, ((offset % 1) + 1) % 1);
    return s;
  }

  /** A scaled copy of `from` into a shared effect, if the context has one. */
  send(from: AudioNode, to: AudioNode | null | undefined, amount: number): void {
    if (!to || amount <= 0) return;
    from.connect(this.gain(to, amount));
  }

  private track(src: AudioScheduledSourceNode, start: number, stop: number, offset?: number): void {
    this.live++;
    src.onended = () => {
      this.live--;
      if (this.live <= 0) this.release();
    };
    // Only buffer sources take an offset (no instanceof: it must run without Web Audio globals).
    if (offset !== undefined) (src as AudioBufferSourceNode).start(start, offset);
    else src.start(start);
    src.stop(Math.max(stop, start + 0.005));
    this.sources.push(src);
  }

  private release(): void {
    for (const n of [...this.sources, ...this.nodes]) {
      try {
        n.disconnect();
      } catch {
        // already disconnected
      }
    }
  }
}

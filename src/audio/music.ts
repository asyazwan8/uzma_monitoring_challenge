import type { MusicMode } from "./cues";
import { FLOOR, Voice, fxFor, hash01, midiHz, pluck, rampTo, swell } from "./dsp";

/**
 * Generative background music in D minor at a fixed 120 bpm, so the 15 s round
 * is seven and a half bars. scheduleRange is pure scheduling: given a time span it
 * places every note that starts inside it, which lets an OfflineAudioContext
 * render the same music the realtime Sequencer plays.
 *
 * attract  sparse pad and bells, 40 bars on then 4 bars of near-silence
 * game     pad, bass and arp; hats from intensity 2, a soft kick at 3. While the
 *          round is live the arp drops out, because it fights mental counting.
 * results  the pad resolves to D major.
 *
 * Kind and intensity changes wait for a bar line. Two exceptions: the live flag
 * applies on the next step (the arp must be gone when counting starts), and the
 * Sequencer restarts on 'results' so the bed lands with the D major sting
 * instead of a game chord ringing under it. The engine can also realign the bar
 * grid so a bar line falls on the start of the live window: the 15 s round
 * then spans seven and a half bars and the urgent ticks fall on beats, between the hats.
 */

export const BPM = 120;
/** One 16th note, in seconds. */
export const STEP = 60 / BPM / 4;
export const STEPS_PER_BAR = 16;
export const BAR = STEP * STEPS_PER_BAR;

interface Chord {
  /** Bass root (MIDI). */
  root: number;
  /** Voice-led pad tones (MIDI). */
  pad: number[];
  /** Arp/bell pool: chord tones plus the 9th, D4..D6. */
  pool: number[];
}

// MIDI: D2 38, F3 53, A3 57, C4 60, D4 62, E4 64.
const pool = (pcs: number[], lo = 62, hi = 86): number[] => {
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
};
// Pitch classes: C0 D2 E4 F5 F#6 G7 A9 Bb10 B11 C#1.
const DM9: Chord = { root: 38, pad: [53, 57, 60, 64], pool: pool([2, 5, 9, 0, 4]) };
const BBMAJ9: Chord = { root: 34, pad: [53, 57, 60, 62], pool: pool([10, 2, 5, 9, 0]) };
const GM11: Chord = { root: 31, pad: [53, 58, 60, 62], pool: pool([7, 10, 2, 5, 0]) };
const A7SUS4: Chord = { root: 33, pad: [55, 57, 62, 64], pool: pool([9, 2, 4, 7]) };
const BBMAJ7S11: Chord = { root: 34, pad: [53, 57, 62, 64], pool: pool([10, 2, 5, 9, 4]) };
const FMAJ9: Chord = { root: 41, pad: [55, 57, 60, 64], pool: pool([5, 9, 0, 4, 7]) };
const C69: Chord = { root: 36, pad: [55, 57, 62, 64], pool: pool([0, 4, 7, 9, 2]) };
const DMAJ9: Chord = { root: 38, pad: [54, 57, 61, 64], pool: pool([2, 6, 9, 1, 4]) };

const GAME_PROG = [DM9, BBMAJ9, GM11, A7SUS4];
const ATTRACT_PROG = [DM9, BBMAJ7S11, FMAJ9, C69];
// Starts on the chord the results sting plays; A7sus4 leads back round to it.
const RESULTS_PROG = [DMAJ9, DMAJ9, BBMAJ9, A7SUS4];

/** Attract cycle: this many bars playing, then the rest near-silent. */
const ATTRACT_ON_BARS = 40;
const ATTRACT_CYCLE_BARS = 44;

export interface StepState {
  /** Audio time of step 0. */
  anchor: number;
  /** Next 16th to schedule. */
  step: number;
  /** The mode currently playing (requests wait for a bar line). */
  mode: MusicMode;
  /** Bar at which the current mode kind began; progressions count from it. */
  modeBar: number;
  /**
   * A pending grid shift: from step `atStep` (a bar line) on, the anchor moves by
   * `delta` seconds. Steps of the old grid that would land at or after the moved
   * bar line are skipped, so a shortened bar never overlaps the next one.
   */
  shift?: { atStep: number; delta: number };
}

export function createStepState(anchor: number, mode: MusicMode, step = 0): StepState {
  return { anchor, step, mode, modeBar: Math.floor(step / STEPS_PER_BAR) };
}

function sameMode(a: MusicMode, b: MusicMode): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "game" && b.kind === "game") return a.intensity === b.intensity && a.live === b.live;
  return true;
}

/** Switch the playing mode to `mode` from bar `bar`; a new kind restarts its progression. */
function adopt(st: StepState, mode: MusicMode, bar: number): void {
  if (sameMode(st.mode, mode)) return;
  if (st.mode.kind !== mode.kind) st.modeBar = bar;
  st.mode = mode;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

/**
 * Plan a grid shift so that a bar line falls at audio time `at` (and therefore
 * every 2 s around it). The shift happens at the first bar line not yet
 * scheduled, stretching or shortening that bar by at most half a bar.
 */
export function alignTo(st: StepState, at: number): void {
  if (!Number.isFinite(at)) return;
  const frontier = st.anchor + st.step * STEP;
  let atStep = Math.ceil(st.step / STEPS_PER_BAR) * STEPS_PER_BAR;
  let delta = mod(at - (st.anchor + atStep * STEP), BAR);
  if (delta > BAR / 2) delta -= BAR;
  if (Math.abs(delta) < 0.002) {
    st.shift = undefined;
    return;
  }
  // A shortened bar must not start before what is already scheduled.
  if (st.anchor + atStep * STEP + delta < frontier - 1e-9) atStep += STEPS_PER_BAR;
  st.shift = { atStep, delta };
}

/** How far behind the clock the next step may be before the sequencer resyncs. */
export const LATE_RESYNC_S = 0.03;

/**
 * Late wake-up (background tab, GC pause): jump to the next step boundary rather
 * than scheduling the backlog in a burst. A jump across a bar line still applies
 * the requested mode (and any pending grid shift) there, as the bar line would.
 */
export function catchUp(st: StepState, now: number, mode: MusicMode): void {
  if (st.anchor + st.step * STEP >= now - LATE_RESYNC_S) return;
  const target = () => Math.ceil((now - st.anchor) / STEP - 1e-9);
  if (st.shift && target() >= st.shift.atStep) {
    st.step = Math.max(st.step, st.shift.atStep);
    st.anchor += st.shift.delta;
    st.shift = undefined;
  }
  const from = st.step;
  st.step = Math.max(st.step, target());
  const bar = Math.floor(st.step / STEPS_PER_BAR);
  if (bar !== Math.floor(from / STEPS_PER_BAR)) adopt(st, mode, bar);
}

/**
 * Schedule every note whose start falls in [fromSec, toSec). With no stepState
 * the grid starts at audio time 0 in `mode`. A requested mode that differs from
 * the playing one takes over at the next bar line.
 */
export function scheduleRange(
  ctx: BaseAudioContext,
  dest: AudioNode,
  mode: MusicMode,
  fromSec: number,
  toSec: number,
  stepState?: StepState,
): StepState {
  const st = stepState ?? createStepState(0, mode, Math.max(0, Math.ceil(fromSec / STEP - 1e-9)));
  for (;;) {
    if (st.shift && st.step >= st.shift.atStep) {
      st.anchor += st.shift.delta;
      st.shift = undefined;
    }
    const t = st.anchor + st.step * STEP;
    if (t >= toSec) break;
    if (st.shift && t >= st.anchor + st.shift.atStep * STEP + st.shift.delta - 1e-6) {
      // The tail of a shortened bar: skip straight to the moved bar line.
      st.step = st.shift.atStep;
      continue;
    }
    if (st.step % STEPS_PER_BAR === 0) adopt(st, mode, st.step / STEPS_PER_BAR);
    // The live flag does not wait for the bar line.
    if (st.mode.kind === "game" && mode.kind === "game" && st.mode.live !== mode.live) {
      st.mode = { ...st.mode, live: mode.live };
    }
    if (t >= fromSec - 1e-6) {
      const bar = Math.floor(st.step / STEPS_PER_BAR) - st.modeBar;
      playStep(ctx, dest, st.mode, st.step, bar, t);
    }
    st.step++;
  }
  return st;
}

function playStep(ctx: BaseAudioContext, dest: AudioNode, mode: MusicMode, step: number, bar: number, t: number): void {
  const s = step % STEPS_PER_BAR;
  switch (mode.kind) {
    case "silent":
      return;
    case "attract": {
      const cb = ((bar % ATTRACT_CYCLE_BARS) + ATTRACT_CYCLE_BARS) % ATTRACT_CYCLE_BARS;
      const chord = ATTRACT_PROG[Math.floor(cb / 2) % ATTRACT_PROG.length];
      if (cb < ATTRACT_ON_BARS) {
        if (s === 0 && cb % 2 === 0) {
          pad(ctx, dest, chord.pad, t, BAR * 2, { cutoff: 1100, level: 0.17, attack: 1.0 });
          bass(ctx, dest, chord.root, t, BAR * 2 - 0.1, 0.09);
        }
        // Sparse bells on 8ths, more often in the second half of each phrase.
        const p = s % 2 === 0 ? (cb % 8 < 4 ? 0.1 : 0.17) : 0;
        if (p > 0 && hash01(bar, s) < p) {
          const note = chord.pool[Math.floor(hash01(bar + 101, s) * chord.pool.length)];
          bell(ctx, dest, note, t, 0.16);
        }
      } else if (s === 0 && cb % 4 === 0) {
        // Near-silence: one soft bell every four bars keeps the room alive.
        bell(ctx, dest, chord.pool[Math.floor(hash01(bar, 7) * 4)], t, 0.08);
      }
      return;
    }
    case "game": {
      const { intensity, live } = mode;
      const chord = GAME_PROG[((bar % 4) + 4) % 4];
      if (s === 0) {
        pad(ctx, dest, chord.pad, t, BAR, { cutoff: 1200 + (1300 * intensity) / 3, level: 0.2 + 0.03 * intensity, attack: 0.7 });
      }
      if (intensity === 0) {
        if (s === 0) bass(ctx, dest, chord.root, t, BAR - 0.08, 0.1);
      } else if (s % 2 === 0) {
        bass(ctx, dest, chord.root + (s === 6 || s === 14 ? 12 : 0), t, STEP * 1.6, s === 0 ? 0.4 : 0.3);
      }
      if (!live && (intensity >= 1 || s % 2 === 0)) {
        const k = intensity === 0 ? Math.floor(step / 2) : step;
        arp(ctx, dest, chord.pool[arpIndex(k, chord.pool.length)], t, s % 4 === 0 ? 0.2 : 0.142);
      }
      if (intensity >= 2 && s % 4 === 2) hat(ctx, dest, t, step, live ? 0.1 : 0.08);
      if (intensity >= 3 && s % 8 === 0) kick(ctx, dest, t, 0.95);
      return;
    }
    case "results": {
      const chord = RESULTS_PROG[((bar % 4) + 4) % 4];
      if (s === 0) {
        pad(ctx, dest, chord.pad, t, BAR, { cutoff: 1800, level: 0.24, attack: 0.6 });
        bass(ctx, dest, chord.root, t, BAR - 0.08, 0.14);
      }
      if (chord === DMAJ9 && s % 4 === 0) bell(ctx, dest, chord.pool[arpIndex(step / 4, chord.pool.length)], t, 0.12);
      return;
    }
  }
}

/** Up-up-down walk through the pool: 0 1 2, 1 2 3, 2 3 4 ... wrapping at the top. */
export function arpIndex(k: number, len: number): number {
  const span = Math.max(1, len - 2);
  return (Math.floor(k / 3) % span) + (k % 3);
}

interface PadOpts {
  cutoff: number;
  level: number;
  attack: number;
}

/** Release time constant: about 1.8 s to inaudible. */
const PAD_TAU = 1.8 / 5;
/** Slow filter breathing: rate (Hz) and depth (fraction of the cutoff). */
const LFO_HZ = 0.11;
const LFO_DEPTH = 0.12;

/**
 * Per note: two saws +/-6 cents panned +/-0.4 and a triangle an octave down, into
 * one lowpass. The attack is linear (an exponential ramp from the floor stays
 * inaudible for half its length) and each pad holds through half of the next
 * one's attack, so chord changes cross-fade without a dip in level.
 */
function pad(ctx: BaseAudioContext, dest: AudioNode, notes: number[], t: number, dur: number, o: PadOpts): void {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  const hold = t + dur + o.attack * 0.5;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(o.level, t + o.attack);
  env.gain.setValueAtTime(o.level, hold);
  env.gain.setTargetAtTime(0, hold, PAD_TAU);
  const end = hold + PAD_TAU * 6;
  const lp = v.filter(env, "lowpass", o.cutoff, 0.5);
  // The filter breathes on the absolute clock, so consecutive pads share one
  // continuous LFO instead of each restarting it from phase 0.
  const breath = (x: number) => o.cutoff * (1 + LFO_DEPTH * Math.sin(2 * Math.PI * LFO_HZ * x));
  lp.frequency.setValueAtTime(breath(t), t);
  for (let x = t + 0.25; x < end + 0.25; x += 0.25) lp.frequency.linearRampToValueAtTime(breath(x), x);
  const left = v.pan(lp, -0.4);
  const right = v.pan(lp, 0.4);
  const per = 1 / notes.length;
  const sawL = v.gain(left, 0.32 * per);
  const sawR = v.gain(right, 0.32 * per);
  const tri = v.gain(lp, 0.45 * per);
  for (const m of notes) {
    const f = midiHz(m);
    v.osc(sawL, "sawtooth", f, t, end, -6);
    v.osc(sawR, "sawtooth", f, t, end, 6);
    v.osc(tri, "triangle", f / 2, t, end);
  }
}

/** Sine plus a -12 dB saw through a 350 Hz lowpass. */
function bass(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number, dur: number, level: number): void {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  const long = dur > 0.5;
  const end = long ? swell(env.gain, t, level, 0.04, t + dur - 0.3, 0.12) : pluck(env.gain, t, level, 0.008, dur);
  const lp = v.filter(env, "lowpass", 350, 0.7);
  const f = midiHz(midi);
  v.osc(lp, "sine", f, t, end);
  v.osc(v.gain(lp, 0.25), "sawtooth", f, t, end);
}

/** Triangle through 2.2 kHz, 0.14 s decay, into the ping-pong delay and a little reverb. */
function arp(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number, level: number): void {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  const end = pluck(env.gain, t, level, 0.004, 0.14);
  const lp = v.filter(env, "lowpass", 2200, 0.7);
  v.osc(lp, "triangle", midiHz(midi), t, end);
  const fx = fxFor(ctx);
  v.send(env, fx?.delay, 1);
  v.send(env, fx?.musicReverb, 0.2);
}

/** Soft glassy bell for the attract and results beds. */
function bell(ctx: BaseAudioContext, dest: AudioNode, midi: number, t: number, level: number): void {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  const end = pluck(env.gain, t, level, 0.005, 1.1);
  const f = midiHz(midi);
  v.osc(env, "triangle", f, t, end);
  v.osc(v.gain(env, 0.18), "sine", f * 2, t, end);
  const fx = fxFor(ctx);
  v.send(env, fx?.delay, 0.8);
  v.send(env, fx?.musicReverb, 0.35);
}

/** Shared noise, 8 kHz highpass, 35 ms. */
function hat(ctx: BaseAudioContext, dest: AudioNode, t: number, step: number, level: number): void {
  const v = new Voice(ctx);
  const env = v.gain(v.pan(dest, step % 8 === 2 ? -0.2 : 0.2));
  const end = pluck(env.gain, t, level, 0.002, 0.035);
  v.noise(v.filter(env, "highpass", 8000, 0.8), t, end, hash01(step, 3));
}

/** Sine dropping 140 -> 50 Hz over 70 ms, 220 ms decay. */
function kick(ctx: BaseAudioContext, dest: AudioNode, t: number, level: number): void {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  const end = pluck(env.gain, t, level, 0.003, 0.22);
  const o = v.osc(env, "sine", 140, t, end);
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(50, t + 0.07);
}

/**
 * Band-pass noise sweeping 500 -> 4000 Hz, swelling into the end of the live
 * window. The engine schedules it on the phase-scoped sfx path so an early
 * answer cancels it.
 */
export function riser(ctx: BaseAudioContext, dest: AudioNode, t: number, dur = 3): AudioScheduledSourceNode[] {
  const d = Math.max(0.1, dur);
  const v = new Voice(ctx);
  const env = v.gain(dest);
  env.gain.setValueAtTime(FLOOR, t);
  env.gain.exponentialRampToValueAtTime(0.16, t + d);
  env.gain.setTargetAtTime(FLOOR, t + d, 0.03);
  const bp = v.filter(env, "bandpass", 500, 2.2);
  bp.frequency.setValueAtTime(500, t);
  bp.frequency.exponentialRampToValueAtTime(4000, t + d);
  v.noise(bp, t, t + d + 0.25, 0.37);
  return v.sources;
}

/**
 * Realtime driver: every 25 ms it schedules the next 250 ms with scheduleRange.
 * A late wake-up (background tab, GC pause) resyncs to the next step boundary
 * instead of bursting the backlog.
 */
export class Sequencer {
  static readonly INTERVAL_MS = 25;
  static readonly HORIZON = 0.25;
  private timer: ReturnType<typeof setInterval> | null = null;
  private state: StepState | null = null;
  private out: GainNode | null = null;
  private mode: MusicMode = { kind: "silent" };
  /** A requested bar-line time, applied on the next tick. */
  private align: number | null = null;

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly dest: AudioNode,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * The requested mode; the playing mode follows at the next bar line, except
   * that arriving at 'results' restarts the bed at once (see the module notes).
   */
  setMode(mode: MusicMode): void {
    this.mode = mode;
    const st = this.state;
    if (this.timer !== null && st && mode.kind === "results" && st.mode.kind !== "results") {
      this.stop(0.08);
      this.start();
    }
  }

  /** Shift the bar grid (at the next unscheduled bar line) so a bar line falls at `at`. */
  realign(at: number): void {
    this.align = at;
  }

  /** Idempotent. A fresh start plays the requested mode straight away from `at`. */
  start(at = this.ctx.currentTime + 0.05): void {
    if (this.timer !== null) return;
    const out = this.ctx.createGain();
    out.connect(this.dest);
    this.out = out;
    this.state = createStepState(at, this.mode);
    this.timer = setInterval(() => this.tick(), Sequencer.INTERVAL_MS);
    this.tick();
  }

  /** Clears the timer and releases whatever is still sounding (time constant `tau`). */
  stop(tau = 0.25): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.state = null;
    this.align = null;
    const out = this.out;
    this.out = null;
    if (!out) return;
    try {
      rampTo(this.ctx, out.gain, 0, tau);
    } catch {
      // context closed
    }
    setTimeout(() => {
      try {
        out.disconnect();
      } catch {
        // already gone
      }
    }, 2000);
  }

  private tick(): void {
    const st = this.state;
    const out = this.out;
    if (!st || !out) return;
    try {
      const now = this.ctx.currentTime;
      if (this.align !== null) {
        // A target already behind the clock still fixes the grid's phase.
        alignTo(st, this.align);
        this.align = null;
      }
      catchUp(st, now, this.mode);
      scheduleRange(this.ctx, out, this.mode, now - LATE_RESYNC_S, now + Sequencer.HORIZON, st);
    } catch {
      // Audio must never take the game down.
    }
  }
}

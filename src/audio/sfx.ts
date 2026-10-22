import type { CueName, CueParams } from "./cues";
import { FLOOR, Voice, clamp, fxFor, midiHz, pluck, swell } from "./dsp";
import { riser } from "./music";

/**
 * The game's sound effects, all synthesised and all in D (minor for the bed,
 * bright major colours for success). Each voice schedules itself at audio time
 * `t` into `dest` and returns its sources so a phase change can cut it off.
 *
 * Short, clean, never harsh: sines and triangles, gentle filters, no buzzers.
 * Levels assume the sfx bus (~0.6) and master (~0.9) that follow.
 */

/**
 * `reverb` overrides the shared sfx reverb send: the realtime engine passes a
 * per-phase send so a phase change fades the wet path with the dry one.
 */
export type VoiceFn = (
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  params?: CueParams,
  reverb?: AudioNode | null,
) => AudioScheduledSourceNode[];

/** The reverb send a cue should use: the override if given, else the context's shared one. */
function reverbSend(ctx: BaseAudioContext, override: AudioNode | null | undefined): AudioNode | null {
  return override === undefined ? (fxFor(ctx)?.reverb ?? null) : override;
}

// MIDI reference: F3 53, A3 57, D5 74, F#5 78, A5 81, D6 86, A6 93.

/** Envelope peak of the 'go' sting (tuned against the countdown blips by offline render). */
const GO_LEVEL = 0.22;

/** A soft sine "blip" with a quiet octave on top for definition. */
function blip(v: Voice, dest: AudioNode, midi: number, t: number, level: number, decay: number): void {
  const env = v.gain(dest);
  const end = pluck(env.gain, t, level, 0.003, decay);
  const f = midiHz(midi);
  v.osc(env, "sine", f, t, end);
  v.osc(v.gain(env, 0.12), "sine", f * 2, t, end);
}

/** 3, 2, 1: A5 sine blips, the last one a touch fuller. */
const countdown: VoiceFn = (ctx, dest, t, p) => {
  const v = new Voice(ctx);
  const last = (p?.n ?? 3) <= 1;
  blip(v, dest, 81, t, last ? 0.42 : 0.34, last ? 0.22 : 0.14);
  return v.sources;
};

/**
 * D6 + A6 opening through a 400 -> 1600 Hz sweep, with a soft noise whoosh. The
 * envelope holds through the 250 ms sweep before it decays, so the opening is
 * actually heard; it peaks a few dB above the countdown blips.
 */
const go: VoiceFn = (ctx, dest, t, _p, reverb) => {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  env.gain.setValueAtTime(FLOOR, t);
  env.gain.exponentialRampToValueAtTime(GO_LEVEL, t + 0.01);
  env.gain.setValueAtTime(GO_LEVEL, t + 0.01);
  env.gain.linearRampToValueAtTime(GO_LEVEL * 0.8, t + 0.28);
  env.gain.setTargetAtTime(FLOOR, t + 0.28, 0.12);
  const end = t + 0.28 + 0.12 * 7;
  const lp = v.filter(env, "lowpass", 400, 1.6);
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
  for (const m of [86, 93]) {
    v.osc(v.gain(lp, 0.5), "sawtooth", midiHz(m), t, end);
    v.osc(v.gain(lp, 0.6), "triangle", midiHz(m), t, end);
  }
  v.osc(v.gain(env, 0.35), "sine", midiHz(86), t, end);
  const whoosh = v.gain(dest);
  whoosh.gain.setValueAtTime(FLOOR, t);
  whoosh.gain.exponentialRampToValueAtTime(0.12, t + 0.12);
  whoosh.gain.exponentialRampToValueAtTime(FLOOR, t + 0.4);
  const bp = v.filter(whoosh, "bandpass", 700, 1.2);
  bp.frequency.setValueAtTime(700, t);
  bp.frequency.exponentialRampToValueAtTime(3200, t + 0.3);
  v.noise(bp, t, t + 0.42, 0.21);
  v.send(env, reverbSend(ctx, reverb), 0.25);
  return v.sources;
};

/** The last three seconds: a crisp 2.2 kHz tick plus a tiny noise click. */
const tickUrgent: VoiceFn = (ctx, dest, t) => {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  v.osc(env, "sine", 2200, t, pluck(env.gain, t, 0.24, 0.001, 0.025));
  const click = v.gain(dest);
  v.noise(v.filter(click, "highpass", 5000, 0.7), t, pluck(click.gain, t, 0.07, 0.0005, 0.006), 0.63);
  return v.sources;
};

/** Window closed: a falling fifth A5 -> D5, clear and rounded. */
const timeUp: VoiceFn = (ctx, dest, t) => {
  const v = new Voice(ctx);
  [81, 74].forEach((m, k) => {
    const at = t + k * 0.14;
    const env = v.gain(dest);
    const end = pluck(env.gain, at, 0.24, 0.006, k ? 0.5 : 0.22);
    v.osc(env, "triangle", midiHz(m), at, end);
    v.osc(v.gain(env, 0.5), "sine", midiHz(m), at, end);
  });
  return v.sources;
};

/** Answer received: a soft click and a short confirming D6. */
const lock: VoiceFn = (ctx, dest, t) => {
  const v = new Voice(ctx);
  const click = v.gain(dest);
  v.noise(v.filter(click, "bandpass", 2600, 1.1), t, pluck(click.gain, t, 0.16, 0.001, 0.012), 0.11);
  const env = v.gain(dest);
  const end = pluck(env.gain, t + 0.008, 0.2, 0.003, 0.09);
  v.osc(env, "sine", midiHz(86), t + 0.008, end);
  v.osc(v.gain(env, 0.25), "sine", midiHz(93), t + 0.008, end);
  return v.sources;
};

/** D major pentatonic from D5, two octaves: D5 E5 F#5 A5 B5 D6 E6 F#6 A6 B6 D7. */
const PENTA = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98];

/** Pentatonic step for ping i of n: one note each up to the cap, else spread across it. */
export function detectNote(i: number, n?: number): number {
  const top = PENTA.length - 1;
  const idx = n && n > PENTA.length ? Math.round((i * top) / (n - 1)) : Math.min(i, top);
  return PENTA[clamp(idx, 0, top)];
}

/** One AI detection box landing: a quiet panned sine ping, ~-24 dBFS. */
const detect: VoiceFn = (ctx, dest, t, p) => {
  const v = new Voice(ctx);
  const env = v.gain(v.pan(dest, clamp(p?.pan ?? 0, -0.6, 0.6)));
  v.osc(env, "sine", midiHz(detectNote(p?.i ?? 0, p?.n)), t, pluck(env.gain, t, 0.16, 0.003, 0.06));
  return v.sources;
};

/** Correct: D5 F#5 A5 D6, 70 ms apart, bright with a little air. */
const correct: VoiceFn = (ctx, dest, t, _p, reverb) => {
  const v = new Voice(ctx);
  const bus = v.gain(dest, 1);
  [74, 78, 81, 86].forEach((m, k) => {
    const at = t + k * 0.07;
    const env = v.gain(bus);
    const end = pluck(env.gain, at, 0.27, 0.005, k === 3 ? 0.9 : 0.45);
    const f = midiHz(m);
    v.osc(env, "triangle", f, at, end);
    v.osc(v.gain(env, 0.3), "sine", f * 2, at, end);
  });
  v.send(bus, reverbSend(ctx, reverb), 0.3);
  return v.sources;
};

/**
 * Wrong: a soft falling A3 -> F3 through a 900 Hz lowpass. No buzzer, and it
 * carries no more energy than 'correct': a miss is not announced to the room.
 */
const wrong: VoiceFn = (ctx, dest, t) => {
  const v = new Voice(ctx);
  const lp = v.filter(dest, "lowpass", 900, 0.6);
  [57, 53].forEach((m, k) => {
    const at = t + k * 0.18;
    const env = v.gain(lp);
    env.gain.setValueAtTime(FLOOR, at);
    env.gain.exponentialRampToValueAtTime(0.17, at + 0.012);
    env.gain.setTargetAtTime(FLOOR, at + (k ? 0.16 : 0.13), k ? 0.09 : 0.03);
    const stop = at + (k ? 0.75 : 0.32);
    v.osc(env, "triangle", midiHz(m), at, stop);
    v.osc(v.gain(env, 0.22), "sine", midiHz(m - 12), at, stop);
  });
  return v.sources;
};

/** Timeout: F3 sagging 200 cents, under a breath of filtered noise. */
const timeout: VoiceFn = (ctx, dest, t) => {
  const v = new Voice(ctx);
  const env = v.gain(v.filter(dest, "lowpass", 1000, 0.6));
  const end = pluck(env.gain, t, 0.3, 0.01, 0.7);
  for (const [type, gain] of [["triangle", 1], ["sine", 0.5]] as const) {
    const o = v.osc(v.gain(env, gain), type, midiHz(53), t, end);
    o.detune.setValueAtTime(0, t);
    o.detune.linearRampToValueAtTime(-200, t + 0.45);
  }
  const air = v.gain(dest);
  air.gain.setValueAtTime(FLOOR, t);
  air.gain.exponentialRampToValueAtTime(0.06, t + 0.05);
  air.gain.exponentialRampToValueAtTime(FLOOR, t + 0.4);
  v.noise(v.filter(air, "lowpass", 900, 0.7), t, t + 0.42, 0.77);
  return v.sources;
};

/** Tier banner: a Dm9 swell opening up, with a high A shimmer at the crest. */
const tierUp: VoiceFn = (ctx, dest, t, _p, reverb) => {
  const v = new Voice(ctx);
  const env = v.gain(dest);
  const end = swell(env.gain, t, 0.3, 0.9, t + 1.3, 0.35);
  const lp = v.filter(env, "lowpass", 500, 0.8);
  lp.frequency.setValueAtTime(500, t);
  lp.frequency.exponentialRampToValueAtTime(3200, t + 1.2);
  const notes = [62, 65, 69, 72, 76];
  for (const m of notes) {
    const g = v.gain(lp, 1 / notes.length);
    v.osc(v.pan(g, -0.3), "sawtooth", midiHz(m), t, end, -7);
    v.osc(v.pan(g, 0.3), "sawtooth", midiHz(m), t, end, 7);
  }
  v.osc(v.gain(env, 0.5), "sine", midiHz(50), t, end);
  const shine = v.gain(dest);
  const shineEnd = pluck(shine.gain, t + 0.9, 0.12, 0.01, 1.2);
  v.osc(shine, "sine", midiHz(93), t + 0.9, shineEnd);
  const fx = reverbSend(ctx, reverb);
  v.send(env, fx, 0.35);
  v.send(shine, fx, 0.5);
  return v.sources;
};

/** A phone joined: a gentle rising A5 -> D6 chime. */
const join: VoiceFn = (ctx, dest, t, _p, reverb) => {
  const v = new Voice(ctx);
  const bus = v.gain(dest, 1);
  [81, 86].forEach((m, k) => {
    const at = t + k * 0.12;
    const env = v.gain(bus);
    const end = pluck(env.gain, at, 0.26, 0.004, k ? 0.7 : 0.35);
    v.osc(env, "sine", midiHz(m), at, end);
    v.osc(v.gain(env, 0.2), "triangle", midiHz(m + 12), at, end);
  });
  v.send(bus, reverbSend(ctx, reverb), 0.3);
  return v.sources;
};

/** Results: a rolled Dmaj9 that settles, D2 underneath. */
const results: VoiceFn = (ctx, dest, t, _p, reverb) => {
  const v = new Voice(ctx);
  const bus = v.gain(dest, 1);
  [50, 57, 61, 64, 66, 69, 74].forEach((m, k) => {
    const at = t + k * 0.045;
    const env = v.gain(bus);
    const end = pluck(env.gain, at, 0.1, 0.006, 2.2);
    v.osc(env, "triangle", midiHz(m), at, end);
    v.osc(v.gain(env, 0.15), "sine", midiHz(m + 12), at, end);
  });
  const low = v.gain(bus);
  v.osc(low, "sine", midiHz(38), t, swell(low.gain, t, 0.16, 0.08, t + 1.2, 0.4));
  v.send(bus, reverbSend(ctx, reverb), 0.35);
  return v.sources;
};

/** The live-window riser lives with the music but plays on the phase-scoped sfx path. */
const riserCue: VoiceFn = (ctx, dest, t, p) => riser(ctx, dest, t, (p?.durMs ?? 3000) / 1000);

export const CUE_VOICES: Record<CueName, VoiceFn> = {
  join,
  tierUp,
  countdown,
  go,
  tickUrgent,
  timeUp,
  riser: riserCue,
  lock,
  detect,
  correct,
  wrong,
  timeout,
  results,
};

/**
 * Stings and how long each ducks the music, in seconds. Ticks, countdown blips,
 * detection pings and the riser never duck.
 */
export const STING_SECONDS: Partial<Record<CueName, number>> = {
  go: 0.7,
  timeUp: 0.6,
  correct: 0.9,
  wrong: 0.7,
  timeout: 0.8,
  tierUp: 2.2,
  results: 2.4,
};

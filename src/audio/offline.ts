import { CUE_NAMES, musicFromKey, type CueName, type CueParams } from "./cues";
import { buildMasterChain } from "./engine";
import { scheduleRange } from "./music";
import { CUE_VOICES } from "./sfx";

/**
 * Offline renders of single cues and music modes through the real master
 * chain, for the audio lab and for automated level checks (no speakers needed).
 * Names: "cue:<CueName>" and "music:<musicKey>".
 */

export const MUSIC_TEST_KEYS = ["attract", "game0", "game1", "game2", "game3", "game3-live", "results"] as const;

export const AUDIO_TEST_NAMES: readonly string[] = [
  ...CUE_NAMES.map((c) => `cue:${c}`),
  ...MUSIC_TEST_KEYS.map((m) => `music:${m}`),
];

export interface RenderMetrics {
  /** Largest absolute sample. */
  peak: number;
  /** RMS over every sample of both channels. */
  rms: number;
  /** NaN or infinite samples (must be 0). */
  nonFinite: number;
}

/** Representative parameters for auditioning a cue on its own. */
export const DEMO_PARAMS: Partial<Record<CueName, CueParams>> = {
  countdown: { n: 3 },
  detect: { i: 0, n: 1, pan: 0 },
  riser: { durMs: 3000 },
};

export function measure(buffer: AudioBuffer): RenderMetrics {
  let peak = 0;
  let sumSq = 0;
  let nonFinite = 0;
  let count = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const x = data[i];
      if (!Number.isFinite(x)) {
        nonFinite++;
        continue;
      }
      const a = Math.abs(x);
      if (a > peak) peak = a;
      sumSq += x * x;
      count++;
    }
  }
  return { peak, rms: count ? Math.sqrt(sumSq / count) : 0, nonFinite };
}

/** Render `name` for `seconds` into a 2-channel 48 kHz OfflineAudioContext and measure it. */
export async function renderOffline(name: string, seconds: number): Promise<RenderMetrics> {
  const sampleRate = 48000;
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.max(1, Math.ceil(seconds * sampleRate)), sampleRate });
  const chain = buildMasterChain(ctx, ctx.destination);
  const [kind, id] = name.split(":");
  if (kind === "cue" && (CUE_NAMES as readonly string[]).includes(id)) {
    const cue = id as CueName;
    CUE_VOICES[cue](ctx, chain.sfx, 0.05, DEMO_PARAMS[cue]);
  } else if (kind === "music" && musicFromKey(id)) {
    scheduleRange(ctx, chain.music, musicFromKey(id)!, 0, seconds);
  } else {
    throw new Error(`unknown audio test name: ${name}`);
  }
  return measure(await ctx.startRendering());
}

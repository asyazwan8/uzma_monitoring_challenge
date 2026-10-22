import { TIMINGS, lastResult, type GameState } from "@/game/engine";
import { ROUND_MS, revealStaggerMs, revealVerdictDelayMs, tierInfo } from "@/game/levels";

/**
 * What the display should sound like for a given game state. Pure: no Web Audio
 * here, so the whole mapping is unit-testable under vitest's node environment.
 *
 * Cues are one-shot sounds tied to a phase transition and placed on the wall
 * clock (Date.now, the same clock as `phaseStartedAt`); the audio engine converts
 * them to AudioContext time. Music is a mode the sequencer switches to at the
 * next bar line.
 */

export type CueName =
  | "join"
  | "tierUp"
  | "countdown"
  | "go"
  | "tickUrgent"
  | "timeUp"
  | "riser"
  | "lock"
  | "detect"
  | "correct"
  | "wrong"
  | "timeout"
  | "results";

export const CUE_NAMES: readonly CueName[] = [
  "join",
  "tierUp",
  "countdown",
  "go",
  "tickUrgent",
  "timeUp",
  "riser",
  "lock",
  "detect",
  "correct",
  "wrong",
  "timeout",
  "results",
];

export interface ScheduledCue {
  cue: CueName;
  atWallMs: number;
  /**
   * n: countdown number, or the detection count for `detect`; i: detection index;
   * pan: -1..1; durMs: riser length (it must end exactly at the window end).
   */
  params?: { n?: number; i?: number; pan?: number; durMs?: number };
}

export type CueParams = NonNullable<ScheduledCue["params"]>;

export type MusicMode =
  | { kind: "attract" }
  | { kind: "game"; intensity: 0 | 1 | 2 | 3; live: boolean }
  | { kind: "results" }
  | { kind: "silent" };

/** The last seconds of the live window get a riser and one urgent tick per second. */
export const URGENT_MS = 3000;
/** Never more pings than this on reveal; matches the cap in revealVerdictDelayMs. */
export const MAX_DETECT_PINGS = 30;

/** Identifies one phase instance. Heartbeats and rank updates leave it unchanged. */
export function phaseKey(state: Pick<GameState, "phase" | "phaseStartedAt">): string {
  return `${state.phase}@${state.phaseStartedAt}`;
}

/** Deterministic spread across the stereo field (golden-ratio walk), in [-0.6, 0.6). */
export function detectPan(i: number): number {
  return ((i * 0.618) % 1) * 1.2 - 0.6;
}

/**
 * Cues for the transition prev -> next, keyed by the NEW phase. Returns [] when
 * the phase instance did not change, so re-renders never replay a sound.
 */
export function cuesFor(prev: GameState | null, next: GameState): ScheduledCue[] {
  if (prev && phaseKey(prev) === phaseKey(next)) return [];
  const t0 = next.phaseStartedAt;
  const ts = next.timeScale;
  switch (next.phase) {
    case "lobby":
      return [{ cue: "join", atWallMs: t0 }];
    case "tier":
      return [{ cue: "tierUp", atWallMs: t0 }];
    case "intro":
      return [3, 2, 1].map((n, k) => ({ cue: "countdown", atWallMs: t0 + k * 1000 * ts, params: { n } }));
    case "live": {
      const windowEnd = t0 + ROUND_MS * ts;
      const urgent = URGENT_MS * ts;
      return [
        { cue: "go", atWallMs: t0 },
        { cue: "riser", atWallMs: windowEnd - urgent, params: { durMs: urgent } },
        { cue: "tickUrgent", atWallMs: windowEnd - 3000 * ts },
        { cue: "tickUrgent", atWallMs: windowEnd - 2000 * ts },
        { cue: "tickUrgent", atWallMs: windowEnd - 1000 * ts },
        { cue: "timeUp", atWallMs: windowEnd },
      ];
    }
    case "reveal": {
      const result = lastResult(next);
      const n = next.round?.count ?? result?.truth ?? 0;
      const out: ScheduledCue[] = [];
      if (result && result.answer !== null) out.push({ cue: "lock", atWallMs: t0 });
      // The detection boxes are CSS-animated with real-millisecond delays, which
      // timeScale does not touch, so the pings stay unscaled to land with them.
      const stagger = revealStaggerMs(n);
      const pings = Math.min(n, MAX_DETECT_PINGS);
      for (let i = 0; i < pings; i++) {
        out.push({ cue: "detect", atWallMs: t0 + i * stagger, params: { i, n: pings, pan: detectPan(i) } });
      }
      const verdict: CueName = !result || result.answer === null ? "timeout" : result.correct ? "correct" : "wrong";
      out.push({ cue: verdict, atWallMs: t0 + revealVerdictDelayMs(n) });
      return out;
    }
    case "results":
      return [{ cue: "results", atWallMs: t0 }];
    default:
      // idle, instructions, leaderboard: the music carries these.
      return [];
  }
}

/**
 * Where the music's bar grid should put a bar line, on the wall clock: on entering
 * the countdown, the moment the live window will open. The 15 s window is then
 * exactly five bars, and the urgent ticks and time-up land on beats. Null when
 * the phase asks for no alignment.
 */
export function musicAnchorFor(state: GameState): number | null {
  return state.phase === "intro" ? state.phaseStartedAt + TIMINGS.introMs * state.timeScale : null;
}

function intensityOf(state: GameState): 0 | 1 | 2 | 3 {
  const tier = state.round?.config.tier;
  if (!tier) return 0;
  return Math.max(0, Math.min(3, tierInfo(tier).index)) as 0 | 1 | 2 | 3;
}

/**
 * Background music for a state. The sequencer applies changes at the next bar
 * line, except the live flag (next step) and the switch to results (at once).
 */
export function musicFor(state: GameState): MusicMode {
  switch (state.phase) {
    case "idle":
    case "lobby":
    case "instructions":
      return { kind: "attract" };
    case "tier":
    case "intro":
    case "reveal":
      return { kind: "game", intensity: intensityOf(state), live: false };
    case "live":
      return { kind: "game", intensity: intensityOf(state), live: true };
    case "results":
    case "leaderboard":
      return { kind: "results" };
    default:
      return { kind: "attract" };
  }
}

/** Stable string form, handy as an effect dependency. */
export function musicKey(mode: MusicMode): string {
  return mode.kind === "game" ? `game${mode.intensity}${mode.live ? "-live" : ""}` : mode.kind;
}

/** Inverse of musicKey: "attract", "game0".."game3", "game2-live", "results", "silent". */
export function musicFromKey(key: string): MusicMode | null {
  if (key === "attract" || key === "results" || key === "silent") return { kind: key };
  const m = /^game([0-3])(-live)?$/.exec(key);
  return m ? { kind: "game", intensity: Number(m[1]) as 0 | 1 | 2 | 3, live: Boolean(m[2]) } : null;
}

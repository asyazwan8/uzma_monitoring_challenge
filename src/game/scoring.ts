import type { TargetKind, Tier } from "./levels";

export interface RoundResult {
  level: number;
  tier: Tier;
  target: TargetKind;
  truth: number;
  /** null when the answer window ran out. */
  answer: number | null;
  /** Time from keypad opening to submit, measured on the phone. null on timeout. */
  reactionMs: number | null;
  answerWindowMs: number;
  accuracy: number;
  points: number;
  correct: boolean;
}

/** 1 for an exact answer, falling linearly to 0 at 100% error. Timeouts score 0. */
export function roundAccuracy(answer: number | null, truth: number): number {
  if (answer === null || truth <= 0) return 0;
  return Math.max(0, 1 - Math.abs(answer - truth) / truth);
}

/** 1 for an instant answer, 0 when the full window was used. */
export function speedFactor(reactionMs: number | null, windowMs: number): number {
  if (reactionMs === null) return 0;
  return Math.max(0, Math.min(1, 1 - reactionMs / windowMs));
}

/**
 * Points = base x accuracy x (50% + 50% speed). An exact answer always earns at least
 * half the base, a near miss on the final round still earns partial credit.
 */
export function roundPoints(basePoints: number, accuracy: number, speed: number): number {
  return Math.round(basePoints * accuracy * (0.5 + 0.5 * speed));
}

export interface RunSummary {
  score: number;
  levelsCleared: number;
  roundsPlayed: number;
  /** Mean round accuracy, 0..100 with one decimal. */
  accuracyPct: number;
  /** Mean reaction over answered rounds, null if none answered. */
  avgReactionMs: number | null;
  completed: boolean;
}

export function summarise(history: readonly RoundResult[], totalLevels: number): RunSummary {
  const roundsPlayed = history.length;
  const score = history.reduce((sum, r) => sum + r.points, 0);
  const levelsCleared = history.filter((r) => r.correct).length;
  const accuracyPct = roundsPlayed
    ? Math.round((history.reduce((sum, r) => sum + r.accuracy, 0) / roundsPlayed) * 1000) / 10
    : 0;
  const answered = history.filter((r) => r.reactionMs !== null);
  const avgReactionMs = answered.length
    ? Math.round(answered.reduce((sum, r) => sum + (r.reactionMs ?? 0), 0) / answered.length)
    : null;
  return {
    score,
    levelsCleared,
    roundsPlayed,
    accuracyPct,
    avgReactionMs,
    completed: levelsCleared === totalLevels,
  };
}

/** The benchmark the end screen compares players against. */
export const AI_BENCHMARK = {
  name: "Geospatial AI",
  reactionLabel: "0.00001 s",
  accuracyPct: 100,
} as const;

export function formatSeconds(ms: number | null): string {
  if (ms === null) return "–";
  return `${(ms / 1000).toFixed(2)} s`;
}

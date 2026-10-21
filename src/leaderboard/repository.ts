export interface LeaderboardEntry {
  id: string;
  nickname: string;
  score: number;
  levelsCleared: number;
  /** Mean round accuracy, 0..100. */
  accuracyPct: number;
  /** Mean reaction time over answered rounds, null when none were answered. */
  avgReactionMs: number | null;
  /** ISO timestamp. */
  createdAt: string;
}

export type NewLeaderboardEntry = Omit<LeaderboardEntry, "id" | "createdAt">;

/**
 * Storage seam for the leaderboard. The proof of concept keeps scores in the
 * display browser's localStorage; implement this against a database (and an
 * API route) to share scores across devices. See docs/HANDOFF.md.
 */
export interface LeaderboardRepository {
  submit(entry: NewLeaderboardEntry): Promise<{ entry: LeaderboardEntry; rank: number }>;
  top(limit: number): Promise<LeaderboardEntry[]>;
}

/** Highest score first; ties go to the faster average, then the earlier run. */
export function compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  const ra = a.avgReactionMs ?? Number.POSITIVE_INFINITY;
  const rb = b.avgReactionMs ?? Number.POSITIVE_INFINITY;
  if (ra !== rb) return ra - rb;
  return a.createdAt.localeCompare(b.createdAt);
}

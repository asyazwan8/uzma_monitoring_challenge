import { createLocalStorageRepository } from "./localStorageRepository";
import type { LeaderboardRepository } from "./repository";

export type { LeaderboardEntry, LeaderboardRepository, NewLeaderboardEntry } from "./repository";
export { compareEntries } from "./repository";

/** Swap this for a database-backed repository at hand-off. */
export function createLeaderboard(): LeaderboardRepository {
  return createLocalStorageRepository();
}

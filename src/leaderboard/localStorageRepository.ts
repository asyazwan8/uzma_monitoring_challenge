import { randomId } from "@/lib/id";
import { compareEntries, type LeaderboardEntry, type LeaderboardRepository } from "./repository";

// v2: ten-second live rounds. Runs from the v1 timing are not comparable.
const KEY = "monitoring-challenge:leaderboard:v2";
const MAX_ENTRIES = 1000;

export function createLocalStorageRepository(storage: Storage = window.localStorage): LeaderboardRepository {
  const read = (): LeaderboardEntry[] => {
    try {
      const parsed = JSON.parse(storage.getItem(KEY) ?? "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const write = (entries: LeaderboardEntry[]) => {
    try {
      storage.setItem(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
      // storage full or unavailable: the run still shows, it just is not kept
    }
  };
  return {
    async submit(input) {
      const entry: LeaderboardEntry = {
        ...input,
        id: randomId(),
        createdAt: new Date().toISOString(),
      };
      const entries = [...read(), entry].sort(compareEntries);
      write(entries);
      return { entry, rank: entries.findIndex((e) => e.id === entry.id) + 1 };
    },
    async top(limit) {
      return read().sort(compareEntries).slice(0, limit);
    },
  };
}

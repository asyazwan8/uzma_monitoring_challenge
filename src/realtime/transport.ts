import type { GameMessage } from "@/game/protocol";

export type Role = "display" | "phone";
export type TransportStatus = "connecting" | "open" | "closed";

/**
 * A room-scoped message pipe between the display and phones. Implementations:
 * - ws: the local relay in server/relay.ts (real phones over LAN)
 * - broadcast: BroadcastChannel (two windows of one browser, and e2e tests)
 * A hosted adapter (Supabase Realtime, Ably...) only needs to implement this
 * interface; see docs/HANDOFF.md.
 */
export interface Transport {
  readonly kind: string;
  send(message: GameMessage): void;
  onMessage(handler: (message: GameMessage) => void): () => void;
  onStatus(handler: (status: TransportStatus) => void): () => void;
  close(): void;
}

/** Tiny listener set shared by the adapters. */
export function listeners<T>() {
  const set = new Set<(value: T) => void>();
  return {
    add(fn: (value: T) => void) {
      set.add(fn);
      return () => void set.delete(fn);
    },
    emit(value: T) {
      for (const fn of set) fn(value);
    },
    clear() {
      set.clear();
    },
  };
}

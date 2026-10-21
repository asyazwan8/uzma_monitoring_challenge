import type { GameMessage } from "@/game/protocol";
import { listeners, type Role, type Transport, type TransportStatus } from "./transport";

/** Same-browser transport: open the phone view in a second window or tab. */
export function createBroadcastTransport(room: string, role: Role): Transport {
  const channel = new BroadcastChannel(`monitoring-challenge:${room}`);
  const messages = listeners<GameMessage>();
  const statuses = listeners<TransportStatus>();
  channel.onmessage = (event: MessageEvent<{ role: Role; data: GameMessage }>) => {
    if (event.data?.role !== role) messages.emit(event.data.data);
  };
  return {
    kind: "broadcast",
    send(message) {
      channel.postMessage({ role, data: message });
    },
    onMessage: messages.add,
    onStatus(handler) {
      queueMicrotask(() => handler("open"));
      return statuses.add(handler);
    },
    close() {
      channel.close();
      messages.clear();
      statuses.clear();
    },
  };
}

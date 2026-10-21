import type { GameMessage } from "@/game/protocol";
import { listeners, type Role, type Transport, type TransportStatus } from "./transport";

/** Same-browser transport: open the phone view in a second window or tab. */
export function createBroadcastTransport(room: string, role: Role): Transport {
  const channel = new BroadcastChannel(`monitoring-challenge:${room}`);
  const messages = listeners<GameMessage>();
  const statuses = listeners<TransportStatus>();
  let closed = false;
  channel.onmessage = (event: MessageEvent<{ role: Role; data: GameMessage }>) => {
    if (event.data?.role !== role) messages.emit(event.data.data);
  };
  return {
    kind: "broadcast",
    send(message) {
      if (!closed) channel.postMessage({ role, data: message });
    },
    onMessage: messages.add,
    onStatus(handler) {
      queueMicrotask(() => !closed && handler("open"));
      return statuses.add(handler);
    },
    close() {
      closed = true;
      channel.close();
      messages.clear();
      statuses.clear();
    },
  };
}

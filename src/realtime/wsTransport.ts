import type { GameMessage } from "@/game/protocol";
import { listeners, type Role, type Transport, type TransportStatus } from "./transport";

/** Relay wire format (see server/relay.ts). */
type RelayIn = { t: "msg"; data: GameMessage };

export function createWsTransport(room: string, role: Role, url: string): Transport {
  const messages = listeners<GameMessage>();
  const statuses = listeners<TransportStatus>();
  const queue: string[] = [];
  let socket: WebSocket | null = null;
  let closed = false;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (s: TransportStatus) => statuses.emit(s);

  const connect = () => {
    if (closed) return;
    setStatus("connecting");
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      ws.send(JSON.stringify({ t: "join", room, role }));
      while (queue.length) ws.send(queue.shift()!);
      setStatus("open");
    };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data)) as RelayIn;
        if (msg.t === "msg" && msg.data && typeof msg.data === "object") messages.emit(msg.data);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      if (closed) return setStatus("closed");
      setStatus("connecting");
      retryTimer = setTimeout(connect, Math.min(4000, 250 * 2 ** attempt++));
    };
    ws.onerror = () => ws.close();
  };
  connect();

  return {
    kind: "ws",
    send(message) {
      const frame = JSON.stringify({ t: "msg", data: message });
      if (socket?.readyState === WebSocket.OPEN) socket.send(frame);
      else {
        queue.push(frame);
        if (queue.length > 20) queue.shift();
      }
    },
    onMessage: messages.add,
    onStatus: statuses.add,
    close() {
      closed = true;
      clearTimeout(retryTimer);
      socket?.close();
      messages.clear();
      statuses.clear();
    },
  };
}

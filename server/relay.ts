/**
 * Local realtime relay for the proof of concept. It knows nothing about the game:
 * clients join a room, and every message is forwarded to the other members of
 * that room. Replace with a hosted service (Supabase Realtime, Ably...) when
 * deploying; see docs/HANDOFF.md.
 *
 *   npm run relay            # ws://0.0.0.0:3001
 *   RELAY_PORT=4001 npm run relay
 */
import { networkInterfaces } from "node:os";
import { WebSocket, WebSocketServer } from "ws";

interface Member {
  ws: WebSocket;
  room: string;
  role: string;
  alive: boolean;
}

const port = Number(process.env.RELAY_PORT ?? 3001);
const rooms = new Map<string, Set<Member>>();
const wss = new WebSocketServer({ port, host: "0.0.0.0", maxPayload: 16 * 1024 });

function leave(member: Member) {
  const room = rooms.get(member.room);
  if (!room) return;
  room.delete(member);
  if (room.size === 0) rooms.delete(member.room);
}

wss.on("connection", (ws) => {
  let me: Member | null = null;

  ws.on("pong", () => {
    if (me) me.alive = true;
  });

  ws.on("message", (raw) => {
    let msg: { t?: string; room?: unknown; role?: unknown; data?: unknown };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.t === "join") {
      if (typeof msg.room !== "string" || !/^[A-Z0-9]{3,12}$/.test(msg.room)) return;
      if (msg.role !== "display" && msg.role !== "phone") return;
      if (me) leave(me);
      me = { ws, room: msg.room, role: msg.role, alive: true };
      if (!rooms.has(me.room)) rooms.set(me.room, new Set());
      rooms.get(me.room)!.add(me);
      return;
    }
    if (msg.t === "msg" && me) {
      const frame = JSON.stringify({ t: "msg", data: msg.data });
      for (const other of rooms.get(me.room) ?? []) {
        if (other !== me && other.ws.readyState === WebSocket.OPEN) other.ws.send(frame);
      }
    }
  });

  ws.on("close", () => {
    if (me) leave(me);
  });
});

// Drop sockets that vanished without a close frame (phone went to sleep).
setInterval(() => {
  for (const room of rooms.values()) {
    for (const member of room) {
      if (!member.alive) {
        member.ws.terminate();
        leave(member);
        continue;
      }
      member.alive = false;
      member.ws.ping();
    }
  }
}, 20000);

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);
console.log(`[relay] listening on ws://0.0.0.0:${port}`);
for (const ip of lan) console.log(`[relay] phones on this network reach it at ws://${ip}:${port}`);

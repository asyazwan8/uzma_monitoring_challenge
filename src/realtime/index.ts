import { createBroadcastTransport } from "./broadcastTransport";
import { createWsTransport } from "./wsTransport";
import type { Role, Transport } from "./transport";

export type { Role, Transport, TransportStatus } from "./transport";

export type TransportKind = "ws" | "broadcast";

/** `?transport=broadcast` on the URL overrides NEXT_PUBLIC_TRANSPORT. */
export function transportKind(): TransportKind {
  if (typeof window !== "undefined") {
    const fromUrl = new URLSearchParams(window.location.search).get("transport");
    if (fromUrl === "ws" || fromUrl === "broadcast") return fromUrl;
  }
  return process.env.NEXT_PUBLIC_TRANSPORT === "broadcast" ? "broadcast" : "ws";
}

export function relayUrl(): string {
  if (process.env.NEXT_PUBLIC_RELAY_URL) return process.env.NEXT_PUBLIC_RELAY_URL;
  const secure = window.location.protocol === "https:";
  return `${secure ? "wss" : "ws"}://${window.location.hostname}:3001`;
}

export function createTransport(room: string, role: Role): Transport {
  return transportKind() === "broadcast" ? createBroadcastTransport(room, role) : createWsTransport(room, role, relayUrl());
}

import { transportKind } from "@/realtime";

/**
 * Base URL phones should open. Priority: NEXT_PUBLIC_PUBLIC_URL, then this
 * laptop's LAN IP when the display runs on localhost, then the page origin.
 */
export async function resolvePublicBase(): Promise<string> {
  if (process.env.NEXT_PUBLIC_PUBLIC_URL) return process.env.NEXT_PUBLIC_PUBLIC_URL.replace(/\/$/, "");
  const { hostname, port, protocol, origin } = window.location;
  // BroadcastChannel only reaches same-origin windows.
  if (transportKind() === "broadcast") return origin;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    try {
      const res = await fetch("/api/lan-info", { cache: "no-store" });
      const { addresses } = (await res.json()) as { addresses: string[] };
      if (addresses[0]) return `${protocol}//${addresses[0]}${port ? `:${port}` : ""}`;
    } catch {
      // fall through to origin
    }
  }
  return origin;
}

export function joinUrl(base: string, room: string): string {
  const kind = transportKind();
  return `${base}/play/${room}${kind === "broadcast" ? "?transport=broadcast" : ""}`;
}

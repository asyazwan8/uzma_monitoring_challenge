import { networkInterfaces } from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Virtual adapters (VPNs, Docker, VM bridges, AirDrop) are never what a phone on Wi-Fi can reach.
const VIRTUAL = /^(bridge|utun|vmnet|vboxnet|docker|br-|veth|awdl|llw|tun|tap|zt|tailscale|virbr)/i;

/** This machine's LAN IPv4 addresses, best first, so the display can put a phone-reachable URL in the QR. */
export function GET() {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? [])
      .filter((i) => i.family === "IPv4" && !i.internal && !i.address.startsWith("169.254."))
      .map((i) => ({ name, address: i.address })),
  );
  const score = ({ name, address }: { name: string; address: string }) =>
    (VIRTUAL.test(name) ? 100 : 0) +
    (/^(en0|en1|wlan|wlp|wl|eth0|Wi-?Fi)/i.test(name) ? 0 : 10) +
    (address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : address.startsWith("172.") ? 2 : 3);
  const addresses = candidates.sort((a, b) => score(a) - score(b)).map((c) => c.address);
  return Response.json({ addresses, interfaces: candidates });
}

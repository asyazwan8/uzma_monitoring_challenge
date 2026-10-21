import { networkInterfaces } from "node:os";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Private IPv4 addresses of this machine, so the display can put a phone-reachable URL in the QR. */
export function GET() {
  const rank = (ip: string) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : ip.startsWith("172.") ? 2 : 3);
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => !!i && i.family === "IPv4" && !i.internal)
    .map((i) => i.address)
    .sort((a, b) => rank(a) - rank(b));
  return Response.json({ addresses });
}

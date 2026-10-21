import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Phones load the dev server through this machine's LAN address. Next.js blocks
// its dev scripts for unknown hosts, so allow every address this machine has
// (whatever range the venue router or hotspot hands out) plus mDNS names.
const ownAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i!.address);

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [...ownAddresses, "*.local"],
};

export default nextConfig;

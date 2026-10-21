import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Phones on the venue Wi-Fi load the dev server through the laptop's LAN IP.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local"],
};

export default nextConfig;

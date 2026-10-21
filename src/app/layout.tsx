import type { Metadata, Viewport } from "next";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/600.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/400-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Monitoring Challenge · Geospatial AI",
  description: "Count what matters from orbit. A Geospatial AI challenge. An Uzma Company.",
};

export const viewport: Viewport = {
  themeColor: "#091926",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}

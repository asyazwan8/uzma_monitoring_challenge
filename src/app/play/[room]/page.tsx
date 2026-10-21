import type { Metadata } from "next";
import { PhoneEntry } from "@/components/phone/PhoneEntry";

export const metadata: Metadata = { title: "Play · The Monitoring Challenge" };

/** Phone controller, opened by scanning the QR code on the display. */
export default async function PlayPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <PhoneEntry room={room.toUpperCase().replace(/[^A-Z0-9]/g, "")} />;
}

"use client";

import dynamic from "next/dynamic";

// Client-only: the phone keeps its id in sessionStorage and talks over the transport.
const PhoneApp = dynamic(() => import("./PhoneApp").then((m) => m.PhoneApp), { ssr: false });

export function PhoneEntry({ room }: { room: string }) {
  return <PhoneApp room={room} />;
}

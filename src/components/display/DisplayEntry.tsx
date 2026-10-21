"use client";

import dynamic from "next/dynamic";
import type { DisplayAppProps } from "./DisplayApp";

// Client-only: the room code and timers depend on the wall clock.
const DisplayApp = dynamic(() => import("./DisplayApp").then((m) => m.DisplayApp), { ssr: false });

export function DisplayEntry(props: DisplayAppProps) {
  return <DisplayApp {...props} />;
}

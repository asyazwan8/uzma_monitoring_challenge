"use client";

import { useEffect, useState } from "react";

/** Current time, refreshed every `intervalMs` (for countdowns). */
export function useNow(intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

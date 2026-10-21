"use client";

import { useEffect, useState } from "react";

export const STAGE_W = 1920;
export const STAGE_H = 1080;

/** Lays the display out on a fixed 1920x1080 canvas, scaled to fit any 16:9-ish screen. */
export function Stage({ children }: { children: React.ReactNode }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-geo-space">
      <div
        className="absolute left-1/2 top-1/2 overflow-hidden bg-geo-space"
        style={{ width: STAGE_W, height: STAGE_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

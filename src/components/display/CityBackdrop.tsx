"use client";

import { useMemo } from "react";
import { CityMap, DetectionLayer } from "@/city/CityMap";
import { generateCity } from "@/city/generate";

const SCRIMS = {
  idle:
    "linear-gradient(90deg, rgba(9,25,38,0.97) 0%, rgba(9,25,38,0.88) 40%, rgba(9,25,38,0.5) 68%, rgba(9,25,38,0.72) 100%), linear-gradient(0deg, rgba(9,25,38,0.95) 0%, rgba(9,25,38,0) 34%)",
  heavy: "linear-gradient(180deg, rgba(9,25,38,0.9) 0%, rgba(9,25,38,0.94) 60%, rgba(9,25,38,0.98) 100%)",
};

/** A large drifting satellite tile behind the non-game screens. */
export function CityBackdrop({ seed, detections = false, scrim = "idle" }: { seed: number; detections?: boolean; scrim?: keyof typeof SCRIMS }) {
  const scene = useMemo(
    () =>
      generateCity({
        seed,
        level: 16,
        target: "car",
        count: 28,
        density: { cols: 10, rows: 6, clutter: 0.75 },
        world: { width: 2400, height: 1350 },
      }),
    [seed],
  );
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="drift absolute left-0 top-0" style={{ width: 2600, height: 1462 }}>
        <CityMap scene={scene} className="absolute inset-0 h-full w-full" />
        {detections && (
          <DetectionLayer key={seed} scene={scene} staggerMs={800} renderWidthPx={2600} maxLabels={60} className="absolute inset-0 h-full w-full" />
        )}
      </div>
      <div className="absolute inset-0" style={{ background: SCRIMS[scrim] }} />
    </div>
  );
}

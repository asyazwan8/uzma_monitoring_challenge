"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CityMap, DetectionLayer } from "@/city/CityMap";
import { generateCity } from "@/city/generate";
import { TARGET_KINDS, TARGET_LABELS, levelConfig, type TargetKind } from "@/game/levels";

/**
 * Dev preview of generated tiles: /dev/cities?level=12&target=car&seed=7&detections=1
 * Omit `target` to see all four targets for the level.
 */
export function CityGallery() {
  const params = useSearchParams();
  const level = Math.min(20, Math.max(1, Number(params.get("level") ?? 1)));
  const seed = Number(params.get("seed") ?? 1);
  const detections = params.get("detections") === "1";
  const only = params.get("target") as TargetKind | null;
  const config = levelConfig(level);
  const targets = useMemo(() => (only && TARGET_KINDS.includes(only) ? [only] : TARGET_KINDS), [only]);

  const scenes = useMemo(
    () => targets.map((target) => generateCity({ seed, level, target, count: config.count[1] })),
    [targets, seed, level, config.count],
  );

  return (
    <main className="min-h-screen bg-geo-space p-6 text-white">
      <p className="geo-kicker text-xs">Dev preview</p>
      <h1 className="geo-h mb-4 text-2xl">
        Level {level} · {config.tier} · seed {seed}
      </h1>
      <div className={targets.length === 1 ? "" : "grid grid-cols-2 gap-6"}>
        {scenes.map((scene) => (
          <figure key={scene.target} data-testid={`city-${scene.target}`}>
            <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black" style={targets.length === 1 ? { width: 1440 } : undefined}>
              <CityMap scene={scene} className="absolute inset-0 h-full w-full" />
              {detections && <DetectionLayer scene={scene} staggerMs={0} className="absolute inset-0 h-full w-full" />}
            </div>
            <figcaption className="geo-caption mt-2 text-[11px] text-geo-muted">
              {TARGET_LABELS[scene.target].plural} · true count {scene.count} · {scene.objects.length} objects · {scene.caption.tile}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}

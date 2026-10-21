"use client";

import { useId } from "react";
import { CarSprite, HouseSprite, LakeSprite, TreeSprite } from "@/city/sprites";
import { SpriteDefs, makeSpriteIds } from "@/city/CityMap";
import { GROUND, ROAD } from "@/city/palette";
import type { TargetKind } from "@/game/levels";

/** The target drawn exactly as it appears on the map, on a small map swatch. */
export function TargetIcon({ kind, size = 64, className }: { kind: TargetKind; size?: number; className?: string }) {
  const ids = makeSpriteIds(`ti${useId()}`);
  const ground = kind === "car" ? ROAD.asphalt : kind === "circleLake" ? GROUND.park : GROUND.lawn;
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className={className} aria-hidden>
      <defs>
        <SpriteDefs ids={ids} />
      </defs>
      <rect width="40" height="40" rx="4" fill={ground} />
      {kind === "car" && <line x1="0" y1="20" x2="40" y2="20" stroke={ROAD.marking} strokeWidth="0.6" strokeDasharray="4 4" opacity="0.5" transform="translate(0 -9)" />}
      {kind === "blueHouse" && (
        <g transform="translate(20 20) scale(1.25) translate(-12 -9.5)">
          <rect x="2.2" y="2.8" width="24" height="19" fill="#0F1B24" opacity="0.3" />
          <HouseSprite h={{ kind: "house", id: "i", x: 0, y: 0, w: 24, h: 19, ridge: "h", style: "hip", roof: "blue", chimney: false, target: true }} />
        </g>
      )}
      {kind === "circleLake" && (
        <LakeSprite l={{ kind: "lake", id: "i", shape: "circle", cx: 20, cy: 20, rx: 13, ry: 13, rotation: 0, path: null, target: true }} ids={ids} />
      )}
      {kind === "tree" && (
        <g transform="translate(20 20) scale(1.35) translate(-20 -20)">
          <circle cx="23" cy="24" r="9.5" fill="#0F1B24" opacity="0.3" />
          <TreeSprite
            ids={ids}
            t={{
              kind: "tree",
              id: "i",
              cx: 20,
              cy: 20,
              r: 10,
              tone: 0,
              target: true,
              lobes: [0, 1, 2, 3, 4, 5].map((i) => ({ cx: 20 + Math.cos(i * 1.05) * 5.3, cy: 20 + Math.sin(i * 1.05) * 5.3, r: 4.6 })),
            }}
          />
        </g>
      )}
      {kind === "car" && (
        <g transform="translate(20 22) scale(1.9) translate(-20 -20)">
          <rect x="13.6" y="17.3" width="15" height="7" rx="2" fill="#0F1B24" opacity="0.3" />
          <CarSprite c={{ kind: "car", id: "i", cx: 20, cy: 20, length: 15, width: 7, angle: 0, color: "white", target: true }} />
        </g>
      )}
    </svg>
  );
}

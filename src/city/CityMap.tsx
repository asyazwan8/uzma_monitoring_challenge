"use client";

import { memo, useId } from "react";
import type { CityObject, CityScene, Rect, Road } from "./types";
import { GROUND, LINEWORK, POOL, ROAD, SHADOW, SOLAR, TREES, WATER } from "./palette";
import {
  BuildingSprite,
  CarSprite,
  HedgeSprite,
  HouseSprite,
  LakeSprite,
  MonumentSprite,
  PoolSprite,
  ShrubSprite,
  TreeSprite,
  type SpriteIds,
} from "./sprites";

export interface CityMapProps {
  scene: CityScene;
  className?: string;
  preserveAspectRatio?: string;
  /** Corner darkening, 0..1. Kept low while players count so no target hides in the corners. */
  vignette?: number;
}

export function SpriteDefs({ ids }: { ids: SpriteIds }) {
  return (
    <>
      <radialGradient id={ids.water} cx="50%" cy="48%" r="58%">
        <stop offset="0%" stopColor={WATER.deep} />
        <stop offset="65%" stopColor={WATER.mid} />
        <stop offset="100%" stopColor={WATER.shallow} />
      </radialGradient>
      <linearGradient id={ids.pool} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={POOL.water} />
        <stop offset="100%" stopColor={POOL.deep} />
      </linearGradient>
      {TREES.map((t, i) => (
        <radialGradient key={i} id={ids.tree[i]} cx="36%" cy="32%" r="78%">
          <stop offset="0%" stopColor={t.light} />
          <stop offset="55%" stopColor={t.mid} />
          <stop offset="100%" stopColor={t.dark} />
        </radialGradient>
      ))}
      <pattern id={ids.solar} width="4" height="3" patternUnits="userSpaceOnUse">
        <rect width="4" height="3" fill={SOLAR.cell} />
        <path d="M0,0 H4 M0,0 V3" stroke={SOLAR.grid} strokeWidth="0.35" />
      </pattern>
    </>
  );
}

export function makeSpriteIds(prefix: string): SpriteIds {
  const p = prefix.replace(/[^a-zA-Z0-9_-]/g, "");
  return { water: `${p}-water`, pool: `${p}-pool`, tree: [`${p}-tree0`, `${p}-tree1`, `${p}-tree2`], solar: `${p}-solar` };
}

/** Road markings: centre lines between junctions plus zebra crossings at each junction. */
function RoadMarkings({ roads, intersections }: { roads: Road[]; intersections: Rect[] }) {
  const lines: React.ReactNode[] = [];
  roads.forEach((road, ri) => {
    const horizontal = road.orientation === "h";
    const cross = intersections
      .filter((i) => (horizontal ? i.y === road.y : i.x === road.x))
      .map((i) => (horizontal ? [i.x, i.x + i.w] : [i.y, i.y + i.h]))
      .sort((a, b) => a[0] - b[0]);
    const length = horizontal ? road.w : road.h;
    const centre = horizontal ? road.y + road.h / 2 : road.x + road.w / 2;
    const segments: Array<[number, number]> = [];
    let start = 0;
    for (const [a, b] of cross) {
      segments.push([start, a - 9]);
      start = b + 9;
    }
    segments.push([start, length]);
    segments.forEach(([a, b], si) => {
      if (b - a < 4) return;
      const seg = (offset: number, key: string, props: React.SVGProps<SVGLineElement>) =>
        horizontal ? (
          <line key={key} x1={a} y1={centre + offset} x2={b} y2={centre + offset} {...props} />
        ) : (
          <line key={key} x1={centre + offset} y1={a} x2={centre + offset} y2={b} {...props} />
        );
      if (road.arterial) {
        lines.push(seg(-0.9, `${ri}-${si}-c1`, { stroke: ROAD.centreLine, strokeWidth: 0.7 }));
        lines.push(seg(0.9, `${ri}-${si}-c2`, { stroke: ROAD.centreLine, strokeWidth: 0.7 }));
        for (const o of [-9, 9])
          lines.push(seg(o, `${ri}-${si}-l${o}`, { stroke: ROAD.marking, strokeWidth: 0.7, strokeDasharray: "5 6", opacity: 0.7 }));
      } else {
        lines.push(seg(0, `${ri}-${si}-c`, { stroke: ROAD.marking, strokeWidth: 0.7, strokeDasharray: "6 6", opacity: 0.65 }));
      }
    });
  });

  // Zebra crossings on all four approaches to each junction.
  const zebras: React.ReactNode[] = [];
  intersections.forEach((i, k) => {
    const stripes = (x: number, y: number, w: number, h: number, alongX: boolean, key: string) => {
      const out: React.ReactNode[] = [];
      const n = Math.floor((alongX ? w : h) / 3);
      for (let s = 0; s < n; s++) {
        out.push(
          alongX ? (
            <rect key={`${key}-${s}`} x={x + s * 3 + 0.6} y={y} width={1.6} height={h} fill={ROAD.crossing} opacity={0.72} />
          ) : (
            <rect key={`${key}-${s}`} x={x} y={y + s * 3 + 0.6} width={w} height={1.6} fill={ROAD.crossing} opacity={0.72} />
          ),
        );
      }
      return out;
    };
    zebras.push(...stripes(i.x - 7.5, i.y + 1, 5.5, i.h - 2, false, `z${k}w`));
    zebras.push(...stripes(i.x + i.w + 2, i.y + 1, 5.5, i.h - 2, false, `z${k}e`));
    zebras.push(...stripes(i.x + 1, i.y - 7.5, i.w - 2, 5.5, true, `z${k}n`));
    zebras.push(...stripes(i.x + 1, i.y + i.h + 2, i.w - 2, 5.5, true, `z${k}s`));
  });
  return (
    <g>
      {lines}
      {zebras}
    </g>
  );
}

function shadowFor(o: CityObject, k: number): React.ReactNode {
  switch (o.kind) {
    case "house":
      return <rect key={k} x={o.x + 2.2} y={o.y + 2.8} width={o.w} height={o.h} />;
    case "building":
      return <rect key={k} x={o.x + 4.5} y={o.y + 5.5} width={o.w} height={o.h} />;
    case "tree":
      return <circle key={k} cx={o.cx + o.r * 0.38} cy={o.cy + o.r * 0.48} r={o.r * 0.95} />;
    case "car":
      return (
        <rect
          key={k}
          x={-o.length / 2}
          y={-o.width / 2}
          width={o.length}
          height={o.width}
          rx={2}
          transform={`translate(${o.cx + 1.1} ${o.cy + 1.5}) rotate(${o.angle})`}
        />
      );
    case "hedge":
      return <rect key={k} x={o.x + 1} y={o.y + 1.5} width={o.w} height={o.h} rx={1} />;
    case "shrub":
      return <circle key={k} cx={o.cx + 0.8} cy={o.cy + 1} r={o.r} />;
    default:
      return null;
  }
}

function CityMapImpl({ scene, className, preserveAspectRatio = "xMidYMid slice", vignette = 0.38 }: CityMapProps) {
  const uid = useId();
  const ids = makeSpriteIds(`c${uid}`);
  const shadowId = `${ids.water}-shadow`;
  const grainId = `${ids.water}-grain`;
  const vignetteId = `${ids.water}-vignette`;
  const mowId = `${ids.water}-mow`;

  const by = <K extends CityObject["kind"]>(kind: K) =>
    scene.objects.filter((o): o is Extract<CityObject, { kind: K }> => o.kind === kind);
  const shadowCasters = scene.objects.filter((o) => ["house", "building", "tree", "car", "hedge", "shrub"].includes(o.kind));

  return (
    <svg
      className={className}
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      preserveAspectRatio={preserveAspectRatio}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Satellite view of a city"
      data-target={scene.target}
    >
      <defs>
        <SpriteDefs ids={ids} />
        <filter id={shadowId} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="1.1" />
        </filter>
        <filter id={grainId} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <radialGradient id={vignetteId} cx="50%" cy="50%" r="75%">
          <stop offset="60%" stopColor="#091926" stopOpacity="0" />
          <stop offset="100%" stopColor="#091926" stopOpacity={vignette} />
        </radialGradient>
        <pattern id={mowId} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <rect width="5" height="10" fill="#FFFFFF" opacity="0.045" />
        </pattern>
      </defs>

      {/* Roads are the background; blocks sit on top. */}
      <rect width={scene.width} height={scene.height} fill={ROAD.asphalt} />
      {scene.roads
        .filter((r) => r.arterial)
        .map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={ROAD.arterial} />
        ))}
      <RoadMarkings roads={scene.roads} intersections={scene.intersections} />

      {scene.blocks.map((b, i) => (
        <rect key={i} x={b.rect.x} y={b.rect.y} width={b.rect.w} height={b.rect.h} rx={2.5} fill={ROAD.sidewalk} stroke={ROAD.kerb} strokeWidth={0.8} />
      ))}
      {scene.grounds.map((g, i) => (
        <rect key={i} x={g.x} y={g.y} width={g.w} height={g.h} rx={g.kind === "driveway" ? 0.8 : 1.5} fill={GROUND[g.kind]} />
      ))}
      {scene.grounds
        .filter((g) => g.kind === "park" || g.kind === "bank" || g.kind.startsWith("lawn"))
        .map((g, i) => (
          <rect key={`m${i}`} x={g.x} y={g.y} width={g.w} height={g.h} fill={`url(#${mowId})`} />
        ))}
      {scene.paths.map((p, i) => (
        <g key={i}>
          <path d={p.d} fill="none" stroke={LINEWORK.pathEdge} strokeWidth={p.width + 1.2} strokeLinecap="round" />
          <path d={p.d} fill="none" stroke={LINEWORK.path} strokeWidth={p.width} strokeLinecap="round" />
        </g>
      ))}
      <g stroke={LINEWORK.fence} strokeWidth={0.6} opacity={0.75}>
        {scene.fences.map((f, i) => (
          <line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />
        ))}
      </g>
      <g stroke={LINEWORK.bay} strokeWidth={0.6} opacity={0.85}>
        {scene.bayLines.map((f, i) => (
          <line key={i} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />
        ))}
      </g>

      {by("pool").map((p) => (
        <PoolSprite key={p.id} p={p} ids={ids} />
      ))}
      {by("monument").map((m) => (
        <MonumentSprite key={m.id} m={m} />
      ))}
      {by("lake").map((l) => (
        <LakeSprite key={l.id} l={l} ids={ids} />
      ))}

      {/* One blurred pass for every cast shadow. */}
      <g fill={SHADOW} opacity={0.34} filter={`url(#${shadowId})`}>
        {shadowCasters.map(shadowFor)}
      </g>

      {by("hedge").map((h) => (
        <HedgeSprite key={h.id} h={h} />
      ))}
      {by("shrub").map((s) => (
        <ShrubSprite key={s.id} s={s} />
      ))}
      {by("car").map((c) => (
        <CarSprite key={c.id} c={c} />
      ))}
      {by("building").map((b) => (
        <BuildingSprite key={b.id} b={b} ids={ids} />
      ))}
      {by("house").map((h) => (
        <HouseSprite key={h.id} h={h} />
      ))}
      {by("tree").map((t) => (
        <TreeSprite key={t.id} t={t} ids={ids} />
      ))}

      {/* Sensor look: grain, slight cool grade, vignette. */}
      <rect width={scene.width} height={scene.height} filter={`url(#${grainId})`} opacity={0.1} style={{ mixBlendMode: "overlay" }} />
      <rect width={scene.width} height={scene.height} fill="#18324A" opacity={0.07} style={{ mixBlendMode: "multiply" }} />
      <rect width={scene.width} height={scene.height} fill={`url(#${vignetteId})`} />

    </svg>
  );
}

export const CityMap = memo(CityMapImpl);

export interface DetectionLayerProps {
  scene: CityScene;
  className?: string;
  /** Delay between successive boxes appearing. */
  staggerMs?: number;
  /** Approximate rendered width in px, used to size labels. */
  renderWidthPx?: number;
  /** Labels get cluttered on busy tiles; hide them above this many boxes. */
  maxLabels?: number;
  preserveAspectRatio?: string;
}

/**
 * The "AI detection" overlay: orange boxes around every counted object. Kept in
 * its own SVG so animating it never re-rasterises the (filter-heavy) map below.
 */
export function DetectionLayer({
  scene,
  className,
  staggerMs = 90,
  renderWidthPx = 1440,
  maxLabels = 16,
  preserveAspectRatio = "xMidYMid slice",
}: DetectionLayerProps) {
  const unit = scene.width / renderWidthPx;
  const labelW = (label: string) => (label.length + 6) * 7.4 * unit;
  const showLabels = scene.detections.length <= maxLabels;
  return (
    <svg className={className} viewBox={`0 0 ${scene.width} ${scene.height}`} preserveAspectRatio={preserveAspectRatio} aria-hidden>
      {scene.detections.map((d, i) => (
        <g key={d.id} className="det-box" style={{ animationDelay: `${i * staggerMs}ms` }}>
          <rect
            x={d.box.x}
            y={d.box.y}
            width={d.box.w}
            height={d.box.h}
            fill="#F26522"
            fillOpacity={0.14}
            stroke="#F26522"
            strokeWidth={1.8}
            vectorEffect="non-scaling-stroke"
          />
          {showLabels && (
            <g
              transform={`translate(${Math.min(d.box.x, scene.width - labelW(d.label))} ${
                d.box.y < 16 * unit ? d.box.y + d.box.h + 15 * unit : d.box.y - 1
              })`}
            >
              <rect x={0} y={-14 * unit} width={labelW(d.label)} height={14 * unit} fill="#F26522" />
              <text
                x={4 * unit}
                y={-3.8 * unit}
                fontSize={10 * unit}
                fontWeight={700}
                fill="#FFFFFF"
                fontFamily="Montserrat, Arial, sans-serif"
                letterSpacing={0.3 * unit}
              >
                {d.label} {d.confidence.toFixed(2)}
              </text>
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

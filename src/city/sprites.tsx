import type { Building, Car, Hedge, House, Lake, Monument, Pool, Shrub, Tree } from "./types";
import { CARS, FLAT_ROOFS, GLASS, HEDGE, LINEWORK, MONUMENT, POOL, ROOFS, SHRUB, SOLAR, WATER } from "./palette";

/**
 * Sprite renderers. Sun is from the north-west: north/west roof faces are lit,
 * shadows fall to the south-east (drawn separately by `shadowFor`).
 * `ids` carries the per-map gradient ids so several maps can share a page.
 */

export interface SpriteIds {
  water: string;
  pool: string;
  tree: [string, string, string];
  solar: string;
}

export function HouseSprite({ h: house }: { h: House }) {
  const tone = ROOFS[house.roof];
  // Draw in a local frame where the ridge runs along u (length W, depth H);
  // vertical-ridge houses reflect across the diagonal so their west face is lit.
  const W = house.ridge === "h" ? house.w : house.h;
  const H = house.ridge === "h" ? house.h : house.w;
  const transform =
    house.ridge === "h" ? `translate(${house.x} ${house.y})` : `matrix(0 1 1 0 ${house.x} ${house.y})`;
  const m = H / 2;
  // Hip inset; a square-ish house becomes a pyramid roof.
  const a = Math.min(m, W / 2);
  const sw = 0.55;
  return (
    <g transform={transform}>
      {house.style === "gable" ? (
        <>
          <rect x={0} y={0} width={W} height={m} fill={tone.lit} />
          <rect x={0} y={m} width={W} height={m} fill={tone.shade} />
          <line x1={0.6} y1={m} x2={W - 0.6} y2={m} stroke={tone.ridge} strokeWidth={0.9} strokeLinecap="round" />
          {/* gable-end barge boards */}
          <line x1={0.4} y1={0.4} x2={0.4} y2={H - 0.4} stroke={tone.edge} strokeWidth={0.5} opacity={0.6} />
          <line x1={W - 0.4} y1={0.4} x2={W - 0.4} y2={H - 0.4} stroke={tone.edge} strokeWidth={0.5} opacity={0.6} />
        </>
      ) : (
        <>
          <polygon points={`0,0 ${W},0 ${W - a},${m} ${a},${m}`} fill={tone.lit} />
          <polygon points={`0,${H} ${W},${H} ${W - a},${m} ${a},${m}`} fill={tone.shade} />
          <polygon points={`0,0 ${a},${m} 0,${H}`} fill={tone.lit} opacity={0.82} />
          <polygon points={`${W},0 ${W - a},${m} ${W},${H}`} fill={tone.shade} opacity={0.9} />
          <path
            d={`M0,0 L${a},${m} L0,${H} M${W},0 L${W - a},${m} L${W},${H}`}
            fill="none"
            stroke={tone.ridge}
            strokeWidth={0.45}
            opacity={0.6}
          />
          <line x1={a} y1={m} x2={W - a} y2={m} stroke={tone.ridge} strokeWidth={0.9} strokeLinecap="round" />
        </>
      )}
      {house.chimney && <rect x={W * 0.72} y={m + H * 0.12} width={2.6} height={2.6} fill={tone.edge} opacity={0.85} />}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke={tone.edge} strokeWidth={sw} />
    </g>
  );
}

export function TreeSprite({ t, ids }: { t: Tree; ids: SpriteIds }) {
  const fill = `url(#${ids.tree[t.tone]})`;
  return (
    <g>
      <circle cx={t.cx} cy={t.cy} r={t.r * 0.74} fill={fill} />
      {t.lobes.map((l, i) => (
        <circle key={i} cx={l.cx} cy={l.cy} r={l.r} fill={fill} />
      ))}
      <circle cx={t.cx - t.r * 0.22} cy={t.cy - t.r * 0.26} r={t.r * 0.32} fill="#B9D08F" opacity={0.18} />
    </g>
  );
}

export function LakeSprite({ l, ids }: { l: Lake; ids: SpriteIds }) {
  const shape = (props: React.SVGProps<SVGElement>) => {
    switch (l.shape) {
      case "circle":
        return <circle cx={l.cx} cy={l.cy} r={l.rx} {...(props as React.SVGProps<SVGCircleElement>)} />;
      case "ellipse":
        return (
          <ellipse
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry={l.ry}
            transform={`rotate(${l.rotation} ${l.cx} ${l.cy})`}
            {...(props as React.SVGProps<SVGEllipseElement>)}
          />
        );
      case "rect":
        return (
          <rect
            x={l.cx - l.rx}
            y={l.cy - l.ry}
            width={l.rx * 2}
            height={l.ry * 2}
            rx={2.5}
            {...(props as React.SVGProps<SVGRectElement>)}
          />
        );
      case "blob":
        return <path d={l.path ?? ""} {...(props as React.SVGProps<SVGPathElement>)} />;
    }
  };
  return (
    <g>
      {shape({ fill: WATER.rim, stroke: WATER.rim, strokeWidth: 5, strokeLinejoin: "round" })}
      {shape({ fill: `url(#${ids.water})`, stroke: "#6F8B5E", strokeWidth: 1.2, strokeOpacity: 0.55 })}
      {shape({ fill: "none", stroke: WATER.glint, strokeWidth: 0.7, strokeOpacity: 0.45 })}
      {/* soft sky reflection toward the sun */}
      <ellipse
        cx={l.cx - l.rx * 0.28}
        cy={l.cy - l.ry * 0.32}
        rx={Math.min(l.rx, l.ry) * 0.42}
        ry={Math.min(l.rx, l.ry) * 0.2}
        transform={`rotate(-30 ${l.cx - l.rx * 0.28} ${l.cy - l.ry * 0.32})`}
        fill="#FFFFFF"
        opacity={0.1}
      />
    </g>
  );
}

export function CarSprite({ c }: { c: Car }) {
  const tone = CARS[c.color];
  const L = c.length;
  const W = c.width;
  return (
    <g transform={`translate(${c.cx} ${c.cy}) rotate(${c.angle})`}>
      <rect x={-L / 2} y={-W / 2} width={L} height={W} rx={2.1} fill={tone.body} stroke="#15191D" strokeWidth={0.35} strokeOpacity={0.6} />
      {/* windscreen, roof, rear glass */}
      <path d={`M${L / 2 - 5.6},${-W / 2 + 0.9} L${L / 2 - 2.9},${-W / 2 + 1.3} L${L / 2 - 2.9},${W / 2 - 1.3} L${L / 2 - 5.6},${W / 2 - 0.9} Z`} fill={GLASS} opacity={0.88} />
      <rect x={-L / 2 + 3.9} y={-W / 2 + 1} width={L - 9.6} height={W - 2} rx={0.8} fill={tone.roof} />
      <path d={`M${-L / 2 + 1.5},${-W / 2 + 1.3} L${-L / 2 + 3.7},${-W / 2 + 1} L${-L / 2 + 3.7},${W / 2 - 1} L${-L / 2 + 1.5},${W / 2 - 1.3} Z`} fill={GLASS} opacity={0.8} />
    </g>
  );
}

export function BuildingSprite({ b, ids }: { b: Building; ids: SpriteIds }) {
  const tone = FLAT_ROOFS[b.roof];
  return (
    <g>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={tone.fill} />
      <rect x={b.x + 1.4} y={b.y + 1.4} width={b.w - 2.8} height={b.h - 2.8} fill="none" stroke={tone.parapet} strokeWidth={1.4} />
      {b.solar && (
        <g>
          <rect x={b.solar.x} y={b.solar.y} width={b.solar.w} height={b.solar.h} fill={`url(#${ids.solar})`} stroke={SOLAR.frame} strokeWidth={0.6} />
        </g>
      )}
      {b.units.map((u, i) => (
        <g key={i}>
          <rect x={u.x + 1} y={u.y + 1.3} width={u.w} height={u.h} fill="#000" opacity={0.18} />
          <rect x={u.x} y={u.y} width={u.w} height={u.h} fill={tone.unit} stroke="#5E6266" strokeWidth={0.35} />
          <circle cx={u.x + u.w / 2} cy={u.y + u.h / 2} r={Math.min(u.w, u.h) * 0.28} fill="none" stroke="#6E7276" strokeWidth={0.4} />
        </g>
      ))}
      <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#3F4347" strokeWidth={0.6} strokeOpacity={0.7} />
    </g>
  );
}

export function PoolSprite({ p, ids }: { p: Pool; ids: SpriteIds }) {
  return <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={1.6} fill={`url(#${ids.pool})`} stroke={POOL.coping} strokeWidth={1.1} />;
}

export function HedgeSprite({ h }: { h: Hedge }) {
  return (
    <g>
      <rect x={h.x} y={h.y} width={h.w} height={h.h} rx={1.2} fill={HEDGE.fill} />
      <line x1={h.x + 1} y1={h.y + 0.8} x2={h.x + h.w - 1} y2={h.y + 0.8} stroke={HEDGE.top} strokeWidth={0.8} strokeLinecap="round" />
    </g>
  );
}

export function ShrubSprite({ s }: { s: Shrub }) {
  return <circle cx={s.cx} cy={s.cy} r={s.r} fill={SHRUB.fill} stroke={SHRUB.edge} strokeWidth={0.4} />;
}

export function MonumentSprite({ m }: { m: Monument }) {
  const spokes = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  return (
    <g>
      <circle cx={m.cx} cy={m.cy} r={m.r} fill={MONUMENT.paving} stroke={MONUMENT.ring} strokeWidth={1} />
      <circle cx={m.cx} cy={m.cy} r={m.r * 0.72} fill="none" stroke={MONUMENT.ring} strokeWidth={0.7} />
      {spokes.map((a, i) => (
        <line
          key={i}
          x1={m.cx + Math.cos(a) * m.r * 0.3}
          y1={m.cy + Math.sin(a) * m.r * 0.3}
          x2={m.cx + Math.cos(a) * m.r * 0.72}
          y2={m.cy + Math.sin(a) * m.r * 0.72}
          stroke={MONUMENT.ring}
          strokeWidth={0.5}
        />
      ))}
      <circle cx={m.cx} cy={m.cy} r={m.r * 0.3} fill={MONUMENT.centre} stroke={LINEWORK.pathEdge} strokeWidth={0.6} />
    </g>
  );
}

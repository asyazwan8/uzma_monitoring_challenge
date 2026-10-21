import { createRng, hashSeed, type Rng } from "@/lib/rng";
import { TARGET_LABELS, levelConfig, type CityDensity, type TargetKind } from "@/game/levels";
import type {
  Block,
  Building,
  Car,
  CarColor,
  Circle,
  CityObject,
  CityScene,
  Detection,
  Ground,
  House,
  LakeShape,
  LandUse,
  Line,
  Rect,
  RoofColor,
  Road,
  Tree,
} from "./types";

/**
 * Procedural top-down city. Generation is slot based: every block first lays out
 * the places where a house, tree, lake or car *could* go (all disjoint), then the
 * slots are filled. The target kind is placed in exactly `count` slots and every
 * other slot of that kind is left empty or filled with a clearly different
 * variant, so the true count is guaranteed by construction.
 */

export interface GenerateOptions {
  seed: number;
  level: number;
  target: TargetKind;
  count: number;
  /** Override the tier defaults (the idle attract screen uses a bigger tile). */
  density?: Partial<CityDensity>;
  world?: { width: number; height: number };
}

const BASE_WIDTH = 1600;
const BASE_HEIGHT = 900;
const SIDEWALK = 4;
const LOCAL_ROAD = 22;
const ARTERIAL_ROAD = 34;
const CAR_LENGTH = 15;
const CAR_WIDTH = 7;
/** Real-world size of one world unit (a car is ~5 m long). */
const METRES_PER_UNIT = 0.35;

type Side = "top" | "bottom" | "left" | "right";

interface CarSlot {
  cx: number;
  cy: number;
  angle: number;
  where: "road" | "parking" | "driveway";
}

interface BlockPlan {
  block: Block;
  grounds: Ground[];
  paths: Array<{ d: string; width: number }>;
  fences: Line[];
  bayLines: Line[];
  fixed: CityObject[];
  houses: Array<Rect & { ridge: "h" | "v"; patio?: Rect }>;
  trees: Circle[];
  lakes: Circle[];
  cars: CarSlot[];
}

// ---------------------------------------------------------------------------
// Geometry helpers

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const LAWNS = ["lawn", "lawn", "lawn2", "lawn3"] as const;
const round = (v: number) => Math.round(v * 10) / 10;

function distToSegment(px: number, py: number, l: Line): number {
  const dx = l.x2 - l.x1;
  const dy = l.y2 - l.y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = clamp(((px - l.x1) * dx + (py - l.y1) * dy) / len2, 0, 1);
  return Math.hypot(px - (l.x1 + t * dx), py - (l.y1 + t * dy));
}

function circlesClear(a: Circle, list: readonly Circle[], gap: number): boolean {
  return list.every((b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) >= a.r + b.r + gap);
}

/** Map a rect in a side's local frame (u along the street, v away from it) into world space. */
function fromLocal(b: Rect, side: Side, u: number, v: number, du: number, dv: number): Rect {
  switch (side) {
    case "top":
      return { x: b.x + u, y: b.y + v, w: du, h: dv };
    case "bottom":
      return { x: b.x + u, y: b.y + b.h - v - dv, w: du, h: dv };
    case "left":
      return { x: b.x + v, y: b.y + u, w: dv, h: du };
    case "right":
      return { x: b.x + b.w - v - dv, y: b.y + u, w: dv, h: du };
  }
}

/** Smooth closed outline through noisy polar points (Catmull-Rom -> cubic Bézier). */
export function blobPath(cx: number, cy: number, rx: number, ry: number, rng: Rng, wobble = 0.16): string {
  const n = 10;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.15, 0.15);
    const k = 1 - rng.range(0, wobble);
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${round(pts[0][0])},${round(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${round(c1[0])},${round(c1[1])} ${round(c2[0])},${round(c2[1])} ${round(p2[0])},${round(p2[1])}`;
  }
  return `${d} Z`;
}

function emptyPlan(block: Block): BlockPlan {
  return { block, grounds: [], paths: [], fences: [], bayLines: [], fixed: [], houses: [], trees: [], lakes: [], cars: [] };
}

function inset(r: Rect, d: number): Rect {
  return { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
}

// ---------------------------------------------------------------------------
// Street grid

interface Grid {
  blocks: Rect[];
  roads: Road[];
  intersections: Rect[];
  carSlots: CarSlot[];
}

function spans(total: number, count: number, roadWidths: number[], rng: Rng): Array<[number, number]> {
  const free = total - roadWidths.reduce((a, b) => a + b, 0);
  const weights = Array.from({ length: count }, () => rng.range(0.85, 1.15));
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: Array<[number, number]> = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const size = (weights[i] / sum) * free;
    out.push([cursor, cursor + size]);
    cursor += size + (roadWidths[i] ?? 0);
  }
  return out;
}

function roadCarSlots(road: Road, cross: Array<[number, number]>, rng: Rng): CarSlot[] {
  // Malaysia drives on the left: eastbound traffic keeps to the north lane,
  // southbound traffic to the east lane.
  const half = road.orientation === "h" ? road.h / 2 : road.w / 2;
  const centre = road.orientation === "h" ? road.y + half : road.x + half;
  const lanes = road.arterial ? [-13, -5, 5, 13] : [-5.5, 5.5];
  const length = road.orientation === "h" ? road.w : road.h;
  const segments: Array<[number, number]> = [];
  let start = 0;
  for (const [a, b] of cross) {
    segments.push([start, a]);
    start = b;
  }
  segments.push([start, length]);
  const out: CarSlot[] = [];
  for (const [a, b] of segments) {
    for (const lane of lanes) {
      let t = a + 12 + rng.range(0, 10);
      while (t < b - 12) {
        const forward = lane < 0;
        if (road.orientation === "h") out.push({ cx: t, cy: centre + lane, angle: forward ? 0 : 180, where: "road" });
        else out.push({ cx: centre + lane, cy: t, angle: forward ? 270 : 90, where: "road" });
        t += CAR_LENGTH + 10 + rng.range(0, 8);
      }
    }
  }
  return out;
}

function layoutGrid(width: number, height: number, cols: number, rows: number, rng: Rng): Grid {
  const arterialCol = cols > 2 ? rng.int(1, cols - 1) : -1;
  const arterialRow = rows > 2 ? rng.int(1, rows - 1) : -1;
  const vWidths = Array.from({ length: cols - 1 }, (_, i) => (i + 1 === arterialCol ? ARTERIAL_ROAD : LOCAL_ROAD));
  const hWidths = Array.from({ length: rows - 1 }, (_, i) => (i + 1 === arterialRow ? ARTERIAL_ROAD : LOCAL_ROAD));
  const colSpans = spans(width, cols, vWidths, rng);
  const rowSpans = spans(height, rows, hWidths, rng);

  const blocks: Rect[] = [];
  for (const [y0, y1] of rowSpans) for (const [x0, x1] of colSpans) blocks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });

  const vRoads: Road[] = vWidths.map((w, i) => ({ x: colSpans[i][1], y: 0, w, h: height, orientation: "v", arterial: w === ARTERIAL_ROAD }));
  const hRoads: Road[] = hWidths.map((h, i) => ({ x: 0, y: rowSpans[i][1], w: width, h, orientation: "h", arterial: h === ARTERIAL_ROAD }));
  const intersections: Rect[] = [];
  for (const v of vRoads) for (const h of hRoads) intersections.push({ x: v.x, y: h.y, w: v.w, h: h.h });

  const carSlots: CarSlot[] = [];
  for (const road of hRoads) carSlots.push(...roadCarSlots(road, vRoads.map((v) => [v.x, v.x + v.w]), rng));
  for (const road of vRoads) carSlots.push(...roadCarSlots(road, hRoads.map((h) => [h.y, h.y + h.h]), rng));

  return { blocks, roads: [...hRoads, ...vRoads], intersections, carSlots };
}

// ---------------------------------------------------------------------------
// Block planners

function planResidential(block: Block, rng: Rng): BlockPlan {
  const plan = emptyPlan(block);
  const b = block.rect;
  plan.grounds.push({ ...inset(b, SIDEWALK), kind: "lawn" });
  const horizontal = b.w >= b.h;
  const sides: Side[] = horizontal ? ["top", "bottom"] : ["left", "right"];
  const along = horizontal ? b.w : b.h;
  const depth = (horizontal ? b.h : b.w) / 2;
  // Back fence down the middle of the block.
  if (horizontal) plan.fences.push({ x1: b.x + SIDEWALK, y1: b.y + depth, x2: b.x + b.w - SIDEWALK, y2: b.y + depth });
  else plan.fences.push({ x1: b.x + depth, y1: b.y + SIDEWALK, x2: b.x + depth, y2: b.y + b.h - SIDEWALK });

  for (const side of sides) {
    let u = SIDEWALK;
    while (along - SIDEWALK - u >= 26) {
      const remaining = along - SIDEWALK - u;
      const lotW = remaining < 58 ? remaining : rng.range(32, 40);
      planLot(plan, side, u, lotW, depth, rng);
      u += lotW;
    }
  }
  return plan;
}

function planLot(plan: BlockPlan, side: Side, lotU: number, lotW: number, depth: number, rng: Rng) {
  const b = plan.block.rect;
  const houseDepth = clamp(depth * 0.36, 17, 25) * rng.range(0.92, 1.04);
  const houseW = clamp(lotW * 0.66, 19, 32) * rng.range(0.94, 1.04);
  // Half the lots have a car porch in a deeper front yard.
  const porch = depth - houseDepth > 52 && rng.chance(0.55);
  const setback = porch ? 21 + rng.range(0, 2) : 6 + rng.range(0, 2.5);
  const houseU = lotU + (lotW - houseW) / 2 + rng.range(-1.5, 1.5);
  const v0 = SIDEWALK + setback;
  plan.grounds.push({ ...fromLocal(b, side, lotU + 0.4, SIDEWALK, lotW - 0.8, depth - SIDEWALK), kind: rng.pick(LAWNS) });

  let patio: Rect | undefined;
  let patioDepth = 0;
  if (rng.chance(0.45)) {
    patioDepth = 4.5;
    const pw = houseW * rng.range(0.45, 0.7);
    patio = fromLocal(b, side, houseU + (houseW - pw) / 2, v0 + houseDepth, pw, patioDepth);
  }
  const house = fromLocal(b, side, houseU, v0, houseW, houseDepth);
  plan.houses.push({ ...house, ridge: side === "top" || side === "bottom" ? "h" : "v", patio });

  // Lot boundary fence.
  if (lotU > SIDEWALK + 1) {
    const f = fromLocal(b, side, lotU, SIDEWALK + 2, 0, depth - SIDEWALK - 2);
    plan.fences.push({ x1: f.x, y1: f.y, x2: f.x + f.w, y2: f.y + f.h });
  }

  if (porch) {
    const driveW = 11;
    const driveU = houseU + rng.range(0, houseW - driveW);
    plan.grounds.push({ ...fromLocal(b, side, driveU, SIDEWALK, driveW, setback), kind: "driveway" });
    const slot = fromLocal(b, side, driveU + driveW / 2, SIDEWALK + setback / 2 + 0.5, 0, 0);
    const towardHouse = { top: 90, bottom: 270, left: 0, right: 180 }[side];
    plan.cars.push({ cx: slot.x, cy: slot.y, angle: rng.chance(0.6) ? towardHouse : (towardHouse + 180) % 360, where: "driveway" });
  } else {
    // Short front path to the door.
    const pu = houseU + houseW * rng.range(0.3, 0.6);
    plan.grounds.push({ ...fromLocal(b, side, pu, SIDEWALK, 2.6, setback), kind: "driveway" });
  }

  // Back yard: one tree slot, maybe a pool and a hedge along the back fence.
  const yardStart = v0 + houseDepth + patioDepth + 3;
  const yardDepth = depth - 5 - yardStart;
  const r = rng.range(6.5, 8.5);
  if (yardDepth >= 2 * r + 2) {
    const treeLeft = rng.chance(0.5);
    const tu = treeLeft ? lotU + r + 3 : lotU + lotW - r - 3;
    const tv = yardStart + r + rng.range(0, yardDepth - 2 * r);
    const c = fromLocal(b, side, tu, tv, 0, 0);
    plan.trees.push({ cx: c.x, cy: c.y, r });
    const poolW = 13;
    const poolD = 8;
    if (lotW >= 2 * r + poolW + 9 && yardDepth >= poolD + 2 && rng.chance(0.3)) {
      const pu = treeLeft ? lotU + lotW - poolW - 3 : lotU + 3;
      const pv = yardStart + rng.range(0, yardDepth - poolD);
      plan.fixed.push({ kind: "pool", id: "", ...fromLocal(b, side, pu, pv, poolW, poolD) });
    }
  }
  if (rng.chance(0.18)) {
    plan.fixed.push({ kind: "hedge", id: "", ...fromLocal(b, side, lotU + 3, depth - 4.5, lotW - 6, 3) });
  }
}

function scatterTrees(plan: BlockPlan, area: Rect, rng: Rng, attempts: number, avoid: (c: Circle) => boolean) {
  for (let i = 0; i < attempts; i++) {
    const r = rng.range(6.5, 10);
    const c = { cx: rng.range(area.x + r + 3, area.x + area.w - r - 3), cy: rng.range(area.y + r + 3, area.y + area.h - r - 3), r };
    if (avoid(c)) continue;
    if (!circlesClear(c, plan.trees, 2)) continue;
    plan.trees.push(c);
  }
}

function planPark(block: Block, rng: Rng): BlockPlan {
  const plan = emptyPlan(block);
  const b = block.rect;
  const g = inset(b, SIDEWALK);
  plan.grounds.push({ ...g, kind: "park" });

  // A gently curved footpath across the long axis.
  const horizontal = g.w >= g.h;
  const p0 = horizontal ? [g.x, g.y + g.h * rng.range(0.25, 0.75)] : [g.x + g.w * rng.range(0.25, 0.75), g.y];
  const p2 = horizontal ? [g.x + g.w, g.y + g.h * rng.range(0.25, 0.75)] : [g.x + g.w * rng.range(0.25, 0.75), g.y + g.h];
  const p1 = [g.x + g.w * rng.range(0.3, 0.7), g.y + g.h * rng.range(0.2, 0.8)];
  plan.paths.push({ d: `M${round(p0[0])},${round(p0[1])} Q${round(p1[0])},${round(p1[1])} ${round(p2[0])},${round(p2[1])}`, width: 5 });
  const segs: Line[] = [];
  let prev = p0;
  for (let i = 1; i <= 16; i++) {
    const t = i / 16;
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    segs.push({ x1: prev[0], y1: prev[1], x2: x, y2: y });
    prev = [x, y];
  }
  const nearPath = (c: Circle, gap: number) => segs.some((s) => distToSegment(c.cx, c.cy, s) < c.r + gap);

  const maxLakes = clamp(Math.floor((g.w * g.h) / 7500), 1, 6);
  const maxR = Math.min(30, Math.min(g.w, g.h) * 0.3);
  for (let i = 0; i < 80 && plan.lakes.length < maxLakes; i++) {
    const r = rng.range(16, Math.max(17, maxR));
    const c = { cx: rng.range(g.x + r + 6, g.x + g.w - r - 6), cy: rng.range(g.y + r + 6, g.y + g.h - r - 6), r };
    if (nearPath(c, 6) || !circlesClear(c, plan.lakes, 10)) continue;
    plan.lakes.push(c);
  }
  scatterTrees(plan, g, rng, 260, (c) => nearPath(c, 4) || !circlesClear(c, plan.lakes, 5));
  return plan;
}

function planCommercial(block: Block, rng: Rng, allowSolar: boolean): BlockPlan {
  const plan = emptyPlan(block);
  const b = block.rect;
  const g = inset(b, SIDEWALK);
  plan.grounds.push({ ...g, kind: "concrete" });
  const horizontal = g.w >= g.h;
  const long = horizontal ? g.w : g.h;
  const short = horizontal ? g.h : g.w;
  const buildShare = rng.range(0.38, 0.5);
  const buildFirst = rng.chance(0.5);
  const buildLen = long * buildShare;
  const parkLen = long - buildLen;
  // Local frame: u along the long axis, v across.
  const toWorld = (u: number, v: number, du: number, dv: number): Rect =>
    horizontal ? { x: g.x + u, y: g.y + v, w: du, h: dv } : { x: g.x + v, y: g.y + u, w: dv, h: du };
  const buildU = buildFirst ? 0 : parkLen;
  const parkU = buildFirst ? buildLen : 0;

  // Buildings.
  const twoBuildings = short > 120 && rng.chance(0.5);
  const parts = twoBuildings ? 2 : 1;
  for (let i = 0; i < parts; i++) {
    const pv = (short / parts) * i;
    const rect = toWorld(buildU + 7, pv + 7, buildLen - 14, short / parts - 14);
    plan.fixed.push(makeBuilding(rect, rng, allowSolar));
  }

  // Parking: a planted strip, then rows of bays separated by aisles.
  const lot = toWorld(parkU + 4, 0, parkLen - 8, short);
  plan.grounds.push({ ...lot, kind: "parking" });
  const stripW = 11;
  plan.grounds.push({ ...toWorld(parkU + 4, 0, parkLen - 8, stripW + 1), kind: "lawn" });
  for (let u = parkU + 12; u < parkU + parkLen - 12; u += rng.range(20, 26)) {
    const c = toWorld(u, stripW / 2 + 1, 0, 0);
    plan.trees.push({ cx: c.x, cy: c.y, r: rng.range(5, 6) });
  }
  const bayW = 10;
  const bayD = 18;
  const aisle = 13;
  // Rows: one facing the planted strip, then back-to-back pairs between aisles.
  let v = stripW + 3;
  let row = 0;
  while (v + bayD <= short - 3) {
    const noseOut = row === 0 || row % 2 === 1;
    let u = parkU + 8;
    for (; u + bayW <= parkU + parkLen - 8; u += bayW) {
      const line = toWorld(u, v, 0, bayD);
      plan.bayLines.push({ x1: line.x, y1: line.y, x2: line.x + line.w, y2: line.y + line.h });
      const c = toWorld(u + bayW / 2, v + bayD / 2, 0, 0);
      const angle = horizontal ? (noseOut ? 270 : 90) : noseOut ? 180 : 0;
      plan.cars.push({ cx: c.x, cy: c.y, angle: angle + rng.range(-4, 4), where: "parking" });
    }
    const end = toWorld(u, v, 0, bayD);
    plan.bayLines.push({ x1: end.x, y1: end.y, x2: end.x + end.w, y2: end.y + end.h });
    v += bayD + (row % 2 === 0 ? aisle : 0);
    row++;
  }
  return plan;
}

function makeBuilding(rect: Rect, rng: Rng, allowSolar: boolean): Building {
  const roof = rng.pick(["white", "white", "grey", "dark"] as const);
  const units: Rect[] = [];
  const solar = allowSolar && rect.w > 50 && rect.h > 40 && rng.chance(0.4)
    ? { x: rect.x + 6, y: rect.y + 6, w: rect.w * 0.45, h: rect.h - 12 }
    : null;
  const ux0 = solar ? solar.x + solar.w + 6 : rect.x + 6;
  const n = rng.int(2, 6);
  for (let i = 0; i < n * 3 && units.length < n; i++) {
    const w = rng.range(5, 9);
    const h = rng.range(4, 7);
    const u = { x: rng.range(ux0, rect.x + rect.w - w - 6), y: rng.range(rect.y + 6, rect.y + rect.h - h - 6), w, h };
    if (u.x < ux0) continue;
    if (units.some((o) => u.x < o.x + o.w + 3 && o.x < u.x + u.w + 3 && u.y < o.y + o.h + 3 && o.y < u.y + u.h + 3)) continue;
    units.push(u);
  }
  return { kind: "building", id: "", ...rect, roof, units, solar };
}

function planPlaza(block: Block, rng: Rng, lookalikes: boolean): BlockPlan {
  const plan = emptyPlan(block);
  const b = block.rect;
  const g = inset(b, SIDEWALK);
  plan.grounds.push({ ...g, kind: "plaza" });
  const horizontal = g.w >= g.h;
  // Civic building on one end, open square with trees on the other.
  const share = rng.range(0.32, 0.42);
  const civic = horizontal
    ? { x: g.x + 8, y: g.y + 8, w: g.w * share - 12, h: g.h - 16 }
    : { x: g.x + 8, y: g.y + 8, w: g.w - 16, h: g.h * share - 12 };
  plan.fixed.push(makeBuilding(civic, rng, false));
  const square = horizontal
    ? { x: g.x + g.w * share, y: g.y, w: g.w * (1 - share), h: g.h }
    : { x: g.x, y: g.y + g.h * share, w: g.w, h: g.h * (1 - share) };
  const monuments: Circle[] = [];
  if (lookalikes || rng.chance(0.5)) {
    const r = Math.min(square.w, square.h) * rng.range(0.16, 0.22);
    const m = { cx: square.x + square.w / 2, cy: square.y + square.h / 2, r };
    monuments.push(m);
    plan.fixed.push({ kind: "monument", id: "", ...m });
  }
  // Formal rows of trees around the square.
  const step = rng.range(22, 26);
  for (let x = square.x + 12; x <= square.x + square.w - 12; x += step) {
    for (let y = square.y + 12; y <= square.y + square.h - 12; y += step) {
      const c = { cx: x, cy: y, r: rng.range(6, 7.5) };
      if (circlesClear(c, monuments, 6) && circlesClear(c, plan.trees, 2)) plan.trees.push(c);
    }
  }
  return plan;
}

function planReservoir(block: Block, rng: Rng): BlockPlan {
  const plan = emptyPlan(block);
  const b = block.rect;
  const g = inset(b, SIDEWALK);
  plan.grounds.push({ ...g, kind: "bank" });
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const rx = g.w * 0.36;
  const ry = g.h * 0.34;
  plan.fixed.push({ kind: "lake", id: "", shape: "blob", cx, cy, rx, ry, rotation: 0, path: blobPath(cx, cy, rx, ry, rng, 0.22), target: false });
  scatterTrees(plan, g, rng, 160, (c) => ((c.cx - cx) / (rx + c.r + 6)) ** 2 + ((c.cy - cy) / (ry + c.r + 6)) ** 2 < 1);
  return plan;
}

// ---------------------------------------------------------------------------
// Land use

const CARRIER: Record<TargetKind, LandUse> = {
  blueHouse: "residential",
  circleLake: "park",
  tree: "park",
  car: "commercial",
};

function landUseWeights(target: TargetKind, clutter: number): Record<LandUse, number> {
  const open = 1 - clutter;
  const base: Record<LandUse, number> = {
    residential: 0.45 + clutter * 0.2,
    park: 0.15 + open * 0.2,
    commercial: 0.16,
    plaza: 0.07,
    reservoir: 0.05,
  };
  base[CARRIER[target]] += 0.2;
  if (target === "car") base.residential -= 0.1;
  return base;
}

function pickUse(weights: Record<LandUse, number>, rng: Rng): LandUse {
  const entries = Object.entries(weights) as Array<[LandUse, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let t = rng.next() * total;
  for (const [use, w] of entries) {
    t -= w;
    if (t <= 0) return use;
  }
  return "residential";
}

// ---------------------------------------------------------------------------
// Filling

const ROOF_DISTRACTORS: RoofColor[] = ["terracotta", "terracotta", "charcoal", "sand", "grey", "grey", "brick"];
const ROOF_LOOKALIKES: RoofColor[] = ["slate", "teal"];
const CAR_COLORS: Array<[CarColor, number]> = [
  ["white", 30],
  ["silver", 20],
  ["black", 15],
  ["grey", 12],
  ["red", 8],
  ["navy", 8],
  ["beige", 7],
];

function pickCarColor(rng: Rng): CarColor {
  let t = rng.next() * 100;
  for (const [c, w] of CAR_COLORS) {
    t -= w;
    if (t <= 0) return c;
  }
  return "white";
}

function makeTree(c: Circle, rng: Rng, target: boolean): Tree {
  const lobes: Circle[] = [];
  const n = rng.int(5, 7);
  const offset = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = offset + (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const lr = c.r * rng.range(0.4, 0.5);
    const d = c.r - lr - rng.range(0, c.r * 0.06);
    lobes.push({ cx: round(c.cx + Math.cos(a) * d), cy: round(c.cy + Math.sin(a) * d), r: round(lr) });
  }
  return { kind: "tree", id: "", cx: round(c.cx), cy: round(c.cy), r: round(c.r), tone: rng.int(0, 2) as 0 | 1 | 2, lobes, target };
}

function makeLake(c: Circle, shape: LakeShape, rng: Rng, target: boolean, lookalike: boolean): CityObject {
  const base = { kind: "lake" as const, id: "", cx: round(c.cx), cy: round(c.cy), target, path: null as string | null };
  switch (shape) {
    case "circle": {
      const r = round(c.r * rng.range(0.8, 1));
      return { ...base, shape, rx: r, ry: r, rotation: 0 };
    }
    case "ellipse": {
      const aspect = lookalike ? rng.range(1.4, 1.5) : rng.range(1.75, 2.2);
      return { ...base, shape, rx: round(c.r), ry: round(c.r / aspect), rotation: Math.round(rng.range(0, 180)) };
    }
    case "rect": {
      const vertical = rng.chance(0.5);
      const w = c.r * 1.45;
      const h = c.r * 0.95;
      return { ...base, shape, rx: round((vertical ? h : w) / 2), ry: round((vertical ? w : h) / 2), rotation: 0 };
    }
    case "blob": {
      const rx = c.r * 0.92;
      const ry = c.r * rng.range(0.6, 0.78);
      return { ...base, shape, rx: round(rx), ry: round(ry), rotation: 0, path: blobPath(c.cx, c.cy, rx, ry, rng, 0.2) };
    }
  }
}

export function objectBox(o: CityObject): Rect {
  switch (o.kind) {
    case "tree":
    case "shrub":
    case "monument":
      return { x: o.cx - o.r, y: o.cy - o.r, w: o.r * 2, h: o.r * 2 };
    case "lake": {
      if (o.rotation === 0) return { x: o.cx - o.rx, y: o.cy - o.ry, w: o.rx * 2, h: o.ry * 2 };
      const t = (o.rotation * Math.PI) / 180;
      const hw = Math.sqrt((o.rx * Math.cos(t)) ** 2 + (o.ry * Math.sin(t)) ** 2);
      const hh = Math.sqrt((o.rx * Math.sin(t)) ** 2 + (o.ry * Math.cos(t)) ** 2);
      return { x: o.cx - hw, y: o.cy - hh, w: hw * 2, h: hh * 2 };
    }
    case "car": {
      const t = (o.angle * Math.PI) / 180;
      const hw = (Math.abs(Math.cos(t)) * o.length + Math.abs(Math.sin(t)) * o.width) / 2;
      const hh = (Math.abs(Math.sin(t)) * o.length + Math.abs(Math.cos(t)) * o.width) / 2;
      return { x: o.cx - hw, y: o.cy - hh, w: hw * 2, h: hh * 2 };
    }
    default:
      return { x: o.x, y: o.y, w: o.w, h: o.h };
  }
}

function pad(r: Rect, p: number): Rect {
  return { x: round(r.x - p), y: round(r.y - p), w: round(r.w + 2 * p), h: round(r.h + 2 * p) };
}

// ---------------------------------------------------------------------------

export function generateCity(opts: GenerateOptions): CityScene {
  const config = levelConfig(opts.level);
  const density: CityDensity = { ...config.city, ...opts.density };
  const width = opts.world?.width ?? Math.round(BASE_WIDTH / density.scale);
  const height = opts.world?.height ?? Math.round(BASE_HEIGHT / density.scale);
  const rng = createRng(hashSeed(opts.seed, "city", opts.level, opts.target));
  const { target, count } = opts;

  const grid = layoutGrid(width, height, density.cols, density.rows, rng.fork("grid"));
  const weights = landUseWeights(target, density.clutter);
  const useRng = rng.fork("uses");
  const uses: LandUse[] = grid.blocks.map(() => pickUse(weights, useRng));

  const plan = (i: number): BlockPlan => {
    const block: Block = { rect: grid.blocks[i], use: uses[i] };
    const r = rng.fork(`block-${i}-${uses[i]}`);
    switch (uses[i]) {
      case "residential":
        return planResidential(block, r);
      case "park":
        return planPark(block, r);
      case "commercial":
        return planCommercial(block, r, target !== "blueHouse");
      case "plaza":
        return planPlaza(block, r, density.lookalikes);
      case "reservoir":
        return planReservoir(block, r);
    }
  };

  // Lay out blocks, converting more blocks to the target's carrier use until
  // there are enough slots for the true count plus its distractors.
  const lakeDistractors = Math.round(count * density.distractorRatio * 0.25);
  const required = target === "circleLake" ? count + lakeDistractors : Math.ceil(count * 1.3);
  const slotCount = (plans: BlockPlan[]) => {
    switch (target) {
      case "blueHouse":
        return plans.reduce((s, p) => s + p.houses.length, 0);
      case "circleLake":
        return plans.reduce((s, p) => s + p.lakes.length, 0);
      case "tree":
        return plans.reduce((s, p) => s + p.trees.length, 0);
      case "car":
        return plans.reduce((s, p) => s + p.cars.length, 0) + grid.carSlots.length;
    }
  };
  let plans = grid.blocks.map((_, i) => plan(i));
  const convertOrder = rng.fork("convert").shuffle(grid.blocks.map((_, i) => i));
  for (const i of convertOrder) {
    if (slotCount(plans) >= required) break;
    if (uses[i] === CARRIER[target]) continue;
    uses[i] = CARRIER[target];
    plans = plans.map((p, j) => (j === i ? plan(i) : p));
  }
  if (slotCount(plans) < count) {
    throw new Error(`City too small for ${count} ${target} (level ${opts.level}, seed ${opts.seed})`);
  }

  const fill = rng.fork("fill");
  const objects: CityObject[] = [];
  const grounds: Ground[] = [];
  const paths: Array<{ d: string; width: number }> = [];
  const fences: Line[] = [];
  const bayLines: Line[] = [];
  for (const p of plans) {
    grounds.push(...p.grounds);
    paths.push(...p.paths);
    fences.push(...p.fences);
    bayLines.push(...p.bayLines);
    objects.push(...p.fixed);
  }

  const chooseTargets = (n: number): Set<number> => new Set(fill.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, count));

  // Houses.
  const houseSlots = plans.flatMap((p) => p.houses);
  const blueSet = target === "blueHouse" ? chooseTargets(houseSlots.length) : new Set<number>();
  houseSlots.forEach((slot, i) => {
    const isTarget = blueSet.has(i);
    let roof: RoofColor;
    if (isTarget) roof = "blue";
    else if (target === "blueHouse") {
      if (fill.chance(0.06)) return;
      roof = density.lookalikes && fill.chance(0.28) ? fill.pick(ROOF_LOOKALIKES) : fill.pick(ROOF_DISTRACTORS);
    } else {
      if (fill.chance(0.07)) return;
      roof = fill.chance(0.1) ? "blue" : fill.pick(ROOF_DISTRACTORS);
    }
    if (slot.patio) grounds.push({ ...slot.patio, kind: "driveway" });
    const house: House = {
      kind: "house",
      id: "",
      x: round(slot.x),
      y: round(slot.y),
      w: round(slot.w),
      h: round(slot.h),
      ridge: slot.ridge,
      style: fill.chance(0.55) ? "hip" : "gable",
      roof,
      chimney: fill.chance(0.3),
      target: isTarget,
    };
    objects.push(house);
  });

  // Lakes.
  const lakeSlots = plans.flatMap((p) => p.lakes);
  if (target === "circleLake") {
    const order = fill.shuffle(lakeSlots.map((_, i) => i));
    order.forEach((slotIndex, k) => {
      const slot = lakeSlots[slotIndex];
      if (k < count) objects.push(makeLake(slot, "circle", fill, true, false));
      else if (k < count + lakeDistractors) {
        const lookalike = density.lookalikes && fill.chance(0.35);
        const shape: LakeShape = lookalike ? "ellipse" : fill.pick(["ellipse", "blob", "blob", "rect"] as const);
        objects.push(makeLake(slot, shape, fill, false, lookalike));
      }
    });
  } else {
    for (const slot of lakeSlots) {
      if (!fill.chance(0.5)) continue;
      objects.push(makeLake(slot, fill.pick(["circle", "ellipse", "blob", "blob"] as const), fill, false, false));
    }
  }

  // Trees.
  const treeSlots = plans.flatMap((p) => p.trees);
  if (target === "tree") {
    const chosen = chooseTargets(treeSlots.length);
    let shrubs = density.lookalikes ? Math.round(count * density.distractorRatio * 0.3) : 0;
    treeSlots.forEach((slot, i) => {
      if (chosen.has(i)) objects.push(makeTree(slot, fill, true));
      else if (shrubs > 0 && fill.chance(0.3)) {
        shrubs--;
        objects.push({ kind: "shrub", id: "", cx: round(slot.cx), cy: round(slot.cy), r: round(fill.range(3, 3.8)) });
      }
    });
  } else {
    const rate = 0.45 + density.clutter * 0.45;
    for (const slot of treeSlots) if (fill.chance(rate)) objects.push(makeTree(slot, fill, false));
  }

  // Cars.
  const carSlots = [...plans.flatMap((p) => p.cars), ...grid.carSlots];
  const makeCar = (s: CarSlot, isTarget: boolean): Car => ({
    kind: "car",
    id: "",
    cx: round(s.cx),
    cy: round(s.cy),
    length: CAR_LENGTH,
    width: CAR_WIDTH,
    angle: Math.round(s.angle),
    color: pickCarColor(fill),
    target: isTarget,
  });
  if (target === "car") {
    const chosen = chooseTargets(carSlots.length);
    carSlots.forEach((s, i) => chosen.has(i) && objects.push(makeCar(s, true)));
  } else {
    const rates = { road: density.clutter * 0.3, parking: density.clutter * 0.7, driveway: 0.45 };
    for (const s of carSlots) if (fill.chance(rates[s.where])) objects.push(makeCar(s, false));
  }

  // Stable ids and the detections the AI overlay draws on reveal.
  const counters: Record<string, number> = {};
  for (const o of objects) {
    counters[o.kind] = (counters[o.kind] ?? 0) + 1;
    o.id = `${o.kind}-${counters[o.kind]}`;
  }
  const detections: Detection[] = objects
    .filter((o) => "target" in o && o.target)
    .map((o) => ({
      id: o.id,
      box: pad(objectBox(o), o.kind === "lake" ? 3 : 2),
      label: TARGET_LABELS[target].className,
      confidence: Math.round(fill.range(0.962, 0.998) * 1000) / 1000,
    }));

  const tileRng = rng.fork("caption");
  const lat = 3.05 + tileRng.range(0, 0.2);
  const lon = 101.55 + tileRng.range(0, 0.25);
  return {
    width,
    height,
    seed: opts.seed,
    level: opts.level,
    target,
    count,
    roads: grid.roads,
    intersections: grid.intersections,
    blocks: plans.map((p) => p.block),
    grounds,
    paths,
    fences,
    bayLines,
    objects,
    detections,
    caption: {
      tile: `T${String(opts.level).padStart(2, "0")}-${(opts.seed >>> 0).toString(16).slice(-4).toUpperCase().padStart(4, "0")}`,
      lat: `${lat.toFixed(4)}°N`,
      lon: `${lon.toFixed(4)}°E`,
      gsdM: Math.round(((METRES_PER_UNIT * width) / 1440) * 100) / 100,
    },
  };
}

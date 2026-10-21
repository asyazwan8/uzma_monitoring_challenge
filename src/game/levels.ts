/**
 * The single tuning table for the challenge. Every level is one 10-second window
 * in which the player views the tile and answers. Difficulty grows with the city:
 * each tier of five levels shows a bigger grid of blocks (2x2, 2x3, 3x3, 3x4),
 * zoomed out so objects get smaller, and from Hard onwards adds look-alike
 * distractors. Tweak numbers here after playtesting.
 */

export type Tier = "easy" | "medium" | "hard" | "extreme";
export type TargetKind = "blueHouse" | "circleLake" | "tree" | "car";

export const TARGET_KINDS: readonly TargetKind[] = ["blueHouse", "circleLake", "tree", "car"];
export const TOTAL_LEVELS = 20;
/** One window per level to view the tile and answer on the phone. */
export const ROUND_MS = 10_000;

export interface TierInfo {
  id: Tier;
  index: number;
  label: string;
  levels: [number, number];
  blurb: string;
}

export const TIERS: readonly TierInfo[] = [
  { id: "easy", index: 0, label: "Easy", levels: [1, 5], blurb: "A small neighbourhood, up close." },
  { id: "medium", index: 1, label: "Medium", levels: [6, 10], blurb: "A wider view. More to count." },
  { id: "hard", index: 2, label: "Hard", levels: [11, 15], blurb: "Look-alikes appear. Stay sharp." },
  { id: "extreme", index: 3, label: "Extreme", levels: [16, 20], blurb: "The whole district, zoomed out." },
];

export interface CityDensity {
  /** Zoom of the rendered tile: the world is 1600/scale x 900/scale units. Larger means bigger objects. */
  scale: number;
  /** City blocks across. */
  cols: number;
  /** City blocks down. */
  rows: number;
  /** 0..1 how full non-target slots are (background clutter). */
  clutter: number;
  /** How many distractors of the target's own family to add, relative to the target count. */
  distractorRatio: number;
  /** Adds near-similar distractors (slate/teal roofs, roundabouts, shrubs). */
  lookalikes: boolean;
}

export interface LevelConfig {
  level: number;
  tier: Tier;
  /** Inclusive range the true count is drawn from. */
  count: [number, number];
  /** View-and-answer window; ROUND_MS for every level. */
  answerWindowMs: number;
  basePoints: number;
  city: CityDensity;
}

// Grid (rows x cols) and zoom per tier. The landscape tile gets the wider side.
const TIER_CITY: Record<Tier, CityDensity> = {
  easy: { scale: 2.5, rows: 2, cols: 2, clutter: 0.35, distractorRatio: 1.2, lookalikes: false },
  medium: { scale: 2.0, rows: 2, cols: 3, clutter: 0.5, distractorRatio: 1.6, lookalikes: false },
  hard: { scale: 1.65, rows: 3, cols: 3, clutter: 0.6, distractorRatio: 2.0, lookalikes: true },
  extreme: { scale: 1.5, rows: 3, cols: 4, clutter: 0.7, distractorRatio: 2.4, lookalikes: true },
};

const BASE_POINTS: Record<Tier, number> = { easy: 100, medium: 200, hard: 350, extreme: 500 };

// [min, max] true count per level; the bigger grid at 6, 11 and 16 is the tier step.
const LEVEL_TABLE: ReadonlyArray<[number, number]> = [
  [2, 3], [3, 4], [4, 5], [5, 6], [6, 7],
  [7, 8], [8, 9], [9, 10], [10, 11], [11, 12],
  [12, 13], [13, 14], [14, 15], [15, 16], [16, 17],
  [17, 18], [18, 20], [19, 21], [20, 22], [22, 24],
];

export function tierForLevel(level: number): Tier {
  return TIERS[Math.min(3, Math.floor((level - 1) / 5))].id;
}

export function tierInfo(tier: Tier): TierInfo {
  return TIERS.find((t) => t.id === tier)!;
}

export function levelConfig(level: number): LevelConfig {
  if (!Number.isInteger(level) || level < 1 || level > TOTAL_LEVELS) {
    throw new RangeError(`level must be 1..${TOTAL_LEVELS}, got ${level}`);
  }
  const [min, max] = LEVEL_TABLE[level - 1];
  const tier = tierForLevel(level);
  return {
    level,
    tier,
    count: [min, max],
    answerWindowMs: ROUND_MS,
    basePoints: BASE_POINTS[tier],
    city: TIER_CITY[tier],
  };
}

export const LEVELS: readonly LevelConfig[] = Array.from({ length: TOTAL_LEVELS }, (_, i) => levelConfig(i + 1));

/** "2×2": the tier's grid of city blocks, rows × cols. */
export function gridLabel(tier: Tier): string {
  const { rows, cols } = TIER_CITY[tier];
  return `${rows}×${cols}`;
}

/** On-screen pixels per world unit when the tile is drawn 1440 px wide. */
export function pxPerUnit(tier: Tier): number {
  return (1440 * TIER_CITY[tier].scale) / 1600;
}

/**
 * Delay between AI detection boxes appearing on reveal, so all n land within
 * about 1.8 s. Shared by the map overlay and the reveal sound cues.
 */
export function revealStaggerMs(n: number): number {
  return Math.min(120, 1800 / Math.max(1, n));
}

/** When the correct/missed verdict lands on reveal: after the last detection box. */
export function revealVerdictDelayMs(n: number): number {
  return Math.round(Math.min(n, 30) * revealStaggerMs(n)) + 150;
}

/** True when this level is the first of a new tier (shows the tier banner). */
export function startsTier(level: number): boolean {
  return (level - 1) % 5 === 0;
}

export interface TargetLabel {
  singular: string;
  plural: string;
  /** Short detection class used on the AI overlay. */
  className: string;
}

export const TARGET_LABELS: Record<TargetKind, TargetLabel> = {
  blueHouse: { singular: "blue house", plural: "blue houses", className: "HOUSE_BLUE" },
  circleLake: { singular: "circular lake", plural: "circular lakes", className: "LAKE_CIRCULAR" },
  tree: { singular: "tree", plural: "trees", className: "TREE" },
  car: { singular: "car", plural: "cars", className: "VEHICLE_CAR" },
};

export const TARGET_HINTS: Record<TargetKind, string> = {
  blueHouse: "Only houses with blue roofs. Slate and teal roofs do not count.",
  circleLake: "Only round lakes. Oval, irregular and square water does not count.",
  tree: "Every individual tree canopy. Hedges and lawns do not count.",
  car: "Every car, parked or on the road.",
};

/**
 * The single tuning table for the challenge. Every five levels is a clear step up
 * in difficulty: more objects, shorter viewing time, a denser city and, from Hard
 * onwards, look-alike distractors. Tweak numbers here after playtesting.
 */

export type Tier = "easy" | "medium" | "hard" | "extreme";
export type TargetKind = "blueHouse" | "circleLake" | "tree" | "car";

export const TARGET_KINDS: readonly TargetKind[] = ["blueHouse", "circleLake", "tree", "car"];
export const TOTAL_LEVELS = 20;

export interface TierInfo {
  id: Tier;
  index: number;
  label: string;
  levels: [number, number];
  blurb: string;
}

export const TIERS: readonly TierInfo[] = [
  { id: "easy", index: 0, label: "Easy", levels: [1, 5], blurb: "A few objects, plenty of time." },
  { id: "medium", index: 1, label: "Medium", levels: [6, 10], blurb: "More objects. Less time." },
  { id: "hard", index: 2, label: "Hard", levels: [11, 15], blurb: "Look-alikes appear. Stay sharp." },
  { id: "extreme", index: 3, label: "Extreme", levels: [16, 20], blurb: "A dense city in a blink." },
];

export interface CityDensity {
  /** Zoom of the rendered tile. Larger means bigger objects and fewer blocks. */
  scale: number;
  cols: number;
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
  exposureMs: number;
  answerWindowMs: number;
  basePoints: number;
  city: CityDensity;
}

const TIER_CITY: Record<Tier, CityDensity> = {
  easy: { scale: 1.6, cols: 4, rows: 3, clutter: 0.35, distractorRatio: 1.5, lookalikes: false },
  medium: { scale: 1.3, cols: 5, rows: 3, clutter: 0.5, distractorRatio: 2, lookalikes: false },
  hard: { scale: 1.12, cols: 6, rows: 4, clutter: 0.65, distractorRatio: 2.4, lookalikes: true },
  extreme: { scale: 1, cols: 7, rows: 4, clutter: 0.8, distractorRatio: 2.8, lookalikes: true },
};

const TIER_RULES: Record<Tier, { answerWindowMs: number; basePoints: number }> = {
  easy: { answerWindowMs: 12000, basePoints: 100 },
  medium: { answerWindowMs: 11000, basePoints: 200 },
  hard: { answerWindowMs: 10000, basePoints: 350 },
  extreme: { answerWindowMs: 9000, basePoints: 500 },
};

// [min count, max count, exposure ms] per level. Note the jumps at 6, 11 and 16.
const LEVEL_TABLE: ReadonlyArray<[number, number, number]> = [
  [3, 4, 8000], [4, 5, 7500], [5, 6, 7000], [6, 7, 6500], [7, 8, 6000],
  [9, 10, 5500], [10, 11, 5250], [11, 12, 5000], [12, 13, 4750], [13, 14, 4500],
  [15, 16, 4000], [16, 17, 3750], [17, 18, 3500], [18, 19, 3250], [19, 20, 3000],
  [22, 23, 2500], [24, 25, 2250], [26, 27, 2000], [28, 29, 1750], [30, 31, 1500],
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
  const [min, max, exposureMs] = LEVEL_TABLE[level - 1];
  const tier = tierForLevel(level);
  return {
    level,
    tier,
    count: [min, max],
    exposureMs,
    ...TIER_RULES[tier],
    city: TIER_CITY[tier],
  };
}

export const LEVELS: readonly LevelConfig[] = Array.from({ length: TOTAL_LEVELS }, (_, i) => levelConfig(i + 1));

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

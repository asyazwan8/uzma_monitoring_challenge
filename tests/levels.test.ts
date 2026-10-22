import { describe, expect, it } from "vitest";
import {
  LEVELS,
  LIVES,
  ROUND_MS,
  TIERS,
  TOTAL_LEVELS,
  gridLabel,
  levelConfig,
  pxPerUnit,
  revealStaggerMs,
  revealVerdictDelayMs,
  startsTier,
  tierForLevel,
} from "@/game/levels";
import { livePoints } from "@/game/scoring";

describe("levels", () => {
  it("has 20 levels in four tiers of five", () => {
    expect(LEVELS).toHaveLength(TOTAL_LEVELS);
    expect(LEVELS.map((l) => l.tier)).toEqual([
      ...Array(5).fill("easy"),
      ...Array(5).fill("medium"),
      ...Array(5).fill("hard"),
      ...Array(5).fill("extreme"),
    ]);
    expect([1, 6, 11, 16].every(startsTier)).toBe(true);
    expect([2, 5, 10, 15, 20].some(startsTier)).toBe(false);
    expect(tierForLevel(20)).toBe("extreme");
  });

  it("grows the city 2x2 -> 2x3 -> 3x3 -> 3x4, zooming out each tier", () => {
    expect(TIERS.map((t) => gridLabel(t.id))).toEqual(["2×2", "2×3", "3×3", "3×4"]);
    for (let i = 1; i < TIERS.length; i++) {
      expect(pxPerUnit(TIERS[i].id)).toBeLessThan(pxPerUnit(TIERS[i - 1].id));
    }
  });

  it("gives every level the same 15 second view-and-answer window and 3 lives per run", () => {
    expect(ROUND_MS).toBe(15_000);
    expect(LIVES).toBe(3);
    for (const l of LEVELS) {
      expect(l.answerWindowMs).toBe(ROUND_MS);
      expect(l).not.toHaveProperty("exposureMs");
    }
  });

  it("asks for more objects every level", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].count[0]).toBeGreaterThan(LEVELS[i - 1].count[0]);
      expect(LEVELS[i].count[1]).toBeGreaterThanOrEqual(LEVELS[i].count[0]);
      expect(LEVELS[i].basePoints).toBeGreaterThanOrEqual(LEVELS[i - 1].basePoints);
    }
    expect(LEVELS[0].count[0]).toBeLessThanOrEqual(3);
  });

  it("steps up clearly at each tier boundary: bigger grid, smaller objects, more points", () => {
    for (const first of [6, 11, 16]) {
      const prev = levelConfig(first - 1);
      const next = levelConfig(first);
      expect(next.city.cols * next.city.rows).toBeGreaterThan(prev.city.cols * prev.city.rows);
      expect(next.city.scale).toBeLessThan(prev.city.scale);
      expect(next.basePoints).toBeGreaterThan(prev.basePoints);
    }
  });

  it("drains points-if-exact from the full base to half", () => {
    expect(livePoints(200, 0)).toBe(200);
    expect(livePoints(200, ROUND_MS / 2)).toBe(150);
    expect(livePoints(200, ROUND_MS)).toBe(100);
    expect(livePoints(200, ROUND_MS * 3)).toBe(100);
    expect(livePoints(200, -50)).toBe(200);
  });

  it("lands the reveal verdict after the last detection box", () => {
    for (const n of [1, 5, 15, 24, 40]) {
      const lastBox = (Math.min(n, 30) - 1) * revealStaggerMs(n);
      expect(revealVerdictDelayMs(n)).toBeGreaterThan(lastBox);
      expect(revealVerdictDelayMs(n)).toBeLessThanOrEqual(1800 + 150);
    }
  });

  it("rejects out-of-range levels", () => {
    expect(() => levelConfig(0)).toThrow();
    expect(() => levelConfig(21)).toThrow();
  });
});

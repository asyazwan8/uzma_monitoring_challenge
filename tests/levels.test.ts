import { describe, expect, it } from "vitest";
import { LEVELS, TOTAL_LEVELS, levelConfig, startsTier, tierForLevel } from "@/game/levels";

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

  it("gets harder every level: more objects, less time", () => {
    for (let i = 1; i < LEVELS.length; i++) {
      expect(LEVELS[i].count[0]).toBeGreaterThan(LEVELS[i - 1].count[0]);
      expect(LEVELS[i].exposureMs).toBeLessThan(LEVELS[i - 1].exposureMs);
      expect(LEVELS[i].basePoints).toBeGreaterThanOrEqual(LEVELS[i - 1].basePoints);
    }
  });

  it("jumps clearly at each tier boundary", () => {
    for (const first of [6, 11, 16]) {
      const prev = levelConfig(first - 1);
      const next = levelConfig(first);
      expect(next.count[0] - prev.count[0]).toBeGreaterThanOrEqual(2);
      expect(next.city.cols * next.city.rows).toBeGreaterThan(prev.city.cols * prev.city.rows);
      expect(next.basePoints).toBeGreaterThan(prev.basePoints);
    }
  });

  it("rejects out-of-range levels", () => {
    expect(() => levelConfig(0)).toThrow();
    expect(() => levelConfig(21)).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { roundAccuracy, roundPoints, speedFactor, summarise, type RoundResult } from "@/game/scoring";

const result = (patch: Partial<RoundResult>): RoundResult => ({
  level: 1,
  tier: "easy",
  target: "car",
  truth: 10,
  answer: 10,
  reactionMs: 2000,
  answerWindowMs: 10000,
  accuracy: 1,
  points: 100,
  correct: true,
  ...patch,
});

describe("scoring", () => {
  it("scores accuracy by relative error", () => {
    expect(roundAccuracy(10, 10)).toBe(1);
    expect(roundAccuracy(9, 10)).toBeCloseTo(0.9);
    expect(roundAccuracy(12, 10)).toBeCloseTo(0.8);
    expect(roundAccuracy(25, 10)).toBe(0);
    expect(roundAccuracy(null, 10)).toBe(0);
  });

  it("rewards speed between 50% and 100% of base", () => {
    expect(speedFactor(0, 10000)).toBe(1);
    expect(speedFactor(10000, 10000)).toBe(0);
    expect(speedFactor(20000, 10000)).toBe(0);
    expect(speedFactor(null, 10000)).toBe(0);
    expect(roundPoints(200, 1, 1)).toBe(200);
    expect(roundPoints(200, 1, 0)).toBe(100);
    expect(roundPoints(200, 0.5, 0.5)).toBe(75);
    expect(roundPoints(200, 0, 1)).toBe(0);
  });

  it("summarises a run", () => {
    const s = summarise(
      [
        result({ points: 90, reactionMs: 2000 }),
        result({ points: 80, reactionMs: 3000 }),
        result({ answer: 9, accuracy: 0.9, correct: false, points: 40, reactionMs: 4000 }),
      ],
      20,
    );
    expect(s.score).toBe(210);
    expect(s.levelsCleared).toBe(2);
    expect(s.accuracyPct).toBe(96.7);
    expect(s.avgReactionMs).toBe(3000);
    expect(s.completed).toBe(false);
  });

  it("excludes timeouts from the average reaction", () => {
    const s = summarise([result({ reactionMs: 1000 }), result({ answer: null, reactionMs: null, accuracy: 0, correct: false })], 20);
    expect(s.avgReactionMs).toBe(1000);
    expect(s.accuracyPct).toBe(50);
  });
});

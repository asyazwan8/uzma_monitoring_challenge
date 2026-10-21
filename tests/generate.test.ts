import { describe, expect, it } from "vitest";
import { generateCity, objectBox } from "@/city/generate";
import { LEVELS, TARGET_KINDS, type TargetKind } from "@/game/levels";
import type { CityObject, CityScene, Rect } from "@/city/types";

const SEEDS = Array.from({ length: 12 }, (_, i) => 1000 + i * 7919);

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

function targetsOf(scene: CityScene): CityObject[] {
  return scene.objects.filter((o) => "target" in o && o.target);
}

/** Everything a player could mistake for (or must count as) the target. */
function countable(scene: CityScene, target: TargetKind): CityObject[] {
  switch (target) {
    case "blueHouse":
      return scene.objects.filter((o) => o.kind === "house" && o.roof === "blue");
    case "circleLake":
      return scene.objects.filter((o) => o.kind === "lake" && o.shape === "circle");
    case "tree":
      return scene.objects.filter((o) => o.kind === "tree");
    case "car":
      return scene.objects.filter((o) => o.kind === "car");
  }
}

describe("generateCity", () => {
  for (const config of LEVELS) {
    for (const target of TARGET_KINDS) {
      it(`level ${config.level} ${target}: exact count, no overlaps`, () => {
        for (const seed of SEEDS) {
          for (const count of [config.count[0], config.count[1]]) {
            const scene = generateCity({ seed, level: config.level, target, count });
            expect(targetsOf(scene)).toHaveLength(count);
            // What the eye sees must match the truth too, not just the flag.
            expect(countable(scene, target)).toHaveLength(count);
            expect(scene.detections).toHaveLength(count);

            const items = countable(scene, target);
            const boxes = items.map(objectBox);
            for (let i = 0; i < boxes.length; i++) {
              expect(boxes[i].x).toBeGreaterThanOrEqual(-1);
              expect(boxes[i].y).toBeGreaterThanOrEqual(-1);
              expect(boxes[i].x + boxes[i].w).toBeLessThanOrEqual(scene.width + 1);
              expect(boxes[i].y + boxes[i].h).toBeLessThanOrEqual(scene.height + 1);
              for (let j = i + 1; j < boxes.length; j++) {
                const a = items[i];
                const b = items[j];
                // Trees and lakes are round: compare as circles.
                if ((a.kind === "tree" && b.kind === "tree") || (a.kind === "lake" && b.kind === "lake")) {
                  const ra = a.kind === "tree" ? a.r : (a as { rx: number }).rx;
                  const rb = b.kind === "tree" ? b.r : (b as { rx: number }).rx;
                  expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThanOrEqual(ra + rb - 0.01);
                } else {
                  expect(overlaps(boxes[i], boxes[j])).toBe(false);
                }
              }
            }
          }
        }
      });
    }
  }

  it("is deterministic for the same seed", () => {
    const a = generateCity({ seed: 42, level: 12, target: "car", count: 16 });
    const b = generateCity({ seed: 42, level: 12, target: "car", count: 16 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = generateCity({ seed: 43, level: 12, target: "car", count: 16 });
    expect(JSON.stringify(c)).not.toBe(JSON.stringify(a));
  });

  it("never mixes houses into other houses or cars into houses", () => {
    for (const seed of SEEDS) {
      const scene = generateCity({ seed, level: 18, target: "blueHouse", count: 26 });
      const solids = scene.objects.filter((o) => o.kind === "house" || o.kind === "car" || o.kind === "building");
      const boxes = solids.map(objectBox);
      let clashes = 0;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j], -0.5)) clashes++;
      }
      expect(clashes).toBe(0);
    }
  });

  it("only uses look-alike roofs from Hard onwards", () => {
    const easy = generateCity({ seed: 5, level: 3, target: "blueHouse", count: 5 });
    expect(easy.objects.some((o) => o.kind === "house" && (o.roof === "slate" || o.roof === "teal"))).toBe(false);
    const hard = generateCity({ seed: 5, level: 13, target: "blueHouse", count: 17 });
    expect(hard.objects.some((o) => o.kind === "house" && (o.roof === "slate" || o.roof === "teal"))).toBe(true);
  });
});

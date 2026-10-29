import { describe, expect, it } from "vitest";
import { prepare, recognize } from "../src/handwriting";
import type { Point } from "../src/strokes";

const line = (a: Point, b: Point): Point[] => [a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], b];
const kanji = new Map<string, Point[][]>([
  ["一", prepare([line([10, 55], [100, 55])])],
  ["二", prepare([line([25, 35], [85, 35]), line([10, 80], [100, 80])])],
  ["十", prepare([line([10, 50], [100, 50]), line([55, 10], [55, 100])])],
  ["三", prepare([line([25, 25], [85, 25]), line([30, 55], [80, 55]), line([10, 90], [100, 90])])],
]);

describe("handwriting", () => {
  it("finds a kanji drawn smaller, elsewhere on the pad", () => {
    const drawn = [line([5, 10], [40, 12]), line([22, 0], [21, 40])];
    expect(recognize(drawn, kanji)[0]).toBe("十");
  });

  it("tells apart kanji with the same stroke count by shape", () => {
    const drawn = [line([30, 30], [70, 30]), line([20, 60], [80, 60])];
    expect(recognize(drawn, kanji)[0]).toBe("二");
  });

  it("returns nothing for an empty pad", () => {
    expect(recognize([], kanji)).toEqual([]);
  });
});

describe("stroke paths", () => {
  it("follows KanjiVG's relative and smooth curves", async () => {
    const { pathPoints } = await import("../src/strokes");
    const pts = pathPoints("M11,54.25c3.19,0.62,6.25,0.75,9.73,0.5s20,-1,30,-2");
    expect(pts[0]).toEqual([11, 54.25]);
    const end = pts.at(-1)!;
    expect(end[0]).toBeCloseTo(11 + 9.73 + 30);
    expect(end[1]).toBeCloseTo(54.25 + 0.5 - 2);
  });

  it("recognises real kanji from their own strokes", async () => {
    const { kanjiStrokePoints } = await import("../src/handwriting");
    const { pathPoints } = await import("../src/strokes");
    const strokes = (await import("../data/strokes.json")).default as unknown as Record<string, string[]>;
    const all = await kanjiStrokePoints(async () => strokes);
    for (const c of ["木", "語", "海", "口"]) {
      const drawn = strokes[c].map((d) => pathPoints(d).map(([x, y]) => [x * 0.6 + 20, y * 0.6 + 5] as [number, number]));
      expect(recognize(drawn, all)[0]).toBe(c);
    }
  });
});

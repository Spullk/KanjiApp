import { describe, expect, it } from "vitest";
import { checkStroke, resample, type Point } from "../src/strokes";

const line = (a: Point, b: Point, n = 10): Point[] => Array.from({ length: n }, (_, i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)]);

describe("stroke checking", () => {
  it("resamples evenly", () => {
    const r = resample([[0, 0], [10, 0], [10, 10]], 5);
    expect(r[0]).toEqual([0, 0]);
    expect(r[2]).toEqual([10, 0]);
    expect(r[4]).toEqual([10, 10]);
  });

  it("accepts a wobbly but right stroke and rejects wrong ones", () => {
    const expected = line([11, 54], [97, 50], 40); // 一
    const drawn = line([15, 58], [92, 46], 7);
    expect(checkStroke(drawn, expected)).toBe("right");
    expect(checkStroke([...drawn].reverse(), expected)).toBe("backwards");
    expect(checkStroke(line([54, 10], [54, 100]), expected)).toBe("wrong"); // vertical instead
    expect(checkStroke(line([11, 90], [97, 90]), expected)).toBe("wrong"); // too low
  });
});

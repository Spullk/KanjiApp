import { describe, expect, it } from "vitest";
import { morae, pattern, patternName } from "../src/pitch";

describe("pitch accent", () => {
  it("counts morae", () => {
    expect(morae("きょうと")).toEqual(["きょ", "う", "と"]);
    expect(morae("がっこう")).toEqual(["が", "っ", "こ", "う"]);
  });

  it("draws the four patterns", () => {
    expect(pattern(0, 3)).toEqual([false, true, true, true]);
    expect(pattern(1, 3)).toEqual([true, false, false, false]);
    expect(pattern(2, 3)).toEqual([false, true, false, false]);
    expect(pattern(3, 3)).toEqual([false, true, true, false]);
    expect(patternName(3, 3)).toBe("odaka");
    expect(patternName(2, 3)).toBe("nakadaka");
  });
});

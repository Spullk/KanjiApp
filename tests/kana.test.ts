import { describe, expect, it } from "vitest";
import { ALL_KANA, isRomajiFor, kanaFor, KANA_ROWS, romaji } from "../src/kana";
import { addKana, answerKana, drillKana, drillOf, nextKana, removeKana } from "../src/kanaDrill";
import { emptyStore, merge } from "../src/srs";

describe("kana", () => {
  it("has every kana once", () => {
    expect(new Set(ALL_KANA).size).toBe(ALL_KANA.length);
    expect(KANA_ROWS.filter((r) => r.script === "hira").flatMap((r) => r.kana)).toHaveLength(71);
  });

  it("accepts the common romaji spellings", () => {
    expect(isRomajiFor("shi", "し")).toBe(true);
    expect(isRomajiFor("si", "し")).toBe(true);
    expect(isRomajiFor("TSU", "ツ")).toBe(true);
    expect(isRomajiFor("o", "を")).toBe(true);
    expect(isRomajiFor("wo", "を")).toBe(true);
    expect(isRomajiFor("n", "ん")).toBe(true);
    expect(isRomajiFor("ji", "ぢ")).toBe(true);
    expect(isRomajiFor("sha", "しゃ")).toBe(true);
    expect(isRomajiFor("ti", "ティ")).toBe(true);
    expect(isRomajiFor("su", "し")).toBe(false);
    expect(isRomajiFor("", "あ")).toBe(false);
    expect(romaji("ふ")).toBe("fu");
    expect(romaji("ファ")).toBe("fa");
  });

  it("finds the look-alike that was typed", () => {
    expect(kanaFor("tsu", "kata")).toBe("ツ");
    expect(kanaFor("me", "hira")).toBe("め");
    expect(kanaFor("xyz", "hira")).toBeUndefined();
  });
});

describe("kana drill", () => {
  it("asks new kana first, in order, and sends right answers further back than wrong ones", () => {
    const s = emptyStore();
    addKana(s, ["か", "き", "く", "け", "こ"], 1);
    const all = { script: "both" as const };
    expect(nextKana(s, all)).toBe("か");
    answerKana(s, "か", true, 2);
    answerKana(s, "き", false, 3);
    expect(drillOf(s, "か")).toMatchObject({ streak: 1, misses: 0 });
    expect(drillOf(s, "き")).toMatchObject({ streak: 0, misses: 1 });
    expect(drillOf(s, "か")!.at).toBeGreaterThan(drillOf(s, "き")!.at);
    expect(nextKana(s, all)).toBe("く");
    expect(drillKana(s, { script: "both", missed: true })).toEqual(["き"]);
    expect(drillKana(s, { script: "kata" })).toEqual([]);
  });

  it("doesn't ask the same kana twice in a row", () => {
    const s = emptyStore();
    addKana(s, ["あ", "い"], 1);
    expect(nextKana(s, { script: "hira" }, "あ")).toBe("い");
  });

  it("syncs: the newer copy of a kana wins, and taking one out sticks", () => {
    const a = emptyStore();
    addKana(a, ["あ"], 1);
    const b = structuredClone(a);
    answerKana(b, "あ", true, 5);
    removeKana(a, ["あ"], 9);
    expect(drillOf(merge(a, b), "あ")).toBeUndefined();
    expect(drillOf(merge(b, emptyStore()), "あ")?.streak).toBe(1);
  });
});

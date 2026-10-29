import { describe, expect, it } from "vitest";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { addItem, emptyStore, nextToLearn } from "../src/srs";
import { customOrder, kanjiOrder, parseStudyList, teachingOrder } from "../src/order";
import { wordsBySpelling } from "../src/known";

const data = { kanji, radicals, words, sentences: {}, lessons } as unknown as Data;

describe("study order", () => {
  it("sorts kanji by JLPT level, grade or frequency", () => {
    const jlpt = kanjiOrder(data, "jlpt");
    expect(jlpt).toHaveLength(2136);
    const levels = jlpt.map((k) => data.kanji[k].jlpt ?? 0);
    expect(levels.slice(0, 50).every((l) => l === 5)).toBe(true);
    expect(data.kanji[kanjiOrder(data, "grade")[0]].grade).toBe(1);
    expect(kanjiOrder(data, "frequency")[0]).toBe("日");
  });

  it("teaches radicals before their kanji and words once their kanji are known", () => {
    const seq = teachingOrder(data, kanjiOrder(data, "jlpt").slice(0, 80), new Set());
    const pos = (kind: string, key: string) => seq.findIndex((i) => i.kind === kind && i.key === key);
    for (const [i, it] of seq.entries()) {
      if (it.kind === "word") {
        for (const c of data.words[it.key].w) if (data.kanji[c]) expect(pos("kanji", c)).toBeLessThan(i);
      }
      if (it.kind === "radical") expect(seq.slice(i).some((x) => x.kind === "kanji" && data.radicals[it.key].usedIn.includes(x.key))).toBe(true);
    }
    expect(seq.some((i) => i.kind === "word")).toBe(true);
  });

  it("reads a pasted list in order and follows it", () => {
    const list = parseStudyList(data, "学生, 先\n日本 x", wordsBySpelling(data));
    expect(list).toHaveLength(3);
    expect(list[0]).toMatch(/^word:/);
    expect(list[1]).toBe("kanji:先");
    expect(list[2]).toMatch(/^word:/);
    const s = emptyStore();
    s.settings.order = "custom";
    s.settings.customList = ["kanji:語", "kanji:学"];
    addItem(s, "kanji", "語");
    const next = nextToLearn(s, data, 50).map((i) => `${i.kind}:${i.key}`);
    expect(next).not.toContain("kanji:語");
    expect(next.indexOf("kanji:学")).toBeGreaterThanOrEqual(0);
    expect(next.indexOf("kanji:学")).toBeLessThan(next.indexOf("kanji:日"));
    expect(customOrder(data, ["kanji:学"]).at(-1)).toEqual({ kind: "kanji", key: "学" });
  });
});

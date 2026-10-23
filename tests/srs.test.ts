import { describe, expect, it } from "vitest";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { addItem, dueCards, emptyStore, grade, isAdded, nextToLearn, preview, Rating, removeItem, stageOf } from "../src/srs";

const data = { kanji, radicals, words, sentences: {}, lessons } as unknown as Data;
const DAY = 86_400_000;

describe("srs", () => {
  it("adds an item's cards, due immediately", () => {
    const s = emptyStore();
    expect(addItem(s, "kanji", "語", 1000)).toBe(2);
    expect(addItem(s, "kanji", "語", 1000)).toBe(0);
    expect(dueCards(s, 1000).sort()).toEqual(["kanji:語:meaning", "kanji:語:reading"]);
    expect(stageOf(s, "kanji", "語")).toBe("learning");
  });

  it("schedules a correct answer later than a wrong one", () => {
    const s = emptyStore();
    addItem(s, "word", "1464530", 0);
    const p = preview(s, "word:1464530:word", 0);
    expect(p[Rating.Again]).toBeLessThan(p[Rating.Good]);
    expect(p[Rating.Good]).toBeLessThanOrEqual(p[Rating.Easy]);
    grade(s, "word:1464530:word", Rating.Easy, 0);
    expect(dueCards(s, 0)).toEqual([]);
    expect(s.log).toHaveLength(1);
  });

  it("calls an item known once all its cards hold for three weeks", () => {
    const s = emptyStore();
    addItem(s, "radical", "氵", 0);
    let t = 0;
    for (let i = 0; i < 6 && stageOf(s, "radical", "氵") !== "mature"; i++) {
      grade(s, "radical:氵:meaning", Rating.Good, t);
      t = s.cards["radical:氵:meaning"].due;
    }
    expect(stageOf(s, "radical", "氵")).toBe("mature");
    expect(t).toBeGreaterThan(21 * DAY);
  });

  it("suggests each kanji right after its radicals, and words after their kanji", () => {
    const s = emptyStore();
    const first = nextToLearn(s, data, 60);
    const pos = (kind: string, key: string) => first.findIndex((x) => x.kind === kind && x.key === key);
    for (const it of first) {
      if (it.kind === "radical") {
        for (const k of data.radicals[it.key].usedIn) {
          const kp = pos("kanji", k);
          if (kp >= 0) expect(pos("radical", it.key)).toBeLessThan(kp);
        }
      }
      if (it.kind === "word") {
        for (const c of data.words[it.key].w) {
          const kp = pos("kanji", c);
          if (kp >= 0) expect(kp).toBeLessThan(pos("word", it.key));
        }
      }
    }
    addItem(s, first[0].kind, first[0].key);
    expect(nextToLearn(s, data, 1)[0]).toEqual(first[1]);
  });

  it("removes items", () => {
    const s = emptyStore();
    addItem(s, "kanji", "日");
    removeItem(s, "kanji", "日");
    expect(isAdded(s, "kanji", "日")).toBe(false);
  });
});

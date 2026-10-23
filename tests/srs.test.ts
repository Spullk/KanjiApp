import { describe, expect, it } from "vitest";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { addItem, dueCards, emptyStore, grade, isAdded, merge, migrate, nextToLearn, preview, Rating, removeItem, stageOf, undoLast } from "../src/srs";

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

describe("store v2", () => {
  it("upgrades v1 progress, stamping each card with its last change", () => {
    const v1 = {
      version: 1,
      cards: { "kanji:語:meaning": { ...emptyStore().cards, due: 5, added: 1, last_review: 3 }, "radical:口:meaning": { due: 5, added: 2 } },
      log: [["kanji:語:meaning", Rating.Good, 3]],
      settings: { batch: 10, retention: 0.85 },
    };
    const s = migrate(JSON.parse(JSON.stringify(v1)));
    expect(s.version).toBe(2);
    expect(s.cards["kanji:語:meaning"].updated).toBe(3);
    expect(s.cards["radical:口:meaning"].updated).toBe(2);
    expect(s.log).toHaveLength(1);
    expect(s.settings).toEqual({ batch: 10, retention: 0.85 });
    expect(s.removed).toEqual({});
    expect(() => migrate({ version: 9, cards: {} })).toThrow();
    expect(() => migrate("nope")).toThrow();
  });

  it("undoes the last answer", () => {
    const s = emptyStore();
    addItem(s, "radical", "氵", 0);
    const before = s.cards["radical:氵:meaning"];
    grade(s, "radical:氵:meaning", Rating.Easy, 10);
    expect(undoLast(s, 20)).toBe("radical:氵:meaning");
    expect(s.cards["radical:氵:meaning"]).toEqual({ ...before, updated: 20 });
    expect(s.log).toEqual([]);
    expect(undoLast(s)).toBeUndefined();
  });

  it("merges two devices: newest card wins, reviews are combined once, removals stick", () => {
    const phone = emptyStore();
    addItem(phone, "radical", "氵", 0);
    addItem(phone, "kanji", "語", 0);
    const laptop = migrate(JSON.parse(JSON.stringify(phone)));

    grade(phone, "radical:氵:meaning", Rating.Good, 100);
    grade(laptop, "radical:氵:meaning", Rating.Again, 50);
    grade(laptop, "kanji:語:meaning", Rating.Good, 60);
    removeItem(phone, "kanji", "語", 200);
    laptop.settings.batch = 10;
    laptop.settingsUpdated = 70;

    const m = merge(phone, laptop);
    expect(m.cards["radical:氵:meaning"]).toEqual(phone.cards["radical:氵:meaning"]);
    expect(m.cards["kanji:語:meaning"]).toBeUndefined();
    expect(m.removed["kanji:語:meaning"]).toBe(200);
    expect(m.log.map(([, , t]) => t)).toEqual([50, 60, 100]);
    expect(m.settings.batch).toBe(10);
    expect(merge(m, laptop)).toEqual(m);

    // Studying it again after the removal brings it back everywhere.
    const synced = migrate(JSON.parse(JSON.stringify(m)));
    addItem(synced, "kanji", "語", 300);
    const again = merge(m, synced);
    expect(again.cards["kanji:語:meaning"]).toBeDefined();
    expect(again.removed["kanji:語:meaning"]).toBeUndefined();
  });
});

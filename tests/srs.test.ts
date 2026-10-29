import { describe, expect, it } from "vitest";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { addItem, dueCards, emptyStore, endVacation, grade, isAdded, isLeech, merge, newLeftToday, parseFsrsParams, practiceCards, setItemInfo, startVacation, migrate, nextToLearn, preview, Rating, removeItem, stageOf, undoLast } from "../src/srs";

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
    expect(s.settings).toEqual({ batch: 10, retention: 0.85, answerMode: "self", dailyNew: 0, order: "lessons" });
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

describe("item info", () => {
  it("skips known items in lessons and paused items in reviews", () => {
    const s = emptyStore();
    const first = nextToLearn(s, data, 1)[0];
    setItemInfo(s, first.kind, first.key, { status: "known" }, 5);
    expect(nextToLearn(s, data, 1)[0]).not.toEqual(first);
    expect(stageOf(s, first.kind, first.key)).toBe("mature");

    addItem(s, "kanji", "語", 0);
    setItemInfo(s, "kanji", "語", { status: "paused" }, 5);
    expect(dueCards(s, 10)).toEqual([]);
    setItemInfo(s, "kanji", "語", { status: undefined }, 6);
    expect(dueCards(s, 10)).toHaveLength(2);
    expect(s.items["kanji:語"]).toEqual({ updated: 6 });
  });

  it("keeps the newest note when merging", () => {
    const a = emptyStore();
    const b = emptyStore();
    setItemInfo(a, "kanji", "語", { note: "old" }, 1);
    setItemInfo(b, "kanji", "語", { note: "new" }, 2);
    expect(merge(a, b).items["kanji:語"].note).toBe("new");
    expect(merge(b, a).items["kanji:語"].note).toBe("new");
  });

  it("flags leeches", () => {
    const s = emptyStore();
    addItem(s, "radical", "氵", 0);
    expect(isLeech(s, "radical", "氵")).toBe(false);
    s.cards["radical:氵:meaning"].lapses = 8;
    expect(isLeech(s, "radical", "氵")).toBe(true);
  });
});

describe("daily limit and vacation", () => {
  it("counts new items started today against the limit", () => {
    const s = emptyStore();
    const now = new Date(2026, 9, 23, 12).getTime();
    expect(newLeftToday(s, now)).toBe(Infinity);
    s.settings.dailyNew = 3;
    addItem(s, "kanji", "語", now - DAY); // yesterday
    addItem(s, "kanji", "日", now - 1000);
    addItem(s, "radical", "氵", now - 1000);
    expect(newLeftToday(s, now)).toBe(1);
  });

  it("stops reviews on vacation and moves the schedule on afterwards", () => {
    const s = emptyStore();
    addItem(s, "radical", "氵", 0);
    grade(s, "radical:氵:meaning", Rating.Good, 0);
    const due = s.cards["radical:氵:meaning"].due;
    startVacation(s, 1000);
    expect(dueCards(s, due + 10 * DAY)).toEqual([]);
    endVacation(s, 1000 + 5 * DAY);
    expect(s.settings.vacation).toBeUndefined();
    expect(s.cards["radical:氵:meaning"].due).toBe(due + 5 * DAY);
    expect(s.cards["radical:氵:meaning"].last_review).toBe(5 * DAY);
  });
});

describe("practice", () => {
  it("collects today's mistakes, leeches and this week's items without changing anything", () => {
    const now = new Date(2026, 9, 23, 12).getTime();
    const s = emptyStore();
    addItem(s, "kanji", "語", now - 30 * DAY);
    addItem(s, "radical", "氵", now - 2 * DAY);
    grade(s, "kanji:語:meaning", Rating.Again, now - 1000);
    grade(s, "kanji:語:reading", Rating.Again, now - 2 * DAY);
    s.cards["kanji:語:reading"].lapses = 9;
    const before = JSON.stringify(s);
    expect(practiceCards(s, "mistakes", now)).toEqual(["kanji:語:meaning"]);
    expect(practiceCards(s, "leeches", now)).toEqual(["kanji:語:reading"]);
    expect(practiceCards(s, "recent", now)).toEqual(["radical:氵:meaning"]);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("FSRS parameters", () => {
  const anki = "0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542";
  it("reads Anki's parameters and rejects anything else", () => {
    expect(parseFsrsParams(anki)).toHaveLength(21);
    expect(parseFsrsParams("0.4 0.6 2.4 5.8 4.93 0.94 0.86 0.01 1.49 0.14 0.94 2.18 0.05 0.34 1.26 0.29 2.61")).toHaveLength(21);
    expect(() => parseFsrsParams("1, 2, 3")).toThrow(/17, 19 or 21/);
    expect(() => parseFsrsParams("hello")).toThrow(/numbers/);
  });

  it("schedules with them", () => {
    const s = emptyStore();
    addItem(s, "radical", "氵", 0);
    const before = preview(s, "radical:氵:meaning", 0)[Rating.Easy];
    s.settings.fsrsParams = parseFsrsParams(anki.replace(/^0\.212, 1\.2931, 2\.3065, 8\.2956/, "0.212, 1.2931, 2.3065, 30"));
    expect(preview(s, "radical:氵:meaning", 0)[Rating.Easy]).toBeGreaterThan(before);
  });
});

describe("extra card types", () => {
  it("adds switched-on cards to new words and spreads them over studied ones", async () => {
    const { addFaceToStudied, missingFace } = await import("../src/srs");
    const s = emptyStore();
    const now = new Date(2026, 9, 29, 12).getTime();
    addItem(s, "word", "1", now - 3000);
    addItem(s, "word", "2", now - 2000);
    addItem(s, "word", "3", now - 1000);
    addItem(s, "kanji", "語", now);
    s.settings.extraCards = ["recall"];
    expect(missingFace(s, "recall")).toBe(3);
    expect(addFaceToStudied(s, "recall", 2, now)).toBe(3);
    expect(missingFace(s, "recall")).toBe(0);
    expect(s.cards["word:1:recall"].due).toBe(now);
    expect(s.cards["word:3:recall"].due).toBeGreaterThan(now);
    expect(addItem(s, "word", "4", now)).toBe(2);
    expect(dueCards(s, now)).toContain("word:2:recall");
    s.settings.extraCards = [];
    expect(dueCards(s, now).some((id) => id.endsWith(":recall"))).toBe(false);
    removeItem(s, "word", "1", now);
    expect(s.cards["word:1:recall"]).toBeUndefined();
  });
});

describe("one card per kanji", () => {
  it("merges a kanji's two cards into one and splits them back", async () => {
    const { setKanjiCards, mainFaces } = await import("../src/srs");
    const s = emptyStore();
    addItem(s, "kanji", "語", 0);
    addItem(s, "kanji", "日", 0);
    s.cards["kanji:語:meaning"].stability = 20;
    s.cards["kanji:語:reading"].stability = 3;
    setKanjiCards(s, "one", 10);
    expect(mainFaces(s.settings, "kanji")).toEqual(["both"]);
    expect(s.cards["kanji:語:both"].stability).toBe(3);
    expect(s.cards["kanji:語:meaning"]).toBeUndefined();
    expect(s.removed["kanji:語:reading"]).toBe(10);
    expect(isAdded(s, "kanji", "語")).toBe(true);
    expect(dueCards(s, 10).filter((id) => id.startsWith("kanji:日"))).toEqual(["kanji:日:both"]);
    expect(addItem(s, "kanji", "本", 10)).toBe(1);
    expect(s.cards["kanji:本:both"]).toBeDefined();
    setKanjiCards(s, "split", 20);
    expect(s.cards["kanji:語:both"]).toBeUndefined();
    expect(s.cards["kanji:語:meaning"].stability).toBe(3);
    expect(s.cards["kanji:本:reading"]).toBeDefined();
    expect(dueCards(s, 20).some((id) => id.endsWith(":both"))).toBe(false);
  });
});

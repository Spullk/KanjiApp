import { describe, expect, it } from "vitest";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { fetchWaniKani, jlptItems, parseKnownList, wkSchedule, wordsBySpelling } from "../src/known";
import { addReviewedItem, dueCards, emptyStore, newLeftToday, State } from "../src/srs";

const data = { kanji, radicals, words, sentences: {}, lessons } as unknown as Data;
const DAY = 86_400_000;

describe("already known", () => {
  it("picks a JLPT level's kanji and their radicals", () => {
    const n5 = jlptItems(data, 5);
    const k = n5.filter((it) => it.kind === "kanji").map((it) => it.key);
    expect(k).toContain("日");
    expect(k.every((c) => data.kanji[c].jlpt === 5)).toBe(true);
    expect(n5.some((it) => it.kind === "radical")).toBe(true);
  });

  it("finds kanji and whole words in a pasted list", () => {
    const gakusei = wordsBySpelling(data).get("学生")!;
    const items = parseKnownList(data, "日 月\n学生, abc");
    expect(items).toContainEqual({ kind: "kanji", key: "日" });
    expect(items).toContainEqual({ kind: "kanji", key: "学" });
    expect(items).toContainEqual({ kind: "word", key: gakusei });
  });
});

describe("WaniKani", () => {
  const pages: Record<string, unknown> = {
    "https://api.wanikani.com/v2/assignments?started=true": {
      data: [{ id: 1, data: { subject_id: 10, srs_stage: 9, available_at: null } }],
      pages: { next_url: "https://api.wanikani.com/v2/assignments?page=2" },
    },
    "https://api.wanikani.com/v2/assignments?page=2": {
      data: [
        { id: 2, data: { subject_id: 11, srs_stage: 5, available_at: "2026-11-01T00:00:00Z" } },
        { id: 3, data: { subject_id: 12, srs_stage: 3, available_at: null } },
        { id: 4, data: { subject_id: 13, srs_stage: 4, available_at: null } },
      ],
      pages: { next_url: null },
    },
    "https://api.wanikani.com/v2/subjects?types=radical,kanji,vocabulary,kana_vocabulary": {
      data: [
        { id: 10, data: { characters: "日" } },
        { id: 11, data: { characters: "学生" } },
        { id: 12, data: { characters: null } }, // image-only radical
        { id: 13, data: { characters: "ぜんぜん違うもの" } },
      ],
      pages: { next_url: null },
    },
  };
  const fakeFetch = (async (url: string, init: RequestInit) => {
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    return new Response(JSON.stringify(pages[url]), { status: url in pages ? 200 : 404 });
  }) as unknown as typeof fetch;

  it("matches started subjects to Nekko items", async () => {
    const found = await fetchWaniKani(data, "tok", fakeFetch);
    expect(found).toEqual([
      { kind: "kanji", key: "日", stage: 9, availableAt: null },
      { kind: "word", key: wordsBySpelling(data).get("学生"), stage: 5, availableAt: Date.parse("2026-11-01T00:00:00Z") },
    ]);
  });

  it("says when the token is wrong", async () => {
    const no = (async () => new Response("", { status: 401 })) as unknown as typeof fetch;
    await expect(fetchWaniKani(data, "bad", no)).rejects.toThrow(/token/);
  });

  it("burned becomes known; the rest are scheduled like WaniKani would", () => {
    expect(wkSchedule({ kind: "kanji", key: "日", stage: 9, availableAt: null }, 0)).toEqual({ known: true });
    expect(wkSchedule({ kind: "kanji", key: "日", stage: 5, availableAt: null }, 0)).toEqual({ stability: 7, due: 7 * DAY });

    const s = emptyStore();
    s.settings.dailyNew = 5;
    const now = new Date(2026, 9, 23, 12).getTime();
    addReviewedItem(s, "kanji", "日", 7, now + 3 * DAY, now);
    const c = s.cards["kanji:日:meaning"];
    expect(c.state).toBe(State.Review);
    expect(c.last_review).toBe(now - 4 * DAY);
    expect(dueCards(s, now + 3 * DAY)).toHaveLength(2);
    expect(newLeftToday(s, now)).toBe(5);
  });
});

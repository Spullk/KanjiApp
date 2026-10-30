import { describe, expect, it } from "vitest";
import type { Data } from "../src/data";
import { addItem, emptyStore, setItemInfo } from "../src/srs";
import { readableSentences, studiedKanji, unknownKanji } from "../src/reading";

const data = {
  kanji: { 日: {}, 本: {}, 人: {} },
  sentences: {
    a: { ja: "日本人です。", en: "", links: [] },
    b: { ja: "日本に行く。", en: "", links: [] },
    c: { ja: "はい。", en: "", links: [] },
  },
} as unknown as Data;

describe("reading practice", () => {
  it("counts studied and known kanji", () => {
    const s = emptyStore();
    addItem(s, "kanji", "日");
    setItemInfo(s, "kanji", "本", { status: "known" });
    expect([...studiedKanji(s, data)].sort()).toEqual(["日", "本"].sort());
  });

  it("picks sentences with no, or one, unknown kanji", () => {
    const known = new Set(["日", "本"]);
    expect(unknownKanji("日本人です", known)).toEqual(["人"]);
    expect(readableSentences(data, known)).toEqual([]);
    expect(readableSentences(data, known, 1).sort()).toEqual(["a", "b"]);
    expect(readableSentences(data, new Set(["日", "本", "人", "行"]))).toEqual(["a", "b"]);
  });
});

describe("furigana rule", () => {
  it("hides readings over taught kanji, but keeps whole-word readings until the word is studied", async () => {
    const { furiganaRule } = await import("../src/reading");
    const d = { kanji: { 日: {}, 本: {}, 今: {} } } as unknown as Data;
    const s = emptyStore();
    addItem(s, "kanji", "日");
    addItem(s, "kanji", "今");
    const hide = furiganaRule(s, d, "w1");
    expect(hide(["日", "に"])).toBe(true);
    expect(hide(["本", "ほん"])).toBe(false);
    expect(hide(["です", null])).toBe(false);
    expect(hide(["今日", "きょう", "*"])).toBe(false);
    addItem(s, "word", "w1");
    expect(furiganaRule(s, d, "w1")(["今日", "きょう", "*"])).toBe(true);
  });
});

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

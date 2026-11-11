import { describe, expect, it } from "vitest";
import { examplesFor, patternSentence, readableByWords, unknownWords } from "../src/examples";
import type { Data } from "../src/data";
import type { Knowledge } from "../src/stories";

const word = (id: string, w: string, pos: string[], gloss: string[], lesson?: number) => ({
  id, w, r: "", furigana: [], special: [], senses: [{ pos, gloss }], rank: 0, usuallyKana: false, sentences: [] as string[], lesson,
});

const data = {
  words: {
    "1": { ...word("1", "猫", ["noun"], ["cat"], 1), sentences: ["a"] },
    "2": word("2", "犬", ["noun"], ["dog"], 1),
    "3": word("3", "難解", ["na-adjective"], ["(very) difficult"], 50),
    "4": word("4", "ねえ", ["interjection"], ["hey"]),
    "7": word("7", "うようよ", ["adverb"], ["in swarms"]),
    "5": word("5", "食べる", ["ichidan verb", "transitive"], ["to eat"], 2),
    "6": word("6", "ちょっと", ["adverb"], ["a little"], 16),
  },
  sentences: {
    a: { ja: "猫は難解だ", en: "", links: [[0, 1, "1"], [2, 2, "3"]] },
    b: { ja: "ねえ猫と犬", en: "", links: [[0, 2, "4"], [2, 1, "1"], [4, 1, "2"]] },
    c: { ja: "ちょっと猫", en: "", links: [[0, 4, "6"], [4, 1, "1"]] },
  },
} as unknown as Data;

const k = (known: string[], kanaFree = false): Knowledge & { kanaFree: boolean } => ({
  word: (id: string) => (known.includes(id) ? "known" : "new"),
  kanaFree,
});

describe("example sentences", () => {
  it("counts new words, not the word itself or kana words no lesson teaches", () => {
    expect(unknownWords(data, k([]), data.sentences.b, "1")).toEqual(["2"]);
    expect(unknownWords(data, k(["2"]), data.sentences.b, "1")).toEqual([]);
    // A kana word no lesson teaches that isn't grammar is a new word.
    expect(unknownWords(data, k([]), { ja: "うようよ", en: "", links: [[0, 4, "7"]] })).toEqual(["7"]);
  });

  it("counts a kana word a lesson teaches until you've learned it", () => {
    expect(unknownWords(data, k([]), data.sentences.c, "1")).toEqual(["6"]);
    expect(unknownWords(data, k(["6"]), data.sentences.c, "1")).toEqual([]);
    // Kana words left out of lessons in Settings never count.
    expect(unknownWords(data, k([], true), data.sentences.c, "1")).toEqual([]);
  });

  it("keeps only sentences with one word you don't know, including the word itself", () => {
    // 猫 not learned yet: it's the one new word, so every other word must be known.
    expect(examplesFor(data, k(["2"]), "1").map((e) => e.id)).toEqual(["b"]);
    expect(examplesFor(data, k(["3"]), "1").map((e) => e.id)).toEqual(["a"]);
    expect(examplesFor(data, k([]), "1").map((e) => e.id)).toEqual([]);
    // 猫 learned: one other new word is fine, easiest first.
    expect(examplesFor(data, k(["1", "2"]), "1").map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(examplesFor(data, k(["1"]), "1").map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves out sentences with kanji outside their words that you haven't studied", () => {
    const d = { ...data, sentences: { x: { ja: "自分で猫", en: "", links: [[3, 1, "1"]] } } } as unknown as Data;
    expect(readableByWords(d, { ...k(["1"]), kanji: new Set(["猫"]) })).toEqual([]);
    expect(readableByWords(d, { ...k(["1"]), kanji: new Set(["猫", "自", "分"]) }).map((e) => e.id)).toEqual(["x"]);
  });

  it("leaves out sentences with a katakana word that isn't linked", () => {
    const d = { ...data, sentences: { x: { ja: "猫はボウフラ", en: "", links: [[0, 1, "1"]] } } } as unknown as Data;
    expect(readableByWords(d, k(["1"]))).toEqual([]);
  });

  it("finds sentences to read with at most one new word", () => {
    expect(readableByWords(data, k(["1"])).map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(readableByWords(data, k(["1"]), 0).map((e) => e.id)).toEqual([]);
    expect(readableByWords(data, k([])).map((e) => e.id)).toEqual([]);
  });

  it("makes pattern sentences from kana grammar only", () => {
    expect(patternSentence(data, "2")).toMatchObject({ ja: "犬について はなしましょう。", en: "Let's talk about dog.", links: [[0, 1, "2"]] });
    expect(patternSentence(data, "3")).toMatchObject({ ja: "とても 難解です。", en: "It's very difficult.", links: [[4, 2, "3"]] });
    expect(patternSentence(data, "5")?.en).toBe("It's hard to eat.");
  });

  it("leaves out a sentence with a word Nekko has no entry for, but not one with a name", () => {
    const d = {
      ...data,
      sentences: {
        g: { ja: "猫がもつれた", en: "", links: [[0, 1, "1"]], gaps: [[2, 3]] },
        n: { ja: "トムの猫", en: "", links: [[3, 1, "1"]], names: [[0, 2]] },
        s: { ja: "トムの猫", en: "", links: [[3, 1, "1"]] },
      },
    } as unknown as Data;
    const ids = readableByWords(d, k(["1"])).map((e) => e.id);
    expect(ids).toEqual(["n"]);
  });

  it("counts grammar you haven't learned like a new word", () => {
    const d = { ...data, sentences: { p: { ja: "猫と犬", en: "", links: [[0, 1, "1"], [2, 1, "2"]], g: ["passive"] } } } as unknown as Data;
    const knows = (ids: string[]) => ({ ...k(["1"]), grammar: (id: string) => ids.includes(id) });
    // 犬 is new, so new grammar on top is one too many.
    expect(readableByWords(d, knows([]))).toEqual([]);
    expect(readableByWords(d, knows(["passive"]))).toEqual([{ id: "p", unknown: ["2"], grammar: [] }]);
    // Without a grammar level, grammar doesn't count.
    expect(readableByWords(d, k(["1"]))).toEqual([{ id: "p", unknown: ["2"], grammar: [] }]);
  });
});


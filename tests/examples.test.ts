import { describe, expect, it } from "vitest";
import { examplesFor, patternSentence, unknownWords } from "../src/examples";
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
    "4": word("4", "これ", ["pronoun"], ["this"]),
    "5": word("5", "食べる", ["ichidan verb", "transitive"], ["to eat"], 2),
  },
  sentences: {
    a: { ja: "猫は難解だ", en: "", links: [[0, 1, "1"], [2, 2, "3"]] },
    b: { ja: "これは猫と犬", en: "", links: [[0, 2, "4"], [3, 1, "1"], [5, 1, "2"]] },
  },
} as unknown as Data;

const k = (known: string[]): Knowledge => ({ word: (id: string) => (known.includes(id) ? "known" : "new") });

describe("example sentences", () => {
  it("counts new words, not the word itself or everyday kana words", () => {
    expect(unknownWords(data, k([]), data.sentences.b, "1")).toEqual(["2"]);
    expect(unknownWords(data, k(["2"]), data.sentences.b, "1")).toEqual([]);
  });

  it("puts sentences you can read first, including ones picked for other words", () => {
    expect(examplesFor(data, k(["2"]), "1").map((e) => e.id)).toEqual(["b", "a"]);
    expect(examplesFor(data, k(["3"]), "1").map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("makes pattern sentences from kana grammar only", () => {
    expect(patternSentence(data, "2")).toMatchObject({ ja: "犬について はなしましょう。", en: "Let's talk about dog.", links: [[0, 1, "2"]] });
    expect(patternSentence(data, "3")).toMatchObject({ ja: "とても 難解です。", en: "It's very difficult.", links: [[4, 2, "3"]] });
    expect(patternSentence(data, "5")?.en).toBe("It's hard to eat.");
  });
});

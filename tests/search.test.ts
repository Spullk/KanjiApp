import { describe, expect, it } from "vitest";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { search } from "../src/search";
import { parse } from "../src/router";

const data = { kanji, radicals, words, sentences: {}, lessons } as unknown as Data;
const forms = (ids: string[]) => ids.map((id) => data.words[id].w);

describe("search", () => {
  it("finds words and kanji from romaji", () => {
    const r = search(data, "taberu");
    expect(forms(r.words)).toContain("食べる");
    expect(r.kanji).toContain("食");
  });

  it("finds kanji by on'yomi in kana", () => {
    expect(search(data, "ご").kanji).toContain("語");
  });

  it("finds words by English meaning, exact meaning first", () => {
    const r = search(data, "water");
    expect(forms(r.words)[0]).toBe("水");
    expect(r.kanji).toContain("水");
  });

  it("finds kanji and words when typing kanji", () => {
    const r = search(data, "日本");
    expect(r.kanji).toEqual(["日", "本"]);
    expect(forms(r.words)).toContain("日本語");
  });
});

describe("router", () => {
  it("parses kanji and search routes", () => {
    expect(parse("#/k/%E8%AA%9E")).toEqual({ page: "kanji", c: "語" });
    expect(parse("#/search?q=water")).toEqual({ page: "search", q: "water" });
    expect(parse("")).toEqual({ page: "home" });
  });
});

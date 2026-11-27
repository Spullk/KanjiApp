import { describe, expect, it } from "vitest";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { addItem, emptyStore, merge, nextToLearn } from "../src/srs";
import { readFileSync } from "node:fs";
import { lookupDict, makeDict } from "../src/jmdict";
import { aiPrompt, analyse, cleanLyrics, findTitle, groupTokens, matchWord, parseAI, queueWord, removeSong, saveSong, songCredits, unqueueWord, withAnswer, type Song, type Token } from "../src/songs";

const data = { kanji, radicals, words, sentences: {}, lessons, grammar: {} } as unknown as Data;

describe("cleaning a pasted song", () => {
  const paste = `245 ContributorsTranslationsEnglishRomanization夜の歌 (Yoru no Uta) Lyrics
"夜の歌" is a song about… Read More
[Intro]
一行目

[Chorus]
二行目
You might also like
Other Song
Another Artist
三行目
[Verse 2]
四行目12Embed`;

  it("keeps only lyric lines, in verses", () => {
    const { sections, removed } = cleanLyrics(paste);
    expect(sections).toEqual([["一行目"], ["二行目"], ["四行目"]]);
    expect(removed).toContain("[Chorus]");
    expect(removed).toContain("12Embed");
  });

  it("finds the title in a Genius paste", () => {
    expect(findTitle(paste)).toBe("夜の歌 (Yoru no Uta)");
    expect(findTitle("1 ContributorLemon Lyrics\n夢ならば")).toBe("Lemon");
    expect(findTitle("兎追いし\nかの山")).toBe("");
  });
});

describe("the AI's answer", () => {
  it("reads the JSON code block and drops bad entries", () => {
    const ai = parseAI('Here you go\n```json\n{"nekko":2,"notes":[{"line":1,"note":"x"},{"note":"no line"}],"words":[{"base":"夜","r":"よる"},{"r":"no base"}]}\n```');
    expect(ai.words).toHaveLength(1);
    expect(ai.notes).toHaveLength(1);
  });
  it("says so when there is no word list", () => {
    expect(() => parseAI('{"song":{}}')).toThrow(/word list/);
  });
  it("says so when the answer stops partway", () => {
    expect(() => parseAI('```json\n{"nekko":3,"words":[{"base":"夜"')).toThrow(/stops partway/);
  });
  it("picks the code block with the word list", () => {
    const ai = parseAI('```\n{"a":1}\n```\nand\n```json\n{"words":[{"base":"夜"}],"song":{"title":" 夜の歌 ","lyricist":"","sources":["x","https://a.jp","https://a.jp"]}}\n```');
    expect(ai.words).toHaveLength(1);
    expect(ai.song).toEqual({ title: "夜の歌", sources: ["https://a.jp"] });
  });
});

describe("the song's details", () => {
  const song: Song = { id: "a1", title: "Yoru no Uta", lyrics: "一行目", source: "paste", added: 1 };
  it("asks to find the song when it has no title", () => {
    expect(aiPrompt({ ...song, title: "Untitled song" })).toContain("work it out from the lyrics");
    expect(aiPrompt(song)).toContain('"nekko": 3');
  });
  it("takes the official title and artist, keeping yours", () => {
    const s = withAnswer(song, { words: [], song: { title: "夜の歌", artist: "誰か", confidence: "sure" } });
    expect([s.title, s.artist, s.aka]).toEqual(["夜の歌", "誰か", "Yoru no Uta"]);
    const unsure = withAnswer({ ...song, artist: "Me" }, { words: [], song: { title: "夜の歌", artist: "誰か", confidence: "unsure" } });
    expect([unsure.title, unsure.artist]).toEqual(["Yoru no Uta", "Me"]);
    expect(withAnswer({ ...song, title: "Untitled song" }, { words: [], song: { title: "夜の歌", confidence: "unsure" } }).title).toBe("夜の歌");
  });
  it("lists the credits", () => {
    expect(songCredits({ lyricist: "A", composer: "B", vocals: "C", artist: "C", released: "2020", release: "Single" })).toEqual([
      ["Words", "A"],
      ["Music", "B"],
      ["Released", "2020, Single"],
    ]);
    expect(songCredits({ credits: "A and B" })).toEqual([["Credits", "A and B"]]);
  });
});

describe("splitting and matching", () => {
  const t = (surface_form: string, pos: string, pos_detail_1: string, basic_form: string): Token => ({ surface_form, pos, pos_detail_1, basic_form });
  it("keeps a verb's endings with it", () => {
    const groups = groupTokens([t("歩い", "動詞", "自立", "歩く"), t("て", "助詞", "接続助詞", "て"), t("いる", "動詞", "非自立", "いる"), t("道", "名詞", "一般", "道")]);
    expect(groups.map((g) => g.map((x) => x.surface_form).join(""))).toEqual(["歩いている", "道"]);
  });
  it("picks the Nekko word by reading", () => {
    expect(matchWord(data, "空", "そら")?.r).toBe("そら");
    expect(matchWord(data, "空", "から", "から")?.r).toBe("から");
    expect(matchWord(data, "僕", "ぼく")?.r).toBe("ぼく");
  });
});

describe("every word has a meaning", () => {
  const dict = makeDict(JSON.parse(readFileSync(new URL("../public/dict/jmdict.json", import.meta.url), "utf8")));
  const tok = (surface_form: string, pos: string, pos_detail_1: string, basic_form: string, reading: string) => ({ surface_form, pos, pos_detail_1, basic_form, reading });
  it("finds words Nekko doesn't have in JMdict", () => {
    expect(lookupDict(dict, "纏う", "マトウ")?.m).toMatch(/wear/);
    expect(lookupDict(dict, "がむしゃら", "ガムシャラ")?.m).toMatch(/reckless/);
    expect(lookupDict(dict, "分かり合う", "ワカリアウ")?.m).toMatch(/understand/);
  });
  it("reads a particle as a particle, not a noun read the same way", () => {
    expect(lookupDict(dict, "は", "ハ", "grammar")?.m).toMatch(/topic/);
    expect(lookupDict(dict, "を", "ヲ", "grammar")?.m).toMatch(/object/);
    expect(lookupDict(dict, "くる", "キ", "v")?.m).not.toMatch(/rickets/);
  });
  it("fills in what the AI skipped", () => {
    const line = [tok("君", "名詞", "代名詞", "君", "キミ"), tok("は", "助詞", "係助詞", "は", "ハ"), tok("纏う", "動詞", "自立", "纏う", "マトウ")];
    const tk = { tokenize: () => line } as unknown as Parameters<typeof analyse>[1];
    const song = { id: "t", title: "t", lyrics: "君は纏う", added: 0, ai: { words: [] } } as unknown as Song;
    const without = analyse(song, tk, data);
    expect(without.missing).toContain("纏う");
    const { lines, missing } = analyse(song, tk, data, dict);
    expect(missing).toEqual([]);
    const ws = (lines[0] as Extract<(typeof lines)[0], { words: unknown }>).words;
    expect(ws[0].wid).toBeTruthy();
    expect(ws[1].jm).toMatch(/topic/);
    expect(ws[2].jm).toMatch(/wear/);
  });
});

describe("adding song words to your lessons", () => {
  const wid = Object.values(data.words).find((w) => w.w === "夜")!.id;
  it("puts the word, after its kanji, at the front of new lessons", () => {
    const s = emptyStore();
    queueWord(s, data, wid, 1000);
    expect(nextToLearn(s, data, 2)).toEqual([
      { kind: "kanji", key: "夜" },
      { kind: "word", key: wid },
    ]);
    unqueueWord(s, wid, 2000);
    expect(nextToLearn(s, data, 2)[1]).not.toEqual({ kind: "word", key: wid });
  });
  it("skips kanji you already study", () => {
    const s = emptyStore();
    addItem(s, "kanji", "夜", 500);
    queueWord(s, data, wid, 1000);
    expect(nextToLearn(s, data, 1)).toEqual([{ kind: "word", key: wid }]);
  });
});

describe("saving songs", () => {
  const song: Song = { id: "a1", title: "テスト", lyrics: "一行目", source: "paste", added: 1 };
  it("syncs songs and their removal like other items", () => {
    const a = emptyStore();
    saveSong(a, song, 10);
    const b = emptyStore();
    removeSong(b, "a1", 20);
    expect(merge(a, b).items["song:a1"].song).toBeUndefined();
    expect(merge(b, a).items["song:a1"].song).toBeUndefined();
    saveSong(a, { ...song, title: "新" }, 30);
    expect(merge(b, a).items["song:a1"].song?.title).toBe("新");
  });
});

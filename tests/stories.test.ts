import { describe, expect, it } from "vitest";
import type { Data } from "../src/data";
import { addItem, emptyStore, merge, setItemInfo } from "../src/srs";
import { coverage, isFinished, knowledge, newWords, setFinished, type StoryInfo } from "../src/stories";

const data = {
  words: {
    1: { w: "山", lesson: 3 }, // taught by Nekko
    2: { w: "行く" }, // not taught as a word
    3: { w: "狐" },
    4: { w: "森", lesson: 9 },
  },
} as unknown as Data;

const story: StoryInfo = {
  id: "a1", title: "", author: "", source: "aozora", url: "", chars: 100, free: 4,
  w: [["1", 3], ["2", 2], ["4", 1], ["3", 1], ["99", 5]],
};

describe("stories", () => {
  it("counts the words you know, every time they're used", () => {
    const s = emptyStore();
    setItemInfo(s, "word", "1", { status: "known" });
    setItemInfo(s, "kanji", "行", { status: "known" }); // 行く isn't a Nekko word, so knowing 行 is enough
    addItem(s, "word", "4"); // still learning
    // 4 free kana words + 山 ×3 + 行く ×2 known; 森 learning; 狐 new; word 99 has no entry and doesn't count.
    expect(coverage(knowledge(s, data), story)).toEqual({ known: 9, learning: 1, total: 11 });
    expect(newWords(knowledge(s, data), story)).toEqual(["3"]);
  });

  it("a taught word needs its own study, not just its kanji", () => {
    const s = emptyStore();
    setItemInfo(s, "kanji", "山", { status: "known" });
    expect(knowledge(s, data).word("1")).toBe("new");
  });

  it("finished stories merge like other progress", () => {
    const a = emptyStore();
    const b = emptyStore();
    setFinished(a, "a1", true, 1);
    setFinished(b, "a1", false, 2);
    expect(isFinished(a, "a1")).toBe(true);
    expect(isFinished(merge(a, b), "a1")).toBe(false);
  });
});

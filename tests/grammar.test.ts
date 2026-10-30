import { describe, expect, it } from "vitest";
import points from "../data/grammar.json";
import type { GrammarPoint } from "../src/data";
import { cloze, segments, tierOf, TIERS } from "../src/grammar";
import { alignFurigana } from "../src/components/bits";
import { activeTab, barTools, DEFAULT_TABS } from "../src/tools";
import { DEFAULT_SETTINGS } from "../src/srs";

describe("grammar", () => {
  it("reads furigana markup", () => {
    expect(segments("私[わたし]は今日[*きょう]")).toEqual([["私", "わたし"], ["は", null], ["今日", "きょう", "*"]]);
  });

  it("splits an example around its gap, accepting how particles are said", () => {
    const c = cloze(["わたし{は}がくせいです。", "I'm a student."]);
    expect(c.before).toEqual([["わたし", null]]);
    expect(c.answers).toEqual(["は", "わ"]);
    expect(cloze(["{なに|なん}をたべますか。", ""]).answers).toEqual(["なに", "なん"]);
    expect(cloze(["はこの{中[なか]}に", ""]).answers).toEqual(["なか"]);
  });

  it("puts every level in one tab", () => {
    expect(tierOf("numbers")).toBe("beginner");
    expect(tierOf("n4")).toBe("n4");
  });

  it("every point is well formed", () => {
    const ids = new Set<string>();
    for (const g of points as GrammarPoint[]) {
      expect(ids.has(g.id)).toBe(false);
      ids.add(g.id);
      expect(TIERS.flatMap((t) => t.levels)).toContain(g.level);
      for (const ex of g.ex) {
        expect(cloze(ex).answers.every((a) => /^[ぁ-ゖァ-ヺー]+$/.test(a))).toBe(true);
        // Every kanji has its reading, so furigana can show (or hide) it.
        expect(segments(ex[0].replace(/[{}|]/g, "")).filter(([t, r]) => !r && /[一-鿿]/.test(t))).toEqual([]);
      }
    }
  });
});

describe("furigana in sentences", () => {
  it("fits a word's furigana over its conjugated form", () => {
    expect(alignFurigana("言った", [["言", "い"], ["う", null]])).toEqual([["言", "い"], ["った", null]]);
    expect(alignFurigana("学生", [["学", "がく"], ["生", "せい"]])).toEqual([["学", "がく"], ["生", "せい"]]);
    expect(alignFurigana("がくせい", [["学", "がく"], ["生", "せい"]])).toBeNull();
  });
});

describe("bottom bar", () => {
  it("is Home, your three picks, then Progress", () => {
    const bar = barTools(DEFAULT_SETTINGS);
    expect(bar.map((t) => t.tab)).toEqual(["home", ...DEFAULT_TABS, "progress"]);
    expect(activeTab(bar, "settings")).toBe("progress");
    expect(activeTab(bar, "grammar")).toBe("home");
    // An older save picked four, Progress among them; anything that isn't a tool is filled from the defaults.
    const mine = barTools({ ...DEFAULT_SETTINGS, tabs: ["grammar", "progress", "nope", "kana"] });
    expect(mine.map((t) => t.tab)).toEqual(["home", "grammar", "kana", "review", "progress"]);
    expect(activeTab(mine, "kanaRow")).toBe("kana");
  });
});

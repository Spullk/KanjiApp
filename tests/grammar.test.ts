import { describe, expect, it } from "vitest";
import points from "../data/grammar.json";
import type { GrammarPoint } from "../src/data";
import { cloze, segments } from "../src/grammar";
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

  it("every point is well formed", () => {
    const ids = new Set<string>();
    for (const g of points as GrammarPoint[]) {
      expect(ids.has(g.id)).toBe(false);
      ids.add(g.id);
      expect(["start", "numbers", "phrases", "n5"]).toContain(g.level);
      for (const ex of g.ex) expect(cloze(ex).answers.every((a) => /^[ぁ-ゖァ-ヺー]+$/.test(a))).toBe(true);
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
  it("is Home plus your four picks, lighting the most specific tab", () => {
    const bar = barTools(DEFAULT_SETTINGS);
    expect(bar.map((t) => t.tab)).toEqual(["home", ...DEFAULT_TABS]);
    expect(activeTab(bar, "settings")).toBe("progress");
    expect(activeTab(bar, "grammar")).toBe("home");
    const mine = barTools({ ...DEFAULT_SETTINGS, tabs: ["settings", "progress", "nope", "grammar"] });
    expect(mine.map((t) => t.tab)).toEqual(["home", "settings", "progress", "grammar"]);
    expect(activeTab(mine, "settings")).toBe("settings");
  });
});

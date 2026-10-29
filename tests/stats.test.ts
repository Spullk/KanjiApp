import { describe, expect, it } from "vitest";
import { Rating, type Review } from "../src/srs";
import { accuracyByType, dayKey, hardestItems, heatmap, itemHistory, reviewsPerDay, streak, timeSpent } from "../src/stats";

const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

describe("stats", () => {
  it("counts a streak back from today, or from yesterday before today's reviews", () => {
    const log: Review[] = [
      ["kanji:一:meaning", Rating.Good, at(2026, 10, 27)],
      ["kanji:一:meaning", Rating.Good, at(2026, 10, 28)],
    ];
    const per = reviewsPerDay(log);
    expect(streak(per, at(2026, 10, 28, 20))).toBe(2);
    expect(streak(per, at(2026, 10, 29, 8))).toBe(2);
    expect(streak(per, at(2026, 10, 30, 8))).toBe(0);
  });

  it("lays the calendar out in Monday-first weeks ending this week", () => {
    const now = at(2026, 10, 29); // a Thursday
    const weeks = heatmap(new Map([[dayKey(now), 3]]), now, 4);
    expect(weeks).toHaveLength(4);
    expect(new Date(weeks[0][0].t).getDay()).toBe(1);
    const last = weeks[3];
    expect(last[3].n).toBe(3);
    expect(last[3].future).toBe(false);
    expect(last[4].future).toBe(true);
  });

  it("works out accuracy per card type and per item", () => {
    const log: Review[] = [
      ["kanji:一:meaning", Rating.Good, 1],
      ["kanji:一:reading", Rating.Again, 2],
      ["kanji:一:reading", Rating.Hard, 3],
      ["word:123:word", Rating.Easy, 4],
    ];
    const acc = accuracyByType(log, 0);
    expect(acc["kanji:reading"]).toEqual({ right: 1, total: 2 });
    expect(acc["word:word"]).toEqual({ right: 1, total: 1 });
    expect(itemHistory(log, "kanji:一")).toEqual({ right: 2, total: 3, last: 3 });
  });

  it("counts time between answers but not breaks", () => {
    const log: Review[] = [
      ["a:b:c", Rating.Good, 0],
      ["a:b:c", Rating.Good, 20_000],
      ["a:b:c", Rating.Good, 50_000],
      ["a:b:c", Rating.Good, 3_600_000],
    ];
    expect(timeSpent(log, 0)).toBe(10_000 + 20_000 + 30_000 + 10_000);
  });

  it("lists the most missed items first", () => {
    const log: Review[] = [];
    for (let i = 0; i < 4; i++) log.push(["kanji:一:meaning", i ? Rating.Good : Rating.Again, i]);
    for (let i = 0; i < 4; i++) log.push(["kanji:二:meaning", i % 2 ? Rating.Good : Rating.Again, 10 + i]);
    for (let i = 0; i < 4; i++) log.push(["kanji:三:meaning", Rating.Good, 20 + i]);
    expect(hardestItems(log).map((h) => h.item)).toEqual(["kanji:二", "kanji:一"]);
  });
});

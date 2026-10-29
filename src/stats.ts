// Numbers worked out from the review log for the Progress page and item pages.

import { Rating, type Review } from "./srs";

export const DAY = 86_400_000;

/** A calendar day in local time, e.g. "2026-10-29". */
export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function reviewsPerDay(log: Review[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const [, , t] of log) out.set(dayKey(t), (out.get(dayKey(t)) ?? 0) + 1);
  return out;
}

/** Days in a row with at least one review, counting today only once you've reviewed. */
export function streak(perDay: Map<string, number>, now = Date.now()): number {
  let n = 0;
  // Step by calendar date rather than 24 h so a daylight saving change can't skip or repeat a day.
  const d = new Date(now);
  if (!perDay.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (perDay.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export type HeatCell = { t: number; n: number; future: boolean };

/** The last `weeks` weeks as columns of 7 days, Monday on top, ending with the current week. */
export function heatmap(perDay: Map<string, number>, now = Date.now(), weeks = 26): HeatCell[][] {
  const start = new Date(now);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7);
  const today = dayKey(now);
  const out: HeatCell[][] = [];
  let future = false;
  for (let w = 0; w < weeks; w++) {
    const col: HeatCell[] = [];
    for (let i = 0; i < 7; i++) {
      const t = start.getTime();
      col.push({ t, n: perDay.get(dayKey(t)) ?? 0, future });
      if (dayKey(t) === today) future = true;
      start.setDate(start.getDate() + 1);
    }
    out.push(col);
  }
  return out;
}

export type Accuracy = { right: number; total: number };

/** Share of answers that weren't "Again", per kind of card ("kanji:reading"…), since `since`. */
export function accuracyByType(log: Review[], since: number): Record<string, Accuracy> {
  const out: Record<string, Accuracy> = {};
  for (const [id, rating, t] of log) {
    if (t < since) continue;
    const parts = id.split(":");
    const type = `${parts[0]}:${parts[2]}`;
    const a = (out[type] ??= { right: 0, total: 0 });
    a.total++;
    if (rating !== Rating.Again) a.right++;
  }
  return out;
}

export function percent(a: Accuracy | undefined): string {
  return a?.total ? `${Math.round((a.right / a.total) * 100)}%` : "–";
}

/** A pause longer than this between two answers means you stopped; the time isn't counted. */
const BREAK = 5 * 60_000;
/** What the first answer of a sitting is assumed to take. */
const FIRST_ANSWER = 10_000;

/** Roughly how long you spent reviewing between `from` and `to`, from the gaps between answers. */
export function timeSpent(log: Review[], from: number, to = Infinity): number {
  let total = 0;
  let prev = -Infinity;
  for (const [, , t] of log) {
    if (t < from || t > to) continue;
    total += t - prev < BREAK ? t - prev : FIRST_ANSWER;
    prev = t;
  }
  return total;
}

export function duration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

export type History = Accuracy & { last?: number };

/** How an item's reviews have gone, over all of its cards. */
export function itemHistory(log: Review[], item: string): History {
  const out: History = { right: 0, total: 0 };
  const prefix = item + ":";
  for (const [id, rating, t] of log) {
    if (!id.startsWith(prefix)) continue;
    out.total++;
    if (rating !== Rating.Again) out.right++;
    out.last = t;
  }
  return out;
}

/** Items you get wrong most often (at least `minReviews` answers), worst first. */
export function hardestItems(log: Review[], n = 20, minReviews = 4): { item: string; acc: Accuracy }[] {
  const by = new Map<string, Accuracy>();
  for (const [id, rating] of log) {
    const item = id.slice(0, id.lastIndexOf(":"));
    const a = by.get(item) ?? { right: 0, total: 0 };
    a.total++;
    if (rating !== Rating.Again) a.right++;
    by.set(item, a);
  }
  return [...by]
    .filter(([, a]) => a.total >= minReviews && a.right < a.total)
    .sort(([, a], [, b]) => a.right / a.total - b.right / b.total || b.total - a.total)
    .slice(0, n)
    .map(([item, acc]) => ({ item, acc }));
}

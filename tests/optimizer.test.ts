import { describe, expect, it } from "vitest";
import { default_w, FSRSAlgorithm, type FSRSState, type Grade } from "ts-fsrs";
import { histories, logLoss, optimize, type History } from "../src/optimizer";
import type { Review, StoredCard } from "../src/srs";

/** A made-up learner whose memory follows `w`: reviews each card when FSRS would, for `days` days. */
function simulate(w: number[], cards: number, days: number, seed = 1): History[] {
  let x = seed;
  const rand = () => ((x = (x * 16807) % 2147483647) / 2147483647);
  const f = new FSRSAlgorithm({ w, enable_short_term: true });
  const out: History[] = [];
  for (let c = 0; c < cards; c++) {
    const h: History = [];
    let state: FSRSState | null = null;
    let day = Math.floor(rand() * 20);
    let last = day;
    while (day < days) {
      const elapsed = h.length ? day - last : 0;
      const p = state ? f.forgetting_curve(elapsed, state.stability) : 0.7;
      const rating = (rand() < p ? (rand() < 0.15 ? 4 : rand() < 0.1 ? 2 : 3) : 1) as Grade;
      h.push([elapsed, rating]);
      state = f.next_state(state, elapsed, rating);
      last = day;
      day += Math.max(1, Math.round(state.stability * (rating === 1 ? 0.3 : 1)));
    }
    out.push(h);
  }
  return out;
}

describe("optimizer", () => {
  it("builds histories from the log, skipping cards whose early answers are missing", () => {
    const day = 86_400_000;
    const t0 = new Date(2026, 0, 1, 10).getTime();
    const log: Review[] = [
      ["a", 3, t0],
      ["a", 3, t0 + 60_000],
      ["a", 1, t0 + 3 * day],
      ["b", 3, t0 + 5 * day],
    ];
    const cards = { a: { reps: 3 }, b: { reps: 7 } } as unknown as Record<string, StoredCard>;
    expect(histories(log, cards)).toEqual([[[0, 3], [0, 3], [3, 1]]]);
  });

  it("fits a learner whose memory differs from the defaults", () => {
    const truth = [...default_w];
    truth[2] = 8; // Good on a new card holds much longer than the default 2.3 days
    truth[8] = 2.2; // and reviews strengthen memory more
    const hs = simulate(truth, 400, 200);
    const start = Date.now();
    const r = optimize(hs, [...default_w], undefined, 60);
    expect(Date.now() - start).toBeLessThan(60_000);
    expect(r.after).toBeLessThan(r.before);
    expect(logLoss(r.w, hs)).toBeLessThan(logLoss([...default_w], hs));
    expect(r.w[2]).toBeGreaterThan(default_w[2]);
  }, 120_000);
});

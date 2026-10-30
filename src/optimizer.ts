// Trains FSRS on your own review history, like Anki's "Optimize" button. Anki runs the official optimizer, which
// needs browser features GitHub Pages can't turn on, so this is a small one in plain TypeScript: it replays every
// card's answers through ts-fsrs and nudges the 21 parameters (Adam) to predict your right and wrong answers better.

import { CLAMP_PARAMETERS, default_w, FSRSAlgorithm, W17_W18_Ceiling, type FSRSState, type Grade } from "ts-fsrs";
import type { Review, StoredCard } from "./srs";

/** One card's answers: [days since the previous answer (0 for the first and same-day ones), rating]. */
export type History = [days: number, rating: Grade][];

/** Answers a day or more after the last one; only these test memory, so they're what the training counts. */
export const MIN_REVIEWS = 100;

function calendarDay(t: number): number {
  const d = new Date(t);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

/**
 * Each card's answers in order. Cards with answers missing from the log (imported from Anki or WaniKani, or
 * marked known) are left out, since their history doesn't start at the beginning.
 */
export function histories(log: Review[], cards: Record<string, StoredCard>): History[] {
  const byCard = new Map<string, Review[]>();
  for (const r of log) byCard.set(r[0], [...(byCard.get(r[0]) ?? []), r]);
  const out: History[] = [];
  for (const [id, rs] of byCard) {
    if (cards[id] && cards[id].reps !== rs.length) continue;
    rs.sort((a, b) => a[2] - b[2]);
    out.push(rs.map(([, rating, t], i) => [i ? calendarDay(t) - calendarDay(rs[i - 1][2]) : 0, rating]));
  }
  return out;
}

/** How many answers the training can learn from. */
export function countTested(hs: History[]): number {
  return hs.reduce((n, h) => n + h.filter(([days], i) => i > 0 && days > 0).length, 0);
}

/** Average log loss of predicting each tested answer: lower is better. */
export function logLoss(w: number[], hs: History[]): number {
  const f = new FSRSAlgorithm({ w, enable_short_term: true });
  let sum = 0;
  let n = 0;
  for (const h of hs) {
    let state: FSRSState | null = null;
    for (let i = 0; i < h.length; i++) {
      const [days, rating] = h[i];
      if (state && days > 0) {
        const p = Math.min(Math.max(f.forgetting_curve(days, state.stability), 1e-4), 1 - 1e-4);
        sum -= rating > 1 ? Math.log(p) : Math.log(1 - p);
        n++;
      }
      state = f.next_state(state, days, rating);
    }
  }
  return n ? sum / n : 0;
}

export type Progress = { step: number; steps: number; loss: number };
export type Result = { w: number[]; before: number; after: number; reviews: number };

/**
 * Fits the parameters, starting from `start` (your current ones). With little history the pull back towards
 * `start` keeps them from swinging to extremes.
 */
export function optimize(hs: History[], start: number[] = [...default_w], onProgress?: (p: Progress) => void, steps = 200): Result {
  const bounds = CLAMP_PARAMETERS(W17_W18_Ceiling, true);
  const clip = (w: number[]) => w.map((x, i) => Math.min(Math.max(x, bounds[i][0]), bounds[i][1]));
  const range = bounds.map(([lo, hi]) => hi - lo || 1);
  const reviews = countTested(hs);
  const pull = 20 / Math.max(reviews, 1);
  const objective = (w: number[]) => logLoss(w, hs) + pull * w.reduce((s, x, i) => s + ((x - start[i]) / range[i]) ** 2, 0);

  let w = clip(start);
  const before = logLoss(w, hs);
  const m = w.map(() => 0);
  const v = w.map(() => 0);
  const [lr, b1, b2] = [0.04, 0.9, 0.999];
  let best = { w, loss: objective(w) };
  for (let step = 1; step <= steps; step++) {
    // Central differences: 42 replays per step.
    const grad = w.map((x, i) => {
      const h = range[i] * 1e-4;
      const up = [...w];
      const down = [...w];
      up[i] = Math.min(x + h, bounds[i][1]);
      down[i] = Math.max(x - h, bounds[i][0]);
      return up[i] === down[i] ? 0 : (objective(up) - objective(down)) / (up[i] - down[i]);
    });
    const rate = lr * (step <= 20 ? step / 20 : 0.5 * (1 + Math.cos((Math.PI * (step - 20)) / (steps - 20))));
    w = clip(
      w.map((x, i) => {
        m[i] = b1 * m[i] + (1 - b1) * grad[i];
        v[i] = b2 * v[i] + (1 - b2) * grad[i] ** 2;
        const mh = m[i] / (1 - b1 ** step);
        const vh = v[i] / (1 - b2 ** step);
        return x - (rate * mh) / (Math.sqrt(vh) + 1e-8);
      }),
    );
    const loss = objective(w);
    if (loss < best.loss) best = { w, loss };
    onProgress?.({ step, steps, loss });
  }
  return { w: best.w.map((x) => Math.round(x * 10_000) / 10_000), before, after: logLoss(best.w, hs), reviews };
}

// The kana drill: no spaced repetition, just one queue of every kana you've started. The lowest position comes
// next; a right answer sends the kana further back each time (5, 10, 20… cards), a wrong one 3 cards back.
// Each kana's place is kept in store.items["kana:か"], so it syncs like the rest of your progress.

import { ALL_KANA, scriptOf, type Script } from "./kana";
import type { Drill, Store } from "./srs";

export type DrillFilter = { script: Script | "both"; missed?: boolean };

const WRONG_GAP = 3;
const RIGHT_GAP = 5;
const MAX_DOUBLINGS = 6;

const itemKey = (k: string) => `kana:${k}`;

export function drillOf(store: Store, k: string): Drill | undefined {
  return store.items[itemKey(k)]?.drill;
}

function setDrill(store: Store, k: string, drill: Drill | undefined, now: number) {
  const next = { ...store.items[itemKey(k)], drill, updated: now };
  if (!drill) delete next.drill;
  store.items[itemKey(k)] = next;
}

/** The kana in the queue that this filter practises, in teaching order. */
export function drillKana(store: Store, filter: DrillFilter): string[] {
  return ALL_KANA.filter((k) => {
    const d = drillOf(store, k);
    return d && (filter.script === "both" || scriptOf(k) === filter.script) && (!filter.missed || d.misses > 0);
  });
}

/** The front of the queue: where new kana join, and what "now" is. */
function front(store: Store): number {
  const ats = ALL_KANA.map((k) => drillOf(store, k)?.at).filter((a): a is number => a !== undefined);
  return ats.length ? Math.min(...ats) : 0;
}

/** The next kana to ask: the lowest position, but never the one just asked if there's another. */
export function nextKana(store: Store, filter: DrillFilter, prev?: string): string | undefined {
  const pool = drillKana(store, filter);
  const pick = pool.length > 1 ? pool.filter((k) => k !== prev) : pool;
  return pick.sort((a, b) => drillOf(store, a)!.at - drillOf(store, b)!.at)[0];
}

/**
 * Puts kana into the queue, at the front and in the order given, so they're practised next. Kana you already
 * know start with a streak and are spread through the queue instead, so they come up now and then.
 */
export function addKana(store: Store, kana: string[], now = Date.now(), known = false) {
  const at = front(store);
  kana
    .filter((k) => !drillOf(store, k))
    .forEach((k, i) => setDrill(store, k, known ? { at: at + RIGHT_GAP + i, streak: 3, misses: 0 } : { at: at + i / 100, streak: 0, misses: 0 }, now));
}

export function removeKana(store: Store, kana: string[], now = Date.now()) {
  kana.filter((k) => drillOf(store, k)).forEach((k) => setDrill(store, k, undefined, now));
}

export function answerKana(store: Store, k: string, right: boolean, now = Date.now()) {
  const d = drillOf(store, k);
  if (!d) return;
  const streak = right ? d.streak + 1 : 0;
  const gap = right ? RIGHT_GAP * 2 ** Math.min(streak - 1, MAX_DOUBLINGS) : WRONG_GAP;
  setDrill(store, k, { at: d.at + gap, streak, misses: d.misses + (right ? 0 : 1) }, now);
}

/** How well a kana is going, for colouring the chart. */
export function kanaStrength(d: Drill | undefined): "none" | "weak" | "learning" | "strong" {
  if (!d) return "none";
  if (d.streak >= 3) return "strong";
  return d.misses > 0 && d.streak === 0 ? "weak" : "learning";
}

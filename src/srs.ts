// Spaced repetition: which items you study, their FSRS scheduling state, and the review log.
// Everything lives in localStorage on this device; Progress → Backup exports it as JSON.

import { useEffect, useState } from "preact/hooks";
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { Data } from "./data";

export { Rating, State };
export type { Grade };

export type ItemKind = "radical" | "kanji" | "word";
export type Face = "meaning" | "reading" | "word";

/** A study item ("kanji:語") and the cards it makes ("kanji:語:meaning", "kanji:語:reading"). */
export const FACES: Record<ItemKind, Face[]> = {
  radical: ["meaning"],
  kanji: ["meaning", "reading"],
  word: ["word"],
};

export type StoredCard = {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review?: number;
  added: number;
};

export type Settings = { batch: number; retention: number };

export type Store = {
  version: 1;
  cards: Record<string, StoredCard>;
  /** [card id, rating, time] for every review, for stats and a future FSRS optimisation. */
  log: [string, Grade, number][];
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = { batch: 5, retention: 0.9 };

export function emptyStore(): Store {
  return { version: 1, cards: {}, log: [], settings: { ...DEFAULT_SETTINGS } };
}

export const itemId = (kind: ItemKind, key: string) => `${kind}:${key}`;
export const cardId = (kind: ItemKind, key: string, face: Face) => `${kind}:${key}:${face}`;

export function parseCardId(id: string): { kind: ItemKind; key: string; face: Face } {
  const [kind, key, face] = id.split(":") as [ItemKind, string, Face];
  return { kind, key, face };
}

function toCard(c: StoredCard): Card {
  return { ...c, due: new Date(c.due), last_review: c.last_review ? new Date(c.last_review) : undefined };
}

function fromCard(c: Card, added: number): StoredCard {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
    added,
  };
}

function scheduler(settings: Settings) {
  return fsrs(generatorParameters({ request_retention: settings.retention, enable_fuzz: true }));
}

// ---------------------------------------------------------------- pure operations

export function isAdded(store: Store, kind: ItemKind, key: string): boolean {
  return FACES[kind].some((f) => store.cards[cardId(kind, key, f)]);
}

/** Adds an item's cards, due right away. Returns how many cards were new. */
export function addItem(store: Store, kind: ItemKind, key: string, now = Date.now()): number {
  let added = 0;
  for (const face of FACES[kind]) {
    const id = cardId(kind, key, face);
    if (!store.cards[id]) {
      store.cards[id] = fromCard(createEmptyCard(new Date(now)), now);
      added++;
    }
  }
  return added;
}

export function removeItem(store: Store, kind: ItemKind, key: string) {
  for (const face of FACES[kind]) delete store.cards[cardId(kind, key, face)];
}

export function grade(store: Store, id: string, rating: Grade, now = Date.now()) {
  const stored = store.cards[id];
  const { card } = scheduler(store.settings).next(toCard(stored), new Date(now), rating);
  store.cards[id] = fromCard(card, stored.added);
  store.log.push([id, rating, now]);
}

/** When each answer button would bring the card back, for labelling the buttons. */
export function preview(store: Store, id: string, now = Date.now()): Record<Grade, number> {
  const p = scheduler(store.settings).repeat(toCard(store.cards[id]), new Date(now));
  return {
    [Rating.Again]: p[Rating.Again].card.due.getTime(),
    [Rating.Hard]: p[Rating.Hard].card.due.getTime(),
    [Rating.Good]: p[Rating.Good].card.due.getTime(),
    [Rating.Easy]: p[Rating.Easy].card.due.getTime(),
  } as Record<Grade, number>;
}

/** Cards due by `until`, learning cards first, then the most overdue. */
export function dueCards(store: Store, until = Date.now()): string[] {
  return Object.entries(store.cards)
    .filter(([, c]) => c.due <= until)
    .sort(([, a], [, b]) => {
      const al = a.state === State.Review ? 1 : 0;
      const bl = b.state === State.Review ? 1 : 0;
      return al - bl || a.due - b.due;
    })
    .map(([id]) => id);
}

/** The order to learn a lesson in: each kanji right after its new radicals, then the words. */
export function lessonItems(data: Data, lessonIndex: number): { kind: ItemKind; key: string }[] {
  const l = data.lessons[lessonIndex];
  const out: { kind: ItemKind; key: string }[] = [];
  // Radicals that no kanji here uses directly (parts of parts) go first.
  let pending = l.radicals.filter((r) => !l.kanji.some((k) => data.radicals[r]?.usedIn.includes(k)));
  pending.forEach((key) => out.push({ kind: "radical", key }));
  pending = l.radicals.filter((r) => !pending.includes(r));
  for (const k of l.kanji) {
    for (const r of pending.filter((r) => data.radicals[r]?.usedIn.includes(k))) {
      out.push({ kind: "radical", key: r });
      pending = pending.filter((x) => x !== r);
    }
    out.push({ kind: "kanji", key: k });
  }
  l.words.forEach((key) => out.push({ kind: "word", key }));
  return out;
}

/** The next items to learn in lesson order, skipping what's already added. */
export function nextToLearn(store: Store, data: Data, n: number): { kind: ItemKind; key: string }[] {
  const out: { kind: ItemKind; key: string }[] = [];
  for (let i = 0; i < data.lessons.length; i++) {
    for (const it of lessonItems(data, i)) {
      if (!isAdded(store, it.kind, it.key)) out.push(it);
      if (out.length >= n) return out;
    }
  }
  return out;
}

export type Stage = "none" | "learning" | "young" | "mature";

/** An item's stage is its weakest card's: mature once every card holds for 21+ days. */
export function stageOf(store: Store, kind: ItemKind, key: string): Stage {
  const cards = FACES[kind].map((f) => store.cards[cardId(kind, key, f)]).filter(Boolean);
  if (!cards.length) return "none";
  if (cards.some((c) => c.state !== State.Review)) return "learning";
  const s = Math.min(...cards.map((c) => c.scheduled_days));
  return s >= 21 ? "mature" : "young";
}

export const STAGE_LABEL: Record<Stage, string> = {
  none: "Not studied",
  learning: "Learning",
  young: "Young",
  mature: "Known",
};

// ---------------------------------------------------------------- persistence

const KEY = "nekko.srs.v1";
let store: Store = load();
const listeners = new Set<() => void>();

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...emptyStore(), ...JSON.parse(raw) };
  } catch {
    // Private mode or corrupt data: start fresh rather than crash.
  }
  return emptyStore();
}

export function getStore(): Store {
  return store;
}

/** Applies a change, saves it and re-renders anything using useStore(). */
export function update(fn: (s: Store) => void) {
  fn(store);
  store = { ...store };
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (e) {
    console.error("Could not save progress", e);
  }
  listeners.forEach((l) => l());
}

export function replaceStore(next: Store) {
  update((s) => Object.assign(s, emptyStore(), next));
}

export function useStore(): Store {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return store;
}

/** Asks the browser not to evict our storage (matters most for installed iOS apps). */
export function requestPersistence() {
  navigator.storage?.persist?.().catch(() => {});
}

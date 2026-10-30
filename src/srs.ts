// Spaced repetition: which items you study, their FSRS scheduling state, and the review log.
// Everything lives on this device (see storage.ts); Settings → Backup exports it as JSON.

import { useEffect, useState } from "preact/hooks";
import { checkParameters, createEmptyCard, fsrs, generatorParameters, migrateParameters, Rating, State, type Card, type Grade } from "ts-fsrs";
import type { Data } from "./data";
import { defaultAdapter, localStorageAdapter, type StorageAdapter } from "./storage";
import { customOrder, kanjiOrder, teachingOrder, type StudyOrder } from "./order";

export { Rating, State };
export type { Grade };

export type ItemKind = "radical" | "kanji" | "word" | "grammar";
export type Face = "meaning" | "reading" | "word" | "recall" | "listen" | "both" | "cloze" | "context";

/** A study item ("kanji:語") and the cards it always makes ("kanji:語:meaning", "kanji:語:reading"). */
export const FACES: Record<ItemKind, Face[]> = {
  radical: ["meaning"],
  kanji: ["meaning", "reading"],
  word: ["word"],
  grammar: ["cloze"],
};

/** Optional cards you can switch on in Settings, for words: recall (English → Japanese), listening, and the word in a sentence. */
export type ExtraFace = "recall" | "listen" | "context";
export const EXTRA_FACES: Record<ItemKind, ExtraFace[]> = { radical: [], kanji: [], word: ["recall", "listen", "context"], grammar: [] };

/** With Settings.kanjiCards "one", a kanji has a single card asking meaning and reading together. */
const ONE_CARD: Partial<Record<ItemKind, Face[]>> = { kanji: ["both"] };

/** The main cards an item has with these settings: two per kanji, or one if you chose one card per kanji. */
export function mainFaces(settings: Settings, kind: ItemKind): Face[] {
  return settings.kanjiCards === "one" && ONE_CARD[kind] ? ONE_CARD[kind]! : FACES[kind];
}

/** Every card an item can have, switched on or not. */
export function allFaces(kind: ItemKind): Face[] {
  return [...(FACES[kind] ?? []), ...(ONE_CARD[kind] ?? []), ...(EXTRA_FACES[kind] ?? [])];
}

/** The cards a new item gets with the current settings. */
export function facesFor(settings: Settings, kind: ItemKind): Face[] {
  return [...mainFaces(settings, kind), ...EXTRA_FACES[kind].filter((f) => settings.extraCards?.includes(f))];
}

/** Whether this kind of card is asked with the current settings. Cards of a kind this version doesn't know
 * (synced from a newer version on another device) are left alone. */
function faceOn(settings: Settings, kind: ItemKind, face: Face): boolean {
  if (!FACES[kind]) return false;
  if ((EXTRA_FACES[kind] as Face[]).includes(face)) return !!settings.extraCards?.includes(face as ExtraFace);
  return mainFaces(settings, kind).includes(face);
}

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
  /** Last change to this card on any device; the newer copy wins when two stores are merged. */
  updated: number;
};

export type Settings = {
  batch: number;
  retention: number;
  /** self: show the answer and grade yourself (Anki). typed: type meaning and reading (WaniKani). */
  answerMode: "self" | "typed";
  /** FSRS weights trained on your own history (e.g. copied from Anki); default ones when unset. */
  fsrsParams?: number[];
  /** Most new items to start per day; 0 for no limit. */
  dailyNew: number;
  /** The order new items are taught in. */
  order: StudyOrder;
  /** Item ids ("kanji:語", "word:1234") to learn first, in order, when `order` is "custom". */
  customList?: string[];
  /** When vacation mode was switched on. Nothing is due while it's on, and it pushes everything back when it ends. */
  vacation?: number;
  /** Show kanji and words on review cards in a different typeface each day (print, handwriting, brush). */
  fonts?: boolean;
  /** Kanji as two cards (meaning, reading) or one card asking both. Unset means two. */
  kanjiCards?: "split" | "one";
  /** Optional card types switched on. Switching one off keeps its cards but stops asking them. */
  extraCards?: ExtraFace[];
  /** Native app only: hour of the daily review reminder, or undefined for none. */
  reminder?: number;
  /** Where you said you're starting from on the welcome screen: brand new, can read kana, or studied before. */
  start?: "new" | "kana" | "returning";
  /** The tools on the bottom bar after Home, in order. Unset means the default four. */
  tabs?: string[];
  /** Your order for the tools on Home (tool tabs) and for their groups. Unset means the default order. */
  homeTools?: string[];
  homeGroups?: string[];
};

/** What you've told Nekko about an item, apart from its cards. */
export type ItemInfo = {
  /** known: you knew it before, so it's never taught or reviewed. paused: kept, but not reviewed for now. */
  status?: "known" | "paused";
  /** Your own note or mnemonic. */
  note?: string;
  /** Extra meanings you want accepted as answers. */
  synonyms?: string[];
  /** Kana drill only ("kana:か"): where the kana sits in the practice queue (see kanaDrill.ts). */
  drill?: Drill;
  updated: number;
};

/** at: position in the queue, lowest comes next. streak: right answers in a row. misses: wrong answers ever. */
export type Drill = { at: number; streak: number; misses: number };

export type Review = [card: string, rating: Grade, time: number];

/** What a card looked like before an answer, so the answer can be taken back. */
export type Undo = { card: string; before: StoredCard; time: number };

export type Store = {
  version: 2;
  cards: Record<string, StoredCard>;
  /** Cards taken out of study and when, so merging another device's copy doesn't bring them back. */
  removed: Record<string, number>;
  /** By item id ("kanji:語"). */
  items: Record<string, ItemInfo>;
  /** Every review, for stats and a future FSRS optimisation. A card and time identify a review. */
  log: Review[];
  settings: Settings;
  settingsUpdated: number;
  /** The last few answers on this device, newest last. Not merged. */
  undo: Undo[];
};

export const DEFAULT_SETTINGS: Settings = { batch: 5, retention: 0.9, answerMode: "self", dailyNew: 0, order: "lessons" };

const UNDO_LIMIT = 20;

export function emptyStore(): Store {
  return { version: 2, cards: {}, removed: {}, items: {}, log: [], settings: { ...DEFAULT_SETTINGS }, settingsUpdated: 0, undo: [] };
}

/** Brings saved progress or a backup from any earlier version up to the current shape. */
export function migrate(raw: unknown): Store {
  const old = raw as Omit<Partial<Store>, "version"> & { version?: number };
  if (!old || typeof old !== "object" || typeof old.cards !== "object" || ![1, 2].includes(old.version!)) {
    throw new Error("not a Nekko backup");
  }
  const s = { ...emptyStore(), ...old, version: 2 } as Store;
  s.settings = { ...DEFAULT_SETTINGS, ...old.settings };
  if (old.version === 1) {
    s.cards = Object.fromEntries(
      Object.entries(old.cards!).map(([id, c]) => [id, { ...c, updated: c.last_review ?? c.added }]),
    );
  }
  return s;
}

/** Combines two copies of the progress, e.g. a backup from another device with this one. */
export function merge(local: Store, other: Store): Store {
  const out = emptyStore();
  for (const [id, t] of [...Object.entries(local.removed), ...Object.entries(other.removed)]) {
    out.removed[id] = Math.max(out.removed[id] ?? 0, t);
  }
  for (const c of [local.cards, other.cards]) {
    for (const [id, card] of Object.entries(c)) {
      const have = out.cards[id];
      if ((!have || card.updated > have.updated) && card.updated > (out.removed[id] ?? -Infinity)) out.cards[id] = card;
    }
  }
  for (const id of Object.keys(out.cards)) delete out.removed[id];
  for (const items of [local.items, other.items]) {
    for (const [id, info] of Object.entries(items)) {
      if (!out.items[id] || info.updated > out.items[id].updated) out.items[id] = info;
    }
  }
  const seen = new Set<string>();
  out.log = [...local.log, ...other.log]
    .filter(([id, , t]) => !seen.has(id + "@" + t) && !!seen.add(id + "@" + t))
    .sort((a, b) => a[2] - b[2]);
  const newer = other.settingsUpdated > local.settingsUpdated ? other : local;
  out.settings = { ...newer.settings };
  out.settingsUpdated = newer.settingsUpdated;
  out.undo = local.undo;
  return out;
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

function fromCard(c: Card, added: number, updated: number): StoredCard {
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
    updated,
  };
}

function scheduler(settings: Settings) {
  return fsrs(generatorParameters({ request_retention: settings.retention, enable_fuzz: true, w: settings.fsrsParams }));
}

// ---------------------------------------------------------------- pure operations

export function isAdded(store: Store, kind: ItemKind, key: string): boolean {
  return [...FACES[kind], ...(ONE_CARD[kind] ?? [])].some((f) => store.cards[cardId(kind, key, f)]);
}

export function itemInfo(store: Store, kind: ItemKind, key: string): ItemInfo | undefined {
  return store.items[itemId(kind, key)];
}

/** Changes what's stored about an item; empty fields are dropped. */
export function setItemInfo(store: Store, kind: ItemKind, key: string, change: Partial<Omit<ItemInfo, "updated">>, now = Date.now()) {
  const id = itemId(kind, key);
  const next: ItemInfo = { ...store.items[id], ...change, updated: now };
  if (!next.status) delete next.status;
  if (!next.note?.trim()) delete next.note;
  if (!next.synonyms?.length) delete next.synonyms;
  store.items[id] = next;
}

/** Marks (or with `undefined`, unmarks) many items at once, e.g. a whole lesson as already known. */
export function setStatusMany(store: Store, items: { kind: ItemKind; key: string }[], status: ItemInfo["status"], now = Date.now()) {
  for (const it of items) setItemInfo(store, it.kind, it.key, { status }, now);
}

/** A card is a leech once you've forgotten it this many times. */
export const LEECH_LAPSES = 8;

export function isLeech(store: Store, kind: ItemKind, key: string): boolean {
  return allFaces(kind).some((f) => (store.cards[cardId(kind, key, f)]?.lapses ?? 0) >= LEECH_LAPSES);
}

/** Adds an item's cards, due right away. Returns how many cards were new. */
export function addItem(store: Store, kind: ItemKind, key: string, now = Date.now()): number {
  let added = 0;
  for (const face of facesFor(store.settings, kind)) {
    const id = cardId(kind, key, face);
    if (!store.cards[id]) {
      store.cards[id] = fromCard(createEmptyCard(new Date(now)), now, now);
      delete store.removed[id];
      added++;
    }
  }
  return added;
}

/** Adds an item as if you'd been reviewing it elsewhere: its cards hold for `stability` days and come back at `due`. */
export function addReviewedItem(store: Store, kind: ItemKind, key: string, stability: number, due: number, now = Date.now()) {
  for (const face of mainFaces(store.settings, kind)) {
    const id = cardId(kind, key, face);
    store.cards[id] = {
      due,
      stability,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: Math.max(1, Math.round(stability)),
      learning_steps: 0,
      reps: 1,
      lapses: 0,
      state: State.Review,
      last_review: Math.min(now, due - stability * 86_400_000),
      added: startOfDay(now) - 1, // not new today, so it doesn't use up the daily limit
      updated: now,
    };
    delete store.removed[id];
  }
}

export function removeItem(store: Store, kind: ItemKind, key: string, now = Date.now()) {
  for (const face of allFaces(kind)) {
    const id = cardId(kind, key, face);
    if (store.cards[id]) store.removed[id] = now;
    delete store.cards[id];
  }
}

/**
 * Gives the items you already study a newly switched-on card type, `perDay` items a day starting today
 * (oldest first), so they don't all arrive at once. Returns how many cards were added.
 */
export function addFaceToStudied(store: Store, face: ExtraFace, perDay: number, now = Date.now()): number {
  const kinds = (Object.keys(EXTRA_FACES) as ItemKind[]).filter((k) => EXTRA_FACES[k].includes(face));
  const items = Object.entries(store.cards)
    .map(([id, c]) => ({ ...parseCardId(id), added: c.added }))
    .filter((c) => kinds.includes(c.kind) && c.face === FACES[c.kind][0] && !store.cards[cardId(c.kind, c.key, face)])
    .sort((a, b) => a.added - b.added);
  const today = startOfDay(now);
  items.forEach((it, i) => {
    const day = new Date(today);
    day.setDate(day.getDate() + Math.floor(i / perDay));
    const due = i < perDay ? now : day.getTime();
    store.cards[cardId(it.kind, it.key, face)] = fromCard(createEmptyCard(new Date(due)), due, now);
    delete store.removed[cardId(it.kind, it.key, face)];
  });
  return items.length;
}

/** Items you study that don't have this card type yet. */
export function missingFace(store: Store, face: ExtraFace): number {
  return Object.keys(store.cards).filter((id) => {
    const c = parseCardId(id);
    return EXTRA_FACES[c.kind].includes(face) && c.face === FACES[c.kind][0] && !store.cards[cardId(c.kind, c.key, face)];
  }).length;
}

/**
 * Switches kanji between two cards (meaning, reading) and one card for both, carrying your progress over:
 * the single card starts from the weaker of the two, and two cards both start from the single one.
 */
export function setKanjiCards(store: Store, mode: "split" | "one", now = Date.now()) {
  store.settings.kanjiCards = mode;
  const keys = new Set(Object.keys(store.cards).filter((id) => id.startsWith("kanji:")).map((id) => parseCardId(id).key));
  const take = (id: string) => {
    store.removed[id] = now;
    delete store.cards[id];
  };
  for (const key of keys) {
    const [m, r, b] = (["meaning", "reading", "both"] as Face[]).map((f) => cardId("kanji", key, f));
    if (mode === "one") {
      const from = [store.cards[m], store.cards[r]].filter(Boolean).sort((x, y) => x.stability - y.stability)[0];
      if (from && !store.cards[b]) {
        store.cards[b] = { ...from, updated: now };
        delete store.removed[b];
      }
      if (store.cards[b]) [m, r].forEach((id) => store.cards[id] && take(id));
    } else if (store.cards[b]) {
      for (const id of [m, r]) {
        if (!store.cards[id]) {
          store.cards[id] = { ...store.cards[b], updated: now };
          delete store.removed[id];
        }
      }
      take(b);
    }
  }
}

export function grade(store: Store, id: string, rating: Grade, now = Date.now()) {
  const stored = store.cards[id];
  const { card } = scheduler(store.settings).next(toCard(stored), new Date(now), rating);
  store.cards[id] = fromCard(card, stored.added, now);
  store.log.push([id, rating, now]);
  store.undo = [...store.undo, { card: id, before: stored, time: now }].slice(-UNDO_LIMIT);
}

/** Takes back the last answer: the card goes back to how it was and the review is forgotten. */
export function undoLast(store: Store, now = Date.now()): string | undefined {
  const last = store.undo.pop();
  if (!last) return undefined;
  store.cards[last.card] = { ...last.before, updated: now };
  store.log = store.log.filter(([id, , t]) => id !== last.card || t !== last.time);
  return last.card;
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

/** Cards due by `until`, learning cards first, then the most overdue. None while on vacation. */
export function dueCards(store: Store, until = Date.now()): string[] {
  if (store.settings.vacation) return [];
  return Object.entries(store.cards)
    .filter(([id, c]) => c.due <= until && !store.items[id.slice(0, id.lastIndexOf(":"))]?.status && faceOn(store.settings, parseCardId(id).kind, parseCardId(id).face))
    .sort(([, a], [, b]) => {
      const al = a.state === State.Review ? 1 : 0;
      const bl = b.state === State.Review ? 1 : 0;
      return al - bl || a.due - b.due;
    })
    .map(([id]) => id);
}

/**
 * FSRS parameters pasted from Anki (deck options → FSRS), in any of the FSRS 4.5, 5 or 6 lengths.
 * Returns them in the FSRS 6 form Nekko uses, or throws with a message to show.
 */
export function parseFsrsParams(text: string): number[] {
  const nums = text.split(/[\s,]+/).filter(Boolean).map(Number);
  if (!nums.length || nums.some((n) => !isFinite(n))) throw new Error("Paste only the numbers, separated by commas.");
  try {
    checkParameters(nums);
  } catch {
    throw new Error(`That's ${nums.length} numbers; Anki's FSRS parameters are 17, 19 or 21.`);
  }
  return migrateParameters(nums);
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** How many more new items today's limit allows. */
export function newLeftToday(store: Store, now = Date.now()): number {
  if (!store.settings.dailyNew) return Infinity;
  const start = startOfDay(now);
  const today = new Set(
    Object.entries(store.cards)
      .filter(([, c]) => c.added >= start)
      .map(([id]) => id.slice(0, id.lastIndexOf(":"))),
  );
  return Math.max(0, store.settings.dailyNew - today.size);
}

export function relDate(t: number): string {
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function startVacation(store: Store, now = Date.now()) {
  store.settings.vacation = now;
}

/** Ends vacation mode, moving every card's schedule on by the time you were away, as if it had stood still. */
export function endVacation(store: Store, now = Date.now()) {
  const since = store.settings.vacation;
  delete store.settings.vacation;
  if (!since || now <= since) return;
  const shift = now - since;
  for (const c of Object.values(store.cards)) {
    c.due += shift;
    if (c.last_review !== undefined) c.last_review += shift;
    c.updated = now;
  }
}

export type PracticeSet = "mistakes" | "leeches" | "recent";

export const PRACTICE_LABEL: Record<PracticeSet, string> = {
  mistakes: "Today's mistakes",
  leeches: "Leeches",
  recent: "Learned this week",
};

/** Cards for extra practice, which never changes the schedule. */
export function practiceCards(store: Store, set: PracticeSet, now = Date.now()): string[] {
  const ids =
    set === "mistakes"
      ? store.log.filter(([, r, t]) => r === Rating.Again && t >= startOfDay(now)).map(([id]) => id)
      : Object.entries(store.cards)
          .filter(([, c]) => (set === "leeches" ? c.lapses >= LEECH_LAPSES : c.added >= now - 7 * 86_400_000))
          .map(([id]) => id);
  return [...new Set(ids)].filter((id) => store.cards[id]);
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

/** The next items to learn in the order chosen in Settings, skipping what's already added or marked. */
export function nextToLearn(store: Store, data: Data, n: number): { kind: ItemKind; key: string }[] {
  const out: { kind: ItemKind; key: string }[] = [];
  if (n <= 0) return out;
  const seen = new Set<string>();
  /** Adds the item if it's new; true once there are enough. */
  const take = (it: { kind: ItemKind; key: string }) => {
    const id = itemId(it.kind, it.key);
    if (!seen.has(id) && !isAdded(store, it.kind, it.key) && !itemInfo(store, it.kind, it.key)?.status) out.push(it);
    seen.add(id);
    return out.length >= n;
  };
  const order = store.settings.order ?? "lessons";
  if (order === "custom") {
    for (const it of customOrder(data, store.settings.customList ?? [])) if (take(it)) return out;
  } else if (order !== "lessons") {
    const studied = new Set(Object.keys(data.kanji).filter((k) => isAdded(store, "kanji", k) || itemInfo(store, "kanji", k)?.status === "known"));
    for (const it of teachingOrder(data, kanjiOrder(data, order), studied)) if (take(it)) return out;
  }
  // Nekko's lessons, and what comes after your own list.
  for (let i = 0; i < data.lessons.length; i++) {
    for (const it of lessonItems(data, i)) if (take(it)) return out;
  }
  return out;
}

export type Stage = "none" | "learning" | "young" | "mature";

/** An item's stage is its weakest card's: mature once every card holds for 21+ days. Items you marked known count as mature. */
export function stageOf(store: Store, kind: ItemKind, key: string): Stage {
  if (itemInfo(store, kind, key)?.status === "known") return "mature";
  // The optional card types don't count, so switching one on doesn't knock known words back to learning.
  const cards = mainFaces(store.settings, kind).map((f) => store.cards[cardId(kind, key, f)]).filter(Boolean);
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

let store: Store = emptyStore();
let storage: StorageAdapter = localStorageAdapter;
const listeners = new Set<() => void>();
const saveHooks = new Set<(s: Store) => void>();

function parseStore(raw: string | null): Store {
  try {
    if (raw) return migrate(JSON.parse(raw));
  } catch {
    // Corrupt data: start fresh rather than crash.
  }
  return emptyStore();
}

/** Loads saved progress. Call once before showing anything that uses the store. */
export async function initStore(adapter: StorageAdapter = defaultAdapter) {
  storage = adapter;
  store = parseStore(await adapter.load());
  listeners.forEach((l) => l());
}

/** Runs after every saved change (the native app reschedules its reminders here). */
export function onSave(fn: (s: Store) => void) {
  saveHooks.add(fn);
}

export function getStore(): Store {
  return store;
}

/** Applies a change, saves it and re-renders anything using useStore(). */
export function update(fn: (s: Store) => void) {
  const settings = JSON.stringify(store.settings);
  const stamped = store.settingsUpdated;
  fn(store);
  if (JSON.stringify(store.settings) !== settings && store.settingsUpdated === stamped) store.settingsUpdated = Date.now();
  store = { ...store };
  storage.save(JSON.stringify(store)).catch((e) => console.error("Could not save progress", e));
  listeners.forEach((l) => l());
  saveHooks.forEach((h) => h(store));
}

/** Re-renders without saving, e.g. when the app comes back to the foreground and more is due. */
export function refresh() {
  listeners.forEach((l) => l());
}

/** Folds another copy of the progress (a backup, another device's) into this one. */
export function mergeIntoStore(other: Store) {
  update((s) => Object.assign(s, merge(s, other)));
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

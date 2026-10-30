// The progress as it's saved and synced: the same data as the Store, in a shorter form. Card fields become a row of
// numbers, and the review log stores each card id once with the answers as numbers, which is about 2.5x smaller.
// Nothing is rounded or dropped: expandStore(compactStore(s)) gives back s.
//
// Online, the compact progress is cut into pieces (sync.ts): settings, items and cards in buckets by id, and
// reviews by month. Each piece is stored and synced on its own, so a sync moves only the pieces that changed.

import type { ItemInfo, Review, Settings, Store, StoredCard } from "./srs";

/** due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, added, updated */
export type CardRow = [number, number, number, number, number, number, number, number, number, number | null, number, number];

/** Reviews in time order: `ids` lists each card once; `a` is id index * 4 + rating - 1; `t` is ms since the previous. */
export type CompactLog = { ids: string[]; a: number[]; t: number[] };

export type CompactStore = {
  v: 3;
  cards: Record<string, CardRow>;
  removed: Record<string, number>;
  items: Record<string, ItemInfo>;
  log: CompactLog;
  settings: Settings;
  settingsUpdated: number;
  undo: Store["undo"];
};

export function cardRow(c: StoredCard): CardRow {
  return [c.due, c.stability, c.difficulty, c.elapsed_days, c.scheduled_days, c.learning_steps, c.reps, c.lapses, c.state, c.last_review ?? null, c.added, c.updated];
}

export function fromRow(r: CardRow): StoredCard {
  const [due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_review, added, updated] = r;
  const c: StoredCard = { due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, added, updated };
  if (last_review !== null) c.last_review = last_review;
  return c;
}

export function compactLog(log: Review[]): CompactLog {
  const index = new Map<string, number>();
  const out: CompactLog = { ids: [], a: [], t: [] };
  let prev = 0;
  // Same reviews, same order on every device (ties by card, then rating), so the same log always looks the same.
  const sorted = [...log].sort((x, y) => x[2] - y[2] || (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1]));
  for (const [id, rating, time] of sorted) {
    let i = index.get(id);
    if (i === undefined) {
      index.set(id, (i = out.ids.length));
      out.ids.push(id);
    }
    out.a.push(i * 4 + rating - 1);
    out.t.push(time - prev);
    prev = time;
  }
  return out;
}

export function expandLog(c: CompactLog): Review[] {
  const out: Review[] = [];
  let time = 0;
  for (let n = 0; n < c.a.length; n++) {
    time += c.t[n];
    out.push([c.ids[c.a[n] >> 2], ((c.a[n] & 3) + 1) as Review[1], time]);
  }
  return out;
}

const mapValues = <A, B>(o: Record<string, A>, f: (a: A) => B): Record<string, B> => {
  const out: Record<string, B> = {};
  for (const k in o) out[k] = f(o[k]);
  return out;
};

export function compactStore(s: Store): CompactStore {
  return {
    v: 3,
    cards: mapValues(s.cards, cardRow),
    removed: s.removed,
    items: s.items,
    log: compactLog(s.log),
    settings: s.settings,
    settingsUpdated: s.settingsUpdated,
    undo: s.undo,
  };
}

/** Back to the Store shape (version 2, which migrate() in srs.ts finishes). */
export function expandStore(c: CompactStore): Omit<Store, "version"> & { version: 2 } {
  return {
    version: 2,
    cards: mapValues(c.cards ?? {}, fromRow),
    removed: c.removed ?? {},
    items: c.items ?? {},
    log: c.log ? expandLog(c.log) : [],
    settings: c.settings,
    settingsUpdated: c.settingsUpdated ?? 0,
    undo: c.undo ?? [],
  };
}

export function isCompact(raw: unknown): raw is CompactStore {
  return !!raw && typeof raw === "object" && (raw as { v?: unknown }).v === 3;
}

// ---------------------------------------------------------------- pieces

const CARD_BUCKETS = 64;
const ITEM_BUCKETS = 16;

/** JSON with every object's keys in order, so the same data always gives the same text on every device. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v,
  );
}

/** A small, stable number for a string (FNV-1a), for buckets and for telling whether a piece changed. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Cards and their removal markers ("undone:card@time" included) go by card id, so they share a piece. */
const cardKey = (id: string) => (id.startsWith("undone:") ? id.slice(7, id.lastIndexOf("@")) : id);
const month = (t: number) => new Date(t).toISOString().slice(0, 7);

/** One piece's data: any of a store's parts, in compact form. */
export type Piece = Partial<Pick<CompactStore, "cards" | "removed" | "items" | "log" | "settings" | "settingsUpdated">>;

/** The store cut into pieces by id: "settings", "items-3", "cards-41", "log-2026-10". The undo history stays on the device. */
export function piecesOf(s: Store): Map<string, Piece> {
  const out = new Map<string, Piece>([["settings", { settings: s.settings, settingsUpdated: s.settingsUpdated }]]);
  const get = (id: string) => {
    let p = out.get(id);
    if (!p) out.set(id, (p = {}));
    return p;
  };
  for (const id in s.cards) (get(`cards-${hash(id) % CARD_BUCKETS}`).cards ??= {})[id] = cardRow(s.cards[id]);
  for (const id in s.removed) (get(`cards-${hash(cardKey(id)) % CARD_BUCKETS}`).removed ??= {})[id] = s.removed[id];
  for (const id in s.items) (get(`items-${hash(id) % ITEM_BUCKETS}`).items ??= {})[id] = s.items[id];
  const months = new Map<string, Review[]>();
  for (const r of s.log) {
    const m = month(r[2]);
    const list = months.get(m);
    if (list) list.push(r);
    else months.set(m, [r]);
  }
  for (const [m, list] of months) get(`log-${m}`).log = compactLog(list);
  return out;
}

/** Pieces put back together as a store, with nothing in the parts they don't cover (for merge() in srs.ts). */
export function storeOfPieces(pieces: Piece[]): Omit<Store, "version"> & { version: 2 } {
  const s = expandStore({ v: 3, cards: {}, removed: {}, items: {}, log: { ids: [], a: [], t: [] }, settings: {} as Settings, settingsUpdated: 0, undo: [] });
  for (const p of pieces) {
    for (const id in p.cards ?? {}) s.cards[id] = fromRow(p.cards![id]);
    Object.assign(s.removed, p.removed);
    Object.assign(s.items, p.items);
    if (p.log) s.log.push(...expandLog(p.log));
    if (p.settings && (p.settingsUpdated ?? 0) >= s.settingsUpdated) {
      s.settings = p.settings;
      s.settingsUpdated = p.settingsUpdated ?? 0;
    }
  }
  s.log.sort((a, b) => a[2] - b[2]);
  return s;
}

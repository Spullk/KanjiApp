import { describe, expect, it } from "vitest";
import { canonical, compactStore, hash, piecesOf, storeOfPieces, type Piece } from "../src/compact";
import { addItem, emptyStore, grade, merge, migrate, Rating, removeItem, setItemInfo, undoLast, type Store } from "../src/srs";

/** A store with a bit of everything: cards in every state, reviews over two months, notes, removals, an undo. */
function sample(): Store {
  const s = emptyStore();
  const day = 86_400_000;
  const start = Date.UTC(2026, 8, 25);
  ["語", "日", "本", "人"].forEach((k, i) => addItem(s, "kanji", k, start + i));
  addItem(s, "word", "1000220", start);
  for (let d = 0; d < 10; d++) {
    grade(s, "kanji:語:meaning", d % 3 ? Rating.Good : Rating.Again, start + d * day);
    grade(s, "word:1000220:word", Rating.Easy, start + d * day + 1000);
  }
  grade(s, "kanji:日:reading", Rating.Hard, start + 11 * day);
  undoLast(s, start + 11 * day + 5);
  removeItem(s, "kanji", "人", start + 12 * day);
  setItemInfo(s, "kanji", "本", { note: "a tree with its root marked", synonyms: ["origin"] }, start);
  s.settings.batch = 7;
  s.settingsUpdated = start;
  return s;
}

/** A device for the sync tests: its progress, and a hash of each online piece as it last saw it. */
type Device = { store: Store; seen: Record<string, number> };
const pieceHash = (p: Piece) => hash(canonical(p));

/** The same steps as syncNow() in sync.ts, against an online copy held in a Map. Returns how many pieces it wrote. */
function sync(d: Device, online: Map<string, Piece>): number {
  const fresh = [...online].filter(([id, p]) => d.seen[id] !== pieceHash(p));
  for (const [id, p] of fresh) d.seen[id] = pieceHash(p);
  if (fresh.length) d.store = merge(d.store, migrate(storeOfPieces(fresh.map(([, p]) => p))));
  let wrote = 0;
  for (const [id, p] of piecesOf(d.store)) {
    if (d.seen[id] === pieceHash(p)) continue;
    const copy = JSON.parse(canonical(p)) as Piece; // what Firestore would hand back
    online.set(id, copy);
    d.seen[id] = pieceHash(copy);
    wrote++;
  }
  return wrote;
}

describe("compact progress", () => {
  it("gives back exactly the same progress", () => {
    const s = sample();
    const back = migrate(JSON.parse(JSON.stringify(compactStore(s))));
    expect(back).toEqual(s);
    expect(back.log).toEqual(s.log);
  });

  it("is much smaller than the plain JSON", () => {
    const s = emptyStore();
    for (let i = 0; i < 300; i++) addItem(s, "word", String(1_000_000 + i), 1_700_000_000_000);
    for (let r = 0; r < 20; r++) {
      for (let i = 0; i < 300; i++) grade(s, `word:${1_000_000 + i}:word`, Rating.Good, 1_700_000_000_000 + r * 86_400_000 + i * 7000);
    }
    s.undo = [];
    const plain = JSON.stringify(s).length;
    const small = JSON.stringify(compactStore(s)).length;
    expect(small).toBeLessThan(plain / 2);
  });

  it("cuts into pieces and puts them back together", () => {
    const s = sample();
    const pieces = piecesOf(s);
    expect([...pieces.keys()]).toEqual(expect.arrayContaining(["settings", "log-2026-09", "log-2026-10"]));
    expect([...pieces.keys()].some((k) => k.startsWith("cards-"))).toBe(true);
    const back = merge(emptyStore(), migrate(storeOfPieces([...pieces.values()])));
    expect(back.cards).toEqual(s.cards);
    expect(back.removed).toEqual(s.removed);
    expect(back.items).toEqual(s.items);
    expect(back.log).toEqual(s.log);
    expect(back.settings).toEqual(s.settings);
  });
});

describe("piece-by-piece sync", () => {
  it("only sends what changed, and both devices end up the same", () => {
    const online = new Map<string, Piece>();
    const phone: Device = { store: sample(), seen: {} };
    const computer: Device = { store: emptyStore(), seen: {} };
    expect(sync(phone, online)).toBeGreaterThan(3);
    expect(sync(computer, online)).toBe(0); // it only had to download
    expect(computer.store.cards).toEqual(phone.store.cards);

    // A review on the phone touches one card piece and this month's log.
    grade(phone.store, "kanji:語:meaning", Rating.Good, Date.UTC(2026, 9, 20));
    expect(sync(phone, online)).toBe(2);
    expect(sync(computer, online)).toBe(0);
    expect(computer.store.log).toEqual(phone.store.log);
    expect(sync(phone, online)).toBe(0); // nothing left to send
  });

  it("merges changes made on both devices at once", () => {
    const online = new Map<string, Piece>();
    const phone: Device = { store: sample(), seen: {} };
    sync(phone, online);
    const computer: Device = { store: emptyStore(), seen: {} };
    sync(computer, online);
    grade(phone.store, "kanji:語:meaning", Rating.Good, Date.UTC(2026, 9, 21));
    grade(computer.store, "word:1000220:word", Rating.Hard, Date.UTC(2026, 9, 21, 1));
    sync(phone, online);
    sync(computer, online);
    sync(phone, online);
    expect(phone.store.log).toEqual(computer.store.log);
    expect(phone.store.cards).toEqual(computer.store.cards);
    expect(phone.store.log.filter(([, , t]) => t >= Date.UTC(2026, 9, 21))).toHaveLength(2);
  });

  it("settles when both devices changed the same card at the same moment", () => {
    const online = new Map<string, Piece>();
    const a: Device = { store: sample(), seen: {} };
    sync(a, online);
    const b: Device = { store: emptyStore(), seen: {} };
    sync(b, online);
    const t = Date.UTC(2026, 9, 22);
    a.store.cards["kanji:語:meaning"] = { ...a.store.cards["kanji:語:meaning"], reps: 99, updated: t };
    b.store.cards["kanji:語:meaning"] = { ...b.store.cards["kanji:語:meaning"], reps: 42, updated: t };
    let writes = 0;
    for (let round = 0; round < 4; round++) writes += sync(a, online) + sync(b, online);
    expect(a.store.cards["kanji:語:meaning"]).toEqual(b.store.cards["kanji:語:meaning"]);
    expect(writes).toBeLessThanOrEqual(2);
    expect(sync(a, online) + sync(b, online)).toBe(0);
  });
});

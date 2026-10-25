// Reading an Anki deck export (.apkg or .colpkg) and matching its notes to Nekko kanji and words.
// The heavy parts (unzip, zstd, SQLite) are loaded only when you import.

import type { SqlJsStatic } from "sql.js";
import type { Data } from "./data";
import { wordsBySpelling, type ItemRef } from "./known";


export type AnkiCard = {
  nid: number;
  /** 0 new, 1 learning, 2 review, 3 relearning */
  type: number;
  /** -1 suspended, -2/-3 buried, 0 new, 1/3 learning, 2 review */
  queue: number;
  /** days; negative is seconds while learning */
  ivl: number;
  /** review: days since the collection was created; learning: a Unix time */
  due: number;
  /** JSON; FSRS decks keep the memory state here as {"s": stability, "d": difficulty} */
  data: string;
};

export type AnkiCollection = { crt: number; notes: { id: number; fields: string[] }[]; cards: AnkiCard[] };

export async function readAnkiFile(bytes: Uint8Array, initSql?: () => Promise<SqlJsStatic>): Promise<AnkiCollection> {
  const { unzipSync } = await import("fflate");
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error("That isn't an Anki export. In Anki, use File → Export… and pick “Anki Deck Package (.apkg)”.");
  }
  let db = files["collection.anki21b"];
  if (db) db = (await import("fzstd")).decompress(db);
  db ??= files["collection.anki21"] ?? files["collection.anki2"];
  if (!db) throw new Error("Couldn't find the cards in that file. Export it from Anki as an .apkg.");

  const SQL = await (initSql ?? defaultSql)();
  const sql = new SQL.Database(db);
  try {
    const rows = (q: string) => sql.exec(q)[0]?.values ?? [];
    return {
      crt: Number(rows("SELECT crt FROM col")[0]?.[0] ?? 0),
      notes: rows("SELECT id, flds FROM notes").map(([id, flds]) => ({ id: Number(id), fields: String(flds).split("\x1f") })),
      cards: rows("SELECT nid, type, queue, ivl, due, data FROM cards").map(([nid, type, queue, ivl, due, data]) => ({
        nid: Number(nid),
        type: Number(type),
        queue: Number(queue),
        ivl: Number(ivl),
        due: Number(due),
        data: String(data ?? ""),
      })),
    };
  } finally {
    sql.close();
  }
}

async function defaultSql(): Promise<SqlJsStatic> {
  const [{ default: initSqlJs }, { default: wasm }] = await Promise.all([
    import("sql.js"),
    import("sql.js/dist/sql-wasm-browser.wasm?url"),
  ]);
  return initSqlJs({ locateFile: () => wasm });
}

/** Field text without HTML, sounds and furigana: "<b>漢字[かんじ]</b>" → "漢字". */
export function plainField(f: string): string {
  return f
    .replace(/\[sound:[^\]]*\]/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

export type AnkiItem = ItemRef & ({ learning: true } | { stability: number; due: number });

export type AnkiMatch = { items: AnkiItem[]; notes: number; unmatched: number; unstudied: number };

/** Each studied note that's a Nekko kanji or word, with how its best card is scheduled. */
export function matchAnki(data: Data, col: AnkiCollection, now = Date.now()): AnkiMatch {
  const spelling = wordsBySpelling(data);
  const cardsByNote = new Map<number, AnkiCard[]>();
  for (const c of col.cards) cardsByNote.set(c.nid, [...(cardsByNote.get(c.nid) ?? []), c]);

  const items = new Map<string, AnkiItem>();
  let unmatched = 0;
  let unstudied = 0;
  for (const note of col.notes) {
    const ref = note.fields
      .map(plainField)
      .map((f): ItemRef | null => (f.length === 1 && data.kanji[f] ? { kind: "kanji", key: f } : spelling.has(f) ? { kind: "word", key: spelling.get(f)! } : null))
      .find(Boolean);
    if (!ref) {
      unmatched++;
      continue;
    }
    const studied = (cardsByNote.get(note.id) ?? []).filter((c) => c.type !== 0);
    if (!studied.length) {
      unstudied++;
      continue;
    }
    const best = studied.reduce((a, b) => (b.ivl > a.ivl ? b : a));
    let item: AnkiItem;
    if (best.type === 2 || (best.type === 3 && best.ivl > 0)) {
      let stability = best.ivl;
      try {
        stability = JSON.parse(best.data || "{}").s ?? stability;
      } catch {
        // not JSON: an older deck
      }
      const due = best.queue === 2 || best.queue < 0 ? (col.crt + best.due * 86_400) * 1000 : now;
      item = { ...ref, stability: Math.max(0.1, stability), due };
    } else {
      item = { ...ref, learning: true };
    }
    const id = `${ref.kind}:${ref.key}`;
    const have = items.get(id);
    if (!have || ("stability" in item && (!("stability" in have) || item.stability > have.stability))) items.set(id, item);
  }
  return { items: [...items.values()], notes: col.notes.length, unmatched, unstudied };
}


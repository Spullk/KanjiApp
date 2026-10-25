import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { zipSync } from "fflate";
import { zstdCompressSync } from "node:zlib";
import kanji from "../data/kanji.json";
import radicals from "../data/radicals.json";
import words from "../data/words.json";
import lessons from "../data/lessons.json";
import type { Data } from "../src/data";
import { matchAnki, plainField, readAnkiFile } from "../src/anki";
import { wordsBySpelling } from "../src/known";

const data = { kanji, radicals, words, sentences: {}, lessons } as unknown as Data;
const CRT = 1_700_000_000; // collection created, seconds

async function collection(): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`CREATE TABLE col (crt INTEGER); INSERT INTO col VALUES (${CRT});
    CREATE TABLE notes (id INTEGER, flds TEXT);
    CREATE TABLE cards (nid INTEGER, type INTEGER, queue INTEGER, ivl INTEGER, due INTEGER, data TEXT);`);
  const notes: [number, string][] = [
    [1, "<b>日</b>\x1fday, sun"], // FSRS review card
    [2, "学生[がくせい]\x1fstudent"], // old-style review card
    [3, "水\x1fwater"], // still learning
    [4, "火\x1ffire"], // new, never studied
    [5, "Hello there\x1fこんにちは, not a Nekko item"],
  ];
  for (const [id, f] of notes) db.run("INSERT INTO notes VALUES (?, ?)", [id, f]);
  const cards: [number, number, number, number, number, string][] = [
    [1, 2, 2, 30, 400, '{"s":42.5,"d":5.1}'],
    [1, 2, 2, 10, 380, '{"s":12,"d":6}'], // reverse card, weaker
    [2, 2, -1, 15, 390, ""], // suspended, still has a schedule
    [3, 1, 1, -600, CRT + 10, ""],
    [4, 0, 0, 0, 7, ""],
  ];
  for (const c of cards) db.run("INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?)", c);
  const bytes = db.export();
  db.close();
  return bytes;
}

describe("Anki import", () => {
  it("cleans fields", () => {
    expect(plainField("<div>漢字[かんじ]&nbsp;</div>[sound:a.mp3]")).toBe("漢字");
  });

  it("reads old and new (zstd) packages and matches studied notes", async () => {
    const db = await collection();
    const sql = () => initSqlJs();
    for (const zip of [zipSync({ "collection.anki21": db }), zipSync({ "collection.anki2": new Uint8Array([1]), "collection.anki21b": zstdCompressSync(db) })]) {
      const col = await readAnkiFile(zip, sql);
      expect(col.crt).toBe(CRT);
      const m = matchAnki(data, col, 0);
      expect(m).toMatchObject({ notes: 5, unmatched: 1, unstudied: 1 });
      expect(m.items).toEqual([
        { kind: "kanji", key: "日", stability: 42.5, due: (CRT + 400 * 86_400) * 1000 },
        { kind: "word", key: wordsBySpelling(data).get("学生"), stability: 15, due: (CRT + 390 * 86_400) * 1000 },
        { kind: "kanji", key: "水", learning: true },
      ]);
    }
  });

  it("says when the file isn't an Anki export", async () => {
    await expect(readAnkiFile(new Uint8Array([1, 2, 3]), () => initSqlJs())).rejects.toThrow(/Anki/);
  });
});

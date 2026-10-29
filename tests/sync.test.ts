import { describe, expect, it } from "vitest";
import { addItem, emptyStore, grade, Rating } from "../src/srs";
import { pack, PART_BYTES, unpack } from "../src/sync";

describe("sync packing", () => {
  it("round-trips the store without the undo history", () => {
    const s = emptyStore();
    addItem(s, "kanji", "語", 0);
    grade(s, "kanji:語:meaning", Rating.Good, 10);
    expect(s.undo).toHaveLength(1);
    const back = unpack(pack(s));
    expect(back).toEqual({ ...s, undo: [] });
  });

  it("splits a big store into parts under Firestore's limit", () => {
    const s = emptyStore();
    for (let i = 0; i < 60_000; i++) s.log.push([`word:${(i * 2654435761) % 1e9}:word`, Rating.Good, i * 7919]);
    expect(pack(s).every((p) => p.length <= PART_BYTES)).toBe(true);
    const parts = pack(s, 10_000);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 10_000)).toBe(true);
    expect(unpack(parts).log).toHaveLength(60_000);
  });
});

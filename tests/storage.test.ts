import { describe, expect, it } from "vitest";
import { addItem, emptyStore, flushSave, getStore, initStore, update } from "../src/srs";
import type { StorageAdapter } from "../src/storage";

function memory(initial: string | null) {
  const saved: string[] = [];
  const adapter: StorageAdapter = {
    load: async () => initial,
    save: async (json) => void saved.push(json),
  };
  return { adapter, saved };
}

describe("store persistence", () => {
  it("loads what the adapter has and saves every change to it", async () => {
    const before = emptyStore();
    addItem(before, "kanji", "語", 1000);
    const { adapter, saved } = memory(JSON.stringify(before));
    await initStore(adapter);
    expect(Object.keys(getStore().cards)).toHaveLength(2);

    update((s) => addItem(s, "radical", "口", 2000));
    update((s) => addItem(s, "radical", "木", 3000));
    expect(saved).toHaveLength(0); // saved just after, once for both changes
    flushSave();
    expect(saved).toHaveLength(1);
    expect(Object.keys(JSON.parse(saved[0]).cards)).toHaveLength(4);
    flushSave();
    expect(saved).toHaveLength(1);
  });

  it("starts fresh when nothing is saved or the data is corrupt", async () => {
    await initStore(memory(null).adapter);
    expect(getStore()).toEqual(emptyStore());
    await initStore(memory("{not json").adapter);
    expect(getStore()).toEqual(emptyStore());
  });
});

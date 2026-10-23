// Where the progress JSON is kept. srs.ts only sees load/save of one string, so the data shape
// can change without caring which backend holds it.
//
// Web: localStorage. Native app: a file in the app's private data folder, because iOS may clear
// a web view's localStorage when the phone is low on space. The first native launch moves any
// progress already in localStorage into the file.

import { Capacitor } from "@capacitor/core";

export type StorageAdapter = {
  load(): Promise<string | null>;
  save(json: string): Promise<void>;
};

export const LEGACY_KEY = "nekko.srs.v1";

export const localStorageAdapter: StorageAdapter = {
  async load() {
    try {
      return localStorage.getItem(LEGACY_KEY);
    } catch {
      return null; // private mode
    }
  },
  async save(json) {
    localStorage.setItem(LEGACY_KEY, json);
  },
};

const FILE = "progress.json";

function fileAdapter(): StorageAdapter {
  const fs = import("@capacitor/filesystem");
  // Saves run one at a time, and a save that's still waiting is replaced by a newer one.
  let writing: Promise<void> = Promise.resolve();
  let pending: string | null = null;
  return {
    async load() {
      const { Filesystem, Directory, Encoding } = await fs;
      try {
        const { data } = await Filesystem.readFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8 });
        return data as string;
      } catch {
        const legacy = await localStorageAdapter.load();
        if (legacy) await this.save(legacy);
        return legacy;
      }
    },
    save(json) {
      const queued = pending !== null;
      pending = json;
      if (!queued) {
        writing = writing.then(async () => {
          const { Filesystem, Directory, Encoding } = await fs;
          const data = pending!;
          pending = null;
          await Filesystem.writeFile({ path: FILE, directory: Directory.Data, encoding: Encoding.UTF8, data });
        }).catch((e) => console.error("Could not save progress", e));
      }
      return writing;
    },
  };
}

export const defaultAdapter: StorageAdapter = Capacitor.isNativePlatform() ? fileAdapter() : localStorageAdapter;

// Where the progress JSON is kept. srs.ts only sees load/save of one string, so the data shape
// can change without caring which backend holds it.
//
// Web: IndexedDB, which has room for years of reviews (localStorage stops at about 5 MB) and doesn't hold up the
// page while it writes. Native app: a file in the app's private data folder, because iOS may clear a web view's
// storage when the phone is low on space. Either way, progress already in localStorage moves over on first start.

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

const DB = "nekko";
const STORE = "progress";
const KEY = "store";

/** IndexedDB, opened afresh for each read or write: iOS can drop a connection that sat open in the background. */
function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => {
        db.close();
        resolve(req.result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? req.error);
      };
    };
  });
}

/** Tries twice: a first failure is often a connection iOS closed. */
const retry = <T>(f: () => Promise<T>) => f().catch(() => f());

export const indexedDbAdapter: StorageAdapter = {
  async load() {
    let saved: string | undefined;
    try {
      saved = await retry(() => idb<string | undefined>("readonly", (s) => s.get(KEY)));
    } catch {
      return localStorageAdapter.load(); // no IndexedDB here (some private modes)
    }
    return saved ?? localStorageAdapter.load();
  },
  async save(json) {
    try {
      await retry(() => idb("readwrite", (s) => s.put(json, KEY)));
    } catch {
      await localStorageAdapter.save(json);
      return;
    }
    // Moved: free localStorage's space for the small settings kept there.
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      // private mode
    }
  },
};

export const defaultAdapter: StorageAdapter = Capacitor.isNativePlatform()
  ? fileAdapter()
  : typeof indexedDB !== "undefined"
    ? indexedDbAdapter
    : localStorageAdapter;

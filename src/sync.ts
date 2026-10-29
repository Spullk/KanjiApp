// Sign-in and sync. Each person's progress is one compressed copy of the store in Firestore
// (users/{uid}, split into parts under 1 MB). Syncing is always pull → merge → push, so changes made on
// any device survive (see merge() in srs.ts). Firebase loads only once someone has signed in on this device.

import { useEffect, useState } from "preact/hooks";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Bytes } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config";
import { getStore, merge, migrate, onSave, update, type Store } from "./srs";
import { isNative } from "./native";

export const syncAvailable = !!firebaseConfig && !isNative;

export type SyncState = {
  user: { name: string; email: string } | null;
  status: "idle" | "syncing" | "synced" | "error";
  last?: number;
  error?: string;
};

let state: SyncState = { user: null, status: "idle" };
const listeners = new Set<() => void>();
function set(change: Partial<SyncState>) {
  state = { ...state, ...change };
  listeners.forEach((l) => l());
}

export function useSync(): SyncState {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick((t) => t + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

// ---------------------------------------------------------------- packing

/** Firestore documents max out at 1 MiB; stay well under. */
export const PART_BYTES = 900_000;

/** The store as it's kept online: gzipped JSON, without this device's undo history, in parts. */
export function pack(s: Store, size = PART_BYTES): Uint8Array[] {
  const zipped = gzipSync(strToU8(JSON.stringify({ ...s, undo: [] })));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < zipped.length; i += size) parts.push(zipped.subarray(i, i + size));
  return parts.length ? parts : [zipped];
}

export function unpack(parts: Uint8Array[]): Store {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return migrate(JSON.parse(strFromU8(gunzipSync(all))));
}

// ---------------------------------------------------------------- Firebase

const FLAG = "nekko.sync"; // set while someone is signed in here, so Firebase is loaded on start

type Fb = Awaited<ReturnType<typeof loadFirebase>>;
let fb: Promise<Fb> | null = null;

async function loadFirebase() {
  const [{ initializeApp }, auth, fs] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
  const app = initializeApp(firebaseConfig!);
  return { auth: auth.getAuth(app), db: fs.getFirestore(app), authMod: auth, fs };
}

function firebase(): Promise<Fb> {
  if (!fb) {
    fb = loadFirebase();
    fb.then(({ auth, authMod }) =>
      authMod.onAuthStateChanged(auth, (u) => {
        if (u) {
          localStorage.setItem(FLAG, "1");
          set({ user: { name: u.displayName ?? "", email: u.email ?? "" } });
          syncNow();
        } else {
          localStorage.removeItem(FLAG);
          set({ user: null, status: "idle", last: undefined });
        }
      }),
    );
  }
  return fb;
}

/** Call once at start-up: picks up a sign-in from an earlier visit and syncs after every change. */
export function initSync() {
  if (!syncAvailable) return;
  let flag: string | null = null;
  try {
    flag = localStorage.getItem(FLAG);
  } catch {
    // private mode
  }
  if (flag) firebase();
  let timer: ReturnType<typeof setTimeout> | undefined;
  onSave(() => {
    if (!state.user || busy) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 10_000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.user && Date.now() - (state.last ?? 0) > 60_000) syncNow();
  });
}

export async function signIn() {
  const { auth, authMod } = await firebase();
  try {
    await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return;
    set({ status: "error", error: code === "auth/popup-blocked" ? "Your browser blocked the sign-in window. Allow pop-ups for this site and try again." : String((e as Error).message ?? e) });
  }
}

export async function signOut() {
  const { auth, authMod } = await firebase();
  await authMod.signOut(auth);
}

let busy = false;

/** Pulls this account's progress, merges it with this device's, and pushes the result back. */
export async function syncNow() {
  if (busy) return;
  const { auth, db, fs } = await firebase();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  busy = true;
  set({ status: "syncing", error: undefined });
  try {
    const main = fs.doc(db, "users", uid);
    const head = await fs.getDoc(main);
    const count: number = head.exists() ? head.data().parts ?? 0 : 0;
    let remote: Store | null = null;
    if (count) {
      const docs = await Promise.all(Array.from({ length: count }, (_, i) => fs.getDoc(fs.doc(db, "users", uid, "parts", String(i)))));
      remote = unpack(docs.map((d) => (d.data()!.data as Bytes).toUint8Array()));
    }
    if (remote) update((s) => Object.assign(s, merge(s, remote!)));

    const before = remote && JSON.stringify({ ...remote, undo: [] });
    if (before !== JSON.stringify({ ...getStore(), undo: [] })) {
      const parts = pack(getStore());
      const batch = fs.writeBatch(db);
      parts.forEach((p, i) => batch.set(fs.doc(db, "users", uid, "parts", String(i)), { data: fs.Bytes.fromUint8Array(p) }));
      for (let i = parts.length; i < count; i++) batch.delete(fs.doc(db, "users", uid, "parts", String(i)));
      batch.set(main, { parts: parts.length, updated: fs.serverTimestamp() });
      await batch.commit();
    }
    set({ status: "synced", last: Date.now() });
  } catch (e) {
    console.error("Sync failed", e);
    set({ status: "error", error: "Couldn't sync just now. Your progress is safe on this device and will sync next time." });
  } finally {
    busy = false;
  }
}

// Sign-in and sync. Each person's progress is one compressed copy of the store in Firestore
// (users/{uid}, split into parts under 1 MB). Syncing is always pull → merge → push, so changes made on
// any device survive (see merge() in srs.ts). Firebase loads only once someone has signed in on this device.
// In the iPhone/Android app, Google sign-in runs natively (@capacitor-firebase/authentication) and hands its
// token to the same Firebase JS SDK, so syncing works the same everywhere.

import { useEffect, useState } from "preact/hooks";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Bytes } from "firebase/firestore";
import { firebaseConfig, googleWebClientId } from "./firebase-config";
import { getStore, merge, migrate, onSave, update, type Store } from "./srs";
import { isNative } from "./native";
import { savePushState } from "./push";

export const syncAvailable = !!firebaseConfig;

export type SyncState = {
  user: { name: string; email: string } | null;
  status: "idle" | "signing-in" | "syncing" | "synced" | "error";
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

// ---------------------------------------------------------------- full-page sign-in

// A home-screen app on iPhone can open Google's sign-in window but never hears back from it, and Firebase's own
// full-page sign-in needs storage Safari keeps from other sites. So installed apps go to Google directly and come
// back to this page with a token in the address, which Firebase then signs in with.

const RETURN = "nekko.signin"; // the random state we sent to Google, to check the answer is ours

export const installed = typeof window !== "undefined" && (matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true);

function signInFullPage() {
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  localStorage.setItem(RETURN, state);
  const params = new URLSearchParams({
    client_id: googleWebClientId,
    redirect_uri: location.origin + location.pathname,
    response_type: "token",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  location.assign("https://accounts.google.com/o/oauth2/v2/auth?" + params);
}

/** Google's answer when we've just come back from signing in, taken out of the address before the app reads it. */
function takeReturn(): { token?: string; error?: string } | null {
  if (typeof location === "undefined" || !/[#&](access_token|error)=/.test(location.hash)) return null;
  const p = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search + "#/settings");
  let expected: string | null = null;
  try {
    expected = localStorage.getItem(RETURN);
    localStorage.removeItem(RETURN);
  } catch {
    // private mode
  }
  if (!expected || p.get("state") !== expected) return null;
  if (p.get("error")) return { error: p.get("error") === "access_denied" ? undefined : `Google said: ${p.get("error")}` };
  return { token: p.get("access_token") ?? undefined };
}

// Runs on import, before the router looks at the address.
const returned = takeReturn();

type Fb = Awaited<ReturnType<typeof loadFirebase>>;
let fb: Promise<Fb> | null = null;
/** Firebase once it has loaded, so a tap can open the sign-in window straight away. */
let ready: Fb | null = null;

async function loadFirebase() {
  const [{ initializeApp }, auth, fs] = await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
  const app = initializeApp(firebaseConfig!);
  // The app's web view can't use the website's sign-in pop-up, and keeps the session in IndexedDB.
  const a = isNative ? auth.initializeAuth(app, { persistence: auth.indexedDBLocalPersistence }) : auth.getAuth(app);
  return { app, auth: a, db: fs.getFirestore(app), authMod: auth, fs };
}

function firebase(): Promise<Fb> {
  if (!fb) {
    fb = loadFirebase();
    fb.then((f) => (ready = f));
    fb.then(({ auth, authMod }) =>
      authMod.onAuthStateChanged(auth, (u) => {
        if (u) {
          localStorage.setItem(FLAG, "1");
          set({ user: { name: u.displayName ?? "", email: u.email ?? "" } });
          syncNow();
        } else {
          localStorage.removeItem(FLAG);
          lastRev = undefined;
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
  if (returned?.error) set({ status: "error", error: returned.error });
  if (returned?.token) {
    set({ status: "signing-in" });
    firebase()
      .then(({ auth, authMod }) => authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(null, returned.token)))
      .catch((e) => set({ status: "error", error: signInError(e) }));
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  onSave(() => {
    saves++;
    if (!state.user || busy) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 10_000);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.user && Date.now() - (state.last ?? 0) > 60_000) syncNow();
  });
}

/**
 * Starts loading Firebase before the sign-in button is tapped. Browsers, Safari above all, only allow a sign-in
 * window that opens right away from the tap; one opened after waiting for a download is silently blocked.
 */
export function prepareSignIn() {
  if (syncAvailable) firebase().catch(() => {});
}

function signInError(e: unknown): string {
  const code = (e as { code?: string }).code;
  return `Sign-in didn't work (${code ?? String((e as Error).message ?? e)}). Try again in a moment.`;
}

export async function signIn() {
  set({ status: "signing-in", error: undefined });
  const { auth, authMod } = ready ?? (await firebase());
  try {
    if (isNative) {
      // The phone's own Google sign-in sheet, then the same Firebase account as on the website.
      const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
      const result = await FirebaseAuthentication.signInWithGoogle();
      await authMod.signInWithCredential(auth, authMod.GoogleAuthProvider.credential(result.credential?.idToken));
    } else if (installed) {
      signInFullPage();
    } else {
      await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
    }
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request" || (isNative && /cancel/i.test(String((e as Error).message ?? e)))) {
      set({ status: "idle" });
      return;
    }
    set({ status: "error", error: code === "auth/popup-blocked" ? "Your browser blocked the sign-in window. Tap the button again, or allow pop-ups for this site." : signInError(e) });
  }
}

export async function signOut() {
  const { auth, authMod } = await firebase();
  await authMod.signOut(auth);
  if (isNative) {
    // Also forget the Google account on the phone, so the next sign-in can pick another one.
    const { FirebaseAuthentication } = await import("@capacitor-firebase/authentication");
    await FirebaseAuthentication.signOut().catch(() => {});
  }
}

let busy = false;

// Most syncs (coming back to the app, a pause in reviews) find that no other device has written since this one
// last synced. Each write tags the online copy with a random rev; while it's still the one this device wrote or
// read, the parts aren't downloaded again, and nothing is uploaded unless something changed here.
let lastRev: string | undefined;
/** Changes saved on this device, and how many of them the online copy has. */
let saves = 0;
let synced = -1;

const newRev = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");

/** What reminders need to reach your account, once you're signed in. */
export async function account() {
  const f = await firebase();
  const uid = f.auth.currentUser?.uid;
  return uid ? { app: f.app, db: f.db, fs: f.fs, uid } : undefined;
}

/** Pulls this account's progress, merges it with this device's, and pushes the result back. */
export async function syncNow() {
  if (busy) return;
  const { app, auth, db, fs } = await firebase();
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  busy = true;
  set({ status: "syncing", error: undefined });
  try {
    const main = fs.doc(db, "users", uid);
    const head = await fs.getDoc(main);
    const count: number = head.exists() ? head.data().parts ?? 0 : 0;
    const rev: string | undefined = head.exists() ? head.data().rev : undefined;
    const unchanged = !!rev && rev === lastRev;
    let remote: Store | null = null;
    if (count && !unchanged) {
      const docs = await Promise.all(Array.from({ length: count }, (_, i) => fs.getDoc(fs.doc(db, "users", uid, "parts", String(i)))));
      remote = unpack(docs.map((d) => (d.data()!.data as Bytes).toUint8Array()));
    }
    if (remote) update((s) => Object.assign(s, merge(s, remote!)));
    const mark = saves;

    // Unchanged online: this device already has all of it, so only upload if something changed here.
    const push = unchanged ? synced !== mark : (remote && JSON.stringify({ ...remote, undo: [] })) !== JSON.stringify({ ...getStore(), undo: [] });
    if (push) {
      const parts = pack(getStore());
      const next = newRev();
      const batch = fs.writeBatch(db);
      parts.forEach((p, i) => batch.set(fs.doc(db, "users", uid, "parts", String(i)), { data: fs.Bytes.fromUint8Array(p) }));
      for (let i = parts.length; i < count; i++) batch.delete(fs.doc(db, "users", uid, "parts", String(i)));
      batch.set(main, { parts: parts.length, updated: fs.serverTimestamp(), rev: next });
      await batch.commit();
      lastRev = next;
    } else {
      lastRev = rev;
    }
    synced = mark;
    if (!isNative) savePushState({ app, db, fs, uid }, getStore()).catch((e) => console.error("Could not save reminder times", e));
    set({ status: "synced", last: Date.now() });
  } catch (e) {
    console.error("Sync failed", e);
    set({ status: "error", error: "Couldn't sync just now. Your progress is safe on this device and will sync next time." });
  } finally {
    busy = false;
  }
}

// Sign-in and sync. Each person's progress lives in Firestore as small compressed pieces (users/{uid}/pieces/{id}:
// settings, items and cards in buckets, reviews by month; see compact.ts), each stamped with when it last changed.
// A sync downloads only the pieces changed since this device last looked and uploads only the ones it changed. It
// runs on what you do, never on a timer: opening the app, leaving it, finishing reviews, or a change outside reviews
// (a setting, a note). Nothing stays connected in the background. Every merge goes through
// merge() in srs.ts, so changes made on any device survive. Firebase loads only once someone has signed in here.
// In the iPhone/Android app, Google sign-in runs natively (@capacitor-firebase/authentication) and hands its
// token to the same Firebase JS SDK, so syncing works the same everywhere.

import { useEffect, useState } from "preact/hooks";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import type { Bytes } from "firebase/firestore";
import { firebaseConfig, googleWebClientId } from "./firebase-config";
import { getStore, merge, migrate, onSave, update, type Store } from "./srs";
import { canonical, hash, piecesOf, storeOfPieces, type Piece } from "./compact";
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
  // A change outside reviews goes up a few seconds after it's made (so a burst of changes goes up once). Answers
  // wait until the reviews are done (useSyncHold). Opening the app brings in other devices' changes, and leaving
  // it sends anything still waiting, so the next device you open is up to date.
  onSave(() => {
    dirty = true;
    if (state.user && !holds) timer ??= setTimeout(syncNow, PUSH_DELAY);
  });
  document.addEventListener("visibilitychange", () => {
    if (!state.user) return;
    if (document.visibilityState === "visible" || dirty) syncNow();
  });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let holds = 0;

/** While `active` (reviews under way), answers aren't uploaded one by one; they go up together when it ends. */
export function useSyncHold(active: boolean) {
  useEffect(() => {
    if (!active) return;
    holds++;
    return () => {
      holds--;
      if (!holds && dirty && state.user) syncNow();
    };
  }, [active]);
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

/** How long after a change it's uploaded. */
const PUSH_DELAY = 4000;

/** What this device knows about the online copy of one account: when it last looked, and a hash of each piece. */
type Meta = { uid: string; pulled: number; legacy: number; hashes: Record<string, number> };
const META = "nekko.sync.v3";
let meta: Meta | null = null;

function metaFor(uid: string): Meta {
  if (meta?.uid === uid) return meta;
  try {
    const saved = JSON.parse(localStorage.getItem(META) ?? "null") as Meta | null;
    if (saved?.uid === uid) return (meta = saved);
  } catch {
    // private mode, or unreadable: start over, which only means downloading every piece once
  }
  return (meta = { uid, pulled: 0, legacy: 0, hashes: {} });
}

function saveMeta() {
  try {
    localStorage.setItem(META, JSON.stringify(meta));
  } catch {
    // private mode
  }
}

const pieceHash = (p: Piece) => hash(canonical(p));
const encode = (fs: Fb["fs"], p: Piece) => fs.Bytes.fromUint8Array(gzipSync(strToU8(canonical(p))));
const decode = (b: Bytes): Piece => JSON.parse(strFromU8(gunzipSync(b.toUint8Array())));

type PieceDoc = { id: string; data(): { data?: Bytes; updated?: { toMillis(): number } } | undefined };

/** Folds downloaded pieces into this device's progress, skipping ones it already has (such as its own uploads). */
function bringIn(docs: PieceDoc[], m: Meta) {
  const fresh: Piece[] = [];
  for (const d of docs) {
    const doc = d.data();
    if (!doc?.data) continue;
    m.pulled = Math.max(m.pulled, doc.updated?.toMillis() ?? 0);
    const p = decode(doc.data);
    const h = pieceHash(p);
    if (m.hashes[d.id] === h) continue;
    m.hashes[d.id] = h;
    fresh.push(p);
  }
  if (fresh.length) {
    const remote = migrate(storeOfPieces(fresh));
    update((s) => Object.assign(s, merge(s, remote)));
  }
  return fresh.length;
}

let busy = false;
let again = false;

/** What reminders need to reach your account, once you're signed in. */
export async function account() {
  const f = await firebase();
  const uid = f.auth.currentUser?.uid;
  return uid ? { app: f.app, db: f.db, fs: f.fs, uid } : undefined;
}

/** Downloads what other devices changed and uploads what this one changed. */
export async function syncNow() {
  clearTimeout(timer);
  timer = undefined;
  if (busy) {
    again = true;
    return;
  }
  const f = await firebase();
  const uid = f.auth.currentUser?.uid;
  if (!uid) return;
  busy = true;
  set({ status: "syncing", error: undefined });
  try {
    const m = metaFor(uid);
    dirty = false; // a change made while this runs marks it again
    await pull(f, uid, m);
    await push(f, uid, m);
    saveMeta();
    if (!isNative) savePushState({ app: f.app, db: f.db, fs: f.fs, uid }, getStore()).catch((e) => console.error("Could not save reminder times", e));
    set({ status: "synced", last: Date.now() });
  } catch (e) {
    console.error("Sync failed", e);
    dirty = true;
    set({ status: "error", error: "Couldn't sync just now. Your progress is safe on this device and will sync next time." });
  } finally {
    busy = false;
    if (again) {
      again = false;
      syncNow();
    }
  }
}

const pieces = (f: Fb, uid: string) => f.fs.collection(f.db, "users", uid, "pieces");

async function pull(f: Fb, uid: string, m: Meta) {
  const { fs, db } = f;
  const col = pieces(f, uid);
  const changed = await fs.getDocs(m.pulled ? fs.query(col, fs.where("updated", ">=", fs.Timestamp.fromMillis(m.pulled))) : col);
  bringIn(changed.docs, m);

  // Nekko before pieces kept the whole progress in one copy (users/{uid} with parts). Bring it in once, and again
  // whenever a device still on an old version writes to it.
  const head = await fs.getDoc(fs.doc(db, "users", uid));
  const old = head.data();
  const written = old?.updated?.toMillis?.() ?? 0;
  if (old?.parts && written > m.legacy) {
    const docs = await Promise.all(Array.from({ length: old.parts }, (_, i) => fs.getDoc(fs.doc(db, "users", uid, "parts", String(i)))));
    const legacy = unpack(docs.map((d) => (d.data()!.data as Bytes).toUint8Array()));
    update((s) => Object.assign(s, merge(s, legacy)));
    m.legacy = written;
  }
}

async function push(f: Fb, uid: string, m: Meta) {
  const { fs, db } = f;
  const changed = [...piecesOf(getStore())].filter(([id, p]) => m.hashes[id] !== pieceHash(p)).map(([id]) => id);
  if (!changed.length) return;
  const refs = changed.map((id) => fs.doc(pieces(f, uid), id));
  let written: Record<string, number> = {};
  let merged: Store | null = null;
  // Each piece is read again inside the transaction, so one another device wrote a moment ago is merged, not lost.
  await fs.runTransaction(db, async (tx) => {
    const remote = await Promise.all(refs.map((r) => tx.get(r)));
    const newer = remote
      .map((d) => d.data() as { data?: Bytes } | undefined)
      .map((d) => (d?.data ? decode(d.data) : null))
      .filter((p, i): p is Piece => !!p && pieceHash(p) !== m.hashes[changed[i]]);
    merged = newer.length ? merge(getStore(), migrate(storeOfPieces(newer))) : null;
    const now = piecesOf(merged ?? getStore());
    written = {};
    changed.forEach((id, i) => {
      const p = now.get(id) ?? {};
      tx.set(refs[i], { data: encode(fs, p), updated: fs.serverTimestamp() });
      written[id] = pieceHash(p);
    });
  });
  if (merged) {
    const remote = merged;
    update((s) => Object.assign(s, merge(s, remote)));
  }
  Object.assign(m.hashes, written);
}

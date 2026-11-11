// Dev only: flag a card that's wrong or useless, with a note, for review later. Flags go to users/{uid}/flags in
// Firestore, and .github/workflows/card-flags.yml lists them (and deletes the ones that are dealt with).
//
// The button shows only for the developer's account, recognised by a hash of its email so the address isn't in
// the code. Anyone else could only ever write flags into their own account, so it's a convenience, not security.

import { useEffect, useState } from "preact/hooks";
import { account, useSync } from "./sync";
import { BUILD } from "./update";

const DEV_EMAIL_SHA256 = "38e96b60169e0b8dbcd4efb6d33f5d68e8638d47f34f6258d68fd0e835366d81";

async function sha256(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const checked = new Map<string, boolean>();

/** Whether the signed-in account is the developer's. */
export function useIsDev(): boolean {
  const email = useSync().user?.email.trim().toLowerCase() ?? "";
  const [dev, setDev] = useState(() => checked.get(email) ?? false);
  useEffect(() => {
    if (!email || !crypto.subtle) return setDev(false);
    if (checked.has(email)) return setDev(checked.get(email)!);
    let live = true;
    sha256(email).then((h) => {
      checked.set(email, h === DEV_EMAIL_SHA256);
      if (live) setDev(h === DEV_EMAIL_SHA256);
    });
    return () => void (live = false);
  }, [email]);
  return dev;
}

export type Flag = {
  /** A card ("word:1523260:context") or a whole item ("word:1523260"). */
  card: string;
  /** What it shows, so the list reads without looking ids up: "本木 (もとき)". */
  label: string;
  note: string;
  /** Where it was flagged: "review" or the page's address. */
  where: string;
};

export async function sendFlag(flag: Flag) {
  const a = await account();
  if (!a) throw new Error("Not signed in.");
  const { fs, db, uid } = a;
  await fs.addDoc(fs.collection(db, "users", uid, "flags"), { ...flag, build: BUILD.id, at: fs.serverTimestamp() });
}

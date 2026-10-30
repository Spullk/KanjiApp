// Daily review reminders for the website and home-screen app. A browser can't wake itself up at a set time, so
// each device registers for push messages (Firebase Cloud Messaging) and Nekko saves, next to your synced
// progress, when your cards come due. A scheduled GitHub Action (scripts/send_reminders.mjs) checks every half
// hour and sends a reminder at the hour you picked, when something is due. The phone app uses local
// notifications instead (native.ts).

import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import { dueCards, type Store } from "./srs";
import { isNative } from "./native";

const TOKEN = "nekko.push";
const DAY = 86_400_000;

export type PushSupport = "yes" | "add-to-home-screen" | "no";

/** Whether this browser can get reminders. iPhones only allow them in the home-screen app. */
export function pushSupport(): PushSupport {
  if (isNative) return "no";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (ios && !installed) return "add-to-home-screen";
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "yes" : "no";
}

function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN);
  } catch {
    return null;
  }
}

/** Whether this device is set up to get reminders. */
export function pushOnHere(): boolean {
  return !!savedToken() && typeof Notification !== "undefined" && Notification.permission === "granted";
}

/** A short field name for this device's token. */
const deviceKey = (token: string) => "d" + token.replace(/[^A-Za-z0-9]/g, "").slice(-24);

/** The due times the reminder sender needs: every card due in the next week, soonest first. */
export function dueTimes(store: Store, now = Date.now()): number[] {
  return dueCards(store, now + 7 * DAY)
    .map((id) => store.cards[id].due)
    .sort((a, b) => a - b)
    .slice(0, 500);
}

type Fb = { app: FirebaseApp; db: Firestore; fs: typeof import("firebase/firestore"); uid: string };

/**
 * Registers this device, once `permission` (Notification.requestPermission(), which has to be called straight from
 * the tap: iPhones ignore it after any wait) is granted. Returns an error message to show, or undefined.
 */
export async function enablePush({ app, db, fs, uid }: Fb, store: Store, permission: Promise<NotificationPermission>): Promise<string | undefined> {
  if ((await permission) !== "granted") {
    return "Notifications are blocked for Nekko. Allow them in your browser's or phone's settings, then try again.";
  }
  try {
    const { getMessaging, getToken } = await import("firebase/messaging");
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(app), { serviceWorkerRegistration: registration });
    localStorage.setItem(TOKEN, token);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    await fs.setDoc(
      fs.doc(db, "users", uid, "meta", "push"),
      { hour: store.settings.reminder ?? null, due: dueTimes(store), devices: { [deviceKey(token)]: { token, tz, updated: Date.now() } } },
      { merge: true },
    );
  } catch (e) {
    console.error("Push setup failed", e);
    return "Couldn't set up reminders on this device. Try again in a moment.";
  }
}

/** Stops reminders on this device. */
export async function disablePush({ db, fs, uid }: Fb) {
  const token = savedToken();
  if (!token) return;
  localStorage.removeItem(TOKEN);
  await fs.updateDoc(fs.doc(db, "users", uid, "meta", "push"), { [`devices.${deviceKey(token)}`]: fs.deleteField() }).catch(() => {});
}

let written = "";

/** After a sync: tells the sender your reminder hour and when cards come due, if anything changed. */
export async function savePushState({ db, fs, uid }: Fb, store: Store) {
  if (!savedToken() && store.settings.reminder === undefined) return;
  const state = { hour: store.settings.reminder ?? null, due: dueTimes(store) };
  const json = JSON.stringify(state);
  if (json === written) return;
  await fs.setDoc(fs.doc(db, "users", uid, "meta", "push"), state, { merge: true });
  written = json;
}

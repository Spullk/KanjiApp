// Extras for the iPhone/Android app (Capacitor). The website never uses them: callers check isNative,
// and the plugins are loaded lazily so they stay out of the website's start-up path.

import { Capacitor } from "@capacitor/core";
import { dueCards, onSave, refresh, type Store } from "./srs";

export const isNative = Capacitor.isNativePlatform();

export async function initNative(store: () => Store) {
  if (!isNative) return;
  // Recount the reminders whenever progress changes, at most every few seconds.
  const reschedule = () => scheduleReminders(store()).catch((e) => console.error("Could not schedule reminders", e));
  let timer: ReturnType<typeof setTimeout> | undefined;
  onSave(() => {
    clearTimeout(timer);
    timer = setTimeout(reschedule, 3000);
  });
  reschedule();
  const { App } = await import("@capacitor/app");
  App.addListener("resume", refresh);
}

// ---------------------------------------------------------------- haptics

export async function tap(strong = false) {
  if (!isNative) return;
  const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
  Haptics.impact({ style: strong ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
}

// ---------------------------------------------------------------- speech

/** The phone's own Japanese voice. Android's web view has no speechSynthesis, so the app uses this. */
export async function speakNative(text: string) {
  const { TextToSpeech } = await import("@capacitor-community/text-to-speech");
  await TextToSpeech.stop().catch(() => {});
  await TextToSpeech.speak({ text, lang: "ja-JP", rate: 0.9 });
}

// ---------------------------------------------------------------- backup

/** Saves the backup to a temporary file and opens the share sheet (Files, AirDrop, Drive, mail…). */
export async function shareFile(name: string, json: string) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const { uri } = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title: "Nekko progress", files: [uri] }).catch(() => {}); // cancelled
}

// ---------------------------------------------------------------- reminders

// One notification per day for the next week, each saying how many reviews will be waiting then.
// They're recounted after every change, so finishing your reviews quiets today's.
const REMINDER_IDS = Array.from({ length: 7 }, (_, i) => 100 + i);
export async function scheduleReminders(store: Store) {
  if (!isNative) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const pending = await LocalNotifications.getPending();
  const ours = pending.notifications.filter((n) => REMINDER_IDS.includes(n.id));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });

  const hour = store.settings.reminder;
  if (hour === undefined) return;
  if ((await LocalNotifications.checkPermissions()).display !== "granted") return;
  const now = Date.now();
  const first = new Date(now);
  first.setHours(0, Math.round(hour * 60), 0, 0);
  const notifications = REMINDER_IDS.map((id, i) => {
    const at = new Date(first);
    at.setDate(first.getDate() + i);
    const n = at.getTime() > now ? dueCards(store, at.getTime()).length : 0;
    return { id, at, n };
  })
    .filter((r) => r.n > 0)
    .map(({ id, at, n }) => ({
      id,
      title: "Nekko",
      body: `${n} ${n === 1 ? "review is" : "reviews are"} waiting`,
      schedule: { at, allowWhileIdle: true },
      isExactNotification: false,
    }));
  if (notifications.length) await LocalNotifications.schedule({ notifications });
}

/** Asks for notification permission. Returns false if the user said no. */
export async function allowReminders(): Promise<boolean> {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  let { display } = await LocalNotifications.checkPermissions();
  if (display !== "granted") display = (await LocalNotifications.requestPermissions()).display;
  return display === "granted";
}

// Keeping the installed website up to date. The offline cache serves the old build until a new one is fetched,
// and a home-screen app on iPhone rarely reloads on its own, so Nekko checks whenever it comes back on screen
// and Settings has a button to check now.

import { registerSW } from "virtual:pwa-register";

declare const __BUILD__: { id: string; time: string };

export const BUILD = __BUILD__;

/** "29 Oct 2026, 14:20 (cda4629)" in local time. */
export function buildLabel(): string {
  const t = new Date(BUILD.time);
  const when = t.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${when} (${BUILD.id})`;
}

let registration: ServiceWorkerRegistration | undefined;

export function initUpdates() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      registration = r;
    },
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") registration?.update().catch(() => {});
  });
}

export type UpdateCheck = "latest" | "updating" | "offline";

/** Asks the server for the newest build; if it's newer, fetches it and reloads into it. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  let latest: { id: string };
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return "offline";
    latest = await res.json();
  } catch {
    return "offline";
  }
  if (latest.id === BUILD.id) return "latest";
  // The new service worker takes over as soon as it's installed and the page reloads into it. If that doesn't
  // happen (no service worker, or it's slow), reload anyway: the files are fetched fresh.
  navigator.serviceWorker?.addEventListener("controllerchange", () => location.reload());
  registration?.update().catch(() => {});
  setTimeout(() => location.reload(), 8000);
  return "updating";
}

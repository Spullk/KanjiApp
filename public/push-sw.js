// Added to the service worker: shows the daily review reminder sent by scripts/send_reminders.mjs, and opens
// Nekko's review page when it's tapped.

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // Not JSON: show the default text.
  }
  const data = message.data || message;
  event.waitUntil(
    self.registration.showNotification(data.title || "Nekko", {
      body: data.body || "Reviews are waiting",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: "nekko-reminder",
      data: { url: data.url || "./#/review" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});

// Sends the daily review reminders for the website and home-screen app. Runs every half hour from
// .github/workflows/reminders.yml with a Firebase service account; needs no packages.
//
// Each signed-in device that turned reminders on is listed in users/{uid}/meta/push (see src/push.ts) with its
// push token and time zone, next to the reminder time and the times cards come due. A device gets one reminder a
// day, at the first run in the three hours from its reminder time, and only when reviews are waiting.
// The time is in hours: 7.5 is 7:30.

import { createSign } from "node:crypto";

const WINDOW_HOURS = 3;

/** The local date, and minutes since midnight, in a time zone. */
export function localTime(now, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

/** Which devices of one account to remind now: [device key, token, local date, waiting reviews]. */
export function toRemind(push, now) {
  if (push.hour === null || push.hour === undefined) return [];
  const waiting = (push.due ?? []).filter((t) => t <= now.getTime()).length;
  if (!waiting) return [];
  const at = Math.round(push.hour * 60);
  const out = [];
  for (const [key, d] of Object.entries(push.devices ?? {})) {
    let local;
    try {
      local = localTime(now, d.tz || "UTC");
    } catch {
      local = localTime(now, "UTC");
    }
    if (local.minutes < at || local.minutes >= at + WINDOW_HOURS * 60 || d.sent === local.date) continue;
    out.push([key, d.token, local.date, waiting]);
  }
  return out;
}

/** Firestore's typed JSON to plain values. */
export function plain(v) {
  if (!v || "nullValue" in v) return null;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("arrayValue" in v) return (v.arrayValue.values ?? []).map(plain);
  if ("mapValue" in v) return Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, plain(x)]));
  return null;
}

async function accessToken(account) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claims = enc({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
    aud: account.token_uri,
    iat: now,
    exp: now + 3600,
  });
  const sig = createSign("RSA-SHA256").update(`${head}.${claims}`).sign(account.private_key).toString("base64url");
  const res = await fetch(account.token_uri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${head}.${claims}.${sig}` }),
  });
  if (!res.ok) throw new Error(`Sign-in failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function main() {
  const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "null");
  if (!account) {
    console.log("No FIREBASE_SERVICE_ACCOUNT secret yet: nothing to send.");
    return;
  }
  const project = account.project_id;
  const token = await accessToken(account);
  const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

  const res = await fetch(`${base}:runQuery`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "meta", allDescendants: true }] } }),
  });
  if (!res.ok) throw new Error(`Reading reminders failed: ${res.status} ${await res.text()}`);
  const docs = (await res.json()).filter((r) => r.document?.name.endsWith("/meta/push")).map((r) => r.document);

  const now = new Date();
  let sent = 0;
  for (const doc of docs) {
    const push = plain({ mapValue: { fields: doc.fields } });
    for (const [key, device, date, waiting] of toRemind(push, now)) {
      const body = `${waiting} ${waiting === 1 ? "review is" : "reviews are"} waiting`;
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${project}/messages:send`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          message: { token: device, data: { title: "Nekko", body, url: "./#/review" }, webpush: { headers: { Urgency: "high", TTL: "21600" } } },
        }),
      });
      const gone = r.status === 404 || (r.status === 400 && (await r.clone().text()).includes("registration token"));
      if (!r.ok && !gone) {
        console.error(`Sending failed: ${r.status} ${await r.text()}`);
        continue;
      }
      // Remember today's reminder, or drop a device that uninstalled or blocked notifications.
      const field = `devices.${key}${gone ? "" : ".sent"}`;
      const fields = gone ? {} : { devices: { mapValue: { fields: { [key]: { mapValue: { fields: { sent: { stringValue: date } } } } } } } };
      await fetch(`https://firestore.googleapis.com/v1/${doc.name}?updateMask.fieldPaths=${encodeURIComponent(field)}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ fields }),
      });
      if (!gone) sent++;
    }
  }
  console.log(`Checked ${docs.length} accounts, sent ${sent} reminders.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

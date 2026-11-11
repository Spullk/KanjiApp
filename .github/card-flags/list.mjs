// Lists the cards flagged in the app (src/flags.ts), oldest first, and deletes the ones named in DONE (flag ids,
// separated by spaces or commas) once they're dealt with. Runs from .github/workflows/card-flags.yml with the
// same Firebase service account as the reminders; needs no packages.

import { accessToken, plain } from "../reminders/send.mjs";

const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "null");
if (!account) {
  console.log("No FIREBASE_SERVICE_ACCOUNT secret: can't read flags.");
  process.exit(1);
}
const token = await accessToken(account);
const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
const base = `https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents`;

const res = await fetch(`${base}:runQuery`, {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "flags", allDescendants: true }] } }),
});
if (!res.ok) throw new Error(`Reading flags failed: ${res.status} ${await res.text()}`);
const docs = (await res.json()).filter((r) => r.document).map((r) => r.document);

const done = new Set((process.env.DONE || "").split(/[\s,]+/).filter(Boolean));
const open = [];
for (const doc of docs) {
  const id = doc.name.split("/").pop();
  if (done.has(id)) {
    const r = await fetch(`https://firestore.googleapis.com/v1/${doc.name}`, { method: "DELETE", headers: auth });
    console.log(r.ok ? `Deleted ${id}` : `Couldn't delete ${id}: ${r.status}`);
    continue;
  }
  const f = plain({ mapValue: { fields: doc.fields } });
  open.push({ id, at: f.at, card: f.card, label: f.label, note: f.note, where: f.where, build: f.build });
}
open.sort((a, b) => String(a.at).localeCompare(String(b.at)));
console.log(`${open.length} open ${open.length === 1 ? "flag" : "flags"}:`);
console.log("FLAGS_JSON " + JSON.stringify(open));
for (const f of open) console.log(`- ${f.at} ${f.label} [${f.card}] ${f.note ? `"${f.note}"` : ""} (${f.id})`);

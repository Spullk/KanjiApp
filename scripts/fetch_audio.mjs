// Downloads the word and sentence recordings into public/audio/, so the app serves them itself: they play
// offline once heard (or after Settings → Save all recordings), and in the phone apps they're built in.
// Run before `vite build` (the App workflow does, with a cache, so each deploy only fetches new ones).
// Files that fail to download are skipped; the app then streams Kanji alive and Tatoeba ones from the source.
// AUDIO_MINUTES=4 stops starting new downloads after 4 minutes, so a deploy never waits long on recordings: the
// rest (often Commons files that hit its rate limit) are tried again on the next run. A file that failed is
// remembered in public/audio/.failed.json (kept by the workflow's cache, removed before the build) and not tried again for 3 days.
// Wikimedia Commons recordings are .wav/.ogg there, so the mp3 copy Commons makes is used, or ffmpeg converts it.
//
//   node scripts/fetch_audio.mjs

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const KANJI_ALIVE = "https://media.kanjialive.com/examples_audio/audio-mp3/";
const TATOEBA = "https://tatoeba.org/audio/download/";
const OUT = "public/audio";
const UA = { "User-Agent": "NekkoBuild/1.0 (https://github.com/Spullk/KanjiApp; open data build for a kanji study app)" };

/** Where Commons keeps a file, and its mp3 copy. */
function commons(file) {
  const name = file.replaceAll(" ", "_");
  const h = createHash("md5").update(name).digest("hex");
  const path = `${h[0]}/${h.slice(0, 2)}/${encodeURIComponent(name)}`;
  return {
    original: `https://upload.wikimedia.org/wikipedia/commons/${path}`,
    mp3: name.endsWith(".mp3") ? null : `https://upload.wikimedia.org/wikipedia/commons/transcoded/${path}/${encodeURIComponent(name)}.mp3`,
  };
}

const deadline = process.env.AUDIO_MINUTES ? Date.now() + Number(process.env.AUDIO_MINUTES) * 60_000 : Infinity;

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429 && attempt < 4 && Date.now() < deadline) {
      await new Promise((ok) => setTimeout(ok, 2000 * 2 ** attempt));
      continue;
    }
    if (!res.ok) throw new Error(String(res.status));
    return Buffer.from(await res.arrayBuffer());
  }
}

/** A Commons recording as mp3: Commons' own copy, or the original converted here. */
async function commonsMp3(file, dest) {
  const { original, mp3 } = commons(file);
  if (!mp3) return get(original);
  try {
    return await get(mp3);
  } catch {
    const tmp = dest + ".src";
    writeFileSync(tmp, await get(original));
    const r = spawnSync("ffmpeg", ["-loglevel", "error", "-y", "-i", tmp, "-ac", "1", "-b:a", "64k", "-f", "mp3", dest + ".tmp"]);
    rmSync(tmp, { force: true });
    if (r.status !== 0) throw new Error("ffmpeg could not convert it");
    const out = readFileSync(dest + ".tmp");
    rmSync(dest + ".tmp", { force: true });
    return out;
  }
}

const words = JSON.parse(readFileSync("data/words.json", "utf8"));
const sentences = JSON.parse(readFileSync("data/sentences.json", "utf8"));
const jobs = [
  ...[...new Set(Object.values(words).map((w) => w.audio).filter(Boolean))].map((a) => [KANJI_ALIVE + encodeURIComponent(a) + ".mp3", `${OUT}/w/${a}.mp3`]),
  ...Object.values(words).filter((w) => w.rec && !w.audio).map((w) => [{ commons: w.rec[1] }, `${OUT}/w/c${w.rec[0]}.mp3`]),
  ...Object.values(sentences).filter((s) => s.audio).map((s) => [TATOEBA + s.audio[0], `${OUT}/s/${s.audio[0]}.mp3`]),
];
mkdirSync(`${OUT}/w`, { recursive: true });
mkdirSync(`${OUT}/s`, { recursive: true });

const FAILED = `${OUT}/.failed.json`;
const RETRY_AFTER = 3 * 24 * 3600_000;
let failedAt = {};
try {
  failedAt = JSON.parse(readFileSync(FAILED, "utf8"));
} catch {
  // first run
}

let have = 0;
let got = 0;
let skipped = 0;
const failed = [];
const todo = jobs.filter(([, file]) => {
  if (existsSync(file)) return have++, false;
  if (Date.now() - (failedAt[file] ?? 0) < RETRY_AFTER) return skipped++, false;
  return true;
});
async function worker() {
  for (let job = todo.shift(); job && Date.now() < deadline; job = todo.shift()) {
    const [url, file] = job;
    try {
      writeFileSync(file, url.commons ? await commonsMp3(url.commons, file) : await get(url));
      got++;
      delete failedAt[file];
    } catch (e) {
      failed.push(`${url.commons ?? url} (${e.message})`);
      // A dropped connection says nothing about the file, so only the server's answers are remembered.
      if (e.message !== "fetch failed") failedAt[file] = Date.now();
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
const wanted = new Set(jobs.map(([, file]) => file));
writeFileSync(FAILED, JSON.stringify(Object.fromEntries(Object.entries(failedAt).filter(([file]) => wanted.has(file)))));
console.log(`Recordings: ${jobs.length} in the data, ${have} already here, ${skipped} failed lately (skipped), ${got} downloaded, ${failed.length} failed${todo.length ? `, ${todo.length} left for the next run (time limit)` : ""}.`);
if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `changed=${got || failed.length ? 1 : 0}\n`, { flag: "a" });
if (failed.length) console.log("First failures:\n" + failed.slice(0, 10).join("\n"));

// Downloads the word and sentence recordings into public/audio/, so the app serves them itself: they play
// offline once heard (or after Settings → Save all recordings), and in the phone apps they're built in.
// Run before `vite build` (the App workflow does, with a cache, so each deploy only fetches new ones).
// Files that fail to download are skipped; the app then streams Kanji alive and Tatoeba ones from the source.
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

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: UA });
    if (res.status === 429 && attempt < 4) {
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

let have = 0;
let got = 0;
const failed = [];
const todo = jobs.filter(([, file]) => (existsSync(file) ? (have++, false) : true));
async function worker() {
  for (let job = todo.shift(); job; job = todo.shift()) {
    const [url, file] = job;
    try {
      writeFileSync(file, url.commons ? await commonsMp3(url.commons, file) : await get(url));
      got++;
    } catch (e) {
      failed.push(`${url.commons ?? url} (${e.message})`);
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
console.log(`Recordings: ${jobs.length} in the data, ${have} already here, ${got} downloaded, ${failed.length} failed.`);
if (failed.length) console.log("First failures:\n" + failed.slice(0, 10).join("\n"));

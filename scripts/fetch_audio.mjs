// Downloads the word and sentence recordings into public/audio/, so the app serves them itself: they play
// offline once heard (or after Settings → Save all recordings), and in the phone apps they're built in.
// Run before `vite build` (the App workflow does, with a cache, so each deploy only fetches new ones).
// Files that fail to download are skipped; the app then streams them from the source, or uses text-to-speech.
//
//   node scripts/fetch_audio.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const KANJI_ALIVE = "https://media.kanjialive.com/examples_audio/audio-mp3/";
const TATOEBA = "https://tatoeba.org/audio/download/";
const OUT = "public/audio";

const words = JSON.parse(readFileSync("data/words.json", "utf8"));
const sentences = JSON.parse(readFileSync("data/sentences.json", "utf8"));
const jobs = [
  ...[...new Set(Object.values(words).map((w) => w.audio).filter(Boolean))].map((a) => [KANJI_ALIVE + encodeURIComponent(a) + ".mp3", `${OUT}/w/${a}.mp3`]),
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
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      got++;
    } catch (e) {
      failed.push(`${url} (${e.message})`);
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
console.log(`Recordings: ${jobs.length} in the data, ${have} already here, ${got} downloaded, ${failed.length} failed.`);
if (failed.length) console.log("First failures:\n" + failed.slice(0, 10).join("\n"));

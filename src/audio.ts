// Pronunciation: human recordings only (Kanji alive and Wikimedia Commons for words, Tatoeba for sentences). Words
// and sentences without one get no play button: no computer voice. The app serves the recordings itself (audio/, see
// scripts/fetch_audio.mjs) and keeps each one once played (public/audio-sw.js); one missing there streams from
// its source instead.

import type { Sentence, Word } from "./data";
import { isNative, speakNative } from "./native";

const KANJI_ALIVE = "https://media.kanjialive.com/examples_audio/audio-mp3/";
const TATOEBA = "https://tatoeba.org/audio/download/";

let current: HTMLAudioElement | null = null;

export function speak(text: string) {
  if (isNative) {
    speakNative(text).catch(() => {});
    return;
  }
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith("ja"));
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

/** Plays the first of `urls` that works. */
function play(urls: string[]) {
  current?.pause();
  const [url, ...rest] = urls;
  if (!url) return;
  const a = new Audio(url);
  current = a;
  let next = false;
  const onFail = () => {
    if (next || current !== a) return;
    next = true;
    play(rest);
  };
  a.play().catch((e: Error) => e.name !== "NotAllowedError" && onFail());
  a.onerror = onFail;
}

const wordFile = (w: Word) => (w.audio ? `audio/w/${encodeURIComponent(w.audio)}.mp3` : `audio/w/c${w.rec![0]}.mp3`);
const sentenceFile = (s: Sentence) => `audio/s/${s.audio![0]}.mp3`;

/** Whether the word has a real recording (only those are played). */
export const hasRecording = (w: Word) => !!(w.audio || w.rec);

export function playWord(w: Word) {
  // Commons recordings are only served by the app (they're converted to mp3 at build time).
  if (w.audio) play([wordFile(w), KANJI_ALIVE + encodeURIComponent(w.audio) + ".mp3"]);
  else if (w.rec) play([wordFile(w)]);
}

export function playSentence(s: Sentence) {
  if (s.audio) play([sentenceFile(s), TATOEBA + s.audio[0]]);
}

/** Every recording the app has, for saving them all on this device. */
export function allRecordings(words: Word[], sentences: Sentence[]): string[] {
  return [...new Set([...words.filter(hasRecording).map(wordFile), ...sentences.filter((s) => s.audio).map(sentenceFile)])];
}

const AUDIO_CACHE = "nekko-audio"; // the same name as in public/audio-sw.js

/** How many of `urls` are already kept on this device. */
export async function savedRecordings(urls: string[]): Promise<number> {
  if (typeof caches === "undefined") return 0;
  const kept = new Set((await (await caches.open(AUDIO_CACHE)).keys()).map((r) => new URL(r.url).pathname));
  return urls.filter((u) => kept.has(new URL(u, location.href).pathname)).length;
}

/** Downloads every recording not kept yet (the service worker keeps each one), a few at a time. */
export async function saveRecordings(urls: string[], onProgress: (done: number) => void): Promise<number> {
  const cache = await caches.open(AUDIO_CACHE);
  const kept = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
  const todo = urls.filter((u) => !kept.has(new URL(u, location.href).pathname));
  let done = urls.length - todo.length;
  let failed = 0;
  onProgress(done);
  const worker = async () => {
    for (let u = todo.shift(); u; u = todo.shift()) {
      const res = await fetch(u).catch(() => null);
      // Without a service worker (first visit), keep it here directly.
      if (res?.ok && !navigator.serviceWorker?.controller) await cache.put(u, res.clone()).catch(() => {});
      if (res?.ok) done++;
      else failed++;
      onProgress(done);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return failed;
}


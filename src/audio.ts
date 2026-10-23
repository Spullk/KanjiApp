// Pronunciation: human recordings where they exist (Kanji alive for words, Tatoeba for sentences),
// otherwise the device's Japanese text-to-speech voice. Recordings stream, so they need a connection.

import type { Sentence, Word } from "./data";

const KANJI_ALIVE = "https://media.kanjialive.com/examples_audio/audio-mp3/";
const TATOEBA = "https://tatoeba.org/audio/download/";

let current: HTMLAudioElement | null = null;

export function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith("ja"));
  if (voice) u.voice = voice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

function play(url: string, fallback: string) {
  current?.pause();
  const a = new Audio(url);
  current = a;
  a.play().catch(() => speak(fallback));
  a.onerror = () => speak(fallback);
}

export function playWord(w: Word) {
  if (w.audio) play(KANJI_ALIVE + encodeURIComponent(w.audio) + ".mp3", w.r);
  else speak(w.r);
}

export function playSentence(s: Sentence) {
  if (s.audio) play(TATOEBA + s.audio[0], s.ja);
  else speak(s.ja);
}

export function hasSpeech(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

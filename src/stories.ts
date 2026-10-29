// Stories to read (Aozora Bunko and the Tadoku free readers), matched against the words you know.
// The list and each story load only when you open them; data/ is built by scripts/build_stories.py.

import { useEffect, useState } from "preact/hooks";
import { isKanji, type Data } from "./data";
import { stageOf, type Store } from "./srs";

export type StoryInfo = {
  id: string;
  title: string;
  author: string;
  source: "aozora" | "tadoku";
  /** Tadoku's level, 0-5. */
  level?: number | null;
  /** The original: Aozora's library card, or Tadoku's PDF with pictures. */
  url: string;
  chars: number;
  /** Everyday kana words (ある, これ…), counted as known. */
  free: number;
  /** [word id, times used], most used first. */
  w: [string, number][];
};

/** One paragraph: text, word links [start, length, word id] and readings [start, length, kana]. */
export type Paragraph = [string, [number, number, string][], [number, number, string][]];

export const READY = 0.95;
export const ALMOST = 0.85;

let list: StoryInfo[] | undefined;
let loading: Promise<StoryInfo[]> | undefined;
const texts = import.meta.glob<{ default: Paragraph[] }>("../data/stories/*.json");

export function loadStories(): Promise<StoryInfo[]> {
  return (loading ??= import("../data/stories.json").then((m) => (list = m.default as unknown as StoryInfo[])));
}

/** The story list, loaded on first use (pass false to skip loading it). */
export function useStories(load = true): StoryInfo[] | undefined {
  const [stories, setStories] = useState(list);
  useEffect(() => {
    if (load && !stories) loadStories().then(setStories);
  }, [load]);
  return stories;
}

export async function loadStory(id: string): Promise<Paragraph[] | undefined> {
  return (await texts[`../data/stories/${id}.json`]?.())?.default;
}

export type WordStage = "known" | "learning" | "new";

const settled = (s: string) => s === "young" || s === "mature";

/**
 * Tells how well you know each word, remembering answers so a long list of stories stays quick.
 * A word is known once you've studied it past the first steps (or marked it known), or when Nekko doesn't
 * teach it as a word and you know all its kanji (行く once you know 行).
 */
export function knowledge(store: Store, data: Data) {
  const kanjiCache = new Map<string, boolean>();
  const wordCache = new Map<string, WordStage>();
  const kanji = (c: string) => {
    let known = kanjiCache.get(c);
    if (known === undefined) kanjiCache.set(c, (known = settled(stageOf(store, "kanji", c))));
    return known;
  };
  /** undefined for the odd story word Nekko has no entry for: it counts neither way. */
  const word = (id: string): WordStage | undefined => {
    const w = data.words[id];
    if (!w) return;
    let stage = wordCache.get(id);
    if (stage) return stage;
    const s = stageOf(store, "word", id);
    const chars = w.lesson ? [] : [...w.w].filter((c) => isKanji(c) && c !== "々");
    stage = settled(s) ? "known" : s === "learning" ? "learning" : chars.length && chars.every(kanji) ? "known" : "new";
    wordCache.set(id, stage);
    return stage;
  };
  return { word };
}

export type Knowledge = ReturnType<typeof knowledge>;
export type Coverage = { known: number; learning: number; total: number };

/** Share of a story's words you know, counting every time a word is used. */
export function coverage(k: Knowledge, s: StoryInfo): Coverage {
  const c = { known: s.free, learning: 0, total: s.free };
  for (const [id, n] of s.w) {
    const stage = k.word(id);
    if (!stage) continue;
    c.total += n;
    if (stage === "known") c.known += n;
    else if (stage === "learning") c.learning += n;
  }
  return c;
}

/** The story's words you haven't started, most used first. */
export function newWords(k: Knowledge, s: StoryInfo): string[] {
  return s.w.filter(([id]) => k.word(id) === "new").map(([id]) => id);
}

// Finished stories live with your items ("story:<id>"), so they sync and merge like the rest of your progress.
const finishedKey = (id: string) => `story:${id}`;

export function isFinished(store: Store, id: string): boolean {
  return !!store.items[finishedKey(id)]?.status;
}

export function setFinished(store: Store, id: string, done: boolean, now = Date.now()) {
  store.items[finishedKey(id)] = { status: done ? "known" : undefined, updated: now };
}

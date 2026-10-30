// Example sentences you can read: a word's sentences, plus every other sentence that uses it, sorted so the ones
// made of words you already know come first. When none is easy enough, Nekko writes a simple one from a pattern.

import { isKanji, type Data, type Sentence } from "./data";
import { knowledge, type Knowledge } from "./stories";
import type { Store } from "./srs";

const indexes = new WeakMap<Data, Map<string, string[]>>();

/** Every sentence that links each word, in the order the data lists them. */
function sentenceIndex(data: Data): Map<string, string[]> {
  let ix = indexes.get(data);
  if (ix) return ix;
  ix = new Map();
  for (const [id, s] of Object.entries(data.sentences)) {
    for (const [, , wid] of s.links) {
      const list = ix.get(wid);
      if (!list) ix.set(wid, [id]);
      else if (list[list.length - 1] !== id) list.push(id);
    }
  }
  indexes.set(data, ix);
  return ix;
}

const knowCache = new WeakMap<Store, Knowledge>();

/** What you know, worked out once per change to your progress. */
export function knowledgeOf(store: Store, data: Data): Knowledge {
  let k = knowCache.get(store);
  if (!k) knowCache.set(store, (k = knowledge(store, data)));
  return k;
}

/** Kana-only words Nekko doesn't teach (これ, ある, ます…) count as known: they're grammar and everyday words. */
function free(data: Data, wid: string): boolean {
  const w = data.words[wid];
  return !!w && !w.lesson && ![...w.w].some(isKanji);
}

/** The words in a sentence you haven't started, apart from `except` (the word the sentence is for). */
export function unknownWords(data: Data, k: Knowledge, s: Sentence, except?: string): string[] {
  const out: string[] = [];
  for (const [, , wid] of s.links) {
    if (wid === except || out.includes(wid) || free(data, wid)) continue;
    if (k.word(wid) === "new") out.push(wid);
  }
  return out;
}

export type Example = { id: string; unknown: string[] };

/** A word's example sentences, easiest for you first: fewest new words, then its own picks, then shorter. */
export function examplesFor(data: Data, k: Knowledge, wordId: string, max = 12): Example[] {
  const own = data.words[wordId]?.sentences ?? [];
  const ids = [...new Set([...own, ...(sentenceIndex(data).get(wordId) ?? [])])].slice(0, 60);
  return ids
    .map((id, i) => ({ id, i, unknown: unknownWords(data, k, data.sentences[id], wordId) }))
    .sort((a, b) => a.unknown.length - b.unknown.length || a.i - b.i)
    .slice(0, max)
    .map(({ id, unknown }) => ({ id, unknown }));
}

/** Sentences for a kanji page: the easiest one for each of its words, easiest overall first. */
export function kanjiExamples(data: Data, k: Knowledge, words: string[], max = 6): Example[] {
  const seen = new Set<string>();
  const out: Example[] = [];
  for (const w of words.slice(0, 30)) {
    const best = examplesFor(data, k, w, 3).find((e) => !seen.has(e.id));
    if (best) {
      seen.add(best.id);
      out.push(best);
    }
  }
  return out.sort((a, b) => a.unknown.length - b.unknown.length).slice(0, max);
}

/** First meaning, without notes like "(another's)". */
function gloss(data: Data, wid: string): string {
  const g = data.words[wid].senses[0]?.gloss[0] ?? "";
  return g.replace(/\([^)]*\)\s*/g, "").trim();
}

/**
 * A simple sentence for a word, from a pattern built only from kana grammar, so the word is the only thing
 * to read: nouns "〜について はなしましょう", adjectives "とても〜です", verbs "〜のは むずかしいです".
 * Undefined for other kinds of word.
 */
export function patternSentence(data: Data, wid: string): Sentence | undefined {
  const w = data.words[wid];
  if (!w) return;
  const pos = w.senses[0]?.pos ?? [];
  const has = (p: string) => pos.some((x) => x.startsWith(p));
  const g = gloss(data, wid);
  if (!g) return;
  let before = "";
  let after: string;
  let en: string;
  if (has("godan verb") || has("ichidan verb") || has("Kuru verb")) {
    after = "のは むずかしいです。";
    en = `It's hard ${g.startsWith("to ") ? g : `to ${g}`}.`;
  } else if (has("i-adjective") || has("na-adjective")) {
    before = "とても ";
    after = "です。";
    en = `It's very ${g}.`;
  } else if (has("noun") || has("pronoun")) {
    after = "について はなしましょう。";
    en = `Let's talk about ${g}.`;
  } else return;
  const ja = before + w.w + after;
  return { ja, en, links: [[before.length, w.w.length, wid]] };
}

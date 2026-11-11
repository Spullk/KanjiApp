// Example sentences you can read: a word's sentences, plus every other sentence that uses it, keeping only the ones
// with at most one word you don't know (the word itself, if you haven't learned it yet). Only real sentences: Nekko
// doesn't make any up.

import { isKanji, type Data, type Sentence } from "./data";
import { knowledge, type Knowledge } from "./stories";
import type { Store } from "./srs";
import { studiedKanji } from "./reading";
import { grammarKnown } from "./grammar";

const indexes = new WeakMap<Data, Map<string, string[]>>();

/** Every sentence that links each word, in the order the data lists them. */
function sentenceIndex(data: Data): Map<string, string[]> {
  let ix = indexes.get(data);
  if (ix) return ix;
  ix = new Map();
  for (const id in data.sentences) {
    for (const [, , wid] of data.sentences[id].links) {
      const list = ix.get(wid);
      if (!list) ix.set(wid, [id]);
      else if (list[list.length - 1] !== id) list.push(id);
    }
  }
  indexes.set(data, ix);
  return ix;
}

/** Builds the sentence index while the phone is idle after start-up, so the first word or kanji page (or
 * sentence card) doesn't wait for it. */
export function warmExamples(data: Data) {
  const later = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  const run = () => sentenceIndex(data);
  if (later) later(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}

/** What you know, plus whether kana-only words count as known (see `free`), the kanji you've studied and the
 * grammar you know (unset: grammar doesn't count). */
export type ExampleKnowledge = Knowledge & { kanaFree?: boolean; kanji?: Set<string>; grammar?: (id: string) => boolean };

const knowCache = new WeakMap<Store, ExampleKnowledge>();

/** What you know, worked out once per change to your progress. */
export function knowledgeOf(store: Store, data: Data): ExampleKnowledge {
  let k = knowCache.get(store);
  if (!k) {
    k = { ...knowledge(store, data), kanaFree: store.settings.kanaWords === false, kanji: studiedKanji(store, data), grammar: grammarKnown(store, data.grammar) };
    knowCache.set(store, k);
  }
  return k;
}

/** Kana words no lesson teaches that still don't make a sentence harder: えっ, はあ, でも and the like. */
const GRAMMAR_POS = ["interjection", "particle", "auxiliary", "conjunction", "copula"];

/**
 * Words that never make a sentence harder. A kana-only word (ちょっと, もらう, ドア) is taught in a lesson like any
 * other, so it counts only once you've learned it. The exceptions: interjections and other grammar words no lesson
 * teaches (and one-kana links like と), and every kana word when you've left them out of your lessons (Settings →
 * Learning), since you'd never get the chance. Particles and endings (は, を, ます) aren't linked, so never count.
 */
function free(data: Data, k: ExampleKnowledge, wid: string): boolean {
  const w = data.words[wid];
  if (!w || [...w.w].some(isKanji)) return false;
  if (k.kanaFree) return true;
  if (w.lesson) return false;
  return w.w.length === 1 || w.senses.some((s) => s.pos.some((p) => GRAMMAR_POS.some((g) => p.startsWith(g))));
}

/** The words in a sentence you haven't started, apart from `except` (the word the sentence is for). */
export function unknownWords(data: Data, k: ExampleKnowledge, s: Sentence, except?: string): string[] {
  const out: string[] = [];
  for (const [, , wid] of s.links) {
    if (wid === except || out.includes(wid) || free(data, k, wid)) continue;
    if (k.word(wid) === "new") out.push(wid);
  }
  return out;
}

/** The grammar points in a sentence you don't know yet. */
export function unknownGrammar(k: ExampleKnowledge, s: Sentence): string[] {
  return k.grammar && s.g ? s.g.filter((id) => !k.grammar!(id)) : [];
}

const KATAKANA = /^[ァ-ヺー]$/;

/**
 * Whether a sentence has a word outside its dictionary links that you might not know: a word Nekko has no entry
 * for (s.gaps: もつれ, たっぷり), kanji you haven't studied (in a word the data didn't link) or a katakana word
 * (ボウフラ). Nekko can't show what those mean, so the sentence would need guessing: it's left out. Names in
 * katakana (トム) are fine; other unlinked hiragana is grammar (は, ました, んだよ).
 */
function strayWords(s: Sentence, k: ExampleKnowledge): boolean {
  if (s.gaps?.length) return true;
  const linked = new Uint8Array(s.ja.length);
  for (const [start, len] of s.links) linked.fill(1, start, start + len);
  // A name's katakana is fine; its kanji still have to be ones you know.
  for (const [start, len] of s.names ?? []) for (let i = start; i < start + len; i++) if (!isKanji(s.ja[i])) linked[i] = 1;
  let kata = 0;
  for (let i = 0; i < s.ja.length; i++) {
    const c = s.ja[i];
    if (linked[i]) {
      kata = 0;
      continue;
    }
    if (k.kanji && isKanji(c) && c !== "々" && !k.kanji.has(c)) return true;
    kata = KATAKANA.test(c) ? kata + 1 : 0;
    if (kata >= 2) return true;
  }
  return false;
}

/** The most words (or grammar points) you don't know a sentence may have: one, and the word itself is it if you
 * haven't learned it. */
export const MAX_UNKNOWN = 1;

/** Sentences with at most one word you don't know, and at least one kanji, for Read → Sentences. */
export function readableByWords(data: Data, k: ExampleKnowledge, maxUnknown = MAX_UNKNOWN): Example[] {
  const out: Example[] = [];
  for (const id in data.sentences) {
    const s = data.sentences[id];
    if (![...s.ja].some(isKanji) || strayWords(s, k)) continue;
    const unknown = unknownWords(data, k, s);
    const grammar = unknownGrammar(k, s);
    if (unknown.length + grammar.length <= maxUnknown) out.push({ id, unknown, grammar });
  }
  return out;
}

/** unknown: words you don't know. grammar: grammar points you don't know. */
export type Example = { id: string; unknown: string[]; grammar: string[] };

/** How much in a sentence is new to you. */
export const newCount = (e: Example) => e.unknown.length + e.grammar.length;

/**
 * A word's example sentences you can read, easiest first: no other new word, then its own picks, then the rest.
 * A sentence may hold one word you don't know, so if you haven't learned this word yet, every other word is known.
 */
export function examplesFor(data: Data, k: ExampleKnowledge, wordId: string, max = 12): Example[] {
  const own = data.words[wordId]?.sentences ?? [];
  const ids = [...new Set([...own, ...(sentenceIndex(data).get(wordId) ?? [])])].slice(0, 200);
  const room = MAX_UNKNOWN - (k.word(wordId) === "new" ? 1 : 0);
  return ids
    .filter((id) => !strayWords(data.sentences[id], k))
    .map((id, i) => ({ id, i, unknown: unknownWords(data, k, data.sentences[id], wordId), grammar: unknownGrammar(k, data.sentences[id]) }))
    .filter((e) => newCount(e) <= room)
    .sort((a, b) => newCount(a) - newCount(b) || a.i - b.i)
    .slice(0, max)
    .map(({ id, unknown, grammar }) => ({ id, unknown, grammar }));
}

/** Sentences for a kanji page: the easiest one for each of its words, easiest overall first. */
export function kanjiExamples(data: Data, k: ExampleKnowledge, words: string[], max = 6): Example[] {
  const seen = new Set<string>();
  const out: Example[] = [];
  for (const w of words.slice(0, 30)) {
    const best = examplesFor(data, k, w, 3).find((e) => !seen.has(e.id));
    if (best) {
      seen.add(best.id);
      out.push(best);
    }
  }
  return out.sort((a, b) => newCount(a) - newCount(b)).slice(0, max);
}

// Example sentences you can read: a word's sentences, plus every other sentence that uses it, keeping only the ones
// with at most one word you don't know (the word itself, if you haven't learned it yet). When none is easy enough,
// Nekko writes a simple one from a pattern.

import { isKanji, type Data, type Sentence } from "./data";
import { knowledge, type Knowledge } from "./stories";
import type { Store } from "./srs";
import { studiedKanji } from "./reading";

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

/** What you know, plus whether kana-only words count as known (see `free`) and the kanji you've studied. */
export type ExampleKnowledge = Knowledge & { kanaFree?: boolean; kanji?: Set<string> };

const knowCache = new WeakMap<Store, ExampleKnowledge>();

/** What you know, worked out once per change to your progress. */
export function knowledgeOf(store: Store, data: Data): ExampleKnowledge {
  let k = knowCache.get(store);
  if (!k) knowCache.set(store, (k = { ...knowledge(store, data), kanaFree: store.settings.kanaWords === false, kanji: studiedKanji(store, data) }));
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

const KATAKANA = /^[ァ-ヺー]$/;

/**
 * Whether a sentence has a word outside its dictionary links that you might not know: kanji you haven't studied
 * (自分 in 自分で, where the data didn't link a word) or a katakana word (ボウフラ). Nekko can't show what those
 * mean, so the sentence would need guessing: it's left out. Unlinked hiragana is mostly grammar (は, ました, んだよ).
 */
function strayWords(s: Sentence, k: ExampleKnowledge): boolean {
  const linked = new Uint8Array(s.ja.length);
  for (const [start, len] of s.links) linked.fill(1, start, start + len);
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

/** The most words you don't know a sentence may have: one, and the word itself is it if you haven't learned it. */
export const MAX_UNKNOWN = 1;

/** Sentences with at most one word you don't know, and at least one kanji, for Read → Sentences. */
export function readableByWords(data: Data, k: ExampleKnowledge, maxUnknown = MAX_UNKNOWN): Example[] {
  const out: Example[] = [];
  for (const id in data.sentences) {
    const s = data.sentences[id];
    if (![...s.ja].some(isKanji) || strayWords(s, k)) continue;
    const unknown = unknownWords(data, k, s);
    if (unknown.length <= maxUnknown) out.push({ id, unknown });
  }
  return out;
}

export type Example = { id: string; unknown: string[] };

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
    .map((id, i) => ({ id, i, unknown: unknownWords(data, k, data.sentences[id], wordId) }))
    .filter((e) => e.unknown.length <= room)
    .sort((a, b) => a.unknown.length - b.unknown.length || a.i - b.i)
    .slice(0, max)
    .map(({ id, unknown }) => ({ id, unknown }));
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

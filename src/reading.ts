// Reading practice: example sentences you can already read, or nearly.

import { isKanji, type Data, type Segment } from "./data";
import { isAdded, itemInfo, type Store } from "./srs";

/** Kanji you've been taught (studying them, at any stage) or marked as known: no furigana over these. */
export function studiedKanji(store: Store, data: Data): Set<string> {
  const out = new Set<string>();
  for (const c of Object.keys(data.kanji)) {
    if (isAdded(store, "kanji", c) || itemInfo(store, "kanji", c)?.status === "known") out.add(c);
  }
  return out;
}

const taughtCache = new WeakMap<Store, Set<string>>();

/** studiedKanji, worked out once per change to your progress. */
function taught(store: Store, data: Data): Set<string> {
  let set = taughtCache.get(store);
  if (!set) taughtCache.set(store, (set = studiedKanji(store, data)));
  return set;
}

/**
 * Which furigana to hide: readings over kanji you've been taught. A reading that belongs to the whole word
 * (今日 きょう) stays until you study that word, since knowing 今 and 日 doesn't tell you きょう.
 */
export function furiganaRule(store: Store, data: Data, wordId?: string): (s: Segment) => boolean {
  const known = taught(store, data);
  const word = !!wordId && (isAdded(store, "word", wordId) || itemInfo(store, "word", wordId)?.status === "known");
  return ([text, kana, how]) => kana !== null && (word || (how !== "*" && [...text].every((c) => !isKanji(c) || known.has(c))));
}

/** The kanji in a sentence you haven't studied (any kanji outside the Jōyō list counts too). */
export function unknownKanji(ja: string, known: Set<string>): string[] {
  return [...new Set([...ja].filter((c) => isKanji(c) && c !== "々" && !known.has(c)))];
}

/** Sentences with at most `maxUnknown` kanji you haven't studied, and at least one kanji. */
export function readableSentences(data: Data, known: Set<string>, maxUnknown = 0): string[] {
  return Object.entries(data.sentences)
    .filter(([, s]) => [...s.ja].some(isKanji) && unknownKanji(s.ja, known).length <= maxUnknown)
    .map(([id]) => id);
}

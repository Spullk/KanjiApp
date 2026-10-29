// The order new items are taught in: Nekko's lessons, or kanji by JLPT level, school grade or frequency,
// or your own list (a textbook's, for example).

import { isKanji, type Data } from "./data";
import type { ItemKind } from "./srs";

export type StudyOrder = "lessons" | "jlpt" | "grade" | "frequency" | "custom";

export const ORDER_LABEL: Record<StudyOrder, string> = {
  lessons: "Nekko lessons (related kanji together)",
  jlpt: "JLPT level, N5 first",
  grade: "School grade, 1st grade first",
  frequency: "Most common kanji first",
  custom: "My own list",
};

type ItemRef = { kind: ItemKind; key: string };

type Index = {
  /** Lesson order position of every kanji, to break ties. */
  lessonPos: Map<string, number>;
  /** The radicals Nekko teaches that each kanji is built from. */
  radicalsOf: Map<string, string[]>;
  /** The study words that use each kanji, and the kanji each one needs. */
  wordsWith: Map<string, string[]>;
  wordKanji: Map<string, string[]>;
};

const indexes = new WeakMap<Data, Index>();

function indexFor(data: Data): Index {
  let ix = indexes.get(data);
  if (ix) return ix;
  ix = { lessonPos: new Map(), radicalsOf: new Map(), wordsWith: new Map(), wordKanji: new Map() };
  data.lessons.forEach((l) => l.kanji.forEach((k) => ix!.lessonPos.set(k, ix!.lessonPos.size)));
  for (const l of data.lessons) {
    for (const r of l.radicals) {
      for (const k of data.radicals[r]?.usedIn ?? []) ix.radicalsOf.set(k, [...(ix.radicalsOf.get(k) ?? []), r]);
    }
    for (const w of l.words) {
      const ks = [...new Set([...data.words[w].w].filter((c) => isKanji(c) && data.kanji[c]))];
      ix.wordKanji.set(w, ks);
      for (const k of ks) ix.wordsWith.set(k, [...(ix.wordsWith.get(k) ?? []), w]);
    }
  }
  indexes.set(data, ix);
  return ix;
}

/** Every Jōyō kanji in the order chosen. */
export function kanjiOrder(data: Data, order: Exclude<StudyOrder, "lessons" | "custom">): string[] {
  const { lessonPos } = indexFor(data);
  const rank = (k: string): number => {
    const kj = data.kanji[k];
    if (order === "jlpt") return kj.jlpt ? 6 - kj.jlpt : 6;
    if (order === "grade") return kj.grade || 99;
    return kj.freq ?? 9999;
  };
  return [...lessonPos.keys()].sort((a, b) => rank(a) - rank(b) || lessonPos.get(a)! - lessonPos.get(b)!);
}

/**
 * Turns a list of kanji into a teaching order: each kanji after the radicals it needs, and each word as soon as
 * you'd know all its kanji. `known` holds kanji you study already, so their words can come straight away.
 */
export function teachingOrder(data: Data, kanji: string[], known: Set<string>): ItemRef[] {
  const { radicalsOf, wordsWith, wordKanji } = indexFor(data);
  const out: ItemRef[] = [];
  const have = new Set(known);
  const sent = new Set<string>();
  const ready = (w: string) => wordKanji.get(w)!.every((k) => have.has(k));
  for (const k of kanji) {
    for (const r of radicalsOf.get(k) ?? []) {
      if (!sent.has("radical:" + r)) {
        sent.add("radical:" + r);
        out.push({ kind: "radical", key: r });
      }
    }
    if (!sent.has("kanji:" + k)) {
      sent.add("kanji:" + k);
      out.push({ kind: "kanji", key: k });
    }
    have.add(k);
    for (const w of wordsWith.get(k) ?? []) {
      if (!sent.has("word:" + w) && ready(w)) {
        sent.add("word:" + w);
        out.push({ kind: "word", key: w });
      }
    }
  }
  return out;
}

/**
 * Reads a pasted study list in order: single characters are kanji, longer entries are words when Nekko knows
 * them, otherwise their kanji. Entries are separated by spaces, commas or new lines.
 */
export function parseStudyList(data: Data, text: string, spelling: Map<string, string>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };
  for (const token of text.split(/[\s,、，;；・]+/).filter(Boolean)) {
    const word = [...token].length > 1 ? spelling.get(token) : undefined;
    if (word) push("word:" + word);
    else for (const c of token) if (data.kanji[c]) push("kanji:" + c);
  }
  return out;
}

/** Your own list as a teaching order: radicals before each kanji, words where you put them. */
export function customOrder(data: Data, list: string[]): ItemRef[] {
  const { radicalsOf } = indexFor(data);
  const out: ItemRef[] = [];
  const sent = new Set<string>();
  const push = (kind: ItemKind, key: string) => {
    if (!sent.has(kind + ":" + key)) {
      sent.add(kind + ":" + key);
      out.push({ kind, key });
    }
  };
  for (const id of list) {
    const [kind, key] = id.split(":") as [ItemKind, string];
    if (kind === "kanji" && data.kanji[key]) {
      for (const r of radicalsOf.get(key) ?? []) push("radical", r);
      push("kanji", key);
    } else if (kind === "word" && data.words[key]) push("word", key);
  }
  return out;
}

// Grammar points: parsing their example sentences into furigana segments and a gap to fill.

import type { GrammarPoint, Segment } from "./data";
import { cardId, isAdded, itemInfo, type Store } from "./srs";

export const LEVELS: { level: GrammarPoint["level"]; title: string; hint: string }[] = [
  { level: "start", title: "Start here", hint: "Sounds, how the scripts fit together, and the grammar you need before your first words." },
  { level: "numbers", title: "Numbers and counters", hint: "Counting, prices, dates and time, with the sound changes that trip everyone up." },
  { level: "phrases", title: "Set phrases", hint: "Everyday phrases that don't make sense word by word." },
  { level: "n5", title: "N5 grammar", hint: "The rest of the beginner grammar, roughly JLPT N5." },
  { level: "n4", title: "N4 grammar", hint: "Verb forms (can, let's, if, was done, made to), giving and receiving, seems and probably." },
  { level: "n3", title: "N3 grammar", hint: "Intermediate patterns: reasons, contrasts, \"the more… the more\", and the set phrases of written Japanese." },
];

export type Tier = "beginner" | "n5" | "n4" | "n3";

/** The tabs on the Grammar page, easiest first; Beginner holds the levels a newcomer needs before N5. */
export const TIERS: { tier: Tier; label: string; levels: GrammarPoint["level"][] }[] = [
  { tier: "beginner", label: "Beginner", levels: ["start", "numbers", "phrases"] },
  { tier: "n5", label: "N5", levels: ["n5"] },
  { tier: "n4", label: "N4", levels: ["n4"] },
  { tier: "n3", label: "N3", levels: ["n3"] },
];

export const tierOf = (level: GrammarPoint["level"]): Tier => TIERS.find((t) => t.levels.includes(level))!.tier;

// The tab you were last on, so Grammar opens straight to your level. Kept on this phone only: it's a place, not progress.
const LAST_TIER = "nekko.grammarTier";

export function lastTier(): Tier | undefined {
  try {
    const t = localStorage.getItem(LAST_TIER);
    return TIERS.some((x) => x.tier === t) ? (t as Tier) : undefined;
  } catch {
    return undefined;
  }
}

export function rememberTier(tier: Tier) {
  try {
    localStorage.setItem(LAST_TIER, tier);
  } catch {
    // Private mode: Grammar opens on the first unfinished level instead.
  }
}

const RUBY = /([一-鿿々〆ヶ]+)\[(\*?)([^\]]+)\]/g;

/** "学生[がくせい]です" → [["学生", "がくせい"], ["です", null]]. */
export function segments(text: string): Segment[] {
  const out: Segment[] = [];
  let pos = 0;
  for (const m of text.matchAll(RUBY)) {
    if (m.index! > pos) out.push([text.slice(pos, m.index), null]);
    out.push(m[2] ? [m[1], m[3], "*"] : [m[1], m[3]]);
    pos = m.index! + m[0].length;
  }
  if (pos < text.length) out.push([text.slice(pos), null]);
  return out;
}

/** Particles are said differently from how they're written, so either spelling counts. */
const SAID: Record<string, string> = { は: "わ", へ: "え", を: "お" };

export type Cloze = { before: Segment[]; gap: Segment[]; after: Segment[]; answers: string[]; en: string };

/** An example split around its gap, with every answer that counts (in kana). */
export function cloze([ja, en]: [string, string]): Cloze {
  const [, before, gap, after] = ja.match(/^(.*)\{(.*)\}(.*)$/)!;
  const alts = gap.split("|");
  const kana = alts.map((a) => segments(a).map(([t, r]) => r ?? t).join(""));
  return { before: segments(before), gap: segments(alts[0]), after: segments(after), answers: [...kana, ...kana.flatMap((k) => SAID[k] ?? [])], en };
}

/** Which example a grammar card shows: a different one each time it comes up. */
export function exampleFor(store: Store, g: GrammarPoint): [string, string] {
  return g.ex[(store.cards[cardId("grammar", g.id, "cloze")]?.reps ?? 0) % g.ex.length];
}

/** Done: in your reviews, marked known, or a note you've read (notes have no examples to review). */
export function grammarDone(store: Store, id: string): boolean {
  return isAdded(store, "grammar", id) || !!itemInfo(store, "grammar", id)?.status;
}

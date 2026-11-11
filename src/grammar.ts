// Grammar points: parsing their example sentences into furigana segments and a gap to fill.

import type { GrammarPoint, Segment } from "./data";
import { cardId, isAdded, itemInfo, type Store } from "./srs";

export const LEVELS: { level: GrammarPoint["level"]; title: string; hint: string }[] = [
  { level: "start", title: "Start here", hint: "Sounds, how the scripts fit together, and the grammar you need before your first words." },
  { level: "loanwords", title: "Loanwords", hint: "Katakana words from other languages: the sounds native Japanese doesn't have, and how English turns into katakana." },
  { level: "numbers", title: "Numbers and counters", hint: "Counting, prices, dates and time, with the sound changes that trip everyone up." },
  { level: "phrases", title: "Set phrases", hint: "Everyday phrases that don't make sense word by word." },
  { level: "n5", title: "N5 grammar", hint: "The rest of the beginner grammar, roughly JLPT N5." },
  { level: "n4", title: "N4 grammar", hint: "Verb forms (can, let's, if, was done, made to), giving and receiving, seems and probably." },
  { level: "n3", title: "N3 grammar", hint: "Intermediate patterns: reasons, contrasts, \"the more… the more\", and the set phrases of written Japanese." },
];

export type Tier = "beginner" | "n5" | "n4" | "n3";

/** The tabs on the Grammar page, easiest first; Beginner holds the levels a newcomer needs before N5. */
export const TIERS: { tier: Tier; label: string; levels: GrammarPoint["level"][] }[] = [
  { tier: "beginner", label: "Beginner", levels: ["start", "loanwords", "numbers", "phrases"] },
  { tier: "n5", label: "N5", levels: ["n5"] },
  { tier: "n4", label: "N4", levels: ["n4"] },
  { tier: "n3", label: "N3", levels: ["n3"] },
];

export const tierOf = (level: GrammarPoint["level"]): Tier => TIERS.find((t) => t.levels.includes(level))!.tier;

const tierRank = (t: Tier) => TIERS.findIndex((x) => x.tier === t);

/**
 * Which grammar you know, for picking example sentences: what you've started or marked known, plus every level
 * below where the grammar quiz placed you. Undefined until you've taken the quiz: then no sentence is left out
 * for its grammar, since Nekko can't tell what you know.
 */
export function grammarKnown(store: Store, points: Record<string, GrammarPoint>): ((id: string) => boolean) | undefined {
  const level = store.settings.grammarLevel;
  if (!level || level === "skipped") return;
  const below = tierRank(level);
  return (id) => !points[id] || tierRank(tierOf(points[id].level)) < below || grammarDone(store, id);
}

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

// The placement quiz: a few gap-fill questions per tab, easiest first, until you miss too many.

export const QUIZ_PER_TIER = 3;
export const QUIZ_PASS = 2;

// Spelling and sounds rather than grammar: a gap inside one word (ケー{キ}, の{み}ます) isn't a fair question.
const NOT_IN_QUIZ = new Set(["loanwords", "numbers", "dakuten", "small-ya", "small-tsu", "long-vowels", "n-beats", "katakana-words", "verb-groups"]);

// Particles that often fit the same gap (ねこ{が}すき, ねこ{は}すき, パン{も}たべます), so one is never the wrong
// choice for another.
const SWAPPABLE = [["は", "が", "も", "を", "わ", "お"], ["に", "へ", "え"]];

export type QuizQuestion = { tier: Tier; point: string; cloze: Cloze; options: Segment[][]; right: number };

const gapText = (segs: Segment[]) => segs.map(([t]) => t).join("");

function shuffled<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** QUIZ_PER_TIER questions for each tab, each from a different point, with three wrong choices taken from other
 * gaps on the same tab. */
export function placementQuiz(points: GrammarPoint[], rand: () => number = Math.random): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (const t of TIERS) {
    const pool = points.filter((g) => t.levels.includes(g.level) && !NOT_IN_QUIZ.has(g.level) && !NOT_IN_QUIZ.has(g.id) && g.ex.length);
    const gaps = [...new Map(pool.flatMap((g) => g.ex.map((ex) => cloze(ex).gap)).map((gap) => [gapText(gap), gap])).values()];
    for (const g of shuffled(pool, rand)) {
      if (out.filter((q) => q.tier === t.tier).length === QUIZ_PER_TIER) break;
      const c = cloze(shuffled(g.ex, rand)[0]);
      // A wrong choice mustn't also fit: not one of this point's answers, nor one of its gaps.
      const taken = new Set([...c.answers, ...g.ex.flatMap((ex) => cloze(ex).answers), gapText(c.gap)]);
      for (const group of SWAPPABLE) if (c.answers.some((a) => group.includes(a))) group.forEach((x) => taken.add(x));
      const wrong = shuffled(gaps, rand).filter((x) => !taken.has(gapText(x)) && !taken.has(x.map(([text, r]) => r ?? text).join("")));
      if (wrong.length < 3) continue;
      const options = shuffled([c.gap, ...wrong.slice(0, 3)], rand);
      out.push({ tier: t.tier, point: g.id, cloze: c, options, right: options.indexOf(c.gap) });
    }
  }
  return out;
}

/** The tab to study from: the first one you didn't pass. */
export function placedTier(passed: Tier[]): Tier {
  return TIERS.find((t) => !passed.includes(t.tier))?.tier ?? TIERS[TIERS.length - 1].tier;
}

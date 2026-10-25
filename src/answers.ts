// Checking typed answers, WaniKani style: meanings forgive small typos, readings must be exact kana.

import { isJapanese, toHiragana } from "wanakana";

export type Verdict = "right" | "close" | "wrong" | "retry";

function normalizeMeaning(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/^\s*(to|a|an|the)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

/** How many typos a meaning of this length may have. */
const tolerance = (n: number) => (n <= 3 ? 0 : n <= 6 ? 1 : 2);

export function checkMeaning(input: string, answers: string[]): Verdict {
  if (isJapanese(input.replace(/\s/g, ""))) return "retry"; // typed the reading instead
  const got = normalizeMeaning(input);
  if (!got) return "retry";
  let best: Verdict = "wrong";
  // "just (like)" takes both "just" and "just like".
  const wants = answers.flatMap((a) => [a.replace(/\([^)]*\)/g, " "), a]).map(normalizeMeaning).filter(Boolean);
  for (const want of wants) {
    if (want === got) return "right";
    if (distance(want, got) <= tolerance(want.length)) best = "close";
  }
  return best;
}

/** Every way a KANJIDIC-style reading may be typed: カタ → かた, い.きる → いきる or い, -ばい → ばい. */
export function readingForms(r: string): string[] {
  const [stem, okurigana = ""] = r.replace(/-/g, "").split(".");
  return [...new Set([toHiragana(stem + okurigana), toHiragana(stem)])];
}

export function checkReading(input: string, answers: string[]): Verdict {
  const got = toHiragana(input.trim().replace(/n$/, "ん"));
  if (!got) return "retry";
  if (!isJapanese(got)) return "retry"; // still romaji, or typed the meaning
  return answers.some((a) => toHiragana(a) === got) ? "right" : "wrong";
}

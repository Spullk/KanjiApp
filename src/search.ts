import { isKana, isRomaji, toHiragana } from "wanakana";
import { hira, isKanji, type Data } from "./data";

export type Results = { kanji: string[]; radicals: string[]; words: string[] };

const LIMIT = 40;

type Index = {
  words: { id: string; w: string; r: string; gloss: string; rank: number }[];
  kanjiByReading: Map<string, string[]>;
};

let index: Index | null = null;

function buildIndex(d: Data): Index {
  const words = Object.values(d.words)
    .map((w) => ({
      id: w.id,
      w: w.w,
      r: hira(w.r),
      gloss: w.senses.flatMap((s) => s.gloss).join(" | ").toLowerCase(),
      rank: w.rank + (w.usuallyKana ? 100 : 0),
    }))
    .sort((a, b) => a.rank - b.rank);
  const kanjiByReading = new Map<string, string[]>();
  for (const k of Object.values(d.kanji)) {
    for (const r of [...k.on, ...k.kun]) {
      // Index both the stem and the full form: た.べる is found by た and by たべる.
      for (const kana of new Set([hira(r.split(".")[0]), hira(r.replace(".", ""))])) {
        const key = kana.replace(/-/g, "");
        const list = kanjiByReading.get(key) ?? [];
        if (!list.includes(k.c)) list.push(k.c);
        kanjiByReading.set(key, list);
      }
    }
  }
  return { words, kanjiByReading };
}

export function search(d: Data, raw: string): Results {
  const q = raw.trim();
  if (!q) return { kanji: [], radicals: [], words: [] };
  index ??= buildIndex(d);
  const byLesson = (a: string, b: string) => d.kanji[a].lesson - d.kanji[b].lesson;

  if ([...q].some(isKanji) || [...q].some((c) => d.radicals[c])) {
    const chars = [...new Set(q)];
    return {
      kanji: chars.filter((c) => d.kanji[c]),
      radicals: chars.filter((c) => d.radicals[c]),
      words: index.words.filter((w) => w.w.includes(q)).slice(0, LIMIT).map((w) => w.id),
    };
  }

  const results: Results = { kanji: [], radicals: [], words: [] };
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id) && results.words.length < LIMIT) {
      seen.add(id);
      results.words.push(id);
    }
  };

  // Kana, or romaji that converts cleanly to kana ("taberu" → たべる).
  const kana = isKana(q) ? hira(q) : isRomaji(q) ? toHiragana(q.toLowerCase()) : "";
  if (kana && isKana(kana)) {
    results.kanji = [...(index.kanjiByReading.get(kana) ?? [])].sort(byLesson);
    for (const w of index.words) if (w.r === kana) add(w.id);
    for (const w of index.words) if (w.r.startsWith(kana)) add(w.id);
  }

  // English meaning, whole-word matches first.
  if (/^[a-z ,'-]+$/i.test(q) && q.length > 1) {
    const needle = q.toLowerCase();
    const word = new RegExp(`(^|[^a-z])${needle.replace(/[-]/g, "\\-")}($|[^a-z])`);
    results.kanji.push(
      ...Object.values(d.kanji)
        .filter((k) => k.meanings.some((m) => word.test(m.toLowerCase())) && !results.kanji.includes(k.c))
        .map((k) => k.c)
        .sort(byLesson)
        .slice(0, 20),
    );
    for (const w of index.words) if (w.gloss.split(" | ").includes(needle)) add(w.id);
    for (const w of index.words) if (word.test(w.gloss)) add(w.id);
  }
  return results;
}

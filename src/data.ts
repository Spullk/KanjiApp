// Types and loading for the JSON files in data/ (built by scripts/build_data.py).

export type Part = { c: string; phonetic: boolean };
export type Reading = { r: string; type: "on" | "kun"; words: string[] };

export type Kanji = {
  c: string;
  meanings: string[];
  strokes: number;
  grade: number;
  jlpt: number | null;
  freq: number | null;
  on: string[];
  kun: string[];
  parts: Part[];
  phonetic: string | null;
  readings: Reading[];
  specialWords: string[];
  words: string[];
  lesson: number;
  usedIn: string[];
  soundFamily: string[];
};

export type Radical = {
  c: string;
  meanings: string[];
  original: string | null;
  parts: Part[];
  readings: string[];
  usedIn: string[];
  lesson: number | null;
};

/** [text, kana or null for plain kana text, KANJIDIC reading used ("*" = special reading)] */
export type Segment = [string, string | null, string?];

export type Word = {
  id: string;
  w: string;
  r: string;
  furigana: Segment[];
  special: string[];
  senses: { pos: string[]; gloss: string[] }[];
  rank: number;
  usuallyKana: boolean;
  sentences: string[];
  lesson?: number;
  /** Kanji alive recording, e.g. "jutsu-no(beru)_06_a" */
  audio?: string;
};

/** audio: [Tatoeba audio id, speaker] when a freely licensed recording exists. */
export type Sentence = { ja: string; en: string; links: [number, number, string][]; audio?: [string, string] };
export type Lesson = { id: number; radicals: string[]; kanji: string[]; words: string[] };

/** A grammar point (hand-written in data/grammar.json). Examples mark the gap as {は}, alternatives as {なに|なん},
 * and readings as 学生[がくせい] (or [*きょう] for a reading that belongs to the whole word). */
export type GrammarPoint = { id: string; level: "start" | "numbers" | "phrases" | "n5"; title: string; note: string; ex: [string, string][] };

export type Data = {
  kanji: Record<string, Kanji>;
  radicals: Record<string, Radical>;
  words: Record<string, Word>;
  sentences: Record<string, Sentence>;
  lessons: Lesson[];
  grammar: Record<string, GrammarPoint>;
};

let data: Data | null = null;

export async function loadData(): Promise<Data> {
  if (data) return data;
  const [kanji, radicals, words, sentences, lessons, grammar] = await Promise.all([
    import("../data/kanji.json"),
    import("../data/radicals.json"),
    import("../data/words.json"),
    import("../data/sentences.json"),
    import("../data/lessons.json"),
    import("../data/grammar.json"),
  ]);
  data = {
    kanji: kanji.default as unknown as Data["kanji"],
    radicals: radicals.default as unknown as Data["radicals"],
    words: words.default as unknown as Data["words"],
    sentences: sentences.default as unknown as Data["sentences"],
    lessons: lessons.default as unknown as Data["lessons"],
    grammar: Object.fromEntries((grammar.default as unknown as GrammarPoint[]).map((g) => [g.id, g])),
  };
  return data;
}

export function useData(): Data {
  if (!data) throw new Error("data not loaded");
  return data;
}

/** Katakana → hiragana, so on and kun readings can be compared with word readings. */
export function hira(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

export function isKanji(c: string): boolean {
  return /[一-鿿㐀-䶿々]/.test(c);
}

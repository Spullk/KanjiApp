// Songs: lyrics you add (from LRCLIB or pasted), split into words on this device and matched to Nekko's words.
// The lyrics never go into the repo. Each song lives with your items ("song:<id>"), so it syncs and merges like the
// rest of your progress. The AI's part (background, line notes, each word's meaning in the song) comes from
// songAI.ts or from an answer you paste back from an AI app; it never contains the lyrics.

import { hira, isKanji, type Data, type Word } from "./data";
import { isAdded, itemInfo, setItemInfo, stageOf, type Store } from "./srs";
import type { Knowledge } from "./stories";

// ---------------------------------------------------------------- types

/** One entry of the AI's word list: a word or grammar piece, in dictionary form, with the lines it's on. */
export type AIWord = { base: string; r?: string; sung?: string; pos?: string; m?: string; dict?: string; lines?: number[] };

/** What the AI found out about the song (prompt version 3 adds everything after "artist"). Empty means unknown. */
export type SongInfo = {
  /** The official title as written in Japanese. */
  title?: string;
  titleReading?: string;
  titleRomaji?: string;
  titleEnglish?: string;
  artist?: string;
  artistReading?: string;
  lyricist?: string;
  composer?: string;
  arranger?: string;
  /** Who sings it, when that isn't the artist (a vocaloid, a featured singer). */
  vocals?: string;
  /** YYYY-MM-DD, YYYY-MM or YYYY. */
  released?: string;
  /** The single or album it came out on. */
  release?: string;
  /** What it was made for: "Opening theme of the anime …". */
  tieIn?: string;
  genre?: string;
  /** Version 2's single line of credits. */
  credits?: string;
  background?: string;
  /** "sure", "likely" or "unsure": how sure the AI is that it found the right song. */
  confidence?: string;
  sources?: string[];
};

/** The AI's answer (prompt versions 2 and 3): no lyrics, only the song's info, notes by line number and the word list. */
export type AIAnswer = {
  nekko?: number;
  song?: SongInfo;
  lineCount?: number;
  notes?: { line: number; note: string }[];
  words: AIWord[];
};

/** A message in a song's Ask chat. `about` names what it was asked from ("溶けて · line 1"); `info` is the context
 * sent with the first question after it. */
export type ChatMessage = { role: "user" | "assistant"; text: string; about?: string; info?: string; t: number };

export type Song = {
  id: string;
  title: string;
  artist?: string;
  /** The title you gave, when the AI's official title replaced it. */
  aka?: string;
  /** The lyrics as added, before cleaning. Kept only in your own progress. */
  lyrics: string;
  source: "lrclib" | "paste";
  /** Your own notes or links for the AI to use. */
  notes?: string;
  ai?: AIAnswer;
  chat?: ChatMessage[];
  /** Nekko word ids in the song, worked out on this device, so the song list can say how much you know. */
  wids?: string[];
  added: number;
};

// ---------------------------------------------------------------- cleaning a paste

/**
 * Drops what isn't lyrics from a paste (a Genius page in particular): [Chorus]-style labels (they become verse
 * breaks), the "You might also like" block, Contributors / Translations / ticket lines, the title line ending in
 * " Lyrics" and a description ending in "Read More" before the lyrics, and a trailing "123Embed". Lyric lines are
 * never changed. The AI prompt numbers lines the same way.
 */
export function cleanLyrics(raw: string): { sections: string[][]; removed: string[] } {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const removed: string[] = [];
  const sections: string[][] = [];
  let cur: string[] = [];
  const brk = () => {
    if (cur.length) sections.push(cur);
    cur = [];
  };
  const MORE = "You might also like";
  let skip = 0;
  let seenLyric = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const t = line.trim();
    if (t === "") {
      skip = 0;
      brk();
      continue;
    }
    if (/^\[[^\]]*\]$/.test(t)) {
      skip = 0;
      removed.push(t);
      brk();
      continue;
    }
    if (skip > 0) {
      skip--;
      removed.push(t);
      continue;
    }
    if (
      /^\d*\s*Contributors?\b/i.test(t) ||
      /^Translations?$/i.test(t) ||
      /^Get tickets as low as/i.test(t) ||
      /^See .+ Live$/i.test(t) ||
      /^\d*Embed$/i.test(t) ||
      /^You may also like$/i.test(t) ||
      (!seenLyric && (/\sLyrics$/.test(t) || /Read More$/i.test(t)))
    ) {
      removed.push(t);
      continue;
    }
    if (t === MORE) {
      removed.push(t);
      skip = 8;
      continue;
    }
    if (line.endsWith(MORE)) {
      removed.push(MORE);
      line = line.slice(0, -MORE.length);
      skip = 8;
    }
    const rest = lines.slice(i + 1).some((l) => l.trim() !== "");
    const emb = !rest ? line.match(/\d*Embed$/) : null;
    if (emb && emb.index! > 0) {
      removed.push(emb[0]);
      line = line.slice(0, emb.index);
    }
    cur.push(line.trim());
    seenLyric = true;
  }
  brk();
  return { sections, removed };
}

const GENIUS_LANGS = ["English", "Romanization", "Romanized", "Español", "Français", "Deutsch", "Português", "Italiano", "Русский", "Українська", "Polski", "Türkçe", "Nederlands", "Svenska", "Suomi", "Norsk", "Dansk", "Čeština", "Magyar", "Română", "Ελληνικά", "עברית", "العربية", "فارسی", "हिन्दी", "ไทย", "Tiếng Việt", "Bahasa Indonesia", "Indonesia", "Melayu", "Filipino", "Tagalog", "한국어", "中文", "简体中文", "繁體中文", "日本語", "Japanese", "Korean", "Chinese", "Azərbaycanca", "Srpski", "Hrvatski", "Slovenčina", "Català", "Esperanto", "Lietuvių", "Latviešu", "Eesti", "Български"];

/** The song title in a Genius paste: the line ending in " Lyrics" before the first lyric, with "123 Contributors",
 * "Translations" and the language list Genius glues onto its front peeled off. "" when there isn't one. */
export function findTitle(raw: string): string {
  for (const line of raw.replace(/\r\n?/g, "\n").split("\n")) {
    const t = line.trim();
    if (!t || /^\[[^\]]*\]$/.test(t)) continue;
    const m = t.match(/^(.*?)\s+Lyrics$/);
    if (!m) {
      if (/^\d*\s*Contributors?$/i.test(t) || /^Translations?$/i.test(t) || GENIUS_LANGS.includes(t) || /Read More$/i.test(t)) continue;
      return "";
    }
    let x = m[1].replace(/^\d*\s*Contributors?/i, "").trim().replace(/^Translations?/i, "").trim();
    for (let peeled = true; peeled; ) {
      peeled = false;
      for (const lang of GENIUS_LANGS) {
        if (x.startsWith(lang) && x.length > lang.length && x[lang.length] !== " ") {
          x = x.slice(lang.length).trim();
          peeled = true;
        }
      }
    }
    return x.replace(/^["“「]|["”」]$/g, "").trim();
  }
  return "";
}

/** The lyric lines, numbered from 1 the way the AI is asked to number them. */
export function lyricLines(song: Song): string[] {
  return cleanLyrics(song.lyrics).sections.flat();
}

// ---------------------------------------------------------------- the AI's answer

/** Reads an AI answer: the JSON code block (the one with a word list, if there are several), or the text from the
 * first { to the last }. Throws a message to show. */
export function parseAI(text: string): AIAnswer {
  const t = text.trim();
  const tries = [...t.matchAll(/```[a-zA-Z]*\s*([\s\S]*?)```/g)].map((m) => m[1]);
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  if (!tries.length) tries.push(t);
  let ai: AIAnswer | undefined;
  let problem = "";
  for (const raw of tries) {
    try {
      const v = JSON.parse(raw.trim());
      if (v && Array.isArray(v.words)) {
        ai = v;
        break;
      }
      ai ??= v;
    } catch (e) {
      problem ||= (e as Error).message;
    }
  }
  if (!ai) {
    const cut = (t.match(/```/g)?.length ?? 0) % 2 === 1;
    throw new Error(cut ? "That answer stops partway, so it isn't complete. Ask the AI to \"continue the JSON\", or start again." : `That answer isn't readable (${problem}). Copy the AI's whole code block and try again.`);
  }
  if (!Array.isArray(ai.words)) throw new Error("That answer has no word list. Was it the answer to Nekko's request?");
  ai.words = ai.words.filter((w) => w && typeof w.base === "string" && w.base);
  ai.notes = (ai.notes ?? []).filter((n) => n && typeof n.line === "number" && typeof n.note === "string");
  if (ai.song && typeof ai.song === "object") {
    const info: SongInfo = {};
    for (const [k, v] of Object.entries(ai.song)) {
      if (k === "sources") continue;
      if (typeof v === "string" && v.trim()) (info as Record<string, string>)[k] = v.trim();
    }
    const src = Array.isArray(ai.song.sources) ? ai.song.sources : [];
    info.sources = [...new Set(src.filter((u) => typeof u === "string" && /^https?:\/\//.test(u)))];
    ai.song = info;
  } else delete ai.song;
  return ai;
}

/** The song's credits as label and value pairs, for the About part. */
export function songCredits(info: SongInfo | undefined): [string, string][] {
  if (!info) return [];
  const same = (a?: string, b?: string) => !!a && !!b && a.replace(/\s/g, "") === b.replace(/\s/g, "");
  const rows: [string, string | undefined][] = [
    ["Words", info.lyricist],
    ["Music", info.composer],
    ["Arrangement", info.arranger],
    ["Vocals", same(info.vocals, info.artist) ? undefined : info.vocals],
    ["Released", [info.released, info.release].filter(Boolean).join(", ")],
    ["Made for", info.tieIn],
    ["Genre", info.genre],
  ];
  const out = rows.filter((r): r is [string, string] => !!r[1]);
  // Version 2 answers have one line of credits instead.
  if (!out.length && info.credits) out.push(["Credits", info.credits]);
  return out;
}

const PLACEHOLDER = /^(untitled( song)?|unknown|)$/i;

/**
 * The song with the AI's answer, and the AI's title and artist when they're better than what you had: always when
 * you had none, and otherwise only when the AI is sure it found the song. The title you had is kept in `aka`.
 */
export function withAnswer(song: Song, ai: AIAnswer): Song {
  const out: Song = { ...song, ai };
  const info = ai.song;
  if (!info) return out;
  const sure = info.confidence !== "unsure";
  if (info.title && info.title !== song.title && (PLACEHOLDER.test(song.title.trim()) || sure)) {
    out.title = info.title;
    if (!PLACEHOLDER.test(song.title.trim())) out.aka = song.aka ?? song.title;
  }
  if (info.artist && (!song.artist || sure)) out.artist = info.artist;
  return out;
}

/** The request for the AI: identify and research the song, then notes by line number and a word list, never the
 * lyrics. It works in any AI app that can search the web, and through songAI.ts. */
export function aiPrompt(song: Song): string {
  const numbered = lyricLines(song)
    .map((l, i) => `${i + 1}. ${l}`)
    .join("\n");
  const title = PLACEHOLDER.test(song.title.trim()) ? "(not given: work it out from the lyrics)" : song.title;
  return `You're helping someone learn Japanese with a song in the app Nekko. Nekko already has these lyrics on the learner's device and shows them itself, so **never write the lyrics out in your answer**: no full lines, no line-by-line translation. Refer to lines by number. Nekko reads your answer automatically, so follow the format exactly.

**Song as the learner added it:** ${title}
**Artist as the learner added it:** ${song.artist?.trim() || "(not given)"}
**Notes from the learner (may be empty):** ${song.notes?.trim() || ""}

The title and artist above may be romaji, a translation, a page title or missing. The lyric lines below are already numbered. Use those numbers.

**Step 1: find the song.** Search the web before you write anything. Make sure you have the right song: search for its title together with a distinctive line or two from the lyrics, and check that the lyrics you find match these. Songs often share a title, and covers and versions differ, so pick the original that these lyrics come from (say in the background if these lyrics are a cover or a different version). If you can't search the web, say so at the start of the background and give only what you're sure of.

**Step 2: the song's details.** Find each of these from reliable sources (the label or artist's site, official lyrics sites such as Uta-Net or J-Lyric, Wikipedia, VocaDB for vocaloid songs, interviews). Leave a field as "" when you can't find it. Never guess a name or a date.
- the official title exactly as written in Japanese, its reading in hiragana, its romaji, and its official English title (or a short translation if there's none)
- the artist as officially written, and its reading in hiragana or katakana if it's written in kanji
- who wrote the words (作詞), who composed the music (作曲), who arranged it (編曲), and who sings it if that isn't the artist (a vocaloid, a featured singer)
- the release date, and the single or album it first came out on
- what it was made for, if anything: anime, drama, film, game, novel, ad or event, with its role (opening, ending, insert song, theme)
- the genre

**Step 3: research for the notes.** Look for: why the song was written and what it's about; anything the writer or artist said about it in interviews or posts; how the story it was made for connects to the words; slang, wordplay, double meanings, references and cultural background a learner would miss. Prefer what the writer actually said over fan guesses, and say when something is a fan reading.

**Step 4: line notes.** Add a note for each line where the learner would miss something: wordplay, slang, a double meaning, a cultural reference, a link to the source story, unusual grammar, or what the writer said about it. Skip lines that need no explanation. Write each note in your own words. You may name a single word or a short phrase from the line, but never quote or translate the whole line.

**Step 5: word list.** List every word and grammar piece in the lyrics, once each, so that nothing in any line is left without a definition: nouns, verbs, adjectives, adverbs, pronouns, set expressions, every particle (は, が, を, に, の, さ, けど …), every verb and adjective ending (た, ない, て, ている, たい, potential, volitional …), casual forms (てる, ら抜き) and grammar patterns (ように, てしまう, かのような). Give words in dictionary form and grammar as the pattern (〜ている). When one particle is used in clearly different ways, give each use its own entry (の for 'of' and の as a sentence ending). Leave out only English words, romaji and punctuation. Before answering, go through every line piece by piece and check that each piece is covered. For each entry give:
- "base": dictionary form, as usually written in a dictionary (歩いた → 歩く), or the grammar pattern
- "r": its normal reading in hiragana (katakana for katakana words)
- "sung": only if the song clearly sings it with an unusual reading (運命 sung さだめ, 地球 sung ほし), that reading; else "". Check official lyrics with furigana if you can.
- "pos": one of noun, verb, adjective, adverb, pronoun, expression, particle, grammar, name, other
- "m": what it means in this song, short
- "dict": a short general dictionary meaning
- "lines": the line numbers where it appears, in any form (歩いた counts for 歩く)

**Output.** Answer with one JSON code block and nothing after it. Put it straight in your reply as a normal code block, not in a file, canvas or artifact. If your answer would be too long for one reply, keep the notes shorter, but never leave words out. Use this shape:

\`\`\`json
{
  "nekko": 3,
  "song": {
    "title": "official title in Japanese",
    "titleReading": "",
    "titleRomaji": "",
    "titleEnglish": "",
    "artist": "",
    "artistReading": "",
    "lyricist": "",
    "composer": "",
    "arranger": "",
    "vocals": "",
    "released": "YYYY-MM-DD, or YYYY-MM or YYYY if that's all you can find",
    "release": "single or album name",
    "tieIn": "e.g. Opening theme of the anime …",
    "genre": "",
    "background": "3-6 sentences on what the song is about, why it was written and where it comes from",
    "confidence": "sure, likely or unsure: how sure you are that this is the right song",
    "sources": ["https://... every page you used for the details and the background"]
  },
  "lineCount": 0,
  "notes": [
    { "line": 1, "note": "" }
  ],
  "words": [
    { "base": "", "r": "", "sung": "", "pos": "", "m": "", "dict": "", "lines": [1] }
  ]
}
\`\`\`

Rules:
- "lineCount" is how many numbered lyric lines there are.
- Write names in their official form (Japanese where the official form is Japanese).
- Never include full lyric lines or a translation of a full line anywhere in the answer.
- Don't fix lyrics. If a line looks like a typo, say so in its note.
- Plain JSON only: no comments, no trailing commas.

**Lyrics:**
<<<
${numbered}
>>>`;
}

// ---------------------------------------------------------------- the word splitter

/** What kuromoji gives for each piece of a line (IPADIC). */
export type Token = {
  surface_form: string;
  pos: string;
  pos_detail_1: string;
  basic_form: string;
  reading?: string;
};
type Tokenizer = { tokenize: (text: string) => Token[] };

declare global {
  interface Window {
    kuromoji?: { builder: (o: { dicPath: string }) => { build: (cb: (err: unknown, t: Tokenizer) => void) => void } };
  }
}

let tokenizer: Tokenizer | undefined;
let loadingTokenizer: Promise<Tokenizer> | undefined;

export const tokenizerReady = () => !!tokenizer;

/** The dictionary splitter (kuromoji, ~18 MB of dictionary), downloaded the first time Songs needs it and then
 * kept offline by the service worker. */
export function loadTokenizer(): Promise<Tokenizer> {
  if (tokenizer) return Promise.resolve(tokenizer);
  return (loadingTokenizer ??= new Promise<Tokenizer>((ok, fail) => {
    const build = () =>
      window.kuromoji!.builder({ dicPath: "kuromoji/dict/" }).build((err, t) => {
        if (err) fail(new Error("Couldn't download the word splitter's dictionary. Check your connection and try again."));
        else ok((tokenizer = t));
      });
    if (window.kuromoji) return build();
    const script = document.createElement("script");
    script.src = "kuromoji/kuromoji.js";
    script.onload = build;
    script.onerror = () => fail(new Error("Couldn't download the word splitter. Check your connection and try again."));
    document.head.appendChild(script);
  }).catch((e) => {
    loadingTokenizer = undefined;
    throw e;
  }));
}

/** Joins kuromoji's small pieces into the words a learner sees: a verb or adjective keeps its endings (歩い+た → 歩いた,
 * 歩い+て+いる → 歩いている). */
export function groupTokens(tokens: Token[]): Token[][] {
  const out: Token[][] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    const head = prev?.[0];
    const last = prev?.[prev.length - 1];
    const glue =
      !!head &&
      (head.pos === "動詞" || head.pos === "形容詞" || (head.pos === "助動詞" && prev.length > 1)) &&
      (t.pos === "助動詞" ||
        (t.pos === "助詞" && t.pos_detail_1 === "接続助詞" && /^(て|で|ちゃ|じゃ)$/.test(t.surface_form)) ||
        (t.pos === "動詞" && t.pos_detail_1 === "接尾") ||
        (t.pos === "動詞" && t.pos_detail_1 === "非自立" && /^(て|で)$/.test(last.surface_form)) ||
        (t.pos === "形容詞" && t.pos_detail_1 === "非自立" && t.basic_form === "ない"));
    if (glue) prev.push(t);
    else out.push([t]);
  }
  return out;
}

// ---------------------------------------------------------------- matching words

export type WordKind = "word" | "grammar" | "other" | "punct";

/** One word of a lyric line as the song page shows it. */
export type SongWord = {
  s: string;
  kind: WordKind;
  /** Dictionary form. */
  base: string;
  /** Reading of the word as written here, in hiragana. */
  r: string;
  /** An unusual sung reading (運命 sung さだめ), shown as furigana. */
  sung?: string;
  /** Meaning in this song, from the AI. */
  m?: string;
  /** A short dictionary meaning from the AI, for words Nekko doesn't have. */
  dict?: string;
  /** The Nekko word, when Nekko has it. */
  wid?: string;
};

export type SongLine = { gap: true } | { gap?: false; n: number; text: string; note?: string; words: SongWord[] };

const kata2hira = (s: string) => hira(s ?? "");
const isKatakana = (s: string) => /^[゠-ヿー]+$/.test(s);

type WordIndex = { byWritten: Map<string, Word[]>; byKana: Map<string, Word[]> };
let index: WordIndex | undefined;

function wordIndex(data: Data): WordIndex {
  if (index) return index;
  const byWritten = new Map<string, Word[]>();
  const byKana = new Map<string, Word[]>();
  const add = (m: Map<string, Word[]>, k: string, w: Word) => {
    const list = m.get(k);
    if (list) list.push(w);
    else m.set(k, [w]);
  };
  for (const w of Object.values(data.words)) {
    if (w.junk) continue;
    add(byWritten, w.w, w);
    if (w.kanjiForm) add(byWritten, w.kanjiForm, w);
    if (w.usuallyKana || ![...w.w].some(isKanji)) add(byKana, w.r, w);
  }
  return (index = { byWritten, byKana });
}

const words = (s?: string) => new Set((s ?? "").toLowerCase().match(/[a-z]{3,}/g) ?? []);

/** The Nekko word for a dictionary form, picked by reading (the AI's, else the splitter's) and then by meaning. */
export function matchWord(data: Data, base: string, reading: string, aiReading?: string, aiMeaning?: string): Word | undefined {
  const { byWritten, byKana } = wordIndex(data);
  let list = byWritten.get(base) ?? [];
  if (!list.length && ![...base].some(isKanji)) list = byKana.get(kata2hira(base)) ?? [];
  if (!list.length) return;
  if (list.length === 1) return list[0];
  const want = aiReading ? kata2hira(aiReading) : "";
  const exact = want && list.filter((w) => w.r === want);
  if (exact && exact.length === 1) return exact[0];
  // The splitter reads the word as written here (歩い → あるい): keep entries whose reading starts the same way.
  const pool = (exact && exact.length ? exact : list.filter((w) => reading && w.r.length > 1 && reading.startsWith(w.r.slice(0, -1)))) || [];
  const cands = pool.length ? pool : list;
  if (aiMeaning) {
    const ai = words(aiMeaning);
    const scored = cands.map((w) => ({ w, n: [...words(w.senses.flatMap((s) => s.gloss).slice(0, 6).join(" "))].filter((x) => ai.has(x)).length }));
    const best = Math.max(...scored.map((x) => x.n));
    if (best > 0) return scored.filter((x) => x.n === best).sort((a, b) => a.w.rank - b.w.rank)[0].w;
  }
  return [...cands].sort((a, b) => a.rank - b.rank)[0];
}

/** Splits every line into words and attaches Nekko's word and the AI's meaning and notes. */
export function analyse(song: Song, tk: Tokenizer, data: Data): { lines: SongLine[]; wids: string[]; missing: string[]; lineCountOff: boolean } {
  const { sections } = cleanLyrics(song.lyrics);
  const ai = song.ai;
  const byBase = new Map<string, AIWord[]>();
  for (const w of ai?.words ?? []) {
    const k = w.base.replace(/^〜/, "");
    byBase.set(k, [...(byBase.get(k) ?? []), w]);
  }
  const findAI = (keys: string[], reading: string, n: number): AIWord | undefined => {
    for (const key of keys) {
      const list = key ? byBase.get(key) : undefined;
      if (!list) continue;
      const onLine = list.filter((w) => !Array.isArray(w.lines) || w.lines.includes(n));
      const pool = onLine.length ? onLine : list;
      return pool.find((w) => kata2hira(w.r ?? "") === reading) ?? (pool.length === 1 ? pool[0] : pool.find((w) => reading.startsWith(kata2hira(w.r ?? "").slice(0, 1))) ?? pool[0]);
    }
  };
  const notes = new Map((ai?.notes ?? []).map((x) => [x.line, x.note]));
  const lines: SongLine[] = [];
  const wids = new Set<string>();
  const missing = new Set<string>();
  let n = 0;
  sections.forEach((sec, si) => {
    if (si > 0) lines.push({ gap: true });
    for (const text of sec) {
      n++;
      const ws = groupTokens(tk.tokenize(text)).map((g): SongWord => {
        const s = g.map((t) => t.surface_form).join("");
        const h = g[0];
        if (/^\s+$/.test(s) || h.pos === "記号") return { s, kind: "punct", base: s, r: "" };
        const readingRaw = g.map((t) => (t.reading && t.reading !== "*" ? t.reading : t.surface_form)).join("");
        const r = isKatakana(s) ? readingRaw : kata2hira(readingRaw);
        const base = h.basic_form && h.basic_form !== "*" ? h.basic_form : s;
        const headReading = kata2hira(h.reading && h.reading !== "*" ? h.reading : h.surface_form);
        const hit = findAI([base, s, h.surface_form], g.length === 1 ? r : headReading, n);
        const sung = hit?.sung && (!Array.isArray(hit.lines) || hit.lines.includes(n)) ? hit.sung : undefined;
        const out: SongWord = { s, kind: "word", base: hit?.base ?? base, r: r === s ? "" : r, sung, m: hit?.m, dict: hit?.dict };
        if (/^[A-Za-z0-9'’.,!?\- ]+$/.test(s) || (h.pos === "名詞" && h.pos_detail_1 === "固有名詞")) return { ...out, kind: "other" };
        if (h.pos === "助詞" || (h.pos === "助動詞" && g.length === 1)) return { ...out, kind: "grammar" };
        const w = matchWord(data, base, headReading, hit?.r, hit?.m || hit?.dict);
        if (w) {
          out.wid = w.id;
          wids.add(w.id);
        } else if (!hit) missing.add(base);
        return out;
      });
      lines.push({ n, text, note: notes.get(n), words: ws });
    }
  });
  return { lines, wids: [...wids], missing: [...missing], lineCountOff: !!ai?.lineCount && ai.lineCount !== n };
}

// ---------------------------------------------------------------- saving

const songKey = (id: string) => `song:${id}`;

export function allSongs(store: Store): Song[] {
  return Object.entries(store.items)
    .filter(([id, info]) => id.startsWith("song:") && info.song)
    .map(([, info]) => info.song!);
}

export function getSong(store: Store, id: string): Song | undefined {
  return store.items[songKey(id)]?.song;
}

export function saveSong(store: Store, song: Song, now = Date.now()) {
  store.items[songKey(song.id)] = { song, updated: now };
}

/** Removing a song leaves an empty entry behind, so another device's copy doesn't bring it back when merged. */
export function removeSong(store: Store, id: string, now = Date.now()) {
  store.items[songKey(id)] = { updated: now };
}

export function newSongId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ---------------------------------------------------------------- knowing and adding words

/** known / learning / new for a Nekko word, or "added" once you've put it at the front of your lessons. */
export type SongStage = "known" | "learning" | "new" | "added";

export function songStage(store: Store, k: Knowledge, wid: string): SongStage {
  const s = k.word(wid) ?? "new";
  if (s === "new" && itemInfo(store, "word", wid)?.queued && !isAdded(store, "word", wid)) return "added";
  return s;
}

/** Share of the song's Nekko words you know (each word once). */
export function songCoverage(k: Knowledge, song: Song): number | undefined {
  const ws = (song.wids ?? []).map((id) => k.word(id)).filter(Boolean);
  if (!ws.length) return;
  return ws.filter((s) => s === "known").length / ws.length;
}

/** Puts a word at the front of your new lessons, with its kanji you haven't studied just before it. */
export function queueWord(store: Store, data: Data, wid: string, now = Date.now()) {
  const w = data.words[wid];
  if (!w) return;
  const kanji = [...new Set([...w.w].filter((c) => isKanji(c) && data.kanji[c]))].filter(
    (c) => stageOf(store, "kanji", c) === "none" && !itemInfo(store, "kanji", c)?.status && !itemInfo(store, "kanji", c)?.queued,
  );
  kanji.forEach((c, i) => setItemInfo(store, "kanji", c, { queued: now - kanji.length + i }, now));
  setItemInfo(store, "word", wid, { queued: now }, now);
}

export function unqueueWord(store: Store, wid: string, now = Date.now()) {
  setItemInfo(store, "word", wid, { queued: undefined }, now);
}

/** Kanji in a word, for its card. */
export function kanjiOf(text: string): string[] {
  return [...new Set([...text].filter((c) => isKanji(c) && c !== "々"))];
}

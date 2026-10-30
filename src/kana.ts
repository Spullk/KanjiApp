// The kana, in the rows they're taught in, with every romaji spelling that counts as right.

import { toHiragana, toRomaji } from "wanakana";
import { hira } from "./data";

export type Script = "hira" | "kata";
export type KanaRow = { id: string; script: Script; kana: string[] };

const HIRA_ROWS: [string, string][] = [
  ["a", "あいうえお"],
  ["ka", "かきくけこ"],
  ["sa", "さしすせそ"],
  ["ta", "たちつてと"],
  ["na", "なにぬねの"],
  ["ha", "はひふへほ"],
  ["ma", "まみむめも"],
  ["ya", "やゆよ"],
  ["ra", "らりるれろ"],
  ["wa", "わをん"],
  ["ga", "がぎぐげご"],
  ["za", "ざじずぜぞ"],
  ["da", "だぢづでど"],
  ["ba", "ばびぶべぼ"],
  ["pa", "ぱぴぷぺぽ"],
];
// Combinations like きゃ aren't drilled: they're just き plus a small ゃ, so the rows above cover them.

/** Katakana-only sounds for foreign words, with their spellings (wanakana doesn't know these). */
const EXTRA: [string, string[]][] = [
  ["ティ", ["ti", "thi"]],
  ["ディ", ["di", "dhi"]],
  ["トゥ", ["tu", "twu"]],
  ["ドゥ", ["du", "dwu"]],
  ["デュ", ["dyu", "dhu"]],
  ["ファ", ["fa"]],
  ["フィ", ["fi"]],
  ["フェ", ["fe"]],
  ["フォ", ["fo"]],
  ["フュ", ["fyu"]],
  ["ウィ", ["wi"]],
  ["ウェ", ["we"]],
  ["ウォ", ["wo"]],
  ["ヴ", ["vu"]],
  ["シェ", ["she"]],
  ["ジェ", ["je"]],
  ["チェ", ["che"]],
  ["ツァ", ["tsa"]],
];
const EXTRA_ROMAJI = Object.fromEntries(EXTRA);

const split = (s: string) => (s.includes(" ") ? s.split(" ") : [...s]);
const kata = (s: string) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

export const KANA_ROWS: KanaRow[] = [
  ...HIRA_ROWS.map(([id, k]) => ({ id: `h-${id}`, script: "hira" as const, kana: split(k) })),
  ...HIRA_ROWS.map(([id, k]) => ({ id: `k-${id}`, script: "kata" as const, kana: split(kata(k)) })),
  { id: "k-ti", script: "kata", kana: EXTRA.slice(0, 5).map(([k]) => k) },
  { id: "k-fa", script: "kata", kana: EXTRA.slice(5, 10).map(([k]) => k) },
  { id: "k-wi", script: "kata", kana: EXTRA.slice(10).map(([k]) => k) },
];

/** Every kana, in teaching order. */
export const ALL_KANA: string[] = KANA_ROWS.flatMap((r) => r.kana);

export const rowOf = (k: string) => KANA_ROWS.find((r) => r.kana.includes(k))!;
export const scriptOf = (k: string): Script => (/[ァ-ヺ]/.test(k) ? "kata" : "hira");

/** The usual romaji for a kana: shi, tsu, fu, ti for ティ. */
export function romaji(k: string): string {
  return EXTRA_ROMAJI[k]?.[0] ?? toRomaji(k);
}

/** Whether typed romaji (any common spelling: shi or si, tsu or tu, o for を) is this kana. */
export function isRomajiFor(input: string, k: string): boolean {
  const got = input.trim().toLowerCase();
  if (!got) return false;
  if (EXTRA_ROMAJI[k]) return EXTRA_ROMAJI[k].includes(got);
  const h = hira(k);
  if (got === toRomaji(h) || toHiragana(got) === h) return true;
  // Sounds two kana share: を is said お, ぢ and づ are said じ and ず.
  return ({ を: "o", ぢ: "ji", づ: "zu" } as Record<string, string>)[h] === got;
}

/** The kana of the same script that typed romaji spells, if it isn't the one asked: for showing look-alikes. */
export function kanaFor(input: string, script: Script): string | undefined {
  const got = input.trim().toLowerCase();
  const extra = EXTRA.find(([, r]) => r.includes(got));
  if (script === "kata" && extra) return extra[0];
  const h = toHiragana(got);
  if (!/^[ぁ-ゖ]+$/.test(h)) return undefined;
  const k = script === "kata" ? kata(h) : h;
  return ALL_KANA.includes(k) ? k : undefined;
}

// Short meanings for the JMdict words Nekko's own word list doesn't have (public/dict/jmdict.json, written by
// scripts/build_dict.py). Songs use it so that every word has a definition, even when the AI skips one.
// It downloads once, the first time a page needs it, and the service worker keeps it offline.

import { hira, isKanji } from "./data";

/** [id, written forms "a|b", readings "a|b", meaning, flags ("c" common, "k" usually kana), part of speech]. */
type Row = [string, string, string, string, string, string];

export type DictWord = { id: string; w: string; r: string; m: string; common: boolean; pos: string };

export type Dict = { byForm: Map<string, DictWord[]>; byKana: Map<string, DictWord[]> };

let dict: Dict | undefined;
let loading: Promise<Dict> | undefined;

export function dictReady(): boolean {
  return !!dict;
}

export function makeDict(rows: Row[]): Dict {
  const byForm = new Map<string, DictWord[]>();
  const byKana = new Map<string, DictWord[]>();
  const add = (m: Map<string, DictWord[]>, k: string, w: DictWord) => {
    const list = m.get(k);
    if (list) list.push(w);
    else m.set(k, [w]);
  };
  for (const [id, forms, readings, m, flags, pos] of rows) {
    const fs = forms ? forms.split("|") : [];
    const rs = readings.split("|");
    const w: DictWord = { id, w: fs[0] ?? rs[0], r: rs[0], m, common: flags.includes("c"), pos };
    for (const f of fs) add(byForm, f, w);
    // A word written in kanji is found by its reading only when it's usually written in kana, or has no kanji.
    if (!fs.length || flags.includes("k")) for (const r of rs) add(byKana, hira(r), w);
  }
  return { byForm, byKana };
}

export function loadDict(): Promise<Dict> {
  if (dict) return Promise.resolve(dict);
  return (loading ??= fetch("dict/jmdict.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Row[]>;
    })
    .then((rows) => (dict = makeDict(rows)))
    .catch((e) => {
      loading = undefined;
      throw e;
    }));
}

const GRAMMAR_POS = new Set(["prt", "aux", "suf", "exp", ""]);

/** The best dictionary entry for a word as the song page split it: by written form (and reading), else by kana.
 * `want` is what the splitter says the word is: "grammar" prefers particles and endings, so は is the topic marker
 * and not 派; "v" or "adj" only takes verbs or adjectives, so a verb is never given a noun read the same way. */
export function lookupDict(d: Dict, base: string, reading: string, want?: "grammar" | "v" | "adj"): DictWord | undefined {
  const r = hira(reading);
  let list = d.byForm.get(base) ?? [];
  if (!list.length && ![...base].some(isKanji)) list = d.byKana.get(hira(base)) ?? [];
  if (want === "v" || want === "adj") list = list.filter((w) => w.pos === want);
  if (!list.length) return;
  const grammar = want === "grammar";
  const score = (w: DictWord) =>
    (r && w.r === r ? 4 : r && w.r.length > 1 && r.startsWith(w.r.slice(0, -1)) ? 2 : 0) +
    (grammar === GRAMMAR_POS.has(w.pos) ? 2 : 0) +
    (w.common ? 1 : 0);
  return list.reduce((best, w) => (score(w) > score(best) ? w : best));
}

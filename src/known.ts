// Working out which items you already know: by JLPT level, from a pasted list, or from WaniKani.

import { isJunkWord, type Data } from "./data";
import type { ItemKind } from "./srs";

export type ItemRef = { kind: ItemKind; key: string };

/** A JLPT level's kanji and the radicals they're built from. */
export function jlptItems(data: Data, level: number): ItemRef[] {
  const kanji = Object.values(data.kanji).filter((k) => k.jlpt === level).map((k) => k.c);
  const set = new Set(kanji);
  const radicals = Object.values(data.radicals).filter((r) => r.usedIn.some((c) => set.has(c))).map((r) => r.c);
  return [...radicals.map((key) => ({ kind: "radical" as const, key })), ...kanji.map((key) => ({ kind: "kanji" as const, key }))];
}

/** The most common word written each way, for matching words from elsewhere. Dictionary oddities never match. */
export function wordsBySpelling(data: Data): Map<string, string> {
  const out = new Map<string, string>();
  for (const w of Object.values(data.words)) {
    if (isJunkWord(w)) continue;
    const have = out.get(w.w);
    if (!have || w.rank < data.words[have].rank) out.set(w.w, w.id);
  }
  return out;
}

/** Every Jōyō kanji in the text, plus every whole word (separated by spaces, commas or new lines) Nekko knows. */
export function parseKnownList(data: Data, text: string): ItemRef[] {
  const out = new Map<string, ItemRef>();
  for (const ch of text) if (data.kanji[ch]) out.set(`kanji:${ch}`, { kind: "kanji", key: ch });
  const spelling = wordsBySpelling(data);
  for (const token of text.split(/[\s,、，;；・]+/)) {
    const id = spelling.get(token.trim());
    if (id) out.set(`word:${id}`, { kind: "word", key: id });
  }
  return [...out.values()];
}

// ---------------------------------------------------------------- WaniKani

const WK_API = "https://api.wanikani.com/v2";

/** Roughly how long WaniKani waits after each SRS stage (1–8), in days; stage 9 is burned. */
const WK_INTERVAL_DAYS = [0, 4 / 24, 8 / 24, 1, 2, 7, 14, 30, 120];

export type WaniKaniItem = ItemRef & { stage: number; availableAt: number | null };

type WkObject<T> = { id: number; object?: string; data: T };
type WkPage<T> = { data: WkObject<T>[]; pages: { next_url: string | null } };

async function wkGetAll<T>(url: string, token: string, fetcher: typeof fetch): Promise<WkObject<T>[]> {
  const out: WkObject<T>[] = [];
  for (let next: string | null = url; next; ) {
    const res = await fetcher(next, { headers: { Authorization: `Bearer ${token}`, "Wanikani-Revision": "20170710" } });
    if (res.status === 401) throw new Error("WaniKani didn't accept that token. Check you copied all of it.");
    if (!res.ok) throw new Error(`WaniKani answered ${res.status}. Try again in a minute.`);
    const page = (await res.json()) as WkPage<T>;
    out.push(...page.data);
    next = page.pages.next_url;
  }
  return out;
}

/** Everything you've started on WaniKani that Nekko also has, with its SRS stage. */
export async function fetchWaniKani(data: Data, token: string, fetcher: typeof fetch = fetch): Promise<WaniKaniItem[]> {
  const [assignments, subjects] = await Promise.all([
    wkGetAll<{ subject_id: number; srs_stage: number; available_at: string | null }>(
      `${WK_API}/assignments?started=true`,
      token,
      fetcher,
    ),
    wkGetAll<{ characters: string | null }>(`${WK_API}/subjects?types=radical,kanji,vocabulary,kana_vocabulary`, token, fetcher),
  ]);
  const subject = new Map(subjects.map((s) => [s.id, s]));
  const spelling = wordsBySpelling(data);
  const out = new Map<string, WaniKaniItem>();
  for (const { data: a } of assignments) {
    const s = subject.get(a.subject_id);
    const c = s?.data.characters;
    if (!c || !a.srs_stage) continue;
    // Each kind of subject only matches its own kind: WaniKani's radicals include katakana shapes (ト "toe",
    // ハ "fins"), which as words are dictionary oddities like ト "7th note of the scale".
    const vocab = s.object === "vocabulary" || s.object === "kana_vocabulary";
    const ref: ItemRef | null = vocab
      ? spelling.has(c)
        ? { kind: "word", key: spelling.get(c)! }
        : null
      : data.kanji[c]
        ? { kind: "kanji", key: c }
        : data.radicals[c]
          ? { kind: "radical", key: c }
          : null;
    if (!ref) continue;
    const id = `${ref.kind}:${ref.key}`;
    // WaniKani has the same character as a radical and a kanji (口); keep the stronger one.
    if (out.has(id) && out.get(id)!.stage >= a.srs_stage) continue;
    out.set(id, { ...ref, stage: a.srs_stage, availableAt: a.available_at ? Date.parse(a.available_at) : null });
  }
  return [...out.values()];
}

/** How a WaniKani stage carries over: burned items are known, the rest are scheduled about when WaniKani would. */
export function wkSchedule(item: WaniKaniItem, now: number): { known: true } | { stability: number; due: number } {
  if (item.stage >= 9) return { known: true };
  const stability = WK_INTERVAL_DAYS[item.stage];
  return { stability, due: item.availableAt ?? now + stability * 86_400_000 };
}

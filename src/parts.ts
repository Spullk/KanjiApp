// Finding a kanji by the parts it's made of, e.g. 氵 + 每 → 海.

import type { Data } from "./data";

type Index = { partsOf: Map<string, Set<string>>; byUse: string[] };

const indexes = new WeakMap<Data, Index>();

/** Every part inside a kanji or radical, parts of parts included. */
function collect(data: Data, c: string, out: Set<string>) {
  for (const p of (data.kanji[c] ?? data.radicals[c])?.parts ?? []) {
    if (p.c !== c && !out.has(p.c)) {
      out.add(p.c);
      collect(data, p.c, out);
    }
  }
  return out;
}

function indexFor(data: Data): Index {
  let ix = indexes.get(data);
  if (ix) return ix;
  const partsOf = new Map<string, Set<string>>();
  const uses = new Map<string, number>();
  for (const c of Object.keys(data.kanji)) {
    const parts = collect(data, c, new Set());
    partsOf.set(c, parts);
    for (const p of parts) uses.set(p, (uses.get(p) ?? 0) + 1);
  }
  const byUse = [...uses].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  ix = { partsOf, byUse };
  indexes.set(data, ix);
  return ix;
}

/** All parts, most used first. */
export function allParts(data: Data): string[] {
  return indexFor(data).byUse;
}

/** Kanji containing every one of `parts`, fewest strokes first. */
export function kanjiWithParts(data: Data, parts: string[]): string[] {
  if (!parts.length) return [];
  const { partsOf } = indexFor(data);
  return [...partsOf]
    .filter(([c, have]) => parts.every((p) => have.has(p) || p === c))
    .map(([c]) => c)
    .sort((a, b) => data.kanji[a].strokes - data.kanji[b].strokes || (data.kanji[a].freq ?? 9999) - (data.kanji[b].freq ?? 9999));
}

/** Parts that could still be added: those found in at least one of `kanji`. */
export function partsIn(data: Data, kanji: string[]): Set<string> {
  const { partsOf } = indexFor(data);
  const out = new Set<string>();
  for (const c of kanji) for (const p of partsOf.get(c) ?? []) out.add(p);
  return out;
}

/** The part's name, from the radical or kanji it is. */
export function partName(data: Data, p: string): string {
  return (data.radicals[p]?.meanings[0] ?? data.kanji[p]?.meanings[0] ?? "").replace(/ radical.*$/, "");
}

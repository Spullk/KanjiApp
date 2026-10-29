// The other ways to find a kanji on the Search tab: by its parts, or by drawing it.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useData } from "../data";
import { allParts, kanjiWithParts, partName, partsIn } from "../parts";
import { kanjiStrokePoints, recognize } from "../handwriting";
import type { Point } from "../strokes";
import { loadStrokes } from "./StrokeOrder";
import { Chips, Section } from "./bits";

const SHOWN_PARTS = 120;

/** Pick the parts you can see; the kanji containing all of them appear above. */
export function PartsLookup() {
  const data = useData();
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [all, setAll] = useState(false);
  const found = useMemo(() => kanjiWithParts(data, picked), [data, picked]);
  const possible = useMemo(() => (picked.length ? partsIn(data, found) : null), [data, found, picked]);
  const f = filter.trim().toLowerCase();
  const parts = allParts(data).filter((p) => !f || partName(data, p).toLowerCase().includes(f) || p === f);
  const shown = all || f ? parts : parts.slice(0, SHOWN_PARTS);
  const toggle = (p: string) => setPicked(picked.includes(p) ? picked.filter((x) => x !== p) : [...picked, p]);

  return (
    <>
      {picked.length > 0 && (
        <Section title={`${found.length} ${found.length === 1 ? "kanji" : "kanji"} with ${picked.join(" + ")}`}>
          <Chips items={found.slice(0, 60)} kind="kanji" />
          <button class="link-button" onClick={() => setPicked([])}>
            Clear parts
          </button>
        </Section>
      )}
      <input
        class="search-box small"
        type="search"
        placeholder="Filter parts by name: water, tree, person…"
        value={filter}
        onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
      />
      <div class="part-grid" lang="ja">
        {shown.map((p) => {
          const on = picked.includes(p);
          const off = !on && possible && !possible.has(p);
          return (
            <button key={p} class={`part${on ? " on" : ""}`} disabled={!!off} title={partName(data, p)} onClick={() => toggle(p)}>
              {p}
            </button>
          );
        })}
      </div>
      {!all && !f && parts.length > SHOWN_PARTS && (
        <button class="more" onClick={() => setAll(true)}>
          Show all {parts.length} parts
        </button>
      )}
    </>
  );
}

const BOX = 109;

/** Draw a kanji, in the usual stroke order; the closest matches update after each stroke. */
export function DrawLookup() {
  const svg = useRef<SVGSVGElement>(null);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [ink, setInk] = useState<Point[] | null>(null);
  const [kanji, setKanji] = useState<Map<string, Point[][]> | null>(null);
  useEffect(() => {
    kanjiStrokePoints(loadStrokes).then(setKanji);
  }, []);
  const matches = useMemo(() => (kanji ? recognize(strokes, kanji) : []), [kanji, strokes]);

  const toBox = (e: PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOX, ((e.clientY - r.top) / r.height) * BOX];
  };
  // Kept in a ref as well, so quick pointer events never see a stale stroke.
  const current = useRef<Point[] | null>(null);
  const down = (e: PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    current.current = [toBox(e)];
    setInk(current.current);
  };
  const move = (e: PointerEvent) => {
    if (!current.current) return;
    current.current = [...current.current, toBox(e)];
    setInk(current.current);
  };
  const up = () => {
    const s = current.current;
    current.current = null;
    if (s && s.length > 1) setStrokes((all) => [...all, s]);
    setInk(null);
  };

  return (
    <>
      <svg
        ref={svg}
        viewBox={`0 0 ${BOX} ${BOX}`}
        class="write-pad"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setInk(null)}
      >
        <g class="stroke-grid">
          <line x1="54.5" y1="0" x2="54.5" y2="109" />
          <line x1="0" y1="54.5" x2="109" y2="54.5" />
        </g>
        {[...strokes, ...(ink ? [ink] : [])].map((s, i) => (
          <polyline key={i} points={s.map((p) => p.join(",")).join(" ")} class="write-ink" />
        ))}
      </svg>
      <div class="draw-tools">
        <button class="secondary" disabled={!strokes.length} onClick={() => setStrokes(strokes.slice(0, -1))}>
          Undo stroke
        </button>
        <button class="secondary" disabled={!strokes.length} onClick={() => setStrokes([])}>
          Clear
        </button>
      </div>
      <div class="draw-results">
        {!kanji ? (
          <p class="hint">Getting the stroke data ready…</p>
        ) : matches.length ? (
          <Chips items={matches} kind="kanji" />
        ) : (
          <p class="hint">Draw a kanji above, stroke by stroke in the usual order. The closest matches show up here.</p>
        )}
      </div>
    </>
  );
}

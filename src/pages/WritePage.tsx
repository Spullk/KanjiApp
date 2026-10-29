import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useData, type Data } from "../data";
import { href } from "../router";
import { getStore, parseCardId } from "../srs";
import { checkStroke, type Point } from "../strokes";
import { loadStrokes } from "../components/StrokeOrder";
import { useNoScroll } from "../components/useNoScroll";

const BOX = 109;

/** Points along an SVG path, measured by the browser. */
function samplePath(d: string): Point[] {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  svg.style.position = "absolute";
  svg.style.visibility = "hidden";
  document.body.appendChild(svg);
  const len = path.getTotalLength();
  const pts = Array.from({ length: 32 }, (_, i) => {
    const p = path.getPointAtLength((len * i) / 31);
    return [p.x, p.y] as Point;
  });
  svg.remove();
  return pts;
}

/** A kanji to write next: one you're studying, else any N5 kanji. */
export function pickKanji(data: Data, not?: string): string {
  const studying = [...new Set(Object.keys(getStore().cards).filter((id) => id.startsWith("kanji:")).map((id) => parseCardId(id).key))];
  const pool = (studying.length ? studying : Object.values(data.kanji).filter((k) => k.jlpt === 5).map((k) => k.c)).filter((c) => c !== not);
  return pool[Math.floor(Math.random() * pool.length)] ?? "一";
}

export function WritePage({ c }: { c?: string }) {
  const data = useData();
  useEffect(() => {
    if (!c) location.replace(href.write(pickKanji(data)));
  }, [c]);
  return c ? <Writer key={c} c={c} /> : null;
}

function Writer({ c }: { c: string }) {
  const data = useData();
  const k = data.kanji[c];
  const [paths, setPaths] = useState<string[] | null>(null);
  const [done, setDone] = useState(0);
  const [ink, setInk] = useState<Point[] | null>(null);
  const [misses, setMisses] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [message, setMessage] = useState("");
  const [outline, setOutline] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
  useNoScroll(svg);

  useEffect(() => {
    loadStrokes().then((s) => setPaths(s[c] ?? []));
  }, [c]);
  const expected = useMemo(() => paths?.map(samplePath), [paths]);

  if (!k) return <p class="empty">No kanji {c}.</p>;
  if (!paths || !expected) return <p class="empty">Loading…</p>;
  if (!paths.length) return <p class="empty">There's no stroke order for {c} yet.</p>;
  const finished = done >= paths.length;

  const toBox = (e: PointerEvent): Point => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * BOX, ((e.clientY - r.top) / r.height) * BOX];
  };
  const down = (e: PointerEvent) => {
    if (finished) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setInk([toBox(e)]);
  };
  const move = (e: PointerEvent) => ink && setInk([...ink, toBox(e)]);
  const up = () => {
    if (!ink) return;
    const verdict = checkStroke(ink, expected[done]);
    setInk(null);
    if (verdict === "right") {
      setDone(done + 1);
      setMisses(0);
      setMessage("");
      return;
    }
    setMisses(misses + 1);
    setMistakes(mistakes + 1);
    setMessage(verdict === "backwards" ? "Right stroke, other direction." : misses + 1 >= 2 ? "Here's where it goes." : "Not quite. Try again.");
  };
  const restart = () => {
    setDone(0);
    setMisses(0);
    setMistakes(0);
    setMessage("");
  };

  return (
    <article class="page write">
      <div class="write-prompt">
        <div class="answer-main">{k.meanings.slice(0, 3).join(", ")}</div>
        {/* Readings only: the example words would give the kanji away. */}
        <div class="answer-sub" lang="ja">
          {k.readings.filter((r) => r.words.length).slice(0, 3).map((r) => r.r.replace(".", "")).join("・")}
        </div>
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${BOX} ${BOX}`}
        class={`write-pad ${message && !finished ? "miss" : ""}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => setInk(null)}
      >
        <g class="stroke-grid">
          <line x1="54.5" y1="0" x2="54.5" y2="109" />
          <line x1="0" y1="54.5" x2="109" y2="54.5" />
        </g>
        {(outline || finished) && paths.map((d, i) => <path key={i} d={d} class="write-outline" />)}
        {paths.slice(0, done).map((d, i) => (
          <path key={i} d={d} class="write-done" />
        ))}
        {!finished && misses >= 2 && (
          <>
            <path d={paths[done]} class="write-hint" />
            <circle cx={expected[done][0][0]} cy={expected[done][0][1]} r="3" class="write-start" />
          </>
        )}
        {ink && <polyline points={ink.map((p) => p.join(",")).join(" ")} class="write-ink" />}
      </svg>
      {finished ? (
        <div class="write-done-bar">
          <p class="hint">
            {mistakes ? `Done, with ${mistakes} ${mistakes === 1 ? "slip" : "slips"}.` : "Perfect, every stroke first try."}
          </p>
          <button class="secondary" onClick={restart}>
            Again
          </button>
          <a class="primary" href={href.write(pickKanji(data, c))}>
            Next kanji
          </a>
        </div>
      ) : (
        <>
          <p class="hint write-status">
            {message || `Stroke ${done + 1} of ${paths.length}`}
          </p>
          <label class="write-toggle">
            <input type="checkbox" checked={outline} onChange={(e) => setOutline((e.target as HTMLInputElement).checked)} /> Show
            the kanji faintly
          </label>
        </>
      )}
      <a class="more" href={href.kanji(c)}>
        Open {c}'s page
      </a>
    </article>
  );
}

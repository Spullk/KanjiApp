import { useEffect, useState } from "preact/hooks";

let strokes: Record<string, string[]> | null = null;

export async function loadStrokes() {
  strokes ??= (await import("../../data/strokes.json")).default as unknown as Record<string, string[]>;
  return strokes;
}

const STROKE_MS = 450;

/** KanjiVG stroke order: each stroke draws itself in turn, with its number at its start. */
export function StrokeOrder({ c }: { c: string }) {
  const [paths, setPaths] = useState<string[] | null>(strokes?.[c] ?? null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    loadStrokes().then((s) => setPaths(s[c] ?? []));
  }, [c]);
  if (!paths?.length) return null;

  return (
    <div class="strokes">
      <svg key={run} viewBox="0 0 109 109" class="stroke-svg" role="img" aria-label={`Stroke order of ${c}`}>
        <g class="stroke-grid">
          <line x1="54.5" y1="0" x2="54.5" y2="109" />
          <line x1="0" y1="54.5" x2="109" y2="54.5" />
        </g>
        {paths.map((d, i) => (
          <path key={i} d={d} pathLength={1} class="stroke" style={{ animationDelay: `${i * STROKE_MS}ms` }} />
        ))}
        {paths.map((d, i) => {
          const m = d.match(/^[Mm]\s*([\d.]+)[ ,]([\d.]+)/);
          return m ? (
            <text key={i} x={Number(m[1]) - 4} y={Number(m[2]) - 2} class="stroke-num">
              {i + 1}
            </text>
          ) : null;
        })}
      </svg>
      <button class="link-button" onClick={() => setRun(run + 1)}>
        Replay · {paths.length} strokes
      </button>
    </div>
  );
}

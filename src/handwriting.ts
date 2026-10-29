// Recognising a kanji drawn on screen by comparing it, stroke by stroke, with KanjiVG's strokes.
// Both drawings are scaled to the same box first, so size and position on the pad don't matter much.

import { pathPoints, resample, type Point } from "./strokes";

const N = 10;
const BOX = 109;
/** Score added for each stroke drawn more or fewer than the kanji has. */
const STROKE_PENALTY = 12;

/** Scales strokes to fill the 109 box, keeping their shape, then samples each one evenly. */
export function prepare(strokes: Point[][]): Point[][] {
  const pts = strokes.flat();
  if (!pts.length) return [];
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scale = (BOX * 0.85) / Math.max(x1 - x0, y1 - y0, 1);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return strokes.map((s) => resample(s.map(([x, y]): Point => [BOX / 2 + (x - cx) * scale, BOX / 2 + (y - cy) * scale]), N));
}

const mean = (a: Point[], b: Point[]) => a.reduce((sum, p, i) => sum + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;

/** Lower is closer. Strokes are compared in order; one drawn backwards costs a little extra. */
export function score(drawn: Point[][], kanji: Point[][]): number {
  const n = Math.min(drawn.length, kanji.length);
  if (!n) return Infinity;
  let total = 0;
  for (let i = 0; i < n; i++) total += Math.min(mean(drawn[i], kanji[i]), mean(drawn[i], [...kanji[i]].reverse()) + 6);
  return total / n + Math.abs(drawn.length - kanji.length) * STROKE_PENALTY;
}

/** The closest kanji to a drawing, best first. `kanji` holds each kanji's strokes already passed through prepare(). */
export function recognize(drawing: Point[][], kanji: Map<string, Point[][]>, top = 12): string[] {
  const d = prepare(drawing);
  if (!d.length) return [];
  return [...kanji]
    .filter(([, s]) => Math.abs(s.length - d.length) <= 2)
    .map(([c, s]) => [c, score(d, s)] as const)
    .sort((a, b) => a[1] - b[1])
    .slice(0, top)
    .map(([c]) => c);
}

let prepared: Promise<Map<string, Point[][]>> | null = null;

/** Every kanji's strokes as points, worked out once from the KanjiVG paths. */
export function kanjiStrokePoints(load: () => Promise<Record<string, string[]>>): Promise<Map<string, Point[][]>> {
  prepared ??= load().then((paths) => {
    const out = new Map<string, Point[][]>();
    for (const [c, ds] of Object.entries(paths)) if (ds.length) out.set(c, prepare(ds.map((d) => pathPoints(d))));
    return out;
  });
  return prepared;
}

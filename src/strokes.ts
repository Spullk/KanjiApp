// Checking a hand-drawn stroke against the KanjiVG stroke it should be. Points are in KanjiVG's 109×109 box.

export type Point = [number, number];

const SAMPLES = 16;
/** How far, on average, a drawn stroke may stray from the real one. */
const TOLERANCE = 14;

/** `n` points spaced evenly along a polyline. */
export function resample(points: Point[], n = SAMPLES): Point[] {
  if (points.length < 2) return Array.from({ length: n }, () => points[0] ?? [0, 0]);
  const seg = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  const total = seg.reduce((a, b) => a + b, 0);
  if (!total) return Array.from({ length: n }, () => points[0]);
  const out: Point[] = [];
  let i = 0;
  let walked = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (i < seg.length - 1 && walked + seg[i] < target) walked += seg[i++];
    const t = seg[i] ? Math.min(1, (target - walked) / seg[i]) : 0;
    const [a, b] = [points[i], points[i + 1]];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

const meanDistance = (a: Point[], b: Point[]) => a.reduce((sum, p, i) => sum + Math.hypot(p[0] - b[i][0], p[1] - b[i][1]), 0) / a.length;

export type StrokeVerdict = "right" | "backwards" | "wrong";

/** Whether a drawn stroke matches the expected one in place, shape and direction. */
export function checkStroke(drawn: Point[], expected: Point[]): StrokeVerdict {
  const d = resample(drawn);
  const e = resample(expected);
  if (meanDistance(d, e) <= TOLERANCE) return "right";
  if (meanDistance(d, [...e].reverse()) <= TOLERANCE) return "backwards";
  return "wrong";
}

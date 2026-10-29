import { useEffect, useState } from "preact/hooks";
import { hira, type Word } from "../data";
import { loadPitch, morae, pattern, patternName, pitchLoaded } from "../pitch";

/** The word's reading with a line over the high morae and a tick where the pitch falls. */
export function PitchAccent({ w, fallback }: { w: Word; fallback?: string }) {
  const [all, setAll] = useState(pitchLoaded());
  useEffect(() => {
    if (!all) loadPitch().then(setAll, () => {});
  }, []);
  const accents = all?.[w.id];
  if (!accents?.length) return fallback ? <span lang="ja">{fallback}</span> : null;
  const m = morae(hira(w.r));
  return (
    <span class="pitch-list">
      {accents.slice(0, 2).map((n) => {
        const p = pattern(n, m.length);
        return (
          <span key={n} class="pitch" title={`${patternName(n, m.length)} [${n}]`}>
            <span lang="ja">
              {m.map((mora, i) => (
                <span key={i} class={`${p[i] ? "hi" : "lo"}${p[i] && !p[i + 1] ? " drop" : ""}${!p[i] && p[i + 1] ? " rise" : ""}`}>
                  {mora}
                </span>
              ))}
            </span>
            <span class="pitch-name">{patternName(n, m.length)}</span>
          </span>
        );
      })}
    </span>
  );
}

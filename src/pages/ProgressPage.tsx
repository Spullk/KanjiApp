import { useData } from "../data";
import { href } from "../router";
import { STAGE_LABEL, stageOf, useStore, type ItemKind, type Stage } from "../srs";
import { Section } from "../components/bits";

const STAGES: Stage[] = ["mature", "young", "learning", "none"];
const DAY = 86_400_000;

function dayKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function ProgressPage() {
  const data = useData();
  const store = useStore();
  const now = Date.now();

  const count = (kind: ItemKind, keys: string[]) => {
    const c: Record<Stage, number> = { mature: 0, young: 0, learning: 0, none: 0 };
    for (const k of keys) c[stageOf(store, kind, k)]++;
    return c;
  };
  const kanjiKeys = data.lessons.flatMap((l) => l.kanji);
  const rows: [string, ItemKind, string[]][] = [
    ["Radicals", "radical", data.lessons.flatMap((l) => l.radicals)],
    ["Kanji", "kanji", kanjiKeys],
    ["Review words", "word", data.lessons.flatMap((l) => l.words)],
  ];
  const levels = [5, 4, 3, 2, 1, null].map((n) => ({
    label: n ? `N${n}` : "Other Jōyō",
    keys: kanjiKeys.filter((k) => data.kanji[k].jlpt === n),
  }));

  // Reviews per day and streak.
  const perDay = new Map<string, number>();
  for (const [, , t] of store.log) perDay.set(dayKey(t), (perDay.get(dayKey(t)) ?? 0) + 1);
  let streak = 0;
  for (let t = perDay.has(dayKey(now)) ? now : now - DAY; perDay.has(dayKey(t)); t -= DAY) streak++;
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const end = new Date(now + i * DAY);
    end.setHours(23, 59, 59, 999);
    const start = i === 0 ? -Infinity : end.getTime() - DAY;
    return Object.values(store.cards).filter((c) => c.due > start && c.due <= end.getTime()).length;
  });

  return (
    <article class="page">
      <div class="page-head">
        <h1>Progress</h1>
        <a class="settings-link" href={href.settings()}>
          Settings
        </a>
      </div>
      <div class="stat-tiles">
        <Tile n={forecast[0]} label="due today" />
        <Tile n={perDay.get(dayKey(now)) ?? 0} label="reviewed today" />
        <Tile n={streak} label={streak === 1 ? "day streak" : "days streak"} />
      </div>

      <Section title="What you know" hint="Known means every card for it holds for 3+ weeks.">
        {rows.map(([label, kind, keys]) => (
          <StageBar key={label} label={label} counts={count(kind, keys)} total={keys.length} />
        ))}
      </Section>

      <Section title="Kanji by JLPT level">
        {levels.map((l) => (
          <StageBar key={l.label} label={l.label} counts={count("kanji", l.keys)} total={l.keys.length} />
        ))}
      </Section>

      <Section title="Next 7 days">
        <div class="forecast">
          {forecast.map((n, i) => (
            <div class="fc-day" key={i}>
              <div class="fc-bar" style={{ height: `${Math.min(100, (n / Math.max(1, ...forecast)) * 100)}%` }} />
              <div class="fc-n">{n}</div>
              <div class="fc-label">{i === 0 ? "Today" : new Date(now + i * DAY).toLocaleDateString(undefined, { weekday: "short" })}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="All kanji" hint="In lesson order. Tap one to open it.">
        <div class="kanji-grid" lang="ja">
          {kanjiKeys.map((k) => (
            <a key={k} class={`kg ${stageOf(store, "kanji", k)}`} href={href.kanji(k)}>
              {k}
            </a>
          ))}
        </div>
      </Section>

    </article>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div class="tile">
      <div class="tile-n">{n}</div>
      <div class="tile-label">{label}</div>
    </div>
  );
}

function StageBar({ label, counts, total }: { label: string; counts: Record<Stage, number>; total: number }) {
  const studied = total - counts.none;
  return (
    <div class="stage-bar">
      <div class="sb-head">
        <span>{label}</span>
        <span class="sb-num">
          {counts.mature} known · {studied} / {total} studied
        </span>
      </div>
      <div class="sb-track">
        {STAGES.filter((s) => s !== "none").map((s) =>
          counts[s] ? <div key={s} class={`sb-seg ${s}`} style={{ width: `${(counts[s] / total) * 100}%` }} title={STAGE_LABEL[s]} /> : null,
        )}
      </div>
    </div>
  );
}

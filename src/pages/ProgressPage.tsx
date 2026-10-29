import { useData } from "../data";
import { href } from "../router";
import { isLeech, PRACTICE_LABEL, practiceCards, STAGE_LABEL, stageOf, useStore, type ItemKind, type PracticeSet, type Stage } from "../srs";
import { Chip, Section, WordRow } from "../components/bits";
import { accuracyByType, DAY, dayKey, duration, hardestItems, heatmap, percent, reviewsPerDay, streak as streakOf, timeSpent, type Accuracy } from "../stats";

const STAGES: Stage[] = ["mature", "young", "learning", "none"];

const TYPE_LABEL: [string, string][] = [
  ["radical:meaning", "Radical names"],
  ["kanji:meaning", "Kanji meanings"],
  ["kanji:reading", "Kanji readings"],
  ["kanji:both", "Kanji (meaning + reading)"],
  ["word:word", "Words"],
  ["word:recall", "English → Japanese"],
  ["word:listen", "Listening"],
];

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

  const leeches = [
    ...new Set(Object.keys(store.cards).map((id) => id.slice(0, id.lastIndexOf(":")))),
  ]
    .map((id) => id.split(":") as [ItemKind, string])
    .filter(([kind, key]) => isLeech(store, kind, key));

  const perDay = reviewsPerDay(store.log);
  const streak = streakOf(perDay, now);
  const monthAgo = now - 30 * DAY;
  const acc = accuracyByType(store.log, monthAgo);
  const accAll = Object.values(acc).reduce<Accuracy>((a, b) => ({ right: a.right + b.right, total: a.total + b.total }), { right: 0, total: 0 });
  const hardest = hardestItems(store.log, 12).map(({ item, acc }) => ({ ...item_(item), acc }));
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

      <Section title="Extra practice" hint="Go over these as often as you like. It doesn't change when anything is due.">
        <div class="practice-links">
          {(["mistakes", "leeches", "recent"] as PracticeSet[]).map((set) => {
            const n = practiceCards(store, set, now).length;
            return (
              <a key={set} class={n ? "" : "quiet"} href={href.practice(set)}>
                <b>{n}</b>
                {PRACTICE_LABEL[set]}
              </a>
            );
          })}
          <a href={href.write()}>
            <b>筆</b>
            Writing
          </a>
          <a href={href.read()}>
            <b>読</b>
            Reading
          </a>
        </div>
      </Section>

      {store.log.length > 0 && (
        <Section title="Last 30 days">
          <div class="stat-tiles">
            <Tile n={accAll.total} label="answers" />
            <Tile n={percent(accAll)} label="right first time" />
            <Tile n={duration(timeSpent(store.log, monthAgo))} label="spent reviewing" />
          </div>
          <table class="acc-table">
            <tbody>
              {TYPE_LABEL.filter(([t]) => acc[t]).map(([t, label]) => (
                <tr key={t}>
                  <td>{label}</td>
                  <td>{acc[t].total} answers</td>
                  <td class="acc-pct">{percent(acc[t])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p class="hint">Today: {duration(timeSpent(store.log, new Date(now).setHours(0, 0, 0, 0)))}. Time is worked out from the gaps between your answers.</p>
        </Section>
      )}

      <Section title="Review calendar">
        <Heatmap perDay={perDay} now={now} />
      </Section>

      {leeches.length > 0 && (
        <Section title="Leeches" hint="Items you've forgotten 8 or more times. A note on the item's page often helps.">
          <div class="chips" lang="ja">
            {leeches.map(([kind, key]) => kind !== "word" && <Chip key={`${kind}:${key}`} c={key} kind={kind} />)}
          </div>
          {leeches.map(([kind, key]) => kind === "word" && <WordRow key={key} id={key} />)}
        </Section>
      )}

      {hardest.length > 0 && (
        <Section title="Hardest items" hint="What you miss most often, from all your answers.">
          <div class="chips" lang="ja">
            {hardest.map(({ kind, key, acc }) => kind !== "word" && <Chip key={key} c={key} kind={kind} note={`${percent(acc)} right`} />)}
          </div>
          {hardest.map(
            ({ kind, key, acc }) =>
              kind === "word" && (
                <div class="hard-row" key={key}>
                  <WordRow id={key} />
                  <span class="acc-pct">{percent(acc)}</span>
                </div>
              ),
          )}
        </Section>
      )}

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

function item_(item: string): { kind: ItemKind; key: string } {
  const [kind, key] = item.split(":") as [ItemKind, string];
  return { kind, key };
}

function Heatmap({ perDay, now }: { perDay: Map<string, number>; now: number }) {
  const weeks = heatmap(perDay, now);
  const max = Math.max(1, ...weeks.flat().map((c) => c.n));
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  return (
    <>
      <div class="heatmap" style={{ gridTemplateColumns: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((col, i) => (
          <div class="hm-col" key={i}>
            {col.map((c) => (
              <div
                key={c.t}
                class={`hm-cell l${level(c.n)}${c.future ? " future" : ""}${dayKey(c.t) === dayKey(now) ? " today" : ""}`}
                title={`${new Date(c.t).toLocaleDateString()}: ${c.n} ${c.n === 1 ? "review" : "reviews"}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div class="hm-legend">
        <span>{new Date(weeks[0][0].t).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
        <span class="hm-scale">
          Less
          {[0, 1, 2, 3, 4].map((l) => (
            <i key={l} class={`hm-cell l${l}`} />
          ))}
          More
        </span>
      </div>
    </>
  );
}

function Tile({ n, label }: { n: number | string; label: string }) {
  return (
    <div class="tile">
      <div class={String(n).length > 5 ? "tile-n long" : "tile-n"}>{n}</div>
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

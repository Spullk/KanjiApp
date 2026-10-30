import { useState } from "preact/hooks";
import { href } from "../router";
import { getStore, update, useStore } from "../srs";
import { KANA_ROWS, romaji, type Script } from "../kana";
import { addKana, answerKana, drillKana, drillOf, kanaStrength, nextKana, removeKana } from "../kanaDrill";
import { speak } from "../audio";
import { Section } from "../components/bits";
import { KanaQuestion } from "../components/KanaQuestion";

const SCRIPT_LABEL: Record<Script | "both", string> = { hira: "Hiragana", kata: "Katakana", both: "Both" };
const SESSION = 20;

/** The kana chart and the practise buttons. */
export function KanaPage() {
  const store = useStore();
  const [missed, setMissed] = useState(false);
  const [listen, setListen] = useState(false);
  const counts = (["hira", "kata", "both"] as const).map((script) => [script, drillKana(store, { script, missed }).length] as const);

  return (
    <article class="page">
      <h1>Kana</h1>
      <p class="hint">
        Learn a row, then drill whenever you like. There's no schedule: kana you get right move further back in the
        queue, ones you miss come back in a few cards.
      </p>
      <Section title="Practise">
        <div class="practice-links">
          {counts.map(([script, n]) => (
            <a key={script} class={n ? "" : "quiet"} href={n ? href.kanaPractice(script, { missed, listen }) : undefined}>
              <b>{n}</b>
              {SCRIPT_LABEL[script]}
            </a>
          ))}
        </div>
        <label class="check-row">
          <input type="checkbox" checked={missed} onChange={() => setMissed(!missed)} /> Only kana I've missed
        </label>
        <label class="check-row">
          <input type="checkbox" checked={listen} onChange={() => setListen(!listen)} /> Listening: hear it (computer voice), type it
        </label>
      </Section>
      {(["hira", "kata"] as const).map((script) => (
        <KanaChart key={script} script={script} />
      ))}
    </article>
  );
}

function KanaChart({ script }: { script: Script }) {
  const store = useStore();
  const rows = KANA_ROWS.filter((r) => r.script === script);
  const all = rows.flatMap((r) => r.kana);
  const left = all.filter((k) => !drillOf(store, k));
  return (
    <Section title={SCRIPT_LABEL[script]}>
      <div class="kana-chart" lang="ja">
        {rows.map((r) => {
          const started = r.kana.some((k) => drillOf(store, k));
          return (
            <a key={r.id} class="kana-row" href={href.kanaRow(r.id)}>
              {r.kana.map((k) => (
                <span key={k} class={`kana-cell ${kanaStrength(drillOf(store, k))}`}>
                  {k}
                </span>
              ))}
              {!started && <span class="kana-learn">Learn</span>}
            </a>
          );
        })}
      </div>
      {left.length > 0 && (
        <button class="link-button" onClick={() => update((s) => addKana(s, left, Date.now(), true))}>
          I already know all {SCRIPT_LABEL[script].toLowerCase()}
        </button>
      )}
    </Section>
  );
}

/** One row to learn: each kana with its sound, then into the drill. */
export function KanaRowPage({ id }: { id: string }) {
  const store = useStore();
  const i = KANA_ROWS.findIndex((r) => r.id === id);
  const row = KANA_ROWS[i];
  if (!row) return <p class="empty">No such row.</p>;
  const next = KANA_ROWS[i + 1]?.script === row.script ? KANA_ROWS[i + 1] : undefined;
  const inDrill = row.kana.every((k) => drillOf(store, k));
  const practise = () => {
    update((s) => addKana(s, row.kana));
    location.hash = href.kanaPractice(row.script);
  };

  return (
    <article class="page">
      <h1>
        {SCRIPT_LABEL[row.script]}: <span lang="ja">{row.kana[0]}</span> row
      </h1>
      <p class="hint">Tap each one to hear it (computer voice). Say it out loud, then practise.</p>
      <div class="kana-learn-grid" lang="ja">
        {row.kana.map((k) => (
          <button key={k} class="kana-tile" onClick={() => speak(k)}>
            <span class="kana-tile-k">{k}</span>
            <span class="kana-tile-r">{romaji(k)}</span>
          </button>
        ))}
      </div>
      <button class="primary wide" onClick={practise}>
        {inDrill ? "Practise now" : "Add to my drill and practise"}
      </button>
      <div class="kana-row-links">
        {inDrill && (
          <button class="link-button" onClick={() => update((s) => removeKana(s, row.kana))}>
            Take out of my drill
          </button>
        )}
        {next && (
          <a class="more" href={href.kanaRow(next.id)}>
            Next row: <span lang="ja">{next.kana.slice(0, 3).join(" ")}</span> →
          </a>
        )}
      </div>
    </article>
  );
}

/** A drill session: 20 kana from the front of the queue, then keep going or stop. */
export function KanaPracticePage({ script, missed, listen }: { script: Script | "both"; missed: boolean; listen: boolean }) {
  const filter = { script, missed };
  const [current, setCurrent] = useState(() => nextKana(getStore(), filter));
  const [turn, setTurn] = useState(0);
  const [right, setRight] = useState(0);
  const [goal, setGoal] = useState(SESSION);

  if (!current) {
    return (
      <p class="empty">
        Nothing to practise here yet. <a href={href.kana()}>Learn a row first</a>.
      </p>
    );
  }
  if (turn >= goal) {
    return (
      <article class="page review-done">
        <h1>
          {right} of {turn} right
        </h1>
        <button class="primary wide" onClick={() => setGoal(goal + SESSION)}>
          Keep going
        </button>
        <a class="more" href={href.kana()}>
          Back to kana
        </a>
      </article>
    );
  }

  const answer = (ok: boolean) => {
    update((s) => answerKana(s, current, ok));
    setCurrent(nextKana(getStore(), filter, current));
    setTurn(turn + 1);
    if (ok) setRight(right + 1);
  };

  return (
    <article class="page review">
      <div class="review-count">
        {SCRIPT_LABEL[script]}
        {missed && " · missed ones"} · {turn + 1} of {goal}
      </div>
      <KanaQuestion kana={current} turn={turn} listen={listen} onAnswer={answer} />
    </article>
  );
}

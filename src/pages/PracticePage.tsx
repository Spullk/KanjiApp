import { useMemo, useState } from "preact/hooks";
import { href } from "../router";
import { getStore, PRACTICE_LABEL, practiceCards, useStore, type PracticeSet } from "../srs";
import { Section } from "../components/bits";
import { CardBack, CardFront } from "../cards";

/** Extra study: go through a set of cards as often as you like. Nothing here changes when they're due. */
export function PracticePage({ set }: { set: PracticeSet }) {
  const start = useMemo(() => shuffle(practiceCards(getStore(), set)), [set]);
  const [queue, setQueue] = useState(start);
  const [shown, setShown] = useState(false);
  const [missed, setMissed] = useState(0);
  const current = queue[0];

  const next = (gotIt: boolean) => {
    setQueue((q) => (gotIt ? q.slice(1) : [...q.slice(1), q[0]]));
    if (!gotIt) setMissed((m) => m + 1);
    setShown(false);
  };

  if (!current) {
    return (
      <article class="page review-done">
        <h1>{start.length ? "Practice done" : "Nothing to practise"}</h1>
        <p class="hint">
          {start.length
            ? `${start.length} ${start.length === 1 ? "card" : "cards"}, ${missed} ${missed === 1 ? "slip" : "slips"} along the way. Your review schedule hasn't changed.`
            : `There's nothing in ${PRACTICE_LABEL[set].toLowerCase()} right now.`}
        </p>
        <a class="primary wide" href={href.extra()}>
          Back to extra practice
        </a>
      </article>
    );
  }

  return (
    <article class="page review">
      <div class="review-count">
        {PRACTICE_LABEL[set]} · {queue.length} left · doesn't affect reviews
      </div>
      <CardFront id={current} />
      {shown ? (
        <>
          <CardBack id={current} note={getStore().items[current.slice(0, current.lastIndexOf(":"))]?.note} />
          <div class="grade-buttons two">
            <button class="grade g1" onClick={() => next(false)}>
              <span>Missed it</span>
              <small>see it again</small>
            </button>
            <button class="grade g3" onClick={() => next(true)}>
              <span>Got it</span>
            </button>
          </div>
        </>
      ) : (
        <button class="primary wide reveal" onClick={() => setShown(true)}>
          Show answer
        </button>
      )}
    </article>
  );
}

/** The Extra practice tool: the sets to go over, and writing. */
export function ExtraPracticePage() {
  const store = useStore();
  const now = Date.now();
  return (
    <article class="page">
      <h1>Extra practice</h1>
      <p class="hint">Go over these as often as you like. It doesn't change when anything is due.</p>
      <Section title="Practise">
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
        </div>
      </Section>
    </article>
  );
}

export function shuffle<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

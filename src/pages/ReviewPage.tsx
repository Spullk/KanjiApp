import { useEffect, useState } from "preact/hooks";
import { href } from "../router";
import { dueCards, getStore, grade, itemInfo, parseCardId, preview, Rating, undoLast, update, useStore, type Grade } from "../srs";
import { CardBack, CardFront } from "../cards";
import { tap } from "../native";
import { relTime, shortInterval } from "../components/ItemCards";

const EARLY_WINDOW = 20 * 60 * 1000; // learning steps due within 20 min can be done now
const BUTTONS: [Grade, string][] = [
  [Rating.Again, "Again"],
  [Rating.Hard, "Hard"],
  [Rating.Good, "Good"],
  [Rating.Easy, "Easy"],
];

export function ReviewPage() {
  const store = useStore();
  const [early, setEarly] = useState(false);
  const [done, setDone] = useState(0);
  const [undone, setUndone] = useState<string>();
  const now = Date.now();
  const queue = dueCards(store, early ? now + EARLY_WINDOW : now);
  // A card whose answer was just taken back is asked again straight away.
  const current = undone && queue.includes(undone) ? undone : queue[0];

  const answer = (g: Grade) => {
    tap(g === Rating.Again);
    update((s) => grade(s, current, g));
    setUndone(undefined);
    setDone((d) => d + 1);
  };

  const undo = () => {
    let id: string | undefined;
    update((s) => void (id = undoLast(s)));
    setUndone(id);
    setDone((d) => Math.max(0, d - 1));
  };
  const undoButton = done > 0 && store.undo.length > 0 && (
    <button class="link-button" onClick={undo}>
      Undo last answer
    </button>
  );

  if (!current) {
    const soon = dueCards(store, now + EARLY_WINDOW).length;
    const next = Math.min(...Object.values(store.cards).map((c) => c.due));
    return (
      <article class="page review-done">
        <h1>{done ? `Nice, ${done} done` : "All caught up"}</h1>
        {undoButton}
        {soon > 0 && (
          <button class="primary wide" onClick={() => setEarly(true)}>
            Review {soon} learning {soon === 1 ? "card" : "cards"} early
          </button>
        )}
        {isFinite(next) && <p class="hint">Next review {relTime(next)}.</p>}
        <a class="primary wide" href={href.learn()}>
          Learn new items
        </a>
      </article>
    );
  }

  // How you answer. Self-grading is the only mode so far; typed answers will be another component with the
  // same props, chosen in Settings.
  const Answer = SelfGrade;
  return (
    <article class="page review">
      <div class="review-count">
        {queue.length} left{done > 0 && ` · ${done} done`} {undoButton}
      </div>
      <CardFront id={current} />
      <Answer key={`${current}#${done}`} id={current} onAnswer={answer} />
    </article>
  );
}

type AnswerProps = { id: string; onAnswer: (g: Grade) => void };

/** Anki style: show the answer, then say how well you knew it. */
function SelfGrade({ id, onAnswer }: AnswerProps) {
  const [shown, setShown] = useState(false);
  const store = useStore();
  const { kind, key } = parseCardId(id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
        onAnswer(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!shown) {
    return (
      <button class="primary wide reveal" onClick={() => setShown(true)}>
        Show answer
      </button>
    );
  }
  const times = preview(getStore(), id);
  return (
    <>
      <CardBack id={id} note={itemInfo(store, kind, key)?.note} />
      <div class="grade-buttons">
        {BUTTONS.map(([g, label]) => (
          <button key={g} class={`grade g${g}`} onClick={() => onAnswer(g)}>
            <span>{label}</span>
            <small>{shortInterval(times[g])}</small>
          </button>
        ))}
      </div>
    </>
  );
}

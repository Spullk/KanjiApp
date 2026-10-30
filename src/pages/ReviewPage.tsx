import { useState } from "preact/hooks";
import { href } from "../router";
import { dueCards, grade, Rating, undoLast, update, useStore, type Grade } from "../srs";
import { CardFront } from "../cards";
import { SelfGrade, TypedAnswer } from "../components/AnswerModes";
import { tap } from "../native";
import { relTime } from "../components/ItemCards";

const EARLY_WINDOW = 20 * 60 * 1000; // learning steps due within 20 min can be done now

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
    // The soonest card that will actually be asked (not paused, not a card type you switched off).
    const next = dueCards(store, Infinity).reduce((t, id) => Math.min(t, store.cards[id].due), Infinity);
    return (
      <article class="page review-done">
        <h1>{store.settings.vacation ? "On vacation" : done ? `Nice, ${done} done` : "All caught up"}</h1>
        {store.settings.vacation && (
          <p class="hint">
            Reviews are paused. Switch vacation mode off in <a href={href.settings()}>Settings</a> when you're back.
          </p>
        )}
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

  const Answer = store.settings.answerMode === "typed" ? TypedAnswer : SelfGrade;
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

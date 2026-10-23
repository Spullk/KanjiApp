import { useEffect, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { dueCards, getStore, grade, parseCardId, preview, Rating, undoLast, update, useStore, type Grade } from "../srs";
import { Furigana, WordSpeak } from "../components/bits";
import { tap } from "../native";
import { MainReadings, ReadingUse, relTime, shortInterval } from "../components/ItemCards";

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
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const [undone, setUndone] = useState<string>();
  const now = Date.now();
  const queue = dueCards(store, early ? now + EARLY_WINDOW : now);
  // A card whose answer was just taken back is asked again straight away.
  const current = undone && queue.includes(undone) ? undone : queue[0];

  const answer = (g: Grade) => {
    tap(g === Rating.Again);
    update((s) => grade(s, current, g));
    setShown(false);
    setUndone(undefined);
    setDone((d) => d + 1);
  };

  const undo = () => {
    let id: string | undefined;
    update((s) => void (id = undoLast(s)));
    setUndone(id);
    setShown(false);
    setDone((d) => Math.max(0, d - 1));
  };
  const undoButton = done > 0 && store.undo.length > 0 && (
    <button class="link-button" onClick={undo}>
      Undo last answer
    </button>
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current) return;
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
        answer(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  const times = shown ? preview(getStore(), current) : null;
  return (
    <article class="page review">
      <div class="review-count">
        {queue.length} left{done > 0 && ` · ${done} done`} {undoButton}
      </div>
      <CardFront id={current} />
      {shown ? (
        <>
          <CardBack id={current} />
          <div class="grade-buttons">
            {BUTTONS.map(([g, label]) => (
              <button key={g} class={`grade g${g}`} onClick={() => answer(g)}>
                <span>{label}</span>
                <small>{shortInterval(times![g])}</small>
              </button>
            ))}
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

function CardFront({ id }: { id: string }) {
  const { words } = useData();
  const { kind, key, face } = parseCardId(id);
  const prompt =
    kind === "radical" ? "Radical · name?" : face === "meaning" ? "Kanji · meaning?" : face === "reading" ? "Kanji · readings?" : "Word · reading and meaning?";
  return (
    <div class={`card-front ${kind}`}>
      <div class="card-prompt">{prompt}</div>
      <div class={kind === "word" ? "card-word" : "card-char"} lang="ja">
        {kind === "word" ? words[key].w : key}
      </div>
    </div>
  );
}

function CardBack({ id }: { id: string }) {
  const { kanji, radicals, words } = useData();
  const { kind, key, face } = parseCardId(id);
  let body;
  let link;
  if (kind === "radical") {
    body = <div class="answer-main">{radicals[key].meanings.join(", ") || "(no name)"}</div>;
    link = href.radical(key);
  } else if (kind === "kanji") {
    const k = kanji[key];
    body =
      face === "meaning" ? (
        <>
          <div class="answer-main">{k.meanings.slice(0, 4).join(", ")}</div>
          <MainReadings c={key} max={2} />
        </>
      ) : (
        <>
          <MainReadings c={key} max={4} />
          <div class="answer-sub">{k.meanings.slice(0, 3).join(", ")}</div>
        </>
      );
    link = href.kanji(key);
  } else {
    const w = words[key];
    body = (
      <>
        <div class="answer-word" lang="ja">
          <Furigana segments={w.furigana} link={false} /> <WordSpeak w={w} />
        </div>
        <div class="answer-main">{w.senses.slice(0, 2).map((s) => s.gloss.slice(0, 3).join(", ")).join("; ")}</div>
        <ReadingUse id={key} />
      </>
    );
    link = href.word(key);
  }
  return (
    <div class="card-back">
      {body}
      <a class="more" href={link}>
        Open full page
      </a>
    </div>
  );
}

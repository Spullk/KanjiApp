import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { addItem, getStore, isAdded, newLeftToday, nextToLearn, update, useStore } from "../srs";
import { ItemSummary } from "../components/ItemCards";
import { knowledge, newWords, useStories } from "../stories";

/** The next items to learn, or with `story` that story's new words, most used first. They come one at a time:
 * each is added to your reviews as you move past it, so leaving halfway keeps what you've seen. */
export function LearnPage({ story }: { story?: string }) {
  const data = useData();
  const store = useStore();
  const info = useStories(!!story)?.find((s) => s.id === story);
  // Freeze the batch size when the page opens: it shrinks the daily allowance as you go, and the batch mustn't shift.
  const [n] = useState(() => Math.min(store.settings.batch, newLeftToday(store)));
  const fresh = useMemo(
    () =>
      story
        ? info
          ? newWords(knowledge(getStore(), data), info).slice(0, n).map((key) => ({ kind: "word" as const, key }))
          : []
        : nextToLearn(getStore(), data, n),
    [data, n, story, info],
  );
  // Once there is a batch it stays put, even as adding its items changes what "next to learn" would be.
  const frozen = useRef<typeof fresh>();
  if (!frozen.current && fresh.length) frozen.current = fresh;
  const batch = frozen.current ?? fresh;
  const [i, setI] = useState(0);
  const it = batch[i];
  const last = i === batch.length - 1;

  const next = () => {
    if (!it) return;
    update((s) => void (isAdded(s, it.kind, it.key) || addItem(s, it.kind, it.key)));
    if (last) location.hash = href.review();
    else {
      setI(i + 1);
      scrollTo(0, 0);
    }
  };
  const back = () => i > 0 && setI(i - 1);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as Element)?.closest?.("input, textarea")) return;
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!n) {
    return (
      <p class="empty">
        That's today's {store.settings.dailyNew} new items. More tomorrow, or raise the limit in <a href={href.settings("learning")}>Settings</a>.
      </p>
    );
  }
  if (story && !info) return <p class="loading">Loading story…</p>;
  if (!it) {
    return <p class="empty">{story ? "You've started every word in this story. Happy reading!" : "You've added everything. Impressive."}</p>;
  }

  const link = it.kind === "radical" ? href.radical(it.key) : it.kind === "kanji" ? href.kanji(it.key) : href.word(it.key);
  return (
    <article class="page learn-one">
      <div class="learn-head">
        <span class="hint">{info ? `New words from ${info.title}` : "New"} · {i + 1} of {batch.length}</span>
        <div class="learn-dots" aria-hidden="true">
          {batch.map((_, j) => (
            <i key={j} class={j < i ? "seen" : j === i ? "on" : ""} />
          ))}
        </div>
      </div>
      <ItemSummary key={`${it.kind}:${it.key}`} kind={it.kind} k={it.key} />
      <a class="link-button" href={link}>
        See everything about it
      </a>
      <div class="answer-bar learn-bar">
        {i > 0 && (
          <button class="secondary" onClick={back}>
            Back
          </button>
        )}
        <button class="primary" onClick={next}>
          {last ? "Start reviews" : "Got it, next"}
        </button>
      </div>
    </article>
  );
}

import { useMemo } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { addItem, getStore, newLeftToday, nextToLearn, update, useStore } from "../srs";
import { ItemSummary } from "../components/ItemCards";
import { knowledge, newWords, useStories } from "../stories";

/** The next items to learn, or with `story` that story's new words, most used first. */
export function LearnPage({ story }: { story?: string }) {
  const data = useData();
  const store = useStore();
  const info = useStories(!!story)?.find((s) => s.id === story);
  // Freeze the batch when the page opens, so it doesn't shift while you read it.
  const left = newLeftToday(store);
  const n = Math.min(store.settings.batch, left);
  const batch = useMemo(
    () =>
      story
        ? info
          ? newWords(knowledge(getStore(), data), info).slice(0, n).map((key) => ({ kind: "word" as const, key }))
          : []
        : nextToLearn(getStore(), data, n),
    [data, n, story, info],
  );

  if (!left) {
    return (
      <p class="empty">
        That's today's {store.settings.dailyNew} new items. More tomorrow, or raise the limit in <a href={href.settings()}>Settings</a>.
      </p>
    );
  }
  if (story && !info) return <p class="loading">Loading story…</p>;
  if (!batch.length) {
    return <p class="empty">{story ? "You've started every word in this story. Happy reading!" : "You've added everything. Impressive."}</p>;
  }

  const addAll = () => {
    update((s) => batch.forEach((it) => addItem(s, it.kind, it.key)));
    location.hash = href.review();
  };

  return (
    <article class="page">
      <h1>{info ? `Learn ${batch.length} words from ${info.title}` : `Learn ${batch.length} new`}</h1>
      <p class="hint">Read through these, tap anything to dig deeper, then add them to your reviews.</p>
      {batch.map((it) => (
        <ItemSummary key={`${it.kind}:${it.key}`} kind={it.kind} k={it.key} />
      ))}
      <button class="primary wide" onClick={addAll}>
        Add {batch.length} to reviews and start
      </button>
    </article>
  );
}

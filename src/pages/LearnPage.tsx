import { useMemo } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { addItem, getStore, newLeftToday, nextToLearn, update, useStore } from "../srs";
import { ItemSummary } from "../components/ItemCards";

export function LearnPage() {
  const data = useData();
  const store = useStore();
  // Freeze the batch when the page opens, so it doesn't shift while you read it.
  const left = newLeftToday(store);
  const batch = useMemo(() => nextToLearn(getStore(), data, Math.min(store.settings.batch, left)), [data, store.settings.batch, left]);

  if (!left) {
    return (
      <p class="empty">
        That's today's {store.settings.dailyNew} new items. More tomorrow, or raise the limit in <a href={href.settings()}>Settings</a>.
      </p>
    );
  }
  if (!batch.length) return <p class="empty">You've added everything. Impressive.</p>;

  const addAll = () => {
    update((s) => batch.forEach((it) => addItem(s, it.kind, it.key)));
    location.hash = href.review();
  };

  return (
    <article class="page">
      <h1>Learn {batch.length} new</h1>
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

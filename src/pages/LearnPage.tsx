import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useSwipe } from "../components/useSwipe";
import { useData } from "../data";
import { href } from "../router";
import {
  addItem,
  getStore,
  isAdded,
  newLeftToday,
  nextToLearn,
  startOfDay,
  update,
  useStore,
  type ItemKind,
} from "../srs";
import { ItemSummary } from "../components/ItemCards";
import { knowledge, newWords, useStories } from "../stories";
import { BottomBar } from "../components/BottomBar";

type Item = { kind: ItemKind; key: string };
/** The batch you're in the middle of, so opening an item's full page and coming back (which remounts this page)
 * picks up where you were instead of starting a new batch with the items after the ones you've already seen. */
type Kept = { story: string; day: number; n: number; items: Item[]; i: number };
const KEPT = "nekko.learnBatch";
let kept: Kept | undefined;

function keptBatch(story: string): Kept | undefined {
  if (!kept) {
    try {
      kept = JSON.parse(sessionStorage.getItem(KEPT) ?? "null") ?? undefined;
    } catch {
      kept = undefined;
    }
  }
  const s = getStore();
  // Still today's batch for this page, and something in it is left to see.
  if (
    kept?.story === story &&
    kept.day === startOfDay(Date.now()) &&
    kept.items.slice(kept.i).some((it) => !isAdded(s, it.kind, it.key))
  )
    return kept;
  return undefined;
}

function keep(k: Kept | undefined) {
  kept = k;
  try {
    if (k) sessionStorage.setItem(KEPT, JSON.stringify(k));
    else sessionStorage.removeItem(KEPT);
  } catch {
    // Private mode or storage off: the in-memory copy still covers opening a full page and coming back.
  }
}

/** The next items to learn, or with `story` that story's new words, most used first. They come one at a time:
 * each is added to your reviews as you move past it, so leaving halfway keeps what you've seen. */
export function LearnPage({ story }: { story?: string }) {
  const data = useData();
  const store = useStore();
  const info = useStories(!!story)?.find((s) => s.id === story);
  const [resumed] = useState(() => keptBatch(story ?? ""));
  // Freeze the batch size when the page opens: it shrinks the daily allowance as you go, and the batch mustn't shift.
  const [n] = useState(() => resumed?.n ?? Math.min(store.settings.batch, newLeftToday(store)));
  const fresh = useMemo(
    () =>
      story
        ? info
          ? newWords(knowledge(getStore(), data), info)
              .slice(0, n)
              .map((key) => ({ kind: "word" as const, key }))
          : []
        : nextToLearn(getStore(), data, n),
    [data, n, story, info],
  );
  // Once there is a batch it stays put, even as adding its items changes what "next to learn" would be.
  const frozen = useRef<Item[] | undefined>(resumed?.items);
  if (!frozen.current && fresh.length) frozen.current = fresh;
  const batch = frozen.current ?? fresh;
  const [i, setI] = useState(resumed?.i ?? 0);
  const it = batch[i];
  const last = i === batch.length - 1;
  useEffect(() => {
    if (frozen.current?.length)
      keep({
        story: story ?? "",
        day: startOfDay(Date.now()),
        n,
        items: frozen.current,
        i,
      });
  }, [i, batch, n, story]);

  const next = () => {
    if (!it) return;
    update((s) => void (isAdded(s, it.kind, it.key) || addItem(s, it.kind, it.key)));
    if (last) {
      keep(undefined);
      location.hash = href.review();
    } else {
      setI(i + 1);
      scrollTo(0, 0);
    }
  };
  const back = () => i > 0 && setI(i - 1);
  // Swipe left for the next item (it joins your reviews as you pass it), right to go back. On the last one a
  // left swipe does what Start reviews does.
  const swipe = useSwipe({ onLeft: next, onRight: i > 0 ? back : undefined });

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
        That's today's {store.settings.dailyNew} new items. More tomorrow, or raise the limit in{" "}
        <a href={href.settings("learning")}>Settings</a>.
      </p>
    );
  }
  if (story && !info) return <p class="loading">Loading story…</p>;
  if (!it) {
    return (
      <p class="empty">
        {story ? "You've started every word in this story. Happy reading!" : "You've added everything. Impressive."}
      </p>
    );
  }

  const left = batch.length - i;
  return (
    <article class="page learn-one" ref={swipe.ref}>
      <div class="learn-head">
        <span class="hint">
          {info ? `New words from ${info.title}` : "New"} · {left === 1 ? "last one" : `${left} to go`}
        </span>
        <div class="learn-dots" aria-hidden="true">
          {batch.map((_, j) => (
            <i key={j} class={j < i ? "seen" : j === i ? "on" : ""} />
          ))}
        </div>
      </div>
      <div class="learn-card" ref={swipe.card}>
        <ItemSummary key={`${it.kind}:${it.key}`} kind={it.kind} k={it.key} />
      </div>
      {i === 0 && !last && <p class="learn-swipe-hint hint">Swipe left for the next one, right to go back.</p>}
      {last && (
        <BottomBar class="learn-bar">
          <button class="primary" onClick={next}>
            Start reviews
          </button>
        </BottomBar>
      )}
    </article>
  );
}

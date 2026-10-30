import { useMemo } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { useStore } from "../srs";
import { ALMOST, coverage, isFinished, knowledge, READY, useStories, type StoryInfo } from "../stories";
import { Section } from "../components/bits";

/** The Read tab: stories sorted by how much of them you can read, and sentence practice. */
export function StoriesPage() {
  const data = useData();
  const store = useStore();
  const stories = useStories();
  const rows = useMemo(() => {
    if (!stories) return;
    const k = knowledge(store, data);
    return stories
      .map((s) => {
        const c = coverage(k, s);
        return { s, share: c.total ? c.known / c.total : 0 };
      })
      .sort((a, b) => b.share - a.share);
  }, [stories, store, data]);

  const group = (title: string, hint: string, from: number, to: number) => {
    const list = rows!.filter((r) => r.share >= from && r.share < to);
    return (
      list.length > 0 && (
        <Section title={`${title} · ${list.length}`} hint={hint}>
          {list.map((r) => (
            <StoryRow key={r.s.id} s={r.s} share={r.share} done={isFinished(store, r.s.id)} />
          ))}
        </Section>
      )
    );
  };

  return (
    <article class="page">
      <h1>Read</h1>
      <a class="story-row" href={href.sentences()}>
        <span class="story-main">
          <span class="story-title">Sentences</span>
          <span class="story-meta">Short sentences made of kanji you've studied</span>
        </span>
        <span class="story-pct" lang="ja">文</span>
      </a>
      {!rows ? (
        <p class="loading">Loading stories…</p>
      ) : (
        <>
          {group("Ready to read", "You know 95% or more of the words.", READY, 2)}
          {group("Almost", "A few lookups. Tap any word you don't know.", ALMOST, READY)}
          {group("Later", "Open one anyway, or learn its new words first.", 0, ALMOST)}
          <p class="hint">
            Folk tales and children's stories from Aozora Bunko (public domain) and the free Tadoku readers by NPO多言語多読
            (CC BY-NC-ND 4.0), shown unchanged.
          </p>
        </>
      )}
    </article>
  );
}

function StoryRow({ s, share, done }: { s: StoryInfo; share: number; done: boolean }) {
  const pct = Math.floor(share * 100);
  return (
    <a class="story-row" href={href.story(s.id)}>
      <span class="story-main">
        <span class="story-title" lang="ja">
          {s.title}
          {done && <span class="story-done"> ✓</span>}
        </span>
        <span class="story-meta">
          {s.source === "tadoku" ? `Tadoku${s.level != null ? ` level ${s.level}` : ""}` : s.author} · {minutes(s.chars)} min
        </span>
      </span>
      <span class={`story-pct ${share >= READY ? "ready" : share >= ALMOST ? "almost" : ""}`}>{pct}%</span>
    </a>
  );
}

/** Rough reading time for a learner, about 300 characters a minute. */
export function minutes(chars: number): number {
  return Math.max(1, Math.round(chars / 300));
}

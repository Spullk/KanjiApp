import { useData } from "../data";
import { href } from "../router";
import { dueCards, newLeftToday, nextToLearn, stageOf, useStore } from "../srs";
import { Chips, Section } from "../components/bits";
import { TOOLS } from "../tools";
import { startNext } from "./GrammarPages";

export function HomePage() {
  const data = useData();
  const store = useStore();
  const due = dueCards(store).length;
  const next = nextToLearn(store, data, Math.min(store.settings.batch, newLeftToday(store)));
  const all = Object.keys(data.kanji);
  const known = all.filter((k) => stageOf(store, "kanji", k) === "mature").length;
  const studied = all.filter((k) => stageOf(store, "kanji", k) !== "none").length;
  // The first lesson with a kanji you haven't started.
  const lesson = data.lessons.find((l) => l.kanji.some((k) => stageOf(store, "kanji", k) === "none")) ?? data.lessons[0];
  // A different kanji each day, to wander the web from.
  const daily = all[Math.floor(Date.now() / 86_400_000) % all.length];

  return (
    <article class="page">
      <h1 class="brand">
        Nekko <span lang="ja">根っこ</span>
      </h1>

      {store.settings.vacation && (
        <a class="vacation-note" href={href.settings()}>
          Vacation mode is on, so nothing is due. Turn it off in Settings →
        </a>
      )}
      {store.settings.start === "new" && <StartHere />}
      <div class="home-actions">
        <a class={`big-action review ${due ? "" : "quiet"}`} href={href.review()}>
          <span class="ba-n">{due}</span>
          <span class="ba-label">{due === 1 ? "review due" : "reviews due"}</span>
        </a>
        <a class={`big-action learn ${next.length ? "" : "quiet"}`} href={href.learn()}>
          <span class="ba-n">{next.length}</span>
          <span class="ba-label">new to learn</span>
          {next.length > 0 && (
            <span class="ba-preview" lang="ja">
              {next.map((n) => (n.kind === "word" ? data.words[n.key].w : n.key)).join(" ")}
            </span>
          )}
        </a>
      </div>
      <a class="progress-line" href={href.progress()}>
        {studied ? `${studied} kanji studied, ${known} known of ${all.length}` : `${all.length} kanji to discover`} →
      </a>

      <a class="search-link" href={href.search()}>
        Search kanji, words, readings or meanings…
      </a>

      <Section title="Lessons">
        <a class="lesson-row" href={href.lesson(lesson.id)}>
          <span class="lesson-num">{lesson.id}</span>
          <span class="lesson-kanji" lang="ja">{lesson.kanji.join("")}</span>
          <span class="lesson-level">Up next</span>
        </a>
        <a class="more" href={href.lessons()}>
          All {data.lessons.length} lessons →
        </a>
      </Section>

      <Section title="Kanji of the day">
        <Chips items={[daily]} kind="kanji" />
      </Section>

      <Section title="All tools">
        <div class="tool-grid">
          {TOOLS.map((t) => (
            <a key={t.tab} class="tool" href={t.href}>
              <span class="tool-icon" lang="ja">
                {t.icon}
              </span>
              <b>{t.label}</b>
              <span class="tool-about">{t.about}</span>
            </a>
          ))}
        </div>
      </Section>
    </article>
  );
}

/** For beginners until Start here is done: the next step in it. */
function StartHere() {
  const next = startNext(useStore(), Object.values(useData().grammar));
  if (!next) return null;
  return (
    <a class="start-here" href={next.to}>
      <span class="start-here-label">Start here · next up</span>
      <b lang="ja">{next.title}</b>
    </a>
  );
}

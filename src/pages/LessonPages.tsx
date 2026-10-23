import { useData } from "../data";
import { href } from "../router";
import { lessonItems, setStatusMany, update, useStore } from "../srs";
import { Chips, MoreList, Section, WordRow } from "../components/bits";

export function LessonsPage() {
  const { lessons, kanji } = useData();
  return (
    <article class="page">
      <h1>Lessons</h1>
      <p class="hint">
        A suggested order: N5 first, parts before the kanji that use them, sound-alike kanji together. Nothing is locked.
      </p>
      <div class="lesson-list">
        {lessons.map((l) => {
          const levels = [...new Set(l.kanji.map((c) => kanji[c].jlpt))].map((n) => (n ? `N${n}` : "Jōyō"));
          return (
            <a class="lesson-row" key={l.id} href={href.lesson(l.id)}>
              <span class="lesson-num">{l.id}</span>
              <span class="lesson-kanji" lang="ja">{l.kanji.join("")}</span>
              <span class="lesson-level">{levels.join(" ")}</span>
            </a>
          );
        })}
      </div>
    </article>
  );
}

export function LessonPage({ id }: { id: number }) {
  const data = useData();
  const store = useStore();
  const l = data.lessons[id - 1];
  if (!l) return <p class="empty">No lesson {id}.</p>;
  const items = lessonItems(data, id - 1);
  const allKnown = items.every((it) => store.items[`${it.kind}:${it.key}`]?.status === "known");
  return (
    <article class="page">
      <h1>Lesson {l.id}</h1>
      <div class="study-bar">
        {allKnown ? (
          <>
            <span class="stage mature">Already known</span>
            <button class="link-button" onClick={() => update((s) => setStatusMany(s, items, undefined))}>
              Study it after all
            </button>
          </>
        ) : (
          <button class="link-button" onClick={() => update((s) => setStatusMany(s, items, "known"))}>
            I already know this whole lesson
          </button>
        )}
      </div>
      {l.radicals.length > 0 && (
        <Section title="Radicals">
          <Chips items={l.radicals} kind="radical" />
        </Section>
      )}
      <Section title="Kanji">
        <Chips items={l.kanji} kind="kanji" />
      </Section>
      {l.words.length > 0 && (
        <Section title="Vocabulary">
          <MoreList items={l.words} n={12} render={(w) => <WordRow key={w} id={w} />} />
        </Section>
      )}
      <nav class="pager">
        {l.id > 1 && <a href={href.lesson(l.id - 1)}>← Lesson {l.id - 1}</a>}
        {l.id < data.lessons.length && <a href={href.lesson(l.id + 1)}>Lesson {l.id + 1} →</a>}
      </nav>
    </article>
  );
}

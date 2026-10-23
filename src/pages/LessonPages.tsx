import { useData } from "../data";
import { href } from "../router";
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
  const { lessons } = useData();
  const l = lessons[id - 1];
  if (!l) return <p class="empty">No lesson {id}.</p>;
  return (
    <article class="page">
      <h1>Lesson {l.id}</h1>
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
        {l.id < lessons.length && <a href={href.lesson(l.id + 1)}>Lesson {l.id + 1} →</a>}
      </nav>
    </article>
  );
}

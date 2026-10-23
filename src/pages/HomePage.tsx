import { useData } from "../data";
import { href } from "../router";
import { Chips, Section } from "../components/bits";

export function HomePage() {
  const { lessons, kanji } = useData();
  const all = Object.keys(kanji);
  // A different kanji each day, to wander the web from.
  const day = Math.floor(Date.now() / 86_400_000);
  const daily = all[day % all.length];

  return (
    <article class="page">
      <h1 class="brand">
        Nekko <span lang="ja">根っこ</span>
      </h1>
      <a class="search-link" href={href.search()}>
        Search kanji, words, readings or meanings…
      </a>

      <Section title="Kanji of the day">
        <Chips items={[daily]} kind="kanji" />
      </Section>

      <Section title="Start here">
        {lessons.slice(0, 3).map((l) => (
          <a key={l.id} class="lesson-row" href={href.lesson(l.id)}>
            <span class="lesson-num">{l.id}</span>
            <span class="lesson-kanji" lang="ja">{l.kanji.join("")}</span>
          </a>
        ))}
        <a class="more" href={href.lessons()}>All {lessons.length} lessons</a>
      </Section>
    </article>
  );
}

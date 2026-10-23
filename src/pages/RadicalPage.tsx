import { useData } from "../data";
import { href } from "../router";
import { StudyButton } from "../components/ItemCards";
import { Badges, Chip, Chips, Section } from "../components/bits";

export function RadicalPage({ c }: { c: string }) {
  const { radicals, kanji } = useData();
  const r = radicals[c];
  if (!r) return <p class="empty">No radical {c} in the data.</p>;
  return (
    <article class="page radical-page">
      <header class="hero radical">
        <div class="hero-char" lang="ja">{r.c}</div>
        <div class="hero-meaning">{r.meanings.join(", ") || "No name yet"}</div>
        <Badges items={[r.lesson && `Lesson ${r.lesson}`, r.readings.length > 0 && r.readings.slice(0, 3).join("・")]} />
      </header>
      <StudyButton kind="radical" k={r.c} />

      {r.original && r.original !== r.c && (
        <Section title="Variant of">
          <div class="chips">
            <Chip c={r.original} kind={kanji[r.original] ? "kanji" : "radical"} />
          </div>
        </Section>
      )}

      {r.parts.length > 0 && (
        <Section title="Made of">
          <div class="chips">
            {r.parts.map((p) => (
              <Chip key={p.c} c={p.c} />
            ))}
          </div>
        </Section>
      )}

      <Section title={`Found in ${r.usedIn.length} kanji`}>
        <Chips items={r.usedIn} kind="kanji" />
      </Section>

      {r.lesson && (
        <nav class="pager">
          <a href={href.lesson(r.lesson)}>Lesson {r.lesson} →</a>
        </nav>
      )}
    </article>
  );
}

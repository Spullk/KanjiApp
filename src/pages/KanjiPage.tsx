import { useData } from "../data";
import { href } from "../router";
import { StudyButton } from "../components/ItemCards";
import { Badges, Chip, Chips, MoreList, ReadingText, Section, SentenceView, WordRow } from "../components/bits";

export function KanjiPage({ c }: { c: string }) {
  const { kanji, words } = useData();
  const k = kanji[c];
  if (!k) return <p class="empty">No kanji {c} in the data.</p>;

  const used = k.readings.filter((r) => r.words.length);
  const rare = k.readings.filter((r) => !r.words.length);
  const sentences = [...new Set(k.words.flatMap((w) => words[w]?.sentences.slice(0, 1) ?? []))].slice(0, 6);

  return (
    <article class="page kanji-page">
      <header class="hero kanji">
        <div class="hero-char" lang="ja">{k.c}</div>
        <div class="hero-meaning">{k.meanings.join(", ")}</div>
        <Badges
          items={[
            k.jlpt ? `N${k.jlpt}` : "Jōyō",
            `Lesson ${k.lesson}`,
            `${k.strokes} strokes`,
            k.grade <= 6 ? `Grade ${k.grade}` : "Secondary school",
          ]}
        />
      </header>
      <StudyButton kind="kanji" k={k.c} />

      <Section title="Readings" hint="Most-used first. Tap a word to see it in full.">
        {used.map((r) => (
          <div class="reading-group" key={r.r}>
            <div class="reading-head">
              <ReadingText r={r.r} />
              <span class={`rtype ${r.type}`}>{r.type === "on" ? "on'yomi" : "kun'yomi"}</span>
              <span class="count">{r.words.length} {r.words.length === 1 ? "word" : "words"}</span>
            </div>
            <MoreList items={r.words} n={4} render={(w) => <WordRow key={w} id={w} highlight={k.c} />} />
          </div>
        ))}
        {k.specialWords.length > 0 && (
          <div class="reading-group">
            <div class="reading-head">
              <span class="reading-text">Special</span>
              <span class="rtype special">whole-word reading</span>
            </div>
            <MoreList items={k.specialWords} n={4} render={(w) => <WordRow key={w} id={w} highlight={k.c} />} />
          </div>
        )}
        {rare.length > 0 && (
          <p class="rare">
            Rare: {rare.map((r, i) => (
              <span key={r.r}>
                {i > 0 && "、"}
                <ReadingText r={r.r} />
              </span>
            ))}
          </p>
        )}
      </Section>

      {k.parts.length > 0 && (
        <Section title="Made of">
          <div class="chips">
            {k.parts.map((p) => (
              <Chip key={p.c} c={p.c} note={p.phonetic ? "sound" : undefined} />
            ))}
          </div>
        </Section>
      )}

      {k.soundFamily.length > 0 && k.phonetic && (
        <Section
          title="Sound family"
          hint={`These also contain ${k.phonetic}, which hints at the on'yomi, so they often sound alike.`}
        >
          <div class="chips">
            {k.soundFamily.map((o) => (
              <Chip key={o} c={o} note={kanji[o].on.slice(0, 2).join("・")} />
            ))}
          </div>
        </Section>
      )}

      {k.usedIn.length > 0 && (
        <Section title={`Part of ${k.usedIn.length} other kanji`}>
          <Chips items={k.usedIn} kind="kanji" />
        </Section>
      )}

      {sentences.length > 0 && (
        <Section title="Example sentences">
          {sentences.map((s) => (
            <SentenceView key={s} id={s} highlight={k.c} />
          ))}
        </Section>
      )}

      <nav class="pager">
        <a href={href.lesson(k.lesson)}>Lesson {k.lesson} →</a>
      </nav>
    </article>
  );
}

import { hira, useData } from "../data";
import { href } from "../router";
import { StudyButton } from "../components/ItemCards";
import { PitchAccent } from "../components/Pitch";
import { WordExamples } from "../components/Examples";
import { Badges, Furigana, ReadingText, Section, WordSpeak } from "../components/bits";

export function WordPage({ id }: { id: string }) {
  const { words, kanji } = useData();
  const w = words[id];
  if (!w) return <p class="empty">Word not found.</p>;

  // One card per kanji, saying which of its readings this word uses.
  const cards: { c: string; kana: string; key: string }[] = [];
  for (const [text, kana, key] of w.furigana) {
    if (kana === null || !key) continue;
    for (const c of text) {
      const real = c === "々" ? cards[cards.length - 1]?.c : c;
      if (real && kanji[real] && !cards.some((x) => x.c === real)) cards.push({ c: real, kana, key });
    }
  }

  return (
    <article class="page word-page">
      <header class="hero word">
        <div class="hero-word" lang="ja">
          <Furigana segments={w.furigana} />
        </div>
        <div class="hero-reading" lang="ja">
          <PitchAccent w={w} fallback={w.r} /> <WordSpeak w={w} />
        </div>
        <Badges items={[w.lesson && `Lesson ${w.lesson}`, w.usuallyKana && "Usually written in kana"]} />
      </header>
      <StudyButton kind="word" k={w.id} />

      <Section title="Meaning">
        <ol class="senses">
          {w.senses.map((s, i) => (
            <li key={i}>
              {s.pos.length > 0 && <span class="pos">{s.pos.join(", ")}</span>}
              {s.gloss.join("; ")}
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Kanji in this word">
        {cards.map(({ c, kana, key }) => {
          const k = kanji[c];
          const special = key === "*";
          const others = k.readings.filter((r) => r.r !== key && r.words.length).slice(0, 4);
          return (
            <a class="kanji-card" href={href.kanji(c)} key={c}>
              <span class="kc-char" lang="ja">{c}</span>
              <span class="kc-body">
                <span class="kc-meaning">{k.meanings.slice(0, 3).join(", ")}</span>
                <span class="kc-used">
                  {special ? (
                    <>Special reading here: <b lang="ja">{kana}</b></>
                  ) : (
                    <>
                      Read <b lang="ja">{kana}</b> here
                      {hira(key.split(".")[0].replace(/-/g, "")) !== kana && (
                        <> (from <ReadingText r={key} />)</>
                      )}
                      , {k.on.includes(key) ? "on'yomi" : "kun'yomi"}
                    </>
                  )}
                </span>
                {others.length > 0 && (
                  <span class="kc-others">
                    Also: {others.map((r, i) => (
                      <span key={r.r}>
                        {i > 0 && "、"}
                        <ReadingText r={r.r} />
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </a>
          );
        })}
      </Section>

      <WordExamples id={w.id} />
    </article>
  );
}

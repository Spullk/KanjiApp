// Example sentences on word and kanji pages, the ones you can read first.

import { useMemo } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { useStore } from "../srs";
import { examplesFor, kanjiExamples, knowledgeOf, patternSentence, type Example } from "../examples";
import { MoreList, Section, SentenceView } from "./bits";

/** "Every word known", or the new words in a sentence, linked. */
function NewWords({ ids }: { ids: string[] }) {
  const data = useData();
  if (!ids.length) return <>Every other word known</>;
  return (
    <>
      New {ids.length === 1 ? "word" : "words"}:{" "}
      {ids.slice(0, 4).map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <a href={href.word(id)} lang="ja">
            {data.words[id]?.w}
          </a>
        </span>
      ))}
      {ids.length > 4 && ` and ${ids.length - 4} more`}
    </>
  );
}

const render = (highlight: string) => (e: Example) => <SentenceView key={e.id} id={e.id} highlight={highlight} note={<NewWords ids={e.unknown} />} />;

export function WordExamples({ id }: { id: string }) {
  const data = useData();
  const store = useStore();
  const list = useMemo(() => examplesFor(data, knowledgeOf(store, data), id), [data, store, id]);
  // No real sentence with at most one new word: lead with one made from a pattern.
  const pattern = list.some((e) => e.unknown.length <= 1) ? undefined : patternSentence(data, id);
  if (!list.length && !pattern) return null;
  return (
    <Section title="Example sentences" hint={list.length > 1 ? "The ones you can read come first." : undefined}>
      {pattern && <SentenceView sentence={pattern} highlight={id} note="A simple sentence Nekko made from a pattern." />}
      <MoreList items={list} n={3} render={render(id)} />
    </Section>
  );
}

export function KanjiExamples({ c, words }: { c: string; words: string[] }) {
  const data = useData();
  const store = useStore();
  const list = useMemo(() => kanjiExamples(data, knowledgeOf(store, data), words), [data, store, words]);
  if (!list.length) return null;
  return (
    <Section title="Example sentences" hint="The ones you can read come first.">
      {list.map(render(c))}
    </Section>
  );
}

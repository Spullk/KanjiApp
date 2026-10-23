import { useMemo, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { search } from "../search";
import { Chips, Section, WordRow } from "../components/bits";

export function SearchPage({ q: initial, autofocus = true }: { q: string; autofocus?: boolean }) {
  const data = useData();
  const [q, setQ] = useState(initial);
  const results = useMemo(() => search(data, q), [data, q]);
  const empty = q.trim() && !results.kanji.length && !results.radicals.length && !results.words.length;

  const onInput = (value: string) => {
    setQ(value);
    // Keep the query in the URL without adding a history entry per keystroke.
    history.replaceState(null, "", href.search(value));
  };

  return (
    <article class="page">
      <input
        class="search-box"
        type="search"
        placeholder="漢字, かな, romaji or English"
        value={q}
        autoFocus={autofocus}
        autoCapitalize="off"
        autoCorrect="off"
        spellcheck={false}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
      />
      {results.kanji.length > 0 && (
        <Section title="Kanji">
          <Chips items={results.kanji} kind="kanji" />
        </Section>
      )}
      {results.radicals.length > 0 && (
        <Section title="Radicals">
          <Chips items={results.radicals} kind="radical" />
        </Section>
      )}
      {results.words.length > 0 && (
        <Section title="Words">
          {results.words.map((w) => (
            <WordRow key={w} id={w} />
          ))}
        </Section>
      )}
      {empty && <p class="empty">Nothing found.</p>}
    </article>
  );
}

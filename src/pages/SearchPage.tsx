import { useMemo, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { search } from "../search";
import { Chips, Section, WordRow } from "../components/bits";
import { DrawLookup, PartsLookup } from "../components/Lookup";

type Mode = "type" | "parts" | "draw";
const MODES: [Mode, string][] = [
  ["type", "Type"],
  ["parts", "By parts"],
  ["draw", "Draw"],
];

export function SearchPage({ q: initial, autofocus = true }: { q: string; autofocus?: boolean }) {
  const data = useData();
  const [q, setQ] = useState(initial);
  const [mode, setMode] = useState<Mode>("type");
  const results = useMemo(() => search(data, q), [data, q]);
  const empty = q.trim() && !results.kanji.length && !results.radicals.length && !results.words.length;

  const onInput = (value: string) => {
    setQ(value);
    // Keep the query in the URL without adding a history entry per keystroke.
    history.replaceState(null, "", href.search(value));
  };

  const tabs = (
    <div class="seg-tabs" role="tablist">
      {MODES.map(([m, label]) => (
        <button key={m} role="tab" aria-selected={mode === m} class={mode === m ? "on" : ""} onClick={() => setMode(m)}>
          {label}
        </button>
      ))}
    </div>
  );
  if (mode !== "type") {
    return (
      <article class="page">
        {tabs}
        {mode === "parts" ? <PartsLookup /> : <DrawLookup />}
      </article>
    );
  }

  return (
    <article class="page">
      {tabs}
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

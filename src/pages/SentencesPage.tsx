import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { getStore } from "../srs";
import { knowledgeOf, readableByWords } from "../examples";
import { playSentence } from "../audio";
import { SpeakButton, WordGloss } from "../components/bits";
import { shuffle } from "./PracticePage";

/** Read sentences made of words you know, with at most one new one. Tap a word to see its reading and meaning. */
export function SentencesPage() {
  const data = useData();
  const [stretch, setStretch] = useState(true);
  const k = useMemo(() => knowledgeOf(getStore(), data), [data]);
  const list = useMemo(() => shuffle(readableByWords(data, k, stretch ? 1 : 0)), [data, k, stretch]);
  const ids = list.map((e) => e.id);
  const [i, setI] = useState(0);
  const [english, setEnglish] = useState(false);
  const [word, setWord] = useState<string>();

  const id = ids[i % Math.max(1, ids.length)];
  const s = id ? data.sentences[id] : undefined;
  const next = () => {
    setI((n) => n + 1);
    setEnglish(false);
    setWord(undefined);
  };

  const options = (
    <label class="setting">
      Sentences
      <select
        value={stretch ? "1" : "0"}
        onChange={(e) => {
          setStretch((e.target as HTMLSelectElement).value === "1");
          setI(0);
          setWord(undefined);
        }}
      >
        <option value="1">Up to one new word</option>
        <option value="0">Only words I know</option>
      </select>
    </label>
  );

  if (!s) {
    return (
      <article class="page">
        <h1>Sentences</h1>
        {options}
        <p class="empty">
          {stretch
            ? "No sentences with at most one new word yet. Learn a few more words, then come back."
            : "No sentences use only words you know yet. Try allowing one new word, or learn a few more."}
        </p>
        <a class="primary wide" href={href.learn()}>
          Learn new items
        </a>
      </article>
    );
  }

  const newWords = list[i % list.length].unknown;
  // The sentence with each dictionary word as a button; the new word underlined in solid like in stories.
  const parts: ComponentChildren[] = [];
  let pos = 0;
  for (const [start, len, wid] of s.links) {
    if (start < pos) continue;
    if (start > pos) parts.push(s.ja.slice(pos, start));
    parts.push(
      <button key={start} class={`read-word${newWords.includes(wid) ? " new" : ""}${word === wid ? " on" : ""}`} onClick={() => setWord(word === wid ? undefined : wid)}>
        {s.ja.slice(start, start + len)}
      </button>,
    );
    pos = start + len;
  }
  parts.push(s.ja.slice(pos));

  return (
    <article class="page reading">
      <h1>Sentences</h1>
      {options}
      <p class="hint">
        {ids.length} {ids.length === 1 ? "sentence" : "sentences"} to read. Tap a word for its reading and meaning.
      </p>
      <div class="read-card">
        <div class="read-ja" lang="ja">
          {parts}
        </div>
        <div class="read-tools">
          <SpeakButton onClick={() => playSentence(s)} human={!!s.audio} />
          {newWords.length > 0 && (
            <span class="hint">
              New word:{" "}
              {newWords.map((w) => (
                <button key={w} class="link-button" lang="ja" onClick={() => setWord(word === w ? undefined : w)}>
                  {data.words[w]?.w}
                </button>
              ))}
            </span>
          )}
        </div>
        {word && <WordGloss id={word} />}
        {english ? (
          <div class="read-en">{s.en}</div>
        ) : (
          <button class="link-button" onClick={() => setEnglish(true)}>
            Show translation
          </button>
        )}
      </div>
      <button class="primary wide" onClick={next}>
        Next sentence
      </button>
    </article>
  );
}

import type { ComponentChildren } from "preact";
import { useMemo, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { getStore } from "../srs";
import { readableSentences, studiedKanji, unknownKanji } from "../reading";
import { playSentence } from "../audio";
import { SpeakButton, WordGloss } from "../components/bits";
import { shuffle } from "./PracticePage";

/** Read sentences built from kanji you've studied. Tap a word to see its reading and meaning. */
export function SentencesPage() {
  const data = useData();
  const [stretch, setStretch] = useState(false);
  const known = useMemo(() => studiedKanji(getStore(), data), [data]);
  const ids = useMemo(() => shuffle(readableSentences(data, known, stretch ? 1 : 0)), [data, known, stretch]);
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
        <option value="0">Only kanji I've studied</option>
        <option value="1">Up to one new kanji</option>
      </select>
    </label>
  );

  if (!s) {
    return (
      <article class="page">
        <h1>Sentences</h1>
        {options}
        <p class="empty">
          {known.size
            ? "No sentences use only the kanji you've studied yet. Try allowing one new kanji, or learn a few more."
            : "Study some kanji first, then come back to read sentences made of them."}
        </p>
        <a class="primary wide" href={href.learn()}>
          Learn new items
        </a>
      </article>
    );
  }

  // The sentence with each dictionary word as a button.
  const parts: ComponentChildren[] = [];
  let pos = 0;
  for (const [start, len, wid] of s.links) {
    if (start < pos) continue;
    if (start > pos) parts.push(s.ja.slice(pos, start));
    parts.push(
      <button key={start} class={`read-word${word === wid ? " on" : ""}`} onClick={() => setWord(word === wid ? undefined : wid)}>
        {s.ja.slice(start, start + len)}
      </button>,
    );
    pos = start + len;
  }
  parts.push(s.ja.slice(pos));
  const newKanji = unknownKanji(s.ja, known);

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
          {newKanji.length > 0 && (
            <span class="hint" lang="ja">
              New: {newKanji.map((c) => (data.kanji[c] ? <a key={c} href={href.kanji(c)}>{c}</a> : c))}
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

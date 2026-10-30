// What each kind of review card asks and shows. A new card type (listening, English → Japanese…) is a new
// entry here plus its face in FACES (srs.ts); the review screen picks it up without changes.

import type { ComponentChildren } from "preact";
import { useEffect } from "preact/hooks";
import { playWord } from "./audio";
import { PitchAccent } from "./components/Pitch";
import { isKanaWord, useData, type Data, type Sentence } from "./data";
import { href } from "./router";
import { cardId, getStore, parseCardId, useStore, type Face, type ItemKind, type Store } from "./srs";
import { cloze, exampleFor } from "./grammar";
import { furiganaRule } from "./reading";
import { fontFor, loadFont } from "./fonts";
import { alignFurigana, Furigana, Romaji, WordSpeak } from "./components/bits";
import { MainReadings, ReadingUse } from "./components/ItemCards";
import { readingForms } from "./answers";
import { examplesFor, knowledgeOf, patternSentence } from "./examples";

/** One thing to type in typed-answer mode, and every answer that counts. */
export type Ask = {
  label: "Meaning" | "Reading" | "Gap";
  kana: boolean;
  answers(data: Data, key: string): string[];
  placeholder?: string;
  /** Not asked for this item (the reading of a word written in kana). */
  skip?(data: Data, key: string): boolean;
};

const meaning = (get: (data: Data, key: string) => string[]): Ask => ({ label: "Meaning", kana: false, answers: get });
const reading = (get: (data: Data, key: string) => string[]): Ask => ({ label: "Reading", kana: true, answers: get });
/** A word's reading, which a word written in kana doesn't need asking. */
const wordReading: Ask = { ...reading((data, key) => [data.words[key].r]), skip: (data, key) => isKanaWord(data.words[key]) };

export type CardType = {
  /** The question above the card, e.g. "Kanji · meaning?". */
  prompt: string;
  /** For words written in kana, when it differs ("Word · meaning?"). */
  kanaPrompt?: string;
  /** How the front is set: a big character, a word, English text, or a sentence. */
  frontStyle?: "char" | "word" | "english" | "sentence";
  /** What's shown before answering. */
  front(data: Data, key: string): ComponentChildren;
  /** The answer. */
  back(data: Data, key: string): ComponentChildren;
  /** The item's full page. */
  link(key: string): string;
  /** What to type, in order, when answering by typing. */
  asks: Ask[];
};

const char = (_: Data, key: string) => key;
const word = (data: Data, key: string) => data.words[key].w;

/** The word with furigana, its recording and its first meanings. */
function wordBack(data: Data, key: string, use = true) {
  const w = data.words[key];
  return (
    <>
      <div class="answer-word" lang="ja">
        <Furigana segments={w.furigana} link={false} /> <WordSpeak w={w} />
      </div>
      <div class="answer-pitch">
        <PitchAccent w={w} />
      </div>
      <Romaji kana={w.r} />
      <div class="answer-main">{w.senses.slice(0, 2).map((s) => s.gloss.slice(0, 3).join(", ")).join("; ")}</div>
      {use && <ReadingUse id={key} />}
    </>
  );
}

/** A grammar example with its gap empty, or filled in and highlighted once answered. */
function GrammarGap({ id, filled }: { id: string; filled?: boolean }) {
  const data = useData();
  const store = useStore();
  const g = data.grammar[id];
  const c = cloze(exampleFor(store, g));
  const hide = furiganaRule(store, data);
  return (
    <>
      <div class="cloze" lang="ja">
        <Furigana segments={c.before} link={false} hide={hide} reveal />
        {filled ? (
          <b class="cloze-gap filled">
            <Furigana segments={c.gap} link={false} />
          </b>
        ) : (
          <span class="cloze-gap">?</span>
        )}
        <Furigana segments={c.after} link={false} hide={hide} reveal />
      </div>
      <div class="cloze-en">{c.en}</div>
    </>
  );
}

/** One of the word's example sentences you can read, a different one of the easiest few at each review. */
export function contextSentence(store: Store, data: Data, key: string): Sentence {
  const list = examplesFor(data, knowledgeOf(store, data), key, 3);
  const easiest = list.filter((e) => e.unknown.length <= list[0].unknown.length + 1);
  const reps = store.cards[cardId("word", key, "context")]?.reps ?? 0;
  if (easiest.length && easiest[0].unknown.length <= 1) return data.sentences[easiest[reps % easiest.length].id];
  const w = data.words[key];
  return patternSentence(data, key) ?? (list.length ? data.sentences[list[0].id] : { ja: w.w, en: "", links: [[0, w.w.length, key]] });
}

/** The sentence with the word marked; its reading shows only once answered. Other words keep the furigana you need. */
function Context({ id, filled }: { id: string; filled?: boolean }) {
  const data = useData();
  const store = useStore();
  const s = contextSentence(store, data, id);
  const parts: ComponentChildren[] = [];
  let pos = 0;
  for (const [start, len, wid] of s.links) {
    if (start < pos) continue;
    if (start > pos) parts.push(s.ja.slice(pos, start));
    const text = s.ja.slice(start, start + len);
    const segs = data.words[wid] && alignFurigana(text, data.words[wid].furigana);
    if (wid === id) {
      parts.push(
        <b key={start} class="cloze-gap filled">
          {filled && segs ? <Furigana segments={segs} link={false} /> : text}
        </b>,
      );
    } else parts.push(segs ? <Furigana key={start} segments={segs} link={false} hide={furiganaRule(store, data, wid)} reveal /> : text);
    pos = start + len;
  }
  parts.push(s.ja.slice(pos));
  return (
    <>
      <div class="cloze" lang="ja">
        {parts}
      </div>
      {filled && s.en && <div class="cloze-en">{s.en}</div>}
    </>
  );
}

/** Plays the word as soon as the card appears, with a button to hear it again. */
function Listen({ id }: { id: string }) {
  const w = useData().words[id];
  useEffect(() => playWord(w), [id]);
  return (
    <button class="listen-button" onClick={() => playWord(w)} aria-label="Play again">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" />
      </svg>
    </button>
  );
}

export const CARD_TYPES: Partial<Record<`${ItemKind}:${Face}`, CardType>> = {
  "radical:meaning": {
    prompt: "Radical · name?",
    front: char,
    back: (data, key) => <div class="answer-main">{data.radicals[key].meanings.join(", ") || "(no name)"}</div>,
    link: href.radical,
    asks: [meaning((data, key) => data.radicals[key].meanings)],
  },
  "kanji:meaning": {
    prompt: "Kanji · meaning?",
    front: char,
    back: (data, key) => (
      <>
        <div class="answer-main">{data.kanji[key].meanings.slice(0, 4).join(", ")}</div>
        <MainReadings c={key} max={2} />
      </>
    ),
    link: href.kanji,
    asks: [meaning((data, key) => data.kanji[key].meanings)],
  },
  "kanji:reading": {
    prompt: "Kanji · readings?",
    front: char,
    back: (data, key) => (
      <>
        <MainReadings c={key} max={4} />
        <div class="answer-sub">{data.kanji[key].meanings.slice(0, 3).join(", ")}</div>
      </>
    ),
    link: href.kanji,
    asks: [
      reading((data, key) => {
        const k = data.kanji[key];
        return [...k.readings.map((r) => r.r), ...k.on, ...k.kun].flatMap(readingForms);
      }),
    ],
  },
  "kanji:both": {
    prompt: "Kanji · meaning and reading?",
    front: char,
    back: (data, key) => (
      <>
        <div class="answer-main">{data.kanji[key].meanings.slice(0, 4).join(", ")}</div>
        <MainReadings c={key} max={4} />
      </>
    ),
    link: href.kanji,
    asks: [
      meaning((data, key) => data.kanji[key].meanings),
      reading((data, key) => {
        const k = data.kanji[key];
        return [...k.readings.map((r) => r.r), ...k.on, ...k.kun].flatMap(readingForms);
      }),
    ],
  },
  "word:word": {
    prompt: "Word · reading and meaning?",
    kanaPrompt: "Word · meaning?",
    front: word,
    back: (data, key) => wordBack(data, key),
    link: href.word,
    asks: [wordReading, meaning((data, key) => data.words[key].senses.flatMap((s) => s.gloss))],
  },
  "word:recall": {
    prompt: "English → Japanese · which word?",
    frontStyle: "english",
    front: (data, key) => data.words[key].senses[0].gloss.slice(0, 3).join(", "),
    back: (data, key) => wordBack(data, key),
    link: href.word,
    asks: [reading((data, key) => [data.words[key].r])],
  },
  "grammar:cloze": {
    prompt: "Grammar · fill the gap",
    frontStyle: "sentence",
    front: (_, key) => <GrammarGap id={key} />,
    back: (data, key) => (
      <>
        <GrammarGap id={key} filled />
        <div class="answer-sub">{data.grammar[key].title}</div>
      </>
    ),
    link: href.grammarPoint,
    asks: [
      {
        label: "Gap",
        kana: true,
        placeholder: "What goes in the gap?",
        answers: (data, key) => cloze(exampleFor(getStore(), data.grammar[key])).answers,
      },
    ],
  },
  "word:context": {
    prompt: "Word in a sentence · reading and meaning?",
    kanaPrompt: "Word in a sentence · meaning?",
    frontStyle: "sentence",
    front: (_, key) => <Context id={key} />,
    back: (data, key) => (
      <>
        <Context id={key} filled />
        {wordBack(data, key, false)}
      </>
    ),
    link: href.word,
    asks: [wordReading, meaning((data, key) => data.words[key].senses.flatMap((s) => s.gloss))],
  },
  "word:listen": {
    prompt: "Listening · what does it mean?",
    front: (_, key) => <Listen id={key} />,
    back: (data, key) => wordBack(data, key, false),
    link: href.word,
    asks: [meaning((data, key) => data.words[key].senses.flatMap((s) => s.gloss))],
  },
};

export function cardType(id: string): CardType {
  const { kind, face } = parseCardId(id);
  const t = CARD_TYPES[`${kind}:${face}`];
  if (!t) throw new Error(`No card type for ${id}`);
  return t;
}

export function CardFront({ id }: { id: string }) {
  const data = useData();
  const { kind, key } = parseCardId(id);
  const t = cardType(id);
  const style = t.frontStyle ?? (kind === "word" ? "word" : "char");
  const font = useStore().settings.fonts && kind !== "radical" && t.frontStyle === undefined ? fontFor(id) : undefined;
  const text = kind === "word" ? data.words[key].w : key;
  useEffect(() => {
    if (font) loadFont(font, text);
  }, [font, text]);
  return (
    <div class={`card-front ${kind}`}>
      <div class="card-prompt">{kind === "word" && t.kanaPrompt && isKanaWord(data.words[key]) ? t.kanaPrompt : t.prompt}</div>
      {t.frontStyle === "english" ? (
        <div class="card-english">{t.front(data, key)}</div>
      ) : t.frontStyle === "sentence" ? (
        <div class="card-sentence">{t.front(data, key)}</div>
      ) : (
        <div class={style === "word" ? "card-word" : "card-char"} lang="ja" style={font ? { fontFamily: `"${font}", var(--ja-font)` } : undefined}>
          {t.front(data, key)}
        </div>
      )}
    </div>
  );
}

export function CardBack({ id, note }: { id: string; note?: string }) {
  const data = useData();
  const { key } = parseCardId(id);
  const t = cardType(id);
  return (
    <div class="card-back">
      {t.back(data, key)}
      {note && <div class="card-note">{note}</div>}
      <a class="more" href={t.link(key)}>
        Open full page
      </a>
    </div>
  );
}

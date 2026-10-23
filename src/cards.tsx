// What each kind of review card asks and shows. A new card type (listening, English → Japanese…) is a new
// entry here plus its face in FACES (srs.ts); the review screen picks it up without changes.

import type { ComponentChildren } from "preact";
import { useData, type Data } from "./data";
import { href } from "./router";
import { parseCardId, type Face, type ItemKind } from "./srs";
import { Furigana, WordSpeak } from "./components/bits";
import { MainReadings, ReadingUse } from "./components/ItemCards";
import { readingForms } from "./answers";

/** One thing to type in typed-answer mode, and every answer that counts. */
export type Ask = { label: "Meaning" | "Reading"; kana: boolean; answers(data: Data, key: string): string[] };

const meaning = (get: (data: Data, key: string) => string[]): Ask => ({ label: "Meaning", kana: false, answers: get });
const reading = (get: (data: Data, key: string) => string[]): Ask => ({ label: "Reading", kana: true, answers: get });

export type CardType = {
  /** The question above the card, e.g. "Kanji · meaning?". */
  prompt: string;
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
  "word:word": {
    prompt: "Word · reading and meaning?",
    front: word,
    back: (data, key) => {
      const w = data.words[key];
      return (
        <>
          <div class="answer-word" lang="ja">
            <Furigana segments={w.furigana} link={false} /> <WordSpeak w={w} />
          </div>
          <div class="answer-main">{w.senses.slice(0, 2).map((s) => s.gloss.slice(0, 3).join(", ")).join("; ")}</div>
          <ReadingUse id={key} />
        </>
      );
    },
    link: href.word,
    asks: [reading((data, key) => [data.words[key].r]), meaning((data, key) => data.words[key].senses.flatMap((s) => s.gloss))],
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
  return (
    <div class={`card-front ${kind}`}>
      <div class="card-prompt">{t.prompt}</div>
      <div class={kind === "word" ? "card-word" : "card-char"} lang="ja">
        {t.front(data, key)}
      </div>
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

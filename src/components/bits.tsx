import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { toRomaji } from "wanakana";
import { hira, useData, type Segment, type Sentence, type Word } from "../data";
import { furiganaRule } from "../reading";
import { useStore } from "../srs";
import { href } from "../router";
import { playSentence, playWord } from "../audio";

/**
 * A word with furigana, where each kanji links to its own page. With `hide`, readings it hides (kanji you've been
 * taught, see furiganaRule) keep their space but stay invisible; with `reveal`, tapping one shows it.
 */
export function Furigana({
  segments,
  highlight,
  link = true,
  hide,
  reveal,
}: {
  segments: Segment[];
  highlight?: string;
  link?: boolean;
  hide?: (s: Segment) => boolean;
  reveal?: boolean;
}) {
  const [shown, setShown] = useState<number[]>([]);
  return (
    <span class="furigana">
      {segments.map((seg, i) => {
        const [text, kana] = seg;
        if (kana === null) return <span key={i}>{text}</span>;
        const hidden = !!hide?.(seg) && !shown.includes(i);
        const tap = hidden && reveal ? () => setShown([...shown, i]) : undefined;
        return (
          <ruby key={i} class={tap ? "tap-reading" : undefined} onClick={tap}>
            {[...text].map((c, j) => (
              <KanjiChar key={j} c={c} highlight={highlight} link={link && !tap} />
            ))}
            <rt class={hidden ? "hide" : undefined}>{kana}</rt>
          </ruby>
        );
      })}
    </span>
  );
}

function KanjiChar({ c, highlight, link }: { c: string; highlight?: string; link: boolean }) {
  const { kanji } = useData();
  const cls = c === highlight ? "hl" : undefined;
  if (link && kanji[c]) return <a class={cls} href={href.kanji(c)}>{c}</a>;
  return <span class={cls}>{c}</span>;
}

/** A kanji or radical tile. */
export function Chip({ c, kind, note }: { c: string; kind?: "kanji" | "radical"; note?: string }) {
  const { kanji, radicals } = useData();
  const k = kanji[c];
  const r = radicals[c];
  const type = kind ?? (k ? "kanji" : "radical");
  const meaning = (type === "kanji" ? k?.meanings[0] : r?.meanings[0]) ?? "";
  const target = type === "kanji" && k ? href.kanji(c) : r ? href.radical(c) : undefined;
  const body = (
    <>
      <span class="chip-char">{c}</span>
      <span class="chip-meaning">{meaning}</span>
      {note && <span class="chip-note">{note}</span>}
    </>
  );
  return target ? (
    <a class={`chip ${type}`} href={target}>{body}</a>
  ) : (
    <span class={`chip ${type}`}>{body}</span>
  );
}

export function Chips({ items, kind }: { items: string[]; kind?: "kanji" | "radical" }) {
  return (
    <div class="chips">
      {items.map((c) => (
        <Chip key={c} c={c} kind={kind} />
      ))}
    </div>
  );
}

/** One line per word: furigana over kanji you haven't been taught, then the first meaning. Tapping opens the word. */
export function WordRow({ id, highlight }: { id: string; highlight?: string }) {
  const data = useData();
  const hide = furiganaRule(useStore(), data, id);
  const w = data.words[id];
  if (!w) return null;
  return (
    <a class="word-row" href={href.word(id)}>
      <span class="word-jp">
        <Furigana segments={w.furigana} highlight={highlight} link={false} hide={hide} />
      </span>
      <span class="word-gloss">{glossLine(w)}</span>
    </a>
  );
}

export function glossLine(w: Word): string {
  return w.senses[0]?.gloss.slice(0, 3).join(", ") ?? "";
}

/**
 * A Tatoeba sentence (or a made-up one in `sentence`) with every known word linked, English underneath. Kanji you
 * haven't been taught get furigana.
 */
export function SentenceView({
  id,
  sentence,
  highlight,
  note,
}: {
  id?: string;
  sentence?: Sentence;
  highlight?: string;
  note?: ComponentChildren;
}) {
  const data = useData();
  const store = useStore();
  const s = sentence ?? (id ? data.sentences[id] : undefined);
  if (!s) return null;
  const parts: ComponentChildren[] = [];
  let pos = 0;
  for (const [start, len, wid] of s.links) {
    if (start < pos) continue;
    if (start > pos) parts.push(s.ja.slice(pos, start));
    const text = s.ja.slice(start, start + len);
    const hl = highlight && (wid === highlight || [...text].some((c) => c === highlight));
    const segs = data.words[wid] && alignFurigana(text, data.words[wid].furigana);
    const hide = furiganaRule(store, data, wid);
    parts.push(
      <a key={start} class={hl ? "sent-link hl" : "sent-link"} href={href.word(wid)}>
        {segs?.some((g) => g[1] !== null && !hide(g)) ? <Furigana segments={segs} link={false} hide={hide} /> : text}
      </a>,
    );
    pos = start + len;
  }
  parts.push(s.ja.slice(pos));
  return (
    <div class="sentence">
      <div class="sent-ja" lang="ja">
        <SpeakButton onClick={() => playSentence(s)} human={!!s.audio} />
        {parts}
      </div>
      <div class="sent-en">{s.en}</div>
      {note && <div class="sent-note">{note}</div>}
    </div>
  );
}

/** A word's furigana fitted to how it's written in a sentence: 言う's segments over 言った. Null if they don't fit. */
export function alignFurigana(text: string, segs: Segment[]): Segment[] | null {
  const out: Segment[] = [];
  let pos = 0;
  for (const seg of segs) {
    if (text.startsWith(seg[0], pos)) {
      out.push(seg);
      pos += seg[0].length;
    } else if (seg[1] === null) break; // a conjugated ending
    else return null;
  }
  if (pos < text.length) out.push([text.slice(pos), null]);
  return out;
}

/** A small speaker button. Human recordings get a filled icon, text-to-speech an outline. */
export function SpeakButton({ onClick, human }: { onClick: () => void; human: boolean }) {
  return (
    <button
      class={`speak ${human ? "human" : "tts"}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      title={human ? "Play recording" : "Play (synthetic voice)"}
      aria-label={human ? "Play recording" : "Play with synthetic voice"}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 9v6h4l5 4V5L8 9H4z" />
        <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" />
      </svg>
    </button>
  );
}

export function WordSpeak({ w }: { w: Word }) {
  return <SpeakButton onClick={() => playWord(w)} human={!!w.audio} />;
}

/** A KANJIDIC reading: on in katakana, kun with its okurigana dimmed (い.きる → い・きる). */
/** A tapped word's reading and meaning, with a link to its page (reading practice and stories). */
export function WordGloss({ id }: { id: string }) {
  const w = useData().words[id];
  if (!w) return null;
  return (
    <div class="read-gloss">
      <span lang="ja">
        <Furigana segments={w.furigana} link={false} />
      </span>{" "}
      {glossLine(w)}{" "}
      <a class="more" href={href.word(w.id)}>
        Open
      </a>
    </div>
  );
}

export function ReadingText({ r }: { r: string }) {
  const [stem, oku] = r.split(".");
  return (
    <span class="reading-text" lang="ja">
      {stem}
      {oku && <span class="okurigana">{oku}</span>}
    </span>
  );
}

export function Section({ title, children, hint }: { title: string; children: ComponentChildren; hint?: string }) {
  return (
    <section class="section">
      <h2>{title}</h2>
      {hint && <p class="hint">{hint}</p>}
      {children}
    </section>
  );
}

/** Shows the first `n` children with a "show all" button. */
export function MoreList<T>({ items, n, render }: { items: T[]; n: number; render: (item: T) => ComponentChildren }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, n);
  return (
    <>
      {shown.map(render)}
      {items.length > n && (
        <button class="more" onClick={() => setOpen(!open)}>
          {open ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

export function Badges({ items }: { items: (string | number | false | null | undefined)[] }) {
  return (
    <div class="badges">
      {items.filter(Boolean).map((b) => (
        <span key={b as string} class="badge">{b}</span>
      ))}
    </div>
  );
}

/** The kana this reading key stands for in words, for matching search input. */
export function readingKana(r: string): string {
  return hira(r.replace(/[.-]/g, ""));
}


/** A reading in romaji, when it's switched on in Settings (off by default). */
export function Romaji({ kana }: { kana: string }) {
  const store = useStore();
  if (!store.settings.romaji) return null;
  return <div class="romaji">{toRomaji(kana)}</div>;
}

/** The kana reading of furigana segments. */
export const readingOf = (segs: Segment[]) => segs.map(([text, kana]) => kana ?? text).join("");

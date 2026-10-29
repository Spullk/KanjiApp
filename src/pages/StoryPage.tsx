import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { isKanji, useData } from "../data";
import { href } from "../router";
import { update, useStore } from "../srs";
import { coverage, isFinished, knowledge, loadStory, newWords, setFinished, useStories, type Knowledge, type Paragraph } from "../stories";
import { studiedKanji } from "../reading";
import { WordGloss } from "../components/bits";
import { minutes } from "./StoriesPage";

/** A story, exactly as published, with every word tappable and the words you don't know underlined. */
export function StoryPage({ id }: { id: string }) {
  const data = useData();
  const store = useStore();
  const info = useStories()?.find((s) => s.id === id);
  const [paras, setParas] = useState<Paragraph[] | null>();
  const [word, setWord] = useState<string>();
  const [allReadings, setAllReadings] = useState(false);
  useEffect(() => {
    loadStory(id).then((p) => setParas(p ?? null));
  }, [id]);
  const k = useMemo(() => knowledge(store, data), [store, data]);
  const taught = useMemo(() => studiedKanji(store, data), [store, data]);

  if (paras === null) return <p class="empty">This story isn't in Nekko anymore.</p>;
  if (!paras || !info) return <p class="loading">Loading story…</p>;

  const c = coverage(k, info);
  const fresh = newWords(k, info);
  const done = isFinished(store, id);
  const pick = (wid: string) => setWord(word === wid ? undefined : wid);

  return (
    <article class="page story">
      <h1 lang="ja">{info.title}</h1>
      <p class="story-meta">
        <span lang="ja">{info.author}</span>
        {info.level != null && ` · level ${info.level}`} · {minutes(info.chars)} min · you know {Math.floor((c.known / c.total) * 100)}% of the
        words
      </p>
      <label class="story-option">
        <input type="checkbox" checked={allReadings} onChange={() => setAllReadings(!allReadings)} />
        Readings over every kanji, not just the ones you haven't been taught (tap a word for its reading)
      </label>

      <div class="story-text" lang="ja">
        {paras.map((p, i) => (
          <p key={i}>
            <ParagraphView p={p} k={k} taught={allReadings ? undefined : taught} word={word} onWord={pick} />
          </p>
        ))}
      </div>
      {word && (
        <div class="story-gloss">
          <WordGloss id={word} />
        </div>
      )}

      {fresh.length > 0 && (
        <a class="primary wide" href={href.learn(id)}>
          Learn this story's {fresh.length} new {fresh.length === 1 ? "word" : "words"}
        </a>
      )}
      <button class="secondary wide" onClick={() => update((s) => setFinished(s, id, !done))}>
        {done ? "✓ Finished (tap to undo)" : "Mark as finished"}
      </button>
      <p class="hint">
        {info.source === "tadoku" ? (
          <>
            © NPO多言語多読, <a href="https://creativecommons.org/licenses/by-nc-nd/4.0/">CC BY-NC-ND 4.0</a>. Shown
            unchanged. <a href={info.url}>The original, with pictures</a>.
          </>
        ) : (
          <>
            {info.author}, from <a href={info.url}>Aozora Bunko</a> (public domain).
          </>
        )}
      </p>
    </article>
  );
}

type ViewProps = { p: Paragraph; k: Knowledge; taught?: Set<string>; word?: string; onWord: (id: string) => void };

/** One paragraph: words as buttons, with readings only over kanji you haven't been taught (all, without `taught`). */
function ParagraphView({ p: [text, links, readings], k, taught, word, onWord }: ViewProps) {
  const out: ComponentChildren[] = [];
  let r = 0;
  // Text from `at` to `to`, with ruby where a reading starts inside it. Returns where it stopped.
  const plain = (at: number, to: number, into: ComponentChildren[]) => {
    for (; r < readings.length && readings[r][0] < to; r++) {
      const [start, len, kana] = readings[r];
      if (start < at) continue;
      if (start > at) into.push(text.slice(at, start));
      const base = text.slice(start, start + len);
      into.push(!taught || [...base].some((ch) => isKanji(ch) && !taught.has(ch)) ? <ruby key={start}>{base}<rt>{kana}</rt></ruby> : base);
      at = start + len;
    }
    if (at < to) into.push(text.slice(at, to));
    return Math.max(at, to);
  };
  let pos = 0;
  for (const [start, len, wid] of links) {
    if (start < pos || (pos = plain(pos, start, out)) > start) continue;
    const stage = k.word(wid);
    if (!stage) continue;
    const inner: ComponentChildren[] = [];
    pos = plain(start, start + len, inner);
    out.push(
      <button key={start} class={`read-word ${stage}${word === wid ? " on" : ""}`} onClick={() => onWord(wid)}>
        {inner}
      </button>,
    );
  }
  plain(pos, text.length, out);
  return <>{out}</>;
}

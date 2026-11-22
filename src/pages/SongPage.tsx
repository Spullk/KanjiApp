import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useData } from "../data";
import { href } from "../router";
import { getStore, update, useStore } from "../srs";
import { knowledge, type Knowledge } from "../stories";
import { Chips, glossLine } from "../components/bits";
import {
  aiPrompt,
  analyse,
  getSong,
  kanjiOf,
  loadTokenizer,
  parseAI,
  queueWord,
  removeSong,
  saveSong,
  songCoverage,
  songCredits,
  songStage,
  tokenizerReady,
  unqueueWord,
  withAnswer,
  type ChatMessage,
  type Song,
  type SongLine,
  type SongWord,
} from "../songs";
import { aiError, askChat, askForNotes, getAIKey, modelOf } from "../songAI";

type Tk = Awaited<ReturnType<typeof loadTokenizer>>;
type Lyric = Exclude<SongLine, { gap: true }>;
type AskFrom = { about: string; info: string; kind: "song" | "line" | "word" };

const BUBBLE = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9.5h8M8 12.5h5" />
  </svg>
);
const ASK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M12 8.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" />
  </svg>
);

/** A song: every lyric line with its words tappable, the ones you don't know underlined, and AI notes and chat. */
export function SongPage({ id }: { id: string }) {
  const data = useData();
  const store = useStore();
  const song = getSong(store, id);
  const [tk, setTk] = useState<Tk | null>(null);
  const [tkError, setTkError] = useState("");
  const [open, setOpen] = useState<number | null>(null);
  const [sel, setSel] = useState<[number, number] | null>(null);
  const [ask, setAsk] = useState<AskFrom | null>(null);
  const [redo, setRedo] = useState(false);

  useEffect(() => {
    loadTokenizer().then(setTk, (e) => setTkError((e as Error).message));
  }, []);
  const k = useMemo(() => knowledge(store, data), [store, data]);
  const result = useMemo(() => (song && tk ? analyse(song, tk, data) : null), [song?.lyrics, song?.ai, tk, data]);

  // Remember which Nekko words the song has, so the song list can say how much of it you know.
  useEffect(() => {
    if (!song || !result || (song.wids ?? []).join() === result.wids.join()) return;
    update((s) => {
      const cur = getSong(s, id);
      if (cur) saveSong(s, { ...cur, wids: result.wids });
    });
  }, [result]);

  if (!song) return <p class="empty">This song isn't in your songs anymore. <a href={href.songs()}>Your songs</a></p>;

  const cover = songCoverage(k, song);
  const ai = song.ai;
  const info = ai?.song;
  const credits = songCredits(info);
  const names = [info?.titleReading, info?.titleRomaji, info?.titleEnglish, song.aka].filter((n, i, a) => n && n !== song.title && a.indexOf(n) === i);
  const lines = result?.lines ?? [];
  const word = sel ? (lines[sel[0]] as Lyric | undefined)?.words[sel[1]] : undefined;

  const askLine = (li: number) => {
    const l = lines[li] as Lyric;
    setAsk({ kind: "line", about: `Line ${l.n}: ${l.text}`, info: lineInfo(l, "The learner is asking about this line.") });
  };
  const askWord = (li: number, w: SongWord) => {
    const l = lines[li] as Lyric;
    const bits = [`Word: ${w.s}`, w.base !== w.s && `dictionary form ${w.base}`, w.r && `read ${w.r}`, w.sung && `sung as ${w.sung}`, w.m && `meaning here: ${w.m}`, w.wid && `Nekko's dictionary: ${glossLine(data.words[w.wid])}`].filter(Boolean).join("; ");
    setAsk({ kind: "word", about: `${w.s} · line ${l.n}`, info: `${bits}\n${lineInfo(l, "The learner is asking about one word in this line.")}` });
  };

  return (
    <article class="page song-page">
      <a class="back-link" href={href.songs()}>
        ‹ Songs
      </a>
      <h1 lang="ja">{song.title}</h1>
      {names.length > 0 && (
        <p class="song-names" lang="ja">
          {names.join(" · ")}
        </p>
      )}
      <p class="song-meta">
        {song.artist && <span lang="ja">{song.artist} · </span>}
        {cover === undefined ? "" : `you know ${Math.floor(cover * 100)}% of the words`}
      </p>
      {(credits.length > 0 || info?.background) && (
        <details class="song-about">
          <summary>About this song</summary>
          {credits.length > 0 && (
            <dl class="song-credits">
              {credits.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd lang="ja">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          {info?.background && <p>{info.background}</p>}
          {info?.confidence === "unsure" && <p class="hint">The AI wasn't sure it found the right song, so check these details.</p>}
          {!!ai?.song?.sources?.length && (
            <p class="song-sources">
              {ai.song.sources.map((u) => (
                <a key={u} href={u} target="_blank" rel="noopener">
                  {u}
                </a>
              ))}
            </p>
          )}
        </details>
      )}
      <button class="ask-song" onClick={() => setAsk({ kind: "song", about: "The whole song", info: "" })}>
        {ASK}Ask about this song
      </button>

      {(!ai || redo) && <AINotes song={song} onDone={ai ? () => setRedo(false) : undefined} />}
      {result && ai && (result.lineCountOff || result.missing.length > 0) && (
        <p class="hint">
          {result.lineCountOff && `The AI counted ${ai.lineCount} lines and Nekko ${lines.filter((l) => !l.gap).length}, so some notes may sit on the wrong line. `}
          {result.missing.length > 0 && `${result.missing.length} words have no meaning from the AI: ${result.missing.slice(0, 12).join("、")}${result.missing.length > 12 ? "…" : ""}.`}
        </p>
      )}

      {tkError ? (
        <p class="form-error">
          {tkError}{" "}
          <button class="link-button" onClick={() => location.reload()}>
            Try again
          </button>
        </p>
      ) : !result ? (
        <p class="loading">{tokenizerReady() ? "Splitting the lines into words…" : "Getting the word splitter ready. The first time it downloads its dictionary (about 18 MB), then it works offline."}</p>
      ) : (
        <div class="lyrics">
          {lines.map((l, li) =>
            l.gap ? (
              <div key={li} class="stanza-gap" />
            ) : (
              <div key={li} class={`lrow${open === li ? " open" : ""}`}>
                <div class="lmain">
                  <span class="ja-line" lang="ja">
                    {l.words.map((w, wi) => (
                      <WordButton key={wi} w={w} stage={w.wid ? songStage(store, k, w.wid) : undefined} on={!!sel && sel[0] === li && sel[1] === wi} onClick={() => setSel(sel && sel[0] === li && sel[1] === wi ? null : [li, wi])} />
                    ))}
                  </span>
                  <button class={`lb${open === li ? " on" : ""}`} aria-label="Words and notes for this line" aria-expanded={open === li} onClick={() => setOpen(open === li ? null : li)}>
                    {BUBBLE}
                  </button>
                </div>
                {open === li && <LinePanel l={l} li={li} k={k} onWord={(wi) => setSel([li, wi])} onAsk={() => askLine(li)} />}
              </div>
            ),
          )}
        </div>
      )}

      <p class="song-credit">{song.source === "lrclib" ? "Lyrics from LRCLIB." : "Lyrics you pasted."} They're kept only in your own progress.</p>
      <SongTools song={song} onRedo={() => setRedo(true)} />
      <div class="runout" />

      {word && sel && <WordCard w={word} k={k} onClose={() => setSel(null)} onAsk={() => askWord(sel[0], word)} />}
      {ask && <AskChat song={song} from={ask} onClose={() => setAsk(null)} />}
    </article>
  );
}

function lineInfo(l: Lyric, intro: string): string {
  const ws = l.words
    .filter((w) => w.kind !== "punct")
    .map((w) => `${w.s}${w.base !== w.s ? ` (from ${w.base})` : ""}${w.r && w.r !== w.s ? ` [${w.r}]` : ""}${w.sung ? ` sung ${w.sung}` : ""}${w.m ? `: ${w.m}` : ""}`)
    .join("\n");
  return `${intro}\nLine ${l.n}: ${l.text}\n${l.note ? `Note on this line: ${l.note}\n` : ""}How Nekko split it:\n${ws}`;
}

function WordButton({ w, stage, on, onClick }: { w: SongWord; stage?: string; on: boolean; onClick: () => void }) {
  if (w.kind === "punct") return <>{w.s}</>;
  const cls = ["sw", stage === "new" || stage === "learning" || stage === "added" ? stage : "", on ? "on" : ""].filter(Boolean).join(" ");
  return (
    <button class={cls} onClick={onClick}>
      {w.sung ? (
        <ruby>
          {w.s}
          <rt>{w.sung}</rt>
        </ruby>
      ) : (
        w.s
      )}
    </button>
  );
}

function LinePanel({ l, k, onWord, onAsk }: { l: Lyric; li: number; k: Knowledge; onWord: (wi: number) => void; onAsk: () => void }) {
  const store = useStore();
  return (
    <div class="lpanel">
      <div class="wbw">
        {l.words.map((w, wi) => {
          if (w.kind === "punct") return null;
          const st = w.wid ? songStage(store, k, w.wid) : undefined;
          return (
            <button key={wi} onClick={() => onWord(wi)}>
              <span class="jw" lang="ja">
                {w.s}
                {w.r && w.r !== w.s && <span class="jr">{w.r}</span>}
              </span>
              <span class="mean">
                {w.base !== w.s && (
                  <span class="base" lang="ja">
                    {w.base} ·{" "}
                  </span>
                )}
                {w.m || w.dict || (w.wid ? "" : "")}
                {!w.m && w.wid && <WordMeaning wid={w.wid} />}
                {w.sung ? <span class="tag sung">sung {w.sung}</span> : st === "new" ? <span class="tag new">new</span> : st === "added" ? <span class="tag added">added</span> : st === "learning" ? <span class="tag learning">learning</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {l.note && (
        <div class="note">
          <b>Note</b>
          {l.note}
        </div>
      )}
      <button class="askline" onClick={onAsk}>
        {ASK}Ask about this line
      </button>
    </div>
  );
}

function WordMeaning({ wid }: { wid: string }) {
  const w = useData().words[wid];
  return w ? <>{glossLine(w)}</> : null;
}

const STATUS: Record<string, string> = { new: "new to you", learning: "learning", known: "known", added: "added to your lessons" };

/** The word you tapped, as an overlay above the tab bar so it never changes how far the page scrolls. */
function WordCard({ w, k, onClose, onAsk }: { w: SongWord; k: Knowledge; onClose: () => void; onAsk: () => void }) {
  const data = useData();
  const store = useStore();
  const nw = w.wid ? data.words[w.wid] : undefined;
  const st = w.wid ? songStage(store, k, w.wid) : undefined;
  const kanji = kanjiOf(nw?.w ?? w.base).filter((c) => data.kanji[c]);
  const bits = [w.r && w.r !== w.s && w.r, w.base !== w.s && `from ${w.base}${nw && nw.r !== w.r ? `（${nw.r}）` : ""}`, w.kind === "grammar" ? "grammar" : st && STATUS[st]].filter(Boolean);
  return (
    <div class="word-sheet">
      <div class="word-card" role="dialog" aria-label="Word meaning">
        <div class="wc-top">
          <div>
            <div class="wc-word" lang="ja">
              {w.s}
            </div>
            <div class="wc-read" lang="ja">
              {bits.join(" · ")}
            </div>
          </div>
          <button class="x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div class="wc-sec">
          <b>In this song</b>
          {w.m || <span class="muted">No AI meaning yet. Get the AI notes at the top of the song.</span>}
        </div>
        {nw ? (
          <div class="wc-sec">
            <b>Dictionary</b>
            {glossLine(nw)}
          </div>
        ) : (
          w.dict && (
            <div class="wc-sec">
              <b>
                Dictionary <span class="ai-badge">AI</span>
              </b>
              {w.dict}
            </div>
          )
        )}
        {w.sung && (
          <div class="wc-sec sungbox">
            Sung here as{" "}
            <span class="sr" lang="ja">
              {w.sung}
            </span>
            . Your card teaches the usual reading{" "}
            <span lang="ja">{nw?.r ?? w.r}</span>.
          </div>
        )}
        {kanji.length > 0 && (
          <div class="wc-sec">
            <b>Kanji</b>
            <Chips items={kanji} kind="kanji" />
          </div>
        )}
        {w.kind === "word" && !nw && <p class="hint">Nekko doesn't have this word yet, so it can't go in your lessons.</p>}
        <div class="actions">
          {w.wid && st === "new" && (
            <button class="primary" onClick={() => update((s) => queueWord(s, data, w.wid!))}>
              ＋ Add to my lessons
            </button>
          )}
          {w.wid && st === "added" && (
            <button class="primary done" onClick={() => update((s) => unqueueWord(s, w.wid!))}>
              ✓ Added (tap to undo)
            </button>
          )}
          {w.wid && (
            <a class="secondary-link" href={href.word(w.wid)}>
              Open in Nekko
            </a>
          )}
          <button class="secondary ask" onClick={onAsk}>
            {ASK}Ask
          </button>
        </div>
      </div>
    </div>
  );
}

/** Getting the AI's song details, line notes and word meanings: copy Nekko's request into any AI app and paste the
 * answer back (no API key needed), or one tap with your API key. `onDone` closes it when it's redoing notes. */
function AINotes({ song, onDone }: { song: Song; onDone?: () => void }) {
  const store = useStore();
  const key = getAIKey();
  const model = modelOf(store.settings);
  const [notes, setNotes] = useState(song.notes ?? "");
  const [paste, setPaste] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const ctl = useRef<AbortController | null>(null);
  const box = useRef<HTMLElement>(null);
  const withNotes = (): Song => ({ ...song, notes: notes.trim() || undefined });
  const save = (s: Song) => update((st) => saveSong(st, s));
  const done = (s: Song, text: string) => {
    save(withAnswer(s, parseAI(text)));
    onDone?.();
  };

  // Redo opens from the bottom of the page, so bring it into view.
  useEffect(() => {
    if (onDone) box.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const run = async () => {
    setError("");
    ctl.current = new AbortController();
    setStatus("Starting…");
    try {
      const s = withNotes();
      const text = await askForNotes(aiPrompt(s), getStore().settings, (t, n) => setStatus(t ? `Writing the notes (${t.length.toLocaleString()} characters so far)…` : `Researching the song (${n} ${n === 1 ? "search" : "searches"})…`), ctl.current.signal);
      done(s, text);
    } catch (e) {
      setError(await aiError(e));
    } finally {
      ctl.current = null;
      setStatus("");
    }
  };
  const copy = async () => {
    setError("");
    save(withNotes());
    try {
      await navigator.clipboard.writeText(aiPrompt(withNotes()));
      setCopied(true);
    } catch {
      setError("Couldn't copy. Your browser blocked it.");
    }
  };
  const read = () => {
    setError("");
    try {
      done(withNotes(), paste);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <section class="ai-notes" ref={box}>
      <h2>{onDone ? "Redo the notes from AI" : "Notes and meanings from AI"}</h2>
      <p class="hint">The AI finds the song (title, who wrote and sang it, when it came out, what it was made for), looks up why it was written, then explains the lines and gives every word's meaning in the song. It never gets to see more than the lyrics you added.</p>
      <textarea rows={2} placeholder="Your own notes or links for the AI (optional)" value={notes} onInput={(e) => setNotes(e.currentTarget.value)} />
      {key &&
        (status ? (
          <div class="ai-run">
            <span>{status}</span>
            <button class="secondary" onClick={() => ctl.current?.abort()}>
              Stop
            </button>
          </div>
        ) : (
          <button class="primary wide" onClick={run}>
            Get the notes from Claude ({model.label}, {model.price.split(", ")[1]})
          </button>
        ))}
      {key && <p class="ai-or">Or without using your API key:</p>}
      <ol class="ai-steps">
        <li>
          <button class="secondary" onClick={copy}>
            {copied ? "✓ Copied" : "Copy Nekko's request"}
          </button>{" "}
          and paste it into{" "}
          <a href="https://claude.ai/new" target="_blank" rel="noopener">
            Claude
          </a>{" "}
          or any AI app that can search the web. Turn web search on if the app asks.
        </li>
        <li>
          Copy the AI's whole answer and paste it here:
          <textarea rows={3} spellcheck={false} placeholder='{ "nekko": 3, … }' value={paste} onInput={(e) => setPaste(e.currentTarget.value)} />
          <button class="primary wide" disabled={!paste.trim()} onClick={read}>
            Read the answer
          </button>
        </li>
        {!key && (
          <li class="hint">
            Or add your Claude API key in <a href={href.settings("app")}>Settings → AI</a> to do this in one tap.
          </li>
        )}
      </ol>
      {error && <p class="form-error">{error}</p>}
      {onDone && !status && (
        <button class="link-button" onClick={onDone}>
          Keep the notes you have
        </button>
      )}
    </section>
  );
}

/** Less common things to do with a song, at the bottom. */
function SongTools({ song, onRedo }: { song: Song; onRedo: () => void }) {
  const [sure, setSure] = useState(false);
  return (
    <div class="song-tools">
      {song.ai && (
        <button class="link-button" onClick={onRedo}>
          Redo the AI notes
        </button>
      )}
      <button
        class="link-button"
        onClick={() => {
          if (!sure) return setSure(true);
          update((s) => removeSong(s, song.id));
          location.hash = href.songs();
        }}
      >
        {sure ? "Tap again to remove this song" : "Remove this song"}
      </button>
    </div>
  );
}

const SUGGEST: Record<AskFrom["kind"], string[]> = {
  song: ["What is this song about?", "Who wrote it, and why?", "What should I listen for as a learner?"],
  line: ["Break down the grammar", "What feeling does this line give?", "How would you say this in everyday Japanese?"],
  word: ["Why this form here?", "How is it used outside songs?", "Give me two example sentences"],
};

const CHAT_KEEP = 60;

function chatSystem(song: Song): string {
  const s = song.ai?.song;
  const about = [...songCredits(s).map(([k, v]) => `${k}: ${v}.`), s?.background].filter(Boolean).join(" ").slice(0, 2500);
  return `You are the tutor inside Nekko, a Japanese study app. The learner is studying a song and asks you follow-up questions.
Song: ${song.title}${song.artist ? ` by ${song.artist}` : ""}
${about ? `What Nekko knows about the song: ${about}` : ""}

How to answer:
- Answer in English. When you write Japanese, add the reading in hiragana in brackets the first time.
- Explain grammar plainly: name the form, say what it does here, and show how it's built from its parts.
- Go beyond the song when it helps: everyday usage, nuance, register, related words, short example sentences of your own.
- Keep it short (under 150 words) unless the learner asks for more.
- You only see the line or word the learner shares. Never write out or guess other lyrics of this song.
- If you're not sure (for example what the writer meant), say so.
- Plain text, short paragraphs; you may use **bold** and "- " bullet lines.`;
}

/** The Ask chat: knows the song and the line or word you asked from, and keeps one history per song. */
function AskChat({ song, from, onClose }: { song: Song; from: AskFrom; onClose: () => void }) {
  const store = useStore();
  const key = getAIKey();
  const [log, setLog] = useState<ChatMessage[]>(() => {
    const prev = song.chat ?? [];
    const lastAbout = [...prev].reverse().find((m) => m.about)?.about;
    return lastAbout === from.about ? prev : [...prev, { role: "user", text: "", about: from.about, info: from.info, t: Date.now() }];
  });
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ctl = useRef<AbortController | null>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollTo(0, box.current.scrollHeight);
  }, [log]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.classList.add("no-scroll");
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("no-scroll");
    };
  }, []);

  const persist = (msgs: ChatMessage[]) =>
    update((s) => {
      const cur = getSong(s, song.id);
      if (cur) saveSong(s, { ...cur, chat: msgs.filter((m) => m.text || m.about).slice(-CHAT_KEEP) });
    });

  /** The context marker comes first; its info rides with the first question after it. */
  const turns = (msgs: ChatMessage[]) => {
    const out: { role: "user" | "assistant"; content: string }[] = [];
    let info = "";
    for (const m of msgs) {
      if (m.about) {
        info = m.info ?? "";
        continue;
      }
      if (!m.text) continue;
      if (m.role === "user") {
        out.push({ role: "user", content: (info ? info + "\n\n" : "") + "Question: " + m.text });
        info = "";
      } else out.push({ role: "assistant", content: m.text });
    }
    while (out.length && out[0].role !== "user") out.shift();
    return out.slice(-16);
  };

  const send = async (text: string) => {
    text = text.trim();
    if (!text || busy) return;
    setError("");
    const q: ChatMessage = { role: "user", text, t: Date.now() };
    const msgs = [...log, q];
    setDraft("");
    if (!key) {
      setLog(msgs);
      persist(msgs);
      return;
    }
    const a: ChatMessage = { role: "assistant", text: "", t: Date.now() };
    setLog([...msgs, a]);
    setBusy(true);
    ctl.current = new AbortController();
    try {
      const answer = await askChat(chatSystem(song), turns(msgs), store.settings, (t) => setLog([...msgs, { ...a, text: t }]), ctl.current.signal);
      const done = [...msgs, { ...a, text: answer }];
      setLog(done);
      persist(done);
    } catch (e) {
      setError(await aiError(e));
      setLog(msgs);
      persist(msgs);
    } finally {
      setBusy(false);
      ctl.current = null;
    }
  };

  const copyQuestion = async () => {
    const last = [...log].reverse().find((m) => m.role === "user" && m.text);
    const ctx = [...log].reverse().find((m) => m.about)?.info ?? "";
    try {
      await navigator.clipboard.writeText(`${chatSystem(song)}\n\n${ctx}\n\nQuestion: ${last?.text ?? draft}`);
      setError("Copied. Paste it into the Claude app.");
    } catch {
      setError("Couldn't copy. Your browser blocked it.");
    }
  };

  const lastAbout = [...log].reverse().find((m) => m.about);
  return (
    <>
      <div class="chat-bg" onClick={onClose} />
      <section class="chat" role="dialog" aria-label="Ask about this song">
        <div class="chat-head">
          <div>
            <h2>Ask</h2>
            <div class="chat-sub" lang="ja">
              {song.title}
            </div>
          </div>
          <div class="chat-tools">
            {log.some((m) => m.text) && (
              <button
                class="link-button"
                onClick={() => {
                  ctl.current?.abort();
                  const fresh: ChatMessage[] = [{ role: "user", text: "", about: from.about, info: from.info, t: Date.now() }];
                  setLog(fresh);
                  persist([]);
                }}
              >
                Clear
              </button>
            )}
            <button class="x" aria-label="Close chat" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <div class="msgs" ref={box}>
          {log.map((m, i) =>
            m.about ? (
              <div key={i} class="ctxmark" lang="ja">
                {m.about === "The whole song" ? m.about : `Asking about ${m.about}`}
              </div>
            ) : m.role === "user" ? (
              <div key={i} class="msg me">
                {m.text}
              </div>
            ) : (
              <div key={i} class="msg ai">
                {m.text ? <Formatted text={m.text} /> : <span class="muted">Thinking…</span>}
              </div>
            ),
          )}
          {!key && log.some((m) => m.role === "user" && m.text) && (
            <div class="chat-off">
              To get answers here, add your Claude API key in <a href={href.settings("app")}>Settings → AI</a>. Or{" "}
              <button class="link-button" onClick={copyQuestion}>
                copy the question
              </button>{" "}
              to ask in the{" "}
              <a href="https://claude.ai/new" target="_blank" rel="noopener">
                Claude app
              </a>
              .
            </div>
          )}
          {error && <p class="form-error">{error}</p>}
        </div>
        <div class="sugs">
          {SUGGEST[(lastAbout ? (lastAbout.about === "The whole song" ? "song" : lastAbout.about!.startsWith("Line ") ? "line" : "word") : from.kind) as AskFrom["kind"]].map((s) => (
            <button key={s} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
        <form
          class="composer"
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
        >
          <textarea
            rows={1}
            placeholder="Ask a question"
            aria-label="Your question"
            value={draft}
            onInput={(e) => setDraft(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                send(draft);
              }
            }}
          />
          {busy ? (
            <button type="button" class="send" aria-label="Stop" onClick={() => ctl.current?.abort()}>
              <svg viewBox="0 0 24 24">
                <rect x="7" y="7" width="10" height="10" rx="1.5" />
              </svg>
            </button>
          ) : (
            <button class="send" aria-label="Send" disabled={!draft.trim()}>
              <svg viewBox="0 0 24 24">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </form>
      </section>
    </>
  );
}

/** Claude's answer with paragraphs, "- " bullets and **bold**. */
function Formatted({ text }: { text: string }) {
  const inline = (t: string) =>
    t.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part.length > 2 && part.startsWith("*") && part.endsWith("*") ? <i key={i}>{part.slice(1, -1)}</i> : part,
    );
  return (
    <>
      {text
        .trim()
        .split(/\n{2,}/)
        .map((block, i) => {
          const ls = block.split("\n");
          if (ls.every((x) => /^\s*[-•*]\s+/.test(x)))
            return (
              <ul key={i}>
                {ls.map((x, j) => (
                  <li key={j}>{inline(x.replace(/^\s*[-•*]\s+/, ""))}</li>
                ))}
              </ul>
            );
          return (
            <p key={i}>
              {ls.map((x, j) => (
                <>
                  {j > 0 && <br />}
                  {inline(x)}
                </>
              ))}
            </p>
          );
        })}
    </>
  );
}

// The ways to answer a review card. Each gets the card and reports a grade; the review screen picks one
// from Settings.

import { useEffect, useRef, useState } from "preact/hooks";
import { bind, unbind } from "wanakana";
import { useData } from "../data";
import { checkMeaning, checkReading, type Verdict } from "../answers";
import { CardBack, cardType, type Ask } from "../cards";
import { getStore, itemInfo, parseCardId, preview, Rating, setItemInfo, update, useStore, type Grade } from "../srs";
import { shortInterval } from "./ItemCards";

export type AnswerProps = { id: string; onAnswer: (g: Grade) => void };

// Where you are on the current card, kept outside the components: opening the full page and swiping back
// remounts the review screen, and you should come back to the answer you'd already revealed or typed.
let revealed: string | null = null;
let typed: { id: string; results: Result[] } | null = null;

const BUTTONS: [Grade, string][] = [
  [Rating.Again, "Again"],
  [Rating.Hard, "Hard"],
  [Rating.Good, "Good"],
  [Rating.Easy, "Easy"],
];

/** Anki style: show the answer, then say how well you knew it. */
export function SelfGrade({ id, onAnswer: answer }: AnswerProps) {
  const [shown, setShownState] = useState(() => revealed === id);
  const setShown = (v: boolean) => {
    revealed = v ? id : null;
    setShownState(v);
  };
  const onAnswer = (g: Grade) => {
    revealed = null;
    answer(g);
  };
  const store = useStore();
  const { kind, key } = parseCardId(id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!shown && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        setShown(true);
      } else if (shown && ["1", "2", "3", "4"].includes(e.key)) {
        onAnswer(Number(e.key) as Grade);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!shown) {
    return (
      <button class="primary wide reveal" onClick={() => setShown(true)}>
        Show answer
      </button>
    );
  }
  const times = preview(getStore(), id);
  return (
    <>
      <CardBack id={id} note={itemInfo(store, kind, key)?.note} />
      <div class="grade-buttons">
        {BUTTONS.map(([g, label]) => (
          <button key={g} class={`grade g${g}`} onClick={() => onAnswer(g)}>
            <span>{label}</span>
            <small>{shortInterval(times[g])}</small>
          </button>
        ))}
      </div>
    </>
  );
}

type Result = { ask: Ask; input: string; verdict: Verdict };

/** WaniKani style: type the meaning in English and the reading in kana; right is Good, wrong is Again. */
export function TypedAnswer({ id, onAnswer: answer }: AnswerProps) {
  const data = useData();
  const store = useStore();
  const { kind, key } = parseCardId(id);
  const info = itemInfo(store, kind, key);
  const asks = cardType(id).asks.filter((a) => !a.skip?.(data, key));
  const [results, setResultsState] = useState<Result[]>(() => (typed?.id === id ? typed.results : []));
  const setResults = (fn: (rs: Result[]) => Result[]) =>
    setResultsState((rs) => {
      const next = fn(rs);
      typed = { id, results: next };
      return next;
    });
  const onAnswer = (g: Grade) => {
    typed = null;
    answer(g);
  };
  const [hint, setHint] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ask = asks[results.length] as Ask | undefined;
  const right = results.every((r) => r.verdict !== "wrong");

  useEffect(() => {
    const el = input.current;
    if (!el || !ask) return;
    el.focus();
    if (!ask.kana) return;
    bind(el, { IMEMode: true });
    return () => unbind(el);
  }, [ask]);

  useEffect(() => {
    if (ask) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") onAnswer(right ? Rating.Good : Rating.Again);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const submit = (e: Event) => {
    e.preventDefault();
    if (!ask) return;
    const typed = input.current!.value;
    const answers = ask.answers(data, key);
    const verdict = ask.kana ? checkReading(typed, answers) : checkMeaning(typed, [...answers, ...(info?.synonyms ?? [])]);
    if (verdict === "retry") {
      setHint(ask.kana ? `Type the ${ask.label === "Gap" ? "answer" : "reading"}, in kana.` : "Type the meaning, in English.");
      return;
    }
    setHint("");
    setResults((rs) => [...rs, { ask, input: typed.trim(), verdict }]);
  };

  const addSynonym = (word: string) => {
    update((s) => setItemInfo(s, kind, key, { synonyms: [...(info?.synonyms ?? []), word] }));
    onAnswer(Rating.Good);
  };

  return (
    <>
      {results.map((r, i) => (
        <div key={i} class={`typed-result ${r.verdict}`}>
          <span class="typed-label">{r.ask.label}</span>
          <span lang={r.ask.kana ? "ja" : undefined}>{r.input}</span>
          <span class="typed-verdict">{r.verdict === "right" ? "✓" : r.verdict === "close" ? "close enough ✓" : "✗"}</span>
        </div>
      ))}
      {ask ? (
        <form class="typed-form" onSubmit={submit}>
          <input
            key={results.length}
            ref={input}
            class={`typed-input ${ask.kana ? "kana" : ""}`}
            lang={ask.kana ? "ja" : "en"}
            placeholder={ask.placeholder ?? (ask.kana ? "Reading (kana)" : "Meaning")}
            autocomplete="off"
            autocapitalize="off"
            spellcheck={false}
            onInput={() => hint && setHint("")}
          />
          {hint && <p class="hint error">{hint}</p>}
          <button class="primary wide" type="submit">
            Check
          </button>
        </form>
      ) : (
        <>
          <CardBack id={id} note={info?.note} />
          <button class={`primary wide next ${right ? "right" : "wrong"}`} onClick={() => onAnswer(right ? Rating.Good : Rating.Again)}>
            {right ? "Correct · next" : "Wrong · next"}
          </button>
          <div class="typed-overrides">
            {right ? (
              <button class="link-button" onClick={() => onAnswer(Rating.Again)}>
                Actually I didn't know it
              </button>
            ) : (
              <>
                <button class="link-button" onClick={() => onAnswer(Rating.Good)}>
                  I was right
                </button>
                {results
                  .filter((r) => r.verdict === "wrong" && !r.ask.kana)
                  .map((r) => (
                    <button key={r.input} class="link-button" onClick={() => addSynonym(r.input)}>
                      Accept “{r.input}” from now on
                    </button>
                  ))}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}

// The first screen: where are you starting from? Each answer sets up the bottom bar and where you land, then
// the tour runs. It can be opened again from Settings.

import { useEffect, useState } from "preact/hooks";
import { href } from "../router";
import { getStore, update, useStore, type Settings } from "../srs";
import { BEGINNER_TABS } from "../tools";
import { KANA_ROWS } from "../kana";
import { startTour } from "./Tour";
import { KanaQuestion } from "./KanaQuestion";

type Start = NonNullable<Settings["start"]>;

const LEVELS: { start: Start; icon: string; title: string; body: string; to: string }[] = [
  { start: "new", icon: "あ", title: "I'm brand new", body: "Start with kana, sounds and your first grammar.", to: href.grammar() },
  { start: "kana", icon: "漢", title: "I can read kana", body: "Jump into kanji at lesson 1. Grammar is there when you want it.", to: href.lesson(1) },
  { start: "returning", icon: "続", title: "I've studied before", body: "Mark what you know, or bring your progress from WaniKani or Anki.", to: href.known() },
];

const CHECK = 10;
const CHECK_PASS = 8;

const listeners = new Set<() => void>();

/** Opens the welcome screen again (from Settings). */
export function openWelcome() {
  listeners.forEach((l) => l());
}

export function Welcome() {
  const store = useStore();
  const [open, setOpen] = useState(() => !getStore().settings.start && !Object.keys(getStore().cards).length);
  const [check, setCheck] = useState<{ kana: string[]; right: number; turn: number } | null>(null);
  useEffect(() => {
    const l = () => setOpen(true);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (!open) return null;

  const choose = (l: (typeof LEVELS)[number]) => {
    update((s) => {
      s.settings.start = l.start;
      if (l.start === "new") s.settings.tabs = BEGINNER_TABS;
    });
    setOpen(false);
    location.hash = l.to;
    startTour();
  };
  const checked = check && check.turn >= CHECK;
  const suggest: Start | undefined = checked ? (check.right >= CHECK_PASS ? "kana" : "new") : undefined;

  return (
    <div class="welcome" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div class="welcome-inner">
        <h1 id="welcome-title" class="brand">
          Nekko <span lang="ja">根っこ</span>
        </h1>
        {check && !checked ? (
          <>
            <p class="hint">
              Type the romaji for each. {check.turn + 1} of {CHECK}
            </p>
            <KanaQuestion
              kana={check.kana[check.turn]}
              turn={check.turn}
              onAnswer={(right) => setCheck({ ...check, right: check.right + (right ? 1 : 0), turn: check.turn + 1 })}
            />
            <button class="link-button" onClick={() => setCheck(null)}>
              Back
            </button>
          </>
        ) : (
          <>
            <p class="welcome-q">Where are you starting from?</p>
            {checked && (
              <p class="hint">
                {check.right} of {CHECK} right. {suggest === "kana" ? "You can read kana: start with kanji." : "Start from the beginning; kana come quickly."}
              </p>
            )}
            <div class="welcome-levels">
              {LEVELS.map((l) => (
                <button key={l.start} class={`welcome-level ${l.start} ${suggest === l.start ? "suggested" : ""}`} onClick={() => choose(l)}>
                  <span class="welcome-icon" lang="ja">
                    {l.icon}
                  </span>
                  <span class="welcome-text">
                    <b>{l.title}</b>
                    <span>{l.body}</span>
                  </span>
                </button>
              ))}
            </div>
            {!checked && (
              <button class="link-button" onClick={() => setCheck({ kana: sample(), right: 0, turn: 0 })}>
                Not sure? Take a 1-minute kana check
              </button>
            )}
            {store.settings.start && (
              <button class="link-button" onClick={() => setOpen(false)}>
                Close
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Ten random kana from the basic hiragana rows. */
function sample(): string[] {
  const basic = KANA_ROWS.filter((r) => r.script === "hira").slice(0, 10).flatMap((r) => r.kana);
  return [...basic].sort(() => Math.random() - 0.5).slice(0, CHECK);
}

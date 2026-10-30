// A short first-run tour, after the welcome screen: one card per tab on your bottom bar, with that tab lit up.
// It can be replayed from Settings.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { href } from "../router";
import { getStore, useStore } from "../srs";
import { barTools } from "../tools";

const SEEN = "nekko.tour";

type Step = { tab?: string; title: string; body: ComponentChildren };

const ALL_STEPS: Step[] = [
  {
    title: "Welcome to Nekko",
    body: (
      <>
        <p>
          <span lang="ja">根っこ</span> means roots. Nekko teaches kanji the way they grow: from the radicals they're built
          from, to the kanji, to the words that use them, to real sentences.
        </p>
        <p>Here's a quick look at each tab on your bar. It takes a minute. Everything else is on Home, and you can choose which tools sit on the bar in Settings.</p>
      </>
    ),
  },
  {
    tab: "home",
    title: "Home",
    body: (
      <>
        <p>What's due now and what's next to learn, with a kanji of the day to wander from. Tap anything in Nekko to open it and follow its connections.</p>
        <p>Your lessons are here too: all 2,136 Jōyō kanji in 206 lessons, related kanji side by side. Already know a lesson? Mark it known and it's skipped.</p>
      </>
    ),
  },
  {
    tab: "review",
    title: "Learn and review",
    body: (
      <>
        <p>Learn new items a few at a time, then review them as they come due. Each answer decides when you'll see it next, so you spend time on what you're about to forget.</p>
        <p>Grade yourself like in Anki (Again, Hard, Good, Easy), or switch to typing your answers like WaniKani in Settings.</p>
      </>
    ),
  },
  {
    tab: "read",
    title: "Read",
    body: <p>Short stories and folk tales, sorted by how many of their words you know. Tap any word you don't know, and learn a story's new words in one go. Sentence practice is here too.</p>,
  },
  {
    tab: "grammar",
    title: "Grammar",
    body: (
      <p>
        Split by level: Beginner (how Japanese sounds and is written, your first grammar, loanwords, numbers and set phrases),
        then N5, N4 and N3. It opens on the level you were last in. Add a point to your reviews to practise it on
        real sentences.
      </p>
    ),
  },
  {
    tab: "kana",
    title: "Kana",
    body: <p>Learn hiragana and katakana a row at a time, then drill them whenever you like. Ones you miss come back sooner; there's no schedule to keep up with.</p>,
  },
  {
    tab: "search",
    title: "Search",
    body: <p>Type kanji, kana, romaji or English. Don't know how to type a kanji? Find it by the parts you can see, or draw it.</p>,
  },
  {
    tab: "progress",
    title: "Progress",
    body: (
      <>
        <p>Your stats, review calendar and the kanji you know.</p>
        <p>
          Settings is at the top of Progress. Sign in there to sync between devices, and change the study order, card types
          and more.
        </p>
      </>
    ),
  },
  {
    title: "Ready?",
    body: <p>Start with your first few items, or tell Nekko which kanji you already know so it doesn't teach them again.</p>,
  },
];

const listeners = new Set<() => void>();

const closers = new Set<() => void>();

/** Opens the tour (from Settings). */
export function startTour() {
  listeners.forEach((l) => l());
}

/** Closes the tour and doesn't show it again here (someone who signed in and already uses Nekko). */
export function endTour() {
  markSeen();
  closers.forEach((l) => l());
}

function seen(): boolean {
  try {
    return !!localStorage.getItem(SEEN);
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN, "1");
  } catch {
    // Private mode: the tour may show again next time, which is harmless.
  }
}

export function Tour() {
  // Only on a first visit, once you've picked a starting point: nothing studied yet and the tour not seen here.
  const first = () => !seen() && !!getStore().settings.start && !Object.keys(getStore().cards).length;
  const [step, setStep] = useState<number | null>(() => (first() ? 0 : null));
  const settings = useStore().settings;
  const bar = barTools(settings).map((t) => t.tab);
  const STEPS = ALL_STEPS.filter((s) => !s.tab || bar.includes(s.tab));
  useEffect(() => {
    const open = () => setStep(0);
    const close = () => setStep(null);
    listeners.add(open);
    closers.add(close);
    return () => {
      listeners.delete(open);
      closers.delete(close);
    };
  }, []);
  const s = step === null ? undefined : STEPS[step];
  useEffect(() => {
    if (s?.tab) document.body.dataset.tour = s.tab;
    else delete document.body.dataset.tour;
    document.querySelectorAll<HTMLElement>(".tabbar a").forEach((a) => a.classList.toggle("tour-on", a.dataset.tab === s?.tab));
  }, [s]);

  if (!s || step === null) return null;
  const close = (to?: string) => {
    markSeen();
    setStep(null);
    if (to) location.hash = to;
  };
  const last = step === STEPS.length - 1;

  return (
    <div class="tour-backdrop" onClick={() => close()}>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" onClick={(e) => e.stopPropagation()}>
        <div class="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <i key={i} class={i === step ? "on" : ""} />
          ))}
        </div>
        <h2 id="tour-title">{s.title}</h2>
        {s.body}
        {last ? (
          <div class="tour-actions">
            {settings.start === "new" ? (
              <button class="primary" onClick={() => close(href.grammar())}>
                Start here
              </button>
            ) : (
              <>
                <button class="secondary" onClick={() => close(href.known())}>
                  I know some kanji
                </button>
                <button class="primary" onClick={() => close(href.learn())}>
                  Start learning
                </button>
              </>
            )}
          </div>
        ) : (
          <div class="tour-actions">
            <button class="link-button" onClick={() => close()}>
              Skip
            </button>
            {step > 0 && (
              <button class="secondary" onClick={() => setStep(step - 1)}>
                Back
              </button>
            )}
            <button class="primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

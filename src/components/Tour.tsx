// A short first-run tour: one card per tab, with that tab lit up in the tab bar. It can be replayed from Settings.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { href } from "../router";
import { getStore } from "../srs";

const SEEN = "nekko.tour";

type Tab = "home" | "review" | "read" | "search" | "progress";
type Step = { tab?: Tab; title: string; body: ComponentChildren };

const STEPS: Step[] = [
  {
    title: "Welcome to Nekko",
    body: (
      <>
        <p>
          <span lang="ja">根っこ</span> means roots. Nekko teaches kanji the way they grow: from the radicals they're built
          from, to the kanji, to the words that use them, to real sentences.
        </p>
        <p>Here's a quick look at each tab. It takes a minute.</p>
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
    tab: "search",
    title: "Search",
    body: <p>Type kanji, kana, romaji or English. Don't know how to type a kanji? Find it by the parts you can see, or draw it.</p>,
  },
  {
    tab: "progress",
    title: "Progress",
    body: (
      <>
        <p>Your stats, review calendar and the kanji you know. Extra practice lives here too: today's mistakes, leeches and writing.</p>
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

/** Opens the tour (from Settings). */
export function startTour() {
  listeners.forEach((l) => l());
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
  // Only on a first visit: nothing studied yet and the tour not seen on this device.
  const [step, setStep] = useState<number | null>(() => (!seen() && !Object.keys(getStore().cards).length ? 0 : null));
  useEffect(() => {
    const open = () => setStep(0);
    listeners.add(open);
    return () => void listeners.delete(open);
  }, []);
  const s = step === null ? undefined : STEPS[step];
  useEffect(() => {
    if (s?.tab) document.body.dataset.tour = s.tab;
    else delete document.body.dataset.tour;
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
            <button class="secondary" onClick={() => close(href.known())}>
              I know some kanji
            </button>
            <button class="primary" onClick={() => close(href.learn())}>
              Start learning
            </button>
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

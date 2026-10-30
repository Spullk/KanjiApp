// One kana question: see it (or hear it), type its romaji. Used by the kana drill and the welcome screen's check.
// The input stays mounted from one kana to the next so the phone keyboard doesn't close and reopen.

import { useEffect, useRef, useState } from "preact/hooks";
import { speak } from "../audio";
import { isRomajiFor, kanaFor, romaji, scriptOf } from "../kana";

const NEXT_AFTER_RIGHT = 600;

/** `turn` counts questions, so the same kana twice in a row still starts fresh. */
export function KanaQuestion({ kana, turn, listen, onAnswer }: { kana: string; turn: number; listen?: boolean; onAnswer: (right: boolean) => void }) {
  const [typed, setTyped] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const right = typed !== null && isRomajiFor(typed, kana);
  // What they typed, if it's another kana: shown side by side so look-alikes (シ/ツ, ぬ/め) stand out.
  const mixedUp = typed !== null && !right ? kanaFor(typed, scriptOf(kana)) : undefined;

  useEffect(() => {
    setTyped(null);
    if (input.current) input.current.value = "";
    input.current?.focus();
    if (listen) speak(kana);
  }, [kana, turn]);
  useEffect(() => {
    if (!right) return;
    const t = setTimeout(() => onAnswer(true), NEXT_AFTER_RIGHT);
    return () => clearTimeout(t);
  }, [right, kana, turn]);

  const submit = (e: Event) => {
    e.preventDefault();
    if (typed !== null) {
      if (!right) onAnswer(false);
      return;
    }
    const v = input.current!.value;
    if (v.trim()) setTyped(v);
  };

  return (
    <form class="kana-q" onSubmit={submit}>
      {listen && typed === null ? (
        <button type="button" class="listen-button" onClick={() => speak(kana)} aria-label="Play again">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" />
            <path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" />
          </svg>
        </button>
      ) : (
        <div class="kana-big" lang="ja">
          {kana}
        </div>
      )}
      <input
        ref={input}
        class={`typed-input ${typed === null ? "" : right ? "right" : "wrong"}`}
        placeholder="Romaji (ka, shi…)"
        readOnly={typed !== null}
        autocomplete="off"
        autocapitalize="off"
        spellcheck={false}
      />
      {typed !== null && (
        <div class={`kana-result ${right ? "right" : "wrong"}`}>
          {right ? `✓ ${romaji(kana)}` : `✗ It's ${romaji(kana)}`}
          {mixedUp && (
            <div class="kana-pair" lang="ja">
              <span>
                {kana} <small>{romaji(kana)}</small>
              </span>
              <span>
                {mixedUp} <small>{romaji(mixedUp)}</small>
              </span>
            </div>
          )}
        </div>
      )}
      <button class="primary wide" type="submit" disabled={right}>
        {typed === null ? "Check" : right ? "Right!" : "Next"}
      </button>
    </form>
  );
}

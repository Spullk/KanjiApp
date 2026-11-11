// Dev only: "Flag" a bad card with a note (see src/flags.ts). Shows nothing for anyone else.

import { useState } from "preact/hooks";
import { useData, type Data } from "../data";
import { parseCardId } from "../srs";
import { sendFlag, useIsDev } from "../flags";

function labelOf(data: Data, card: string): string {
  const { kind, key, face } = parseCardId(card);
  const what =
    kind === "word" ? (data.words[key] ? `${data.words[key].w} (${data.words[key].r})` : key)
    : kind === "grammar" ? (data.grammar[key]?.title ?? key)
    : key;
  return `${what}, ${kind}${face ? ` ${face} card` : ""}`;
}

/** `card` is a card id ("word:1523260:context") or an item ("word:1523260"). */
export function FlagButton({ card }: { card: string }) {
  const dev = useIsDev();
  const data = useData();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | string>("idle");
  if (!dev) return null;
  if (state === "sent") return <span class="flag-done">Flagged ✓</span>;
  if (!open)
    return (
      <button class="link-button flag-button" onClick={() => setOpen(true)} title="Flag this card for review">
        ⚑ Flag
      </button>
    );
  const send = () => {
    setState("sending");
    sendFlag({ card, label: labelOf(data, card), note: note.trim(), where: location.hash || "#/" })
      .then(() => {
        setState("sent");
        setNote("");
        setOpen(false);
      })
      .catch((e) => setState(`Couldn't send: ${e?.message ?? e}`));
  };
  return (
    <div class="flag-box">
      <div class="flag-what">Flag {labelOf(data, card)}</div>
      <textarea rows={2} placeholder="What's wrong? (optional)" value={note} onInput={(e) => setNote(e.currentTarget.value)} />
      <div class="flag-actions">
        <button class="primary" disabled={state === "sending"} onClick={send}>
          {state === "sending" ? "Sending…" : "Send flag"}
        </button>
        <button class="link-button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state !== "idle" && state !== "sending" && <p class="error">{state}</p>}
    </div>
  );
}

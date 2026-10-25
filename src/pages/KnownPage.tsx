import { useState } from "preact/hooks";
import { useData } from "../data";
import { fetchWaniKani, jlptItems, parseKnownList, wkSchedule, type ItemRef, type WaniKaniItem } from "../known";
import { addItem, addReviewedItem, isAdded, setItemInfo, setStatusMany, update, useStore, type Store } from "../srs";
import { matchAnki, readAnkiFile, type AnkiMatch } from "../anki";
import { Section } from "../components/bits";

const isKnown = (s: Store, it: ItemRef) => s.items[`${it.kind}:${it.key}`]?.status === "known";

export function KnownPage() {
  return (
    <article class="page">
      <h1>What you already know</h1>
      <p class="hint">
        Known items are skipped in lessons and reviews and count as known in Progress. You can undo any of this from
        the item's own page.
      </p>
      <JlptLevels />
      <PasteList />
      <WaniKani />
      <Anki />
    </article>
  );
}

function JlptLevels() {
  const data = useData();
  const store = useStore();
  return (
    <Section title="By JLPT level" hint="Marks the level's kanji and the radicals they're made of. Words stay in your lessons.">
      <div class="known-levels">
        {[5, 4, 3, 2, 1].map((n) => {
          const items = jlptItems(data, n);
          const kanji = items.filter((it) => it.kind === "kanji").length;
          const all = items.every((it) => isKnown(store, it));
          return (
            <button key={n} class={all ? "on" : ""} onClick={() => update((s) => setStatusMany(s, items, all ? undefined : "known"))}>
              <b>N{n}</b>
              <small>{all ? "Known · tap to undo" : `${kanji} kanji`}</small>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function PasteList() {
  const data = useData();
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const mark = () => {
    const items = parseKnownList(data, text);
    update((s) => setStatusMany(s, items, "known"));
    const k = items.filter((it) => it.kind === "kanji").length;
    setResult(items.length ? `Marked ${k} kanji and ${items.length - k} words as known.` : "Didn't find any kanji or words in that.");
    if (items.length) setText("");
  };
  return (
    <Section
      title="Paste a list"
      hint="From any app or a text file: every kanji in it is marked, and any whole word (one per line or separated by commas) Nekko has."
    >
      <textarea class="paste-box" rows={4} value={text} placeholder="日 月 火 水… or 学生, 先生, 日本語" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <button class="secondary" disabled={!text.trim()} onClick={mark}>
        Mark as known
      </button>
      {result && <p class="hint">{result}</p>}
    </Section>
  );
}

function WaniKani() {
  const data = useData();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<WaniKaniItem[] | null>(null);
  const [result, setResult] = useState("");

  const look = async () => {
    setBusy(true);
    setError("");
    setResult("");
    try {
      setFound(await fetchWaniKani(data, token.trim()));
    } catch (e) {
      setError(e instanceof Error && !(e instanceof TypeError) ? e.message : "Couldn't reach WaniKani. Check your connection and try again.");
    }
    setBusy(false);
  };

  const bring = () => {
    const now = Date.now();
    let known = 0;
    let scheduled = 0;
    let skipped = 0;
    update((s) => {
      for (const it of found!) {
        if (isAdded(s, it.kind, it.key) || s.items[`${it.kind}:${it.key}`]?.status) {
          skipped++;
          continue;
        }
        const plan = wkSchedule(it, now);
        if ("known" in plan) {
          setItemInfo(s, it.kind, it.key, { status: "known" }, now);
          known++;
        } else {
          addReviewedItem(s, it.kind, it.key, plan.stability, plan.due, now);
          scheduled++;
        }
      }
    });
    setResult(
      `Brought over ${known + scheduled}: ${known} burned items as known, ${scheduled} into your reviews at about WaniKani's timing.` +
        (skipped ? ` Skipped ${skipped} you already had in Nekko.` : ""),
    );
    setFound(null);
    setToken("");
  };

  const burned = found?.filter((it) => it.stage >= 9).length ?? 0;
  return (
    <Section
      title="From WaniKani"
      hint="Paste a personal access token (read-only is enough). Nekko only uses it once, right here, and doesn't keep it."
    >
      <a class="more" href="https://www.wanikani.com/settings/personal_access_tokens" target="_blank" rel="noopener">
        Get a token on WaniKani
      </a>
      <input
        class="token-input"
        type="password"
        autocomplete="off"
        placeholder="Token"
        value={token}
        onInput={(e) => setToken((e.target as HTMLInputElement).value)}
      />
      {!found && (
        <button class="secondary" disabled={!token.trim() || busy} onClick={look}>
          {busy ? "Looking…" : "Look up my progress"}
        </button>
      )}
      {error && <p class="hint error">{error}</p>}
      {found && (
        <div class="wk-found">
          <p>
            Found {found.length} items Nekko also has: {burned} burned, {found.length - burned} in progress. Burned ones
            become known, the rest join your reviews. Anything already in Nekko is left as it is.
          </p>
          <button class="primary" onClick={bring}>
            Bring them over
          </button>
          <button class="link-button" onClick={() => setFound(null)}>
            Cancel
          </button>
        </div>
      )}
      {result && <p class="hint">{result}</p>}
    </Section>
  );
}

function Anki() {
  const data = useData();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [found, setFound] = useState<AnkiMatch | null>(null);
  const [result, setResult] = useState("");

  const read = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    setResult("");
    try {
      setFound(matchAnki(data, await readAnkiFile(new Uint8Array(await file.arrayBuffer()))));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
    setBusy(false);
  };

  const bring = () => {
    const now = Date.now();
    let added = 0;
    let skipped = 0;
    update((s) => {
      for (const it of found!.items) {
        if (isAdded(s, it.kind, it.key) || s.items[`${it.kind}:${it.key}`]?.status) {
          skipped++;
          continue;
        }
        if ("learning" in it) addItem(s, it.kind, it.key, now);
        else addReviewedItem(s, it.kind, it.key, it.stability, it.due, now);
        added++;
      }
    });
    setResult(`Brought over ${added} items with their Anki schedule.` + (skipped ? ` Skipped ${skipped} you already had in Nekko.` : ""));
    setFound(null);
  };

  return (
    <Section
      title="From Anki"
      hint="In Anki: File → Export…, choose “Anki Deck Package (.apkg)”, keep scheduling information, and open the file here. Notes whose front is a kanji or a word Nekko has come over with their schedule."
    >
      <label class={`file-button ${busy ? "busy" : ""}`}>
        {busy ? "Reading…" : "Choose .apkg file"}
        <input type="file" accept=".apkg,.colpkg" disabled={busy} onChange={(e) => read(e.target as HTMLInputElement)} />
      </label>
      {error && <p class="hint error">{error}</p>}
      {found && (
        <div class="wk-found">
          <p>
            {found.items.length
              ? `Found ${found.items.length} kanji and words you've studied in Anki.`
              : "None of the studied notes in that deck are Nekko kanji or words."}{" "}
            Of {found.notes} notes, {found.unstudied} you haven't started and {found.unmatched} aren't single kanji or words Nekko knows.
          </p>
          {found.items.length > 0 && (
            <button class="primary" onClick={bring}>
              Bring them over
            </button>
          )}
          <button class="link-button" onClick={() => setFound(null)}>
            Cancel
          </button>
        </div>
      )}
      {result && <p class="hint">{result}</p>}
    </Section>
  );
}

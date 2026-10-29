import { DEFAULT_SETTINGS, endVacation, parseFsrsParams, mergeIntoStore, migrate, relDate, startVacation, update, useStore, type Settings, type Store } from "../srs";
import { href } from "../router";
import { Section } from "../components/bits";
import { useState } from "preact/hooks";
import { allowReminders, isNative, shareFile } from "../native";
import { signIn, signOut, syncAvailable, syncNow, useSync } from "../sync";

// Every option lives in Settings (srs.ts) with a default in DEFAULT_SETTINGS; this page only edits it.
// A new option gets a field there, a default, and a row here.

const REMINDER_HOURS = [7, 8, 9, 12, 17, 18, 19, 20, 21, 22];

export function SettingsPage() {
  const store = useStore();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => update((s) => (s.settings[key] = value));
  const isDefault = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).every((k) => store.settings[k] === DEFAULT_SETTINGS[k]);

  return (
    <article class="page">
      <h1>Settings</h1>

      {syncAvailable && <Account />}

      <Section title="Lessons">
        <label class="setting">
          New items per batch
          <select value={store.settings.batch} onChange={(e) => set("batch", Number((e.target as HTMLSelectElement).value))}>
            {[3, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label class="setting">
          New items per day
          <select value={store.settings.dailyNew} onChange={(e) => set("dailyNew", Number((e.target as HTMLSelectElement).value))}>
            {[0, 5, 10, 15, 20, 30, 50].map((n) => (
              <option key={n} value={n}>{n || "No limit"}</option>
            ))}
          </select>
        </label>
      </Section>

      <Section title="Already know some?">
        <a class="more" href={href.known()}>
          Mark kanji you know, by JLPT level or from a list, or import from WaniKani or Anki →
        </a>
      </Section>

      <Section title="Reviews">
        <label class="setting">
          How you answer
          <select value={store.settings.answerMode} onChange={(e) => set("answerMode", (e.target as HTMLSelectElement).value as Settings["answerMode"])}>
            <option value="self">Show and grade yourself</option>
            <option value="typed">Type the answer</option>
          </select>
        </label>
        <p class="hint">
          {store.settings.answerMode === "typed"
            ? "Like WaniKani: type the meaning in English and the reading in kana. Small typos in meanings are fine."
            : "Like Anki: think of the answer, show it, then say how well you knew it."}
        </p>
        <label class="setting">
          Target recall
          <select value={store.settings.retention} onChange={(e) => set("retention", Number((e.target as HTMLSelectElement).value))}>
            {[0.8, 0.85, 0.9, 0.95].map((n) => (
              <option key={n} value={n}>{Math.round(n * 100)}%</option>
            ))}
          </select>
        </label>
        <p class="hint">
          Reviews are scheduled with FSRS, the same algorithm as Anki's newer scheduler. Higher recall means more
          frequent reviews; 90% is the Anki default.
        </p>
        <FsrsParams />
      </Section>

      <Section
        title="Vacation mode"
        hint="Nothing comes due while you're away. When you come back, every review moves on by the time you were gone, so there's no pile waiting."
      >
        {store.settings.vacation ? (
          <div class="backup">
            <span>On since {relDate(store.settings.vacation)}</span>
            <button onClick={() => update((s) => endVacation(s))}>I'm back</button>
          </div>
        ) : (
          <button class="secondary" onClick={() => update((s) => startVacation(s))}>
            Go on vacation
          </button>
        )}
      </Section>

      {isNative && (
        <Section title="Reminders">
          <label class="setting">
            Daily reminder
            <select value={store.settings.reminder ?? ""} onChange={(e) => setReminder(e.target as HTMLSelectElement)}>
              <option value="">Off</option>
              {REMINDER_HOURS.map((h) => (
                <option key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</option>
              ))}
            </select>
          </label>
        </Section>
      )}

      {!isDefault && (
        <button class="link-button" onClick={() => update((s) => (s.settings = { ...DEFAULT_SETTINGS, reminder: s.settings.reminder, vacation: s.settings.vacation }))}>
          Reset to defaults
        </button>
      )}

      <Section
        title="Backup"
        hint={`Progress is saved on this ${isNative ? "phone" : "device"} only. Export now and then so you can't lose it. Importing a backup merges it with what's here, so you can also use it to bring progress over from another device.`}
      >
        <div class="backup">
          <button onClick={() => exportStore(store)}>Export progress</button>
          <label class="file-button">
            Import
            <input type="file" accept="application/json" onChange={(e) => importStore(e.target as HTMLInputElement)} />
          </label>
        </div>
      </Section>

      <Section title="Credits">
        <ul class="credits">
          <li>Dictionary: JMdict and KANJIDIC2, EDRDG, CC BY-SA 4.0</li>
          <li>Kanji parts and stroke order: KanjiVG, Ulrich Apel, CC BY-SA 3.0</li>
          <li>Example sentences and their recordings: Tatoeba Project, CC BY 2.0 FR</li>
          <li>Word recordings: Kanji alive, CC BY 4.0</li>
          <li>JLPT levels: Jonathan Waller's lists</li>
        </ul>
      </Section>
    </article>
  );
}

function ago(t: number): string {
  const m = Math.floor((Date.now() - t) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  return `at ${new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function Account() {
  const sync = useSync();
  if (!sync.user) {
    return (
      <Section title="Account" hint="Sign in to keep your progress in sync between your phone and computer. Your progress on this device is kept and merged in.">
        <button class="secondary" onClick={signIn}>
          Sign in with Google
        </button>
        {sync.error && <p class="hint error">{sync.error}</p>}
      </Section>
    );
  }
  return (
    <Section title="Account">
      <p class="account-line">
        Signed in as <b>{sync.user.name || sync.user.email}</b>
        {sync.user.name && sync.user.email && <span class="hint"> · {sync.user.email}</span>}
      </p>
      <p class="hint">
        {sync.status === "syncing"
          ? "Syncing…"
          : sync.status === "error"
            ? sync.error
            : sync.last
              ? `Synced ${ago(sync.last)}.`
              : "Syncs a few seconds after each change."}
      </p>
      <div class="backup">
        <button disabled={sync.status === "syncing"} onClick={syncNow}>
          Sync now
        </button>
        <button onClick={signOut}>Sign out</button>
      </div>
    </Section>
  );
}

function FsrsParams() {
  const store = useStore();
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const params = store.settings.fsrsParams;
  const use = () => {
    try {
      const w = parseFsrsParams(text);
      update((s) => (s.settings.fsrsParams = w));
      setText("");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details class="fsrs-params">
      <summary>FSRS parameters: {params ? "your own" : "default"}</summary>
      <p class="hint">
        FSRS can be tuned to how your memory works. If you use FSRS in Anki, open a deck's options, press Optimize
        under FSRS, then copy the numbers in the parameters box and paste them here.
      </p>
      {params && (
        <p class="hint params-now">
          {params.map((n) => n.toFixed(4)).join(", ")}{" "}
          <button class="link-button" onClick={() => update((s) => delete s.settings.fsrsParams)}>
            Back to default
          </button>
        </p>
      )}
      <textarea class="paste-box" rows={3} value={text} placeholder="0.212, 1.2931, 2.3065, 8.2956, …" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <button class="secondary" disabled={!text.trim()} onClick={use}>
        Use these
      </button>
      {error && <p class="hint error">{error}</p>}
    </details>
  );
}

async function setReminder(select: HTMLSelectElement) {
  const hour = select.value === "" ? undefined : Number(select.value);
  if (hour !== undefined && !(await allowReminders())) {
    select.value = "";
    alert("Nekko isn't allowed to send notifications. You can turn them on in the phone's Settings.");
    return;
  }
  update((s) => (s.settings.reminder = hour));
}

function exportStore(store: Store) {
  const name = `nekko-progress-${new Date().toISOString().slice(0, 10)}.json`;
  const json = JSON.stringify({ ...store, undo: [] });
  if (isNative) {
    shareFile(name, json).catch((e) => console.error(e));
    return;
  }
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importStore(input: HTMLInputElement) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    mergeIntoStore(migrate(JSON.parse(await file.text())));
    input.value = "";
  } catch (e) {
    input.value = "";
    console.error(e);
    input.setCustomValidity("That file isn't a Nekko backup.");
    input.reportValidity();
  }
}

import { addFaceToStudied, missingFace, setKanjiCards, type ExtraFace } from "../srs";
import { DEFAULT_SETTINGS, endVacation, getStore, parseFsrsParams, mergeIntoStore, migrate, relDate, startVacation, update, useStore, type Settings, type Store } from "../srs";
import { href } from "../router";
import { Section } from "../components/bits";
import { useEffect, useMemo, useState } from "preact/hooks";
import { default_w } from "ts-fsrs";
import { countTested, histories, MIN_REVIEWS, type Result } from "../optimizer";
import type { Reply, Request } from "../optimizer.worker";
import { loadFont, REVIEW_FONTS } from "../fonts";
import { startTour } from "../components/Tour";
import { openWelcome } from "../components/Welcome";
import { pickedTools } from "../tools";
import { ToolbarEditor } from "../components/ToolbarEditor";
import { allowReminders, isNative, shareFile } from "../native";
import { account, installed, prepareSignIn, signIn, signOut, syncAvailable, syncNow, useSync } from "../sync";
import { ORDER_LABEL, parseStudyList, type StudyOrder } from "../order";
import { wordsBySpelling } from "../known";
import { useData } from "../data";
import { disablePush, enablePush, pushOnHere, pushSupport, savePushState } from "../push";
import { buildLabel, checkForUpdate, type UpdateCheck } from "../update";
import { allRecordings, savedRecordings, saveRecordings } from "../audio";

// Every option lives in Settings (srs.ts) with a default in DEFAULT_SETTINGS; this page only edits it.
// A new option gets a field there, a default, and a row here.


export function SettingsPage() {
  const store = useStore();
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => update((s) => (s.settings[key] = value));
  const isDefault = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).every((k) => store.settings[k] === DEFAULT_SETTINGS[k]);

  return (
    <article class="page">
      <h1>Settings</h1>

      {syncAvailable && <Account />}

      <Section title="Bottom bar" hint="Home and Progress are always at the ends, with three tools of your choice between them. Every tool is also on Home.">
        <BarSetting />
      </Section>

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

      <Section title="What to learn next">
        <label class="setting">
          Order
          <select value={store.settings.order} onChange={(e) => set("order", (e.target as HTMLSelectElement).value as StudyOrder)}>
            {(Object.keys(ORDER_LABEL) as StudyOrder[]).map((o) => (
              <option key={o} value={o}>{ORDER_LABEL[o]}</option>
            ))}
          </select>
        </label>
        {store.settings.order === "custom" ? (
          <StudyList list={store.settings.customList ?? []} />
        ) : (
          <p class="hint">
            {store.settings.order === "lessons"
              ? "Kanji that share parts or sounds come together, roughly easiest first."
              : "Each kanji comes after the radicals it's built from, and words come as soon as you've learned their kanji."}{" "}
            Changing this never touches what you've already learned.
          </p>
        )}
      </Section>

      <Section title="Already known">
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
          Kanji cards
          <select
            value={store.settings.kanjiCards ?? "split"}
            onChange={(e) => update((s) => setKanjiCards(s, (e.target as HTMLSelectElement).value as "split" | "one"))}
          >
            <option value="split">Meaning and reading apart</option>
            <option value="one">One card for both</option>
          </select>
        </label>
        <p class="hint">
          {store.settings.kanjiCards === "one"
            ? "Each kanji is one card: recall its meaning and its readings together. Your progress carried over from the weaker of its two old cards."
            : "Each kanji has a meaning card and a reading card, scheduled separately."}
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

      <Section title="Extra card types" hint="Words always get a card asking their reading and meaning. These add more ways to practise them. Words you learn from now on get the cards you switch on.">
        {EXTRA_CARDS.map(([face, label, about]) => (
          <ExtraCard key={face} face={face} label={label} about={about} />
        ))}
      </Section>

      <Section title="Romaji">
        <label class="check-setting">
          <input type="checkbox" checked={!!store.settings.romaji} onChange={() => set("romaji", !store.settings.romaji || undefined)} />
          <span>
            Show romaji under readings
            <small>For beginners: words, review answers and grammar examples also show the reading in Latin letters. Best switched off once kana feel easy.</small>
          </span>
        </label>
      </Section>

      <Section title="Fonts">
        <label class="check-setting">
          <input type="checkbox" checked={!!store.settings.fonts} onChange={() => set("fonts", !store.settings.fonts || undefined)} />
          <span>
            Mix up the font on review cards
            <small>
              Kanji look different in print, handwriting and brush. Each card gets a different typeface each day (needs a
              connection; offline cards keep the usual font).
            </small>
          </span>
        </label>
        <div class="font-samples" lang="ja">
          {REVIEW_FONTS.map((f) => (
            <FontSample key={f} family={f} />
          ))}
        </div>
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

      <Section title="Reminders">{isNative ? <NativeReminder /> : <WebReminder />}</Section>

      {!isDefault && (
        <button class="link-button" onClick={() => update((s) => {
            if (s.settings.kanjiCards === "one") setKanjiCards(s, "split");
            s.settings = { ...DEFAULT_SETTINGS, reminder: s.settings.reminder, vacation: s.settings.vacation };
          })}>
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

      <Section title="Help">
        <div class="button-row">
          <button class="secondary" onClick={startTour}>
            Show the tour again
          </button>
          <button class="secondary" onClick={openWelcome}>
            Change where I'm starting from
          </button>
        </div>
      </Section>

      <Section title="Version and debug">
        <Version />
      </Section>

      <Section title="Credits">
        <ul class="credits">
          <li>Dictionary: JMdict and KANJIDIC2, EDRDG, CC BY-SA 4.0</li>
          <li>Kanji parts and stroke order: KanjiVG, Ulrich Apel, CC BY-SA 3.0</li>
          <li>Example sentences and their recordings: Tatoeba Project, CC BY 2.0 FR</li>
          <li>Word recordings: Kanji alive, CC BY 4.0</li>
          <li>Pitch accents: Kanjium, CC BY-SA 4.0</li>
          <li>JLPT levels: Jonathan Waller's lists</li>
        </ul>
      </Section>
    </article>
  );
}

const UPDATE_TEXT: Record<UpdateCheck | "checking", string> = {
  checking: "Checking…",
  latest: "You have the latest version.",
  updating: "Downloading the new version. Nekko will reload in a moment…",
  offline: "Couldn't check. Are you online?",
};

function Version() {
  const [state, setState] = useState<UpdateCheck | "checking">();
  const sync = useSync();
  const app = isNative ? "phone app" : installed ? "home-screen app" : "browser";
  const signInWay = isNative ? "phone's Google account" : installed ? "full-page Google sign-in" : "pop-up window";
  return (
    <>
      <p>Built {buildLabel()}</p>
      <ul class="debug">
        <li>Running as: {app}</li>
        <li>Sign-in uses: {signInWay}</li>
        <li>Offline copy: {isNative ? "built into the app" : navigator.serviceWorker?.controller ? "on" : "off"}</li>
        <li>
          Sync: {sync.status}
          {sync.user ? `, signed in as ${sync.user.email || sync.user.name}` : ", not signed in"}
        </li>
        {sync.error && <li>Last error: {sync.error}</li>}
      </ul>
      {!isNative && (
        <button
          class="secondary"
          disabled={state === "checking" || state === "updating"}
          onClick={async () => {
            setState("checking");
            setState(await checkForUpdate());
          }}
        >
          Check for update
        </button>
      )}
      {state && <p class="hint">{UPDATE_TEXT[state]}</p>}
      {!isNative && <OfflineRecordings />}
    </>
  );
}

/** Recordings are kept as you play them; this saves the rest too, for listening offline. */
function OfflineRecordings() {
  const data = useData();
  const urls = useMemo(() => allRecordings(Object.values(data.words), Object.values(data.sentences)), [data, data.sentences]);
  const [kept, setKept] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(0);
  useEffect(() => void savedRecordings(urls).then(setKept, () => setKept(0)), [urls]);
  if (kept === undefined || typeof caches === "undefined") return null;
  const save = async () => {
    setSaving(true);
    setFailed(await saveRecordings(urls, setKept).catch(() => urls.length));
    setSaving(false);
  };
  return (
    <>
      <p class="hint">
        Recordings on this device: {kept.toLocaleString()} of {urls.length.toLocaleString()}. Each one is kept once you play it.
        {failed > 0 && ` ${failed} couldn't be downloaded; try again later.`}
      </p>
      {kept < urls.length && (
        <button class="secondary" disabled={saving} onClick={save}>
          {saving ? "Saving recordings…" : `Save them all for offline (about ${Math.round(((urls.length - kept) * 11) / 1000)} MB)`}
        </button>
      )}
    </>
  );
}

function FontSample({ family }: { family: string }) {
  const text = "字書";
  useEffect(() => loadFont(family, text), [family]);
  return (
    <span title={family} style={{ fontFamily: `"${family}", var(--ja-font)` }}>
      {text}
    </span>
  );
}

const EXTRA_CARDS: [ExtraFace, string, string][] = [
  ["recall", "English → Japanese", "See the meaning, recall the word. The hardest direction, and the one you need for speaking."],
  ["listen", "Listening", "Hear the word, say what it means. Uses the recording if there is one, otherwise your device's voice."],
  ["context", "Words in sentences", "Read the word inside an example sentence made of words you know, then give its reading and meaning."],
];
const SPREAD_PER_DAY = 10;

function ExtraCard({ face, label, about }: { face: ExtraFace; label: string; about: string }) {
  const store = useStore();
  const on = !!store.settings.extraCards?.includes(face);
  const missing = on ? missingFace(store, face) : 0;
  const toggle = () =>
    update((s) => {
      const now = s.settings.extraCards ?? [];
      s.settings.extraCards = on ? now.filter((f) => f !== face) : [...now, face];
    });
  return (
    <div>
      <label class="check-setting">
        <input type="checkbox" checked={on} onChange={toggle} />
        <span>
          {label}
          <small>{about}</small>
        </span>
      </label>
      {missing > 0 && (
        <button class="secondary" onClick={() => update((s) => void addFaceToStudied(s, face, SPREAD_PER_DAY))}>
          Add to the {missing} {missing === 1 ? "word" : "words"} you already study ({SPREAD_PER_DAY} a day)
        </button>
      )}
    </div>
  );
}

/** Your own study list, e.g. a textbook chapter's kanji and words. */
function StudyList({ list }: { list: string[] }) {
  const data = useData();
  const asText = list.map((id) => (id.startsWith("word:") ? data.words[id.slice(5)]?.w : id.slice(6))).join(" ");
  const [text, setText] = useState(asText);
  const parsed = text === asText ? list : parseStudyList(data, text, wordsBySpelling(data));
  return (
    <>
      <p class="hint">
        Paste kanji and words in the order you want them, for example from your textbook. Single characters are taught as
        kanji, longer entries as words. When the list is done, Nekko carries on with its own lessons.
      </p>
      <textarea class="paste-box" rows={4} lang="ja" placeholder="日 本 人 日本人 学生…" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class="backup">
        <span>
          {parsed.filter((id) => id.startsWith("kanji:")).length} kanji, {parsed.filter((id) => id.startsWith("word:")).length} words
        </span>
        <button disabled={text === asText} onClick={() => update((s) => (s.settings.customList = parsed))}>
          Save list
        </button>
      </div>
    </>
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
  useEffect(() => {
    if (!sync.user) prepareSignIn();
  }, [!sync.user]);
  if (!sync.user) {
    return (
      <Section title="Account" hint="Sign in to keep your progress in sync between your phone and computer. Your progress on this device is kept and merged in.">
        <button class="secondary" disabled={sync.status === "signing-in"} onClick={signIn}>
          {sync.status === "signing-in" ? "Opening Google sign-in…" : "Sign in with Google"}
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
      <Optimizer />
      <p class="hint">
        Or, if you use FSRS in Anki, open a deck's options, press Optimize under FSRS, then copy the numbers in the
        parameters box and paste them here.
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

type Run = { step: number; steps: number } | { result: Result } | null;

/** Trains FSRS on this store's own review history, in a worker, and offers the result. */
function Optimizer() {
  const store = useStore();
  const hs = useMemo(() => histories(store.log, store.cards), [store.log, store.cards]);
  const tested = useMemo(() => countTested(hs), [hs]);
  const [run, setRun] = useState<Run>(null);
  const start = () => {
    const worker = new Worker(new URL("../optimizer.worker.ts", import.meta.url), { type: "module" });
    setRun({ step: 0, steps: 1 });
    worker.onmessage = (e: MessageEvent<Reply>) => {
      if ("progress" in e.data) setRun(e.data.progress);
      else {
        setRun({ result: e.data.result });
        worker.terminate();
      }
    };
    worker.postMessage({ hs, start: store.settings.fsrsParams ?? [...default_w] } satisfies Request);
  };
  const result = run && "result" in run ? run.result : undefined;
  const better = result ? 1 - result.after / result.before : 0;
  return (
    <div class="optimizer">
      <p class="hint">
        FSRS can be tuned to how your memory works. Nekko can learn it from your own reviews: it uses answers given a
        day or more after the one before, and you have {tested.toLocaleString()} so far.{" "}
        {tested < MIN_REVIEWS
          ? `It needs at least ${MIN_REVIEWS} to start, and works best after about 1,000.`
          : tested < 1000
            ? "It works best after about 1,000, so run it again later."
            : ""}
      </p>
      {!run && (
        <button class="secondary" disabled={tested < MIN_REVIEWS} onClick={start}>
          Optimize from my reviews
        </button>
      )}
      {run && "step" in run && (
        <p class="hint">
          <progress max={run.steps} value={run.step} /> Learning from your reviews…
        </p>
      )}
      {result &&
        (better > 0.005 ? (
          <>
            <p class="hint">
              New parameters predict your answers {Math.round(better * 100)}% better (log loss {result.before.toFixed(3)} →{" "}
              {result.after.toFixed(3)}).
            </p>
            <button
              class="primary"
              onClick={() => {
                update((s) => (s.settings.fsrsParams = result.w));
                setRun(null);
              }}
            >
              Use them
            </button>{" "}
            <button class="link-button" onClick={() => setRun(null)}>
              Keep mine
            </button>
          </>
        ) : (
          <p class="hint">Your current parameters already fit your reviews well. Nothing to change.</p>
        ))}
    </div>
  );
}

/** A reminder time in hours (7.5) as a time field's "07:30", and back. */
function toTimeField(hours: number | undefined): string {
  if (hours === undefined) return "";
  const m = Math.round(hours * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function fromTimeField(value: string): number | undefined {
  const [h, m] = value.split(":").map(Number);
  return value && isFinite(h) && isFinite(m) ? h + m / 60 : undefined;
}

/** Any time of day, or off. */
function ReminderTime({ onChange, disabled }: { onChange: (hours: number | undefined) => void; disabled?: boolean }) {
  const store = useStore();
  const on = store.settings.reminder !== undefined;
  return (
    <>
      <label class="setting">
        Daily reminder
        <input
          type="time"
          value={toTimeField(store.settings.reminder)}
          disabled={disabled}
          onChange={(e) => onChange(fromTimeField((e.target as HTMLInputElement).value))}
        />
      </label>
      {on ? (
        <button class="link-button" disabled={disabled} onClick={() => onChange(undefined)}>
          Turn reminders off
        </button>
      ) : (
        <p class="hint">Off. Pick a time to get a reminder when reviews are waiting.</p>
      )}
    </>
  );
}

function NativeReminder() {
  return <ReminderTime onChange={setReminder} />;
}

/** Push reminders on the website: the time is shared by your devices, and each device opts in. */
function WebReminder() {
  const store = useStore();
  const sync = useSync();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [here, setHere] = useState(pushOnHere);
  const support = pushSupport();
  if (support === "add-to-home-screen") {
    return (
      <p class="hint">
        On iPhone, reminders only work in the home-screen app: in Safari, tap Share, then Add to Home Screen, and
        open Nekko from there.
      </p>
    );
  }
  if (support === "no") return <p class="hint">This browser can't show reminders.</p>;
  if (!syncAvailable || !sync.user) {
    return <p class="hint">Sign in at the top of Settings first. Reminders are sent to the devices on your account.</p>;
  }
  const turnOn = () => {
    // Asked before anything else: iPhones only show the permission question straight from a tap.
    const permission = Notification.requestPermission();
    setBusy(true);
    setError(undefined);
    account()
      .then((acc) => (acc ? enablePush(acc, getStore(), permission) : "Sign in again, then try once more."))
      .then((e) => {
        setError(e);
        setHere(pushOnHere());
      })
      .finally(() => setBusy(false));
  };
  const choose = async (hours: number | undefined) => {
    update((s) => (s.settings.reminder = hours));
    const acc = await account();
    if (acc) await savePushState(acc, getStore()).catch(() => setError("Couldn't save the reminder time. It'll save on the next sync."));
  };
  return (
    <>
      <ReminderTime onChange={choose} disabled={busy} />
      {store.settings.reminder !== undefined &&
        (here ? (
          <p class="hint">
            This device gets a reminder around that time when reviews are waiting.{" "}
            <button
              class="link-button"
              onClick={async () => {
                const acc = await account();
                if (acc) await disablePush(acc);
                setHere(false);
              }}
            >
              Stop on this device
            </button>
          </p>
        ) : (
          <button class="secondary" disabled={busy} onClick={turnOn}>
            {busy ? "Setting up…" : "Get reminders on this device"}
          </button>
        ))}
      {error && <p class="hint error">{error}</p>}
    </>
  );
}

function BarSetting() {
  const store = useStore();
  const [editing, setEditing] = useState(false);
  if (editing) return <ToolbarEditor onDone={() => setEditing(false)} />;
  return (
    <>
      <p class="hint">Now: {pickedTools(store.settings).map((t) => t.label).join(", ")}</p>
      <button class="secondary" onClick={() => setEditing(true)}>
        Edit toolbar
      </button>
    </>
  );
}

async function setReminder(hours: number | undefined) {
  if (hours !== undefined && !(await allowReminders())) {
    alert("Nekko isn't allowed to send notifications. You can turn them on in the phone's Settings.");
    return;
  }
  update((s) => (s.settings.reminder = hours));
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

import { DEFAULT_SETTINGS, endVacation, mergeIntoStore, migrate, relDate, startVacation, update, useStore, type Settings, type Store } from "../srs";
import { Section } from "../components/bits";
import { allowReminders, isNative, shareFile } from "../native";

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

      <Section title="Reviews">
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
          <button onClick={() => update((s) => startVacation(s))}>Go on vacation</button>
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

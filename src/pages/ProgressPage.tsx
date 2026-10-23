import { useData } from "../data";
import { href } from "../router";
import { replaceStore, STAGE_LABEL, stageOf, update, useStore, type ItemKind, type Stage, type Store } from "../srs";
import { Section } from "../components/bits";
import { allowReminders, isNative, shareFile } from "../native";

const STAGES: Stage[] = ["mature", "young", "learning", "none"];
const DAY = 86_400_000;

function dayKey(t: number) {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function ProgressPage() {
  const data = useData();
  const store = useStore();
  const now = Date.now();

  const count = (kind: ItemKind, keys: string[]) => {
    const c: Record<Stage, number> = { mature: 0, young: 0, learning: 0, none: 0 };
    for (const k of keys) c[stageOf(store, kind, k)]++;
    return c;
  };
  const kanjiKeys = data.lessons.flatMap((l) => l.kanji);
  const rows: [string, ItemKind, string[]][] = [
    ["Radicals", "radical", data.lessons.flatMap((l) => l.radicals)],
    ["Kanji", "kanji", kanjiKeys],
    ["Review words", "word", data.lessons.flatMap((l) => l.words)],
  ];
  const levels = [5, 4, 3, 2, 1, null].map((n) => ({
    label: n ? `N${n}` : "Other Jōyō",
    keys: kanjiKeys.filter((k) => data.kanji[k].jlpt === n),
  }));

  // Reviews per day and streak.
  const perDay = new Map<string, number>();
  for (const [, , t] of store.log) perDay.set(dayKey(t), (perDay.get(dayKey(t)) ?? 0) + 1);
  let streak = 0;
  for (let t = perDay.has(dayKey(now)) ? now : now - DAY; perDay.has(dayKey(t)); t -= DAY) streak++;
  const forecast = Array.from({ length: 7 }, (_, i) => {
    const end = new Date(now + i * DAY);
    end.setHours(23, 59, 59, 999);
    const start = i === 0 ? -Infinity : end.getTime() - DAY;
    return Object.values(store.cards).filter((c) => c.due > start && c.due <= end.getTime()).length;
  });

  return (
    <article class="page">
      <h1>Progress</h1>
      <div class="stat-tiles">
        <Tile n={forecast[0]} label="due today" />
        <Tile n={perDay.get(dayKey(now)) ?? 0} label="reviewed today" />
        <Tile n={streak} label={streak === 1 ? "day streak" : "days streak"} />
      </div>

      <Section title="What you know" hint="Known means every card for it holds for 3+ weeks.">
        {rows.map(([label, kind, keys]) => (
          <StageBar key={label} label={label} counts={count(kind, keys)} total={keys.length} />
        ))}
      </Section>

      <Section title="Kanji by JLPT level">
        {levels.map((l) => (
          <StageBar key={l.label} label={l.label} counts={count("kanji", l.keys)} total={l.keys.length} />
        ))}
      </Section>

      <Section title="Next 7 days">
        <div class="forecast">
          {forecast.map((n, i) => (
            <div class="fc-day" key={i}>
              <div class="fc-bar" style={{ height: `${Math.min(100, (n / Math.max(1, ...forecast)) * 100)}%` }} />
              <div class="fc-n">{n}</div>
              <div class="fc-label">{i === 0 ? "Today" : new Date(now + i * DAY).toLocaleDateString(undefined, { weekday: "short" })}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Settings">
        <label class="setting">
          New items per batch
          <select
            value={store.settings.batch}
            onChange={(e) => update((s) => (s.settings.batch = Number((e.target as HTMLSelectElement).value)))}
          >
            {[3, 5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label class="setting">
          Target recall
          <select
            value={store.settings.retention}
            onChange={(e) => update((s) => (s.settings.retention = Number((e.target as HTMLSelectElement).value)))}
          >
            {[0.8, 0.85, 0.9, 0.95].map((n) => (
              <option key={n} value={n}>{Math.round(n * 100)}%</option>
            ))}
          </select>
        </label>
        <p class="hint">Higher recall means more frequent reviews. 90% is the Anki default.</p>
        {isNative && (
          <label class="setting">
            Daily reminder
            <select
              value={store.settings.reminder ?? ""}
              onChange={(e) => setReminder(e.target as HTMLSelectElement)}
            >
              <option value="">Off</option>
              {REMINDER_HOURS.map((h) => (
                <option key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</option>
              ))}
            </select>
          </label>
        )}
      </Section>

      <Section
        title="Backup"
        hint={`Progress is saved on this ${isNative ? "phone" : "device"} only. Export now and then so you can't lose it.`}
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

      <Section title="All kanji" hint="In lesson order. Tap one to open it.">
        <div class="kanji-grid" lang="ja">
          {kanjiKeys.map((k) => (
            <a key={k} class={`kg ${stageOf(store, "kanji", k)}`} href={href.kanji(k)}>
              {k}
            </a>
          ))}
        </div>
      </Section>

    </article>
  );
}

function Tile({ n, label }: { n: number; label: string }) {
  return (
    <div class="tile">
      <div class="tile-n">{n}</div>
      <div class="tile-label">{label}</div>
    </div>
  );
}

function StageBar({ label, counts, total }: { label: string; counts: Record<Stage, number>; total: number }) {
  const studied = total - counts.none;
  return (
    <div class="stage-bar">
      <div class="sb-head">
        <span>{label}</span>
        <span class="sb-num">
          {counts.mature} known · {studied} / {total} studied
        </span>
      </div>
      <div class="sb-track">
        {STAGES.filter((s) => s !== "none").map((s) =>
          counts[s] ? <div key={s} class={`sb-seg ${s}`} style={{ width: `${(counts[s] / total) * 100}%` }} title={STAGE_LABEL[s]} /> : null,
        )}
      </div>
    </div>
  );
}

const REMINDER_HOURS = [7, 8, 9, 12, 17, 18, 19, 20, 21, 22];

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
  if (isNative) {
    shareFile(name, JSON.stringify(store)).catch((e) => console.error(e));
    return;
  }
  const blob = new Blob([JSON.stringify(store)], { type: "application/json" });
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
    const parsed = JSON.parse(await file.text()) as Store;
    if (parsed.version !== 1 || typeof parsed.cards !== "object") throw new Error("not a Nekko backup");
    replaceStore(parsed);
  } catch (e) {
    input.value = "";
    console.error(e);
    input.setCustomValidity("That file isn't a Nekko backup.");
    input.reportValidity();
  }
}

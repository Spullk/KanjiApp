import { useData } from "../data";
import { href } from "../router";
import { cardId, getStore, isAdded, isLeech, itemInfo, setItemInfo, STAGE_LABEL, stageOf, update, useStore, addItem, removeItem, type Face, type ItemKind } from "../srs";
import { Chip, Furigana, ReadingText } from "./bits";

/** The kanji's readings worth knowing: those that have words, each with its most common word. */
export function MainReadings({ c, max = 3 }: { c: string; max?: number }) {
  const { kanji, words } = useData();
  const readings = kanji[c].readings.filter((r) => r.words.length).slice(0, max);
  return (
    <div class="main-readings">
      {readings.map((r) => {
        const w = words[r.words[0]];
        return (
          <div class="main-reading" key={r.r}>
            <ReadingText r={r.r} />
            <span class={`rtype ${r.type}`}>{r.type === "on" ? "on" : "kun"}</span>
            {w && (
              <a class="mr-example" href={href.word(w.id)}>
                <Furigana segments={w.furigana} highlight={c} link={false} />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** What a learn screen shows for an item before it goes into reviews. */
export function ItemSummary({ kind, k }: { kind: ItemKind; k: string }) {
  const { kanji, radicals, words } = useData();
  if (kind === "radical") {
    const r = radicals[k];
    return (
      <div class="summary">
        <a class="summary-char radical" href={href.radical(k)} lang="ja">{k}</a>
        <div class="summary-body">
          <div class="summary-title">{r.meanings.join(", ") || "Radical"}</div>
          <div class="summary-sub">Radical, found in {r.usedIn.length} kanji</div>
          <div class="chips small">
            {r.usedIn.slice(0, 5).map((c) => (
              <Chip key={c} c={c} kind="kanji" />
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === "kanji") {
    const x = kanji[k];
    return (
      <div class="summary">
        <a class="summary-char kanji" href={href.kanji(k)} lang="ja">{k}</a>
        <div class="summary-body">
          <div class="summary-title">{x.meanings.slice(0, 3).join(", ")}</div>
          <MainReadings c={k} />
          {x.parts.length > 0 && (
            <div class="chips small">
              {x.parts.map((p) => (
                <Chip key={p.c} c={p.c} note={p.phonetic ? "sound" : undefined} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }
  const w = words[k];
  return (
    <div class="summary">
      <a class="summary-char word" href={href.word(k)} lang="ja">
        <Furigana segments={w.furigana} link={false} />
      </a>
      <div class="summary-body">
        <div class="summary-title">{w.senses[0]?.gloss.slice(0, 3).join(", ")}</div>
        <ReadingUse id={k} />
      </div>
    </div>
  );
}

/** "語 read ご (on)" for each kanji in a word. */
export function ReadingUse({ id }: { id: string }) {
  const { words, kanji } = useData();
  const w = words[id];
  return (
    <div class="reading-use">
      {w.furigana
        .filter(([, kana, key]) => kana !== null && key)
        .map(([text, kana, key], i) => (
          <span key={i}>
            <b lang="ja">{text}</b> {kana}
            {key === "*" ? " (special)" : kanji[text]?.on.includes(key!) ? " (on)" : " (kun)"}
          </span>
        ))}
    </div>
  );
}

/** Add-to-reviews button, current stage and your note, for kanji, word and radical pages. */
export function StudyButton({ kind, k }: { kind: ItemKind; k: string }) {
  const store = useStore();
  const added = isAdded(store, kind, k);
  const stage = stageOf(store, kind, k);
  const status = itemInfo(store, kind, k)?.status;
  const setStatus = (st?: "known" | "paused") => update((s) => setItemInfo(s, kind, k, { status: st }));
  return (
    <>
      <div class="study-bar">
        {status === "known" ? (
          <>
            <span class="stage mature">Already known</span>
            <button class="link-button" onClick={() => setStatus(undefined)}>
              Study it after all
            </button>
          </>
        ) : added ? (
          <>
            <span class={`stage ${stage}`}>{status === "paused" ? "Paused" : STAGE_LABEL[stage]}</span>
            {isLeech(store, kind, k) && <span class="stage leech">Leech</span>}
            {!status && <NextDue kind={kind} k={k} />}
            <button class="link-button" onClick={() => setStatus(status ? undefined : "paused")}>
              {status ? "Resume" : "Pause"}
            </button>
            <button class="link-button" onClick={() => update((s) => removeItem(s, kind, k))}>
              Remove
            </button>
          </>
        ) : (
          <>
            <button class="primary" onClick={() => update((s) => void addItem(s, kind, k))}>
              Add to reviews
            </button>
            <button class="link-button" onClick={() => setStatus("known")}>
              I already know this
            </button>
          </>
        )}
      </div>
      <NoteBox kind={kind} k={k} />
    </>
  );
}

function NoteBox({ kind, k }: { kind: ItemKind; k: string }) {
  const info = itemInfo(useStore(), kind, k);
  const note = info?.note ?? "";
  const synonyms = info?.synonyms ?? [];
  return (
    <details class="note-box" open={!!note || synonyms.length > 0}>
      <summary>{note ? "Your note" : "Add a note"}</summary>
      <textarea
        key={`${kind}:${k}`}
        rows={3}
        placeholder="A mnemonic, a reminder, anything that helps."
        defaultValue={note}
        onBlur={(e) => {
          const text = (e.target as HTMLTextAreaElement).value;
          if (text !== note) update((s) => setItemInfo(s, kind, k, { note: text }));
        }}
      />
      {synonyms.length > 0 && (
        <div class="synonyms">
          Also accepted when typing:
          {synonyms.map((w) => (
            <button
              key={w}
              class="synonym"
              title="Stop accepting this"
              onClick={() => update((s) => setItemInfo(s, kind, k, { synonyms: synonyms.filter((x) => x !== w) }))}
            >
              {w} ×
            </button>
          ))}
        </div>
      )}
    </details>
  );
}

function NextDue({ kind, k }: { kind: ItemKind; k: string }) {
  const faces: Face[] = kind === "kanji" ? ["meaning", "reading"] : kind === "radical" ? ["meaning"] : ["word"];
  const due = Math.min(...faces.map((f) => getStore().cards[cardId(kind, k, f)]?.due ?? Infinity));
  if (!isFinite(due)) return null;
  return <span class="next-due">{due <= Date.now() ? "Due now" : `Next review ${relTime(due)}`}</span>;
}

export function relTime(t: number, now = Date.now()): string {
  const m = Math.round((t - now) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `in ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `in ${h} h`;
  const d = Math.round(h / 24);
  if (d < 45) return `in ${d} d`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `in ${mo} mo` : `in ${(d / 365).toFixed(1)} y`;
}

/** Short interval label for answer buttons: 1m, 10m, 3d, 2mo. */
export function shortInterval(t: number, now = Date.now()): string {
  return relTime(t, now).replace(/^in /, "").replace(" min", "m").replace(" h", "h").replace(" d", "d").replace(" mo", "mo").replace(" y", "y");
}

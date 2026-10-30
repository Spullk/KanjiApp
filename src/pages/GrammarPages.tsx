import { Fragment } from "preact";
import { useEffect, useState } from "preact/hooks";
import { useData, type GrammarPoint } from "../data";
import { href } from "../router";
import { itemInfo, setItemInfo, STAGE_LABEL, stageOf, update, useStore, type Store } from "../srs";
import { cloze, grammarDone, lastTier, LEVELS, rememberTier, segments, tierOf, TIERS, type Tier } from "../grammar";
import { furiganaRule } from "../reading";
import { ALL_KANA, scriptOf, type Script } from "../kana";
import { drillOf } from "../kanaDrill";
import { Furigana, readingOf, Romaji, Section } from "../components/bits";
import { StudyButton } from "../components/ItemCards";

/** Where the kana sit among the Start here points: hiragana before the sound rules, katakana before foreign words. */
const KANA_BEFORE: Record<string, Script> = { dakuten: "hira", "katakana-words": "kata" };

const kanaLeft = (store: Store, script: Script) => ALL_KANA.filter((k) => scriptOf(k) === script && !drillOf(store, k)).length;

/** The next step in Start here (a point, or learning the kana), or nothing once it's all done. */
export function startNext(store: Store, points: GrammarPoint[]): { title: string; to: string } | undefined {
  for (const g of points.filter((g) => g.level === "start")) {
    const script = KANA_BEFORE[g.id];
    if (script && kanaLeft(store, script)) return { title: script === "hira" ? "Hiragana" : "Katakana", to: href.kana() };
    if (!grammarDone(store, g.id)) return { title: g.title, to: href.grammarPoint(g.id) };
  }
  return undefined;
}

/** Where Grammar opens the first time: Beginner until Start here is done, then the first level with something left. */
function firstTier(store: Store, points: GrammarPoint[]): Tier {
  if (startNext(store, points)) return "beginner";
  return TIERS.find((t) => t.tier !== "beginner" && points.some((g) => t.levels.includes(g.level) && !grammarDone(store, g.id)))?.tier ?? "n5";
}

export function GrammarPage() {
  const data = useData();
  const store = useStore();
  const points = Object.values(data.grammar);
  const done = !startNext(store, points);
  const [openStart, setOpenStart] = useState(!done);
  const [tier, setTier] = useState(() => lastTier() ?? firstTier(store, points));
  const pick = (t: Tier) => {
    setTier(t);
    rememberTier(t);
  };
  const levels = TIERS.find((t) => t.tier === tier)!.levels;

  return (
    <article class="page">
      <h1>Grammar</h1>
      <p class="hint">Everything that isn't a kanji or a word. Each point has a short explanation; add it to your reviews to practise it on real sentences.</p>
      <div class="seg-tabs grammar-tabs" role="tablist">
        {TIERS.map((t) => (
          <button key={t.tier} role="tab" aria-selected={tier === t.tier} class={tier === t.tier ? "on" : ""} onClick={() => pick(t.tier)}>
            {t.label}
          </button>
        ))}
      </div>
      {LEVELS.filter((l) => levels.includes(l.level)).map(({ level, title, hint }) => {
        const list = points.filter((g) => g.level === level);
        if (level === "start" && !openStart) {
          return (
            <button key={level} class="start-done" onClick={() => setOpenStart(true)}>
              ✓ Start here: all done. Show it again
            </button>
          );
        }
        const started = list.filter((g) => grammarDone(store, g.id)).length;
        return (
          <Section key={level} title={title} hint={level === "start" ? hint : `${hint} ${started} of ${list.length} started.`}>
            <div class="grammar-list">
              {list.map((g) => (
                <Fragment key={g.id}>
                  {level === "start" && KANA_BEFORE[g.id] && <KanaLine script={KANA_BEFORE[g.id]} />}
                  <GrammarRow g={g} />
                </Fragment>
              ))}
            </div>
          </Section>
        );
      })}
    </article>
  );
}

function KanaLine({ script }: { script: Script }) {
  const left = kanaLeft(useStore(), script);
  return (
    <a class="grammar-row" href={href.kana()}>
      <span class="grammar-title">
        {script === "hira" ? "Hiragana" : "Katakana"} <span lang="ja">{script === "hira" ? "あいう" : "アイウ"}</span>
      </span>
      <span class={`stage ${left ? "none" : "mature"}`}>{left ? `${left} to learn` : "In your drill"}</span>
    </a>
  );
}

function statusOf(store: Store, g: GrammarPoint): { label: string; cls: string } {
  if (!g.ex.length) return itemInfo(store, "grammar", g.id)?.status ? { label: "Read", cls: "mature" } : { label: "To read", cls: "none" };
  const stage = stageOf(store, "grammar", g.id);
  return { label: stage === "none" ? "New" : STAGE_LABEL[stage], cls: stage };
}

export function GrammarRow({ g }: { g: GrammarPoint }) {
  const s = statusOf(useStore(), g);
  return (
    <a class="grammar-row" href={href.grammarPoint(g.id)}>
      <span class="grammar-title" lang="ja">
        {g.title}
      </span>
      <span class={`stage ${s.cls}`}>{s.label}</span>
    </a>
  );
}

export function GrammarPointPage({ id }: { id: string }) {
  const data = useData();
  const store = useStore();
  const g = data.grammar[id];
  // Back to Grammar lands on this point's level.
  useEffect(() => {
    if (g) rememberTier(tierOf(g.level));
  }, [g]);
  if (!g) return <p class="empty">No such grammar point.</p>;
  const hide = furiganaRule(store, data);
  const level = LEVELS.find((l) => l.level === g.level)!;
  const tier = TIERS.find((t) => t.levels.includes(g.level))!;
  const same = Object.values(data.grammar).filter((x) => tier.levels.includes(x.level));
  const next = same[same.indexOf(g) + 1];
  const read = !!itemInfo(store, "grammar", id)?.status;

  return (
    <article class="page">
      <a class="more" href={href.grammar()}>
        ← {tier.tier === "beginner" ? level.title : `${tier.label} grammar`}
      </a>
      <h1 class="grammar-h" lang="ja">
        {g.title}
      </h1>
      <div class="grammar-note">
        {g.note.split("\n").map((p, i) =>
          p.startsWith("•") ? (
            <ul key={i}>
              <li>
                <Furigana segments={segments(p.slice(1).trim())} link={false} />
              </li>
            </ul>
          ) : (
            <p key={i}>
              <Furigana segments={segments(p)} link={false} />
            </p>
          ),
        )}
      </div>
      {g.ex.length > 0 && (
        <Section title="Examples" hint="Tap a kanji to see its reading.">
          {g.ex.map((ex) => {
            const c = cloze(ex);
            return (
              <div class="sentence" key={ex[0]}>
                <div class="sent-ja" lang="ja">
                  <Furigana segments={c.before} link={false} hide={hide} reveal />
                  <b class="cloze-gap filled">
                    <Furigana segments={c.gap} link={false} hide={hide} reveal />
                  </b>
                  <Furigana segments={c.after} link={false} hide={hide} reveal />
                </div>
                <Romaji kana={readingOf([...c.before, ...c.gap, ...c.after])} />
                <div class="sent-en">{c.en}</div>
              </div>
            );
          })}
        </Section>
      )}
      {g.ex.length > 0 ? (
        <StudyButton kind="grammar" k={id} />
      ) : (
        <div class="study-bar">
          {read ? (
            <span class="stage mature">Read ✓</span>
          ) : (
            <button class="primary" onClick={() => update((s) => setItemInfo(s, "grammar", id, { status: "known" }))}>
              Got it
            </button>
          )}
        </div>
      )}
      {next && (
        <a class="more next-point" href={href.grammarPoint(next.id)}>
          Next: <span lang="ja">{next.title}</span> →
        </a>
      )}
    </article>
  );
}

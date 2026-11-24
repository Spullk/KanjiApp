import { useData } from "../data";
import { href } from "../router";
import { dueCards, newLeftToday, nextToLearn, stageOf, useStore } from "../srs";
import { rackTools, type Tool } from "../tools";
import { useEffect, useState } from "preact/hooks";
import { darkSky, frontGround, worldSVG } from "../season";
import { startNext } from "./GrammarPages";

export function HomePage() {
  const data = useData();
  const store = useStore();
  const dark = useDark();
  const due = dueCards(store).length;
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const later = Math.max(0, dueCards(store, endOfDay.getTime()).length - due);
  const next = nextToLearn(store, data, Math.min(store.settings.batch, newLeftToday(store)));
  const all = Object.keys(data.kanji);
  const known = all.filter((k) => stageOf(store, "kanji", k) === "mature").length;
  const studied = all.filter((k) => stageOf(store, "kanji", k) !== "none").length;
  // The first lesson with a kanji you haven't started.
  const lesson = data.lessons.find((l) => l.kanji.some((k) => stageOf(store, "kanji", k) === "none")) ?? data.lessons[0];
  // The bottom bar becomes the nearest hill while Home is open.
  useEffect(() => {
    const root = document.documentElement.style;
    root.setProperty("--ground-front", frontGround(dark));
    return () => root.removeProperty("--ground-front");
  }, [dark]);
  const rack = rackTools(store.settings);
  const rows: Tool[][] = [];
  for (let i = 0; i < rack.length; i += 3) rows.push(rack.slice(i, i + 3));
  const caption: Record<string, string> = {
    progress: studied ? `${known} known` : "stats, settings",
    practice: "mistakes",
    kana: "あ to ん",
    grammar: "up to N3",
    read: "stories",
    songs: "lyrics",
    lessons: `${data.lessons.length} lessons`,
    review: `${due} due`,
    search: "look up",
    write: "strokes",
  };

  return (
    <article class="page home-page" style={{ "--world-ink": darkSky(dark) ? "#ece9dc" : "#2a211c" }}>
      <div class="home-world" dangerouslySetInnerHTML={{ __html: worldSVG(dark) }} />
      {store.settings.vacation && (
        <a class="vacation-note" href={href.settings("app")}>
          Vacation mode is on, so nothing is due. Turn it off in Settings →
        </a>
      )}
      {store.settings.start === "new" && <StartHere />}

      <a class="tree-slot" href={href.progress()}>
        <b>{studied}</b>
        <span>kanji studied</span>
        <small>Your tree grows here · tap for Progress</small>
      </a>

      <a class={`plq leaf ${next.length ? "" : "quiet"}`} href={href.learn()}>
        <i class="sh" />
        <i class="bg" />
        <span class="k" lang="ja">
          学
        </span>
        <span class="tx">
          <b>Learn new</b>
          <span>{next.length ? `Lesson ${lesson.id}` : "All done for today"}</span>
        </span>
        <span class="big">{next.length}</span>
      </a>

      <a class={`plq ema rv ${due ? "" : "quiet"}`} href={href.review()}>
        <i class="sh" />
        <i class="bg" />
        <span class="k" lang="ja">
          復
        </span>
        <span class="n">{due}</span>
        <span class="l">to review</span>
        <span class="s">{later ? `+${later} later today` : due ? "" : "all caught up"}</span>
      </a>

      <div class="rack">
        {rows.map((row, r) => (
          <div key={r} class="trow">
            {row.map((t) => (
              <a key={t.tab} class="plq ema hang" href={t.href}>
                <i class="sh" />
                <i class="bg" />
                <span class="g" lang="ja">
                  {t.icon}
                </span>
                <span class="t">{t.short ?? t.label}</span>
                <span class="c">{caption[t.tab] ?? t.about}</span>
              </a>
            ))}
          </div>
        ))}
      </div>
    </article>
  );
}

/** Follows the phone's light or dark setting live. */
function useDark(): boolean {
  const query = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
  const [dark, setDark] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = () => setDark(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return dark;
}

/** For beginners until Start here is done: the next step in it. */
function StartHere() {
  const next = startNext(useStore(), Object.values(useData().grammar));
  if (!next) return null;
  return (
    <a class="start-here" href={next.to}>
      <span class="start-here-label">Start here · next up</span>
      <b lang="ja">{next.title}</b>
    </a>
  );
}

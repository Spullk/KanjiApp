import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { loadData, loadSentences } from "./data";
import { useRoute, type Route } from "./router";
import { placeOf, placeSVG, useDark } from "./places";
import { DOCK_SLOT } from "./components/BottomBar";
import { HomePage } from "./pages/HomePage";
import { KanjiPage } from "./pages/KanjiPage";
import { WordPage } from "./pages/WordPage";
import { RadicalPage } from "./pages/RadicalPage";
import { LessonPage, LessonsPage } from "./pages/LessonPages";
import { SearchPage } from "./pages/SearchPage";
import { ReviewPage } from "./pages/ReviewPage";
import { LearnPage } from "./pages/LearnPage";
import { ProgressPage } from "./pages/ProgressPage";
import { SettingsPage } from "./pages/SettingsPage";
import { KnownPage } from "./pages/KnownPage";
import { ExtraPracticePage, PracticePage } from "./pages/PracticePage";
import { WritePage } from "./pages/WritePage";
import { SentencesPage } from "./pages/SentencesPage";
import { StoriesPage } from "./pages/StoriesPage";
import { StoryPage } from "./pages/StoryPage";
import { SongAddPage, SongsPage } from "./pages/SongsPage";
import { SongPage } from "./pages/SongPage";
import { GrammarPage, GrammarPointPage } from "./pages/GrammarPages";
import { KanaPage, KanaPracticePage, KanaRowPage } from "./pages/KanaPages";
import { Welcome } from "./components/Welcome";
import { activeTab, barTools } from "./tools";
import { dropJunkWords, dueCards, getStore, initStore, junkWordsStudied, requestPersistence, update, useStore } from "./srs";
import { initNative, isNative } from "./native";
import { initAppFeel } from "./appFeel";
import { initSeason, loadLookFonts } from "./season";
import { initSync } from "./sync";
import { Tour } from "./components/Tour";
import { initUpdates } from "./update";
import { warmExamples } from "./examples";
import { warmSearch } from "./search";
import "./style.css";

// The app store build ships every file inside the app, so only the website needs the offline cache.
if (!isNative) initUpdates();
initAppFeel();
initSeason();
loadLookFonts();
requestPersistence();

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "kanji":
      return <KanjiPage c={route.c} />;
    case "word":
      return <WordPage id={route.id} />;
    case "radical":
      return <RadicalPage c={route.c} />;
    case "lessons":
      return <LessonsPage />;
    case "lesson":
      return <LessonPage id={route.id} />;
    case "search":
      return <SearchPage q={route.q} />;
    case "review":
      return <ReviewPage />;
    case "learn":
      return <LearnPage story={route.story} />;
    case "progress":
      return <ProgressPage />;
    case "settings":
      return <SettingsPage group={route.group} />;
    case "known":
      return <KnownPage />;
    case "write":
      return <WritePage c={route.c} />;
    case "read":
      return <StoriesPage />;
    case "sentences":
      return <SentencesPage />;
    case "story":
      return <StoryPage id={route.id} />;
    case "songs":
      return <SongsPage />;
    case "songAdd":
      return <SongAddPage />;
    case "song":
      return <SongPage id={route.id} />;
    case "grammar":
      return <GrammarPage />;
    case "grammarPoint":
      return <GrammarPointPage id={route.id} />;
    case "kana":
      return <KanaPage />;
    case "kanaRow":
      return <KanaRowPage id={route.id} />;
    case "kanaPractice":
      return <KanaPracticePage key={location.hash} script={route.script} missed={route.missed} listen={route.listen} />;
    case "extra":
      return <ExtraPracticePage />;
    case "practice":
      return <PracticePage key={route.set} set={route.set} />;
    default:
      return <HomePage />;
  }
}

/** Pages that open without the example sentences, so they can show before those have loaded. */
const NO_SENTENCES = new Set<Route["page"]>(["home", "lessons", "lesson", "progress", "settings", "known", "search", "grammar", "grammarPoint", "kana", "kanaRow", "kanaPractice", "read", "story", "write", "radical", "songs", "songAdd", "song"]);

/** The spot in the tree world behind this screen (src/places.ts). Home draws its own scene. */
function PlaceBackdrop({ page }: { page: Route["page"] }) {
  const dark = useDark();
  const place = placeOf(page);
  if (!place) return null;
  return <div class={`place-bg place-${place}`} data-place={place} dangerouslySetInnerHTML={{ __html: placeSVG(place, dark) }} />;
}

function App() {
  const [ready, setReady] = useState(false);
  const [sentences, setSentences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  const store = useStore();
  const due = dueCards(store).length;
  const bar = barTools(store.settings);
  const on = activeTab(bar, route.page);
  // Overlays (the tour card) sit above the dock, so they need its height. Layout itself never uses this number:
  // the dock is a normal row at the end of the page, so nothing can end up underneath it.
  const dock = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dock.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--dock-h", `${el.offsetHeight}px`);
    set();
    const watch = new ResizeObserver(set);
    watch.observe(el, { box: "border-box" }); // border-box: also catches the phone's home-strip padding changing
    return () => watch.disconnect();
  }, []);
  useEffect(() => {
    Promise.all([loadData(), initStore()]).then(
      ([data]) => {
        const junk = junkWordsStudied(getStore(), data);
        if (junk.length) update((s) => dropJunkWords(s, junk));
        setReady(true);
        loadSentences().then(
          () => {
            setSentences(true);
            warmExamples(data);
          },
          (e) => setError(String(e)),
        );
        warmSearch(data);
        initNative(getStore);
        initSync();
      },
      (e) => setError(String(e)),
    );
  }, []);

  return (
    <>
      <PlaceBackdrop page={route.page} />
      <main>
        {error ? <p class="empty">Couldn't load the dictionary: {error}</p> : ready && (sentences || NO_SENTENCES.has(route.page)) ? <Page route={route} /> : <Loading />}
      </main>
      <div class="dock" ref={dock}>
        <div class="dock-actions" id={DOCK_SLOT} />
        <nav class="tabbar">
          {bar.map((t) => (
            <a key={t.tab} data-tab={t.tab} class={[t.tab === on && "on", t.tab === "home" && "home"].filter(Boolean).join(" ")} href={t.href} aria-label={t.label}>
              <span class="pl" aria-hidden="true">
                <i />
                <i />
              </span>
              <span class="kj" lang="ja" aria-hidden="true">
                {t.icon}
              </span>
              <span class="en">{t.short ?? t.label}</span>
              {t.tab === "review" && due > 0 && <b class="tab-badge">{due}</b>}
            </a>
          ))}
        </nav>
      </div>
      {ready && <Welcome />}
      {ready && <Tour />}
    </>
  );
}

function Loading() {
  return <p class="loading">Loading dictionary…</p>;
}

render(<App />, document.getElementById("app")!);

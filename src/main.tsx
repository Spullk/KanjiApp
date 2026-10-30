import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { loadData, loadSentences } from "./data";
import { useRoute, type Route } from "./router";
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
import { GrammarPage, GrammarPointPage } from "./pages/GrammarPages";
import { KanaPage, KanaPracticePage, KanaRowPage } from "./pages/KanaPages";
import { Welcome } from "./components/Welcome";
import { activeTab, barTools } from "./tools";
import { dueCards, getStore, initStore, requestPersistence, useStore } from "./srs";
import { initNative, isNative } from "./native";
import { initSync } from "./sync";
import { Tour } from "./components/Tour";
import { initUpdates } from "./update";
import { warmExamples } from "./examples";
import { warmSearch } from "./search";
import "./style.css";

// The app store build ships every file inside the app, so only the website needs the offline cache.
if (!isNative) initUpdates();
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
const NO_SENTENCES = new Set<Route["page"]>(["home", "lessons", "lesson", "progress", "settings", "known", "search", "grammar", "grammarPoint", "kana", "kanaRow", "kanaPractice", "read", "story", "write", "radical"]);

function App() {
  const [ready, setReady] = useState(false);
  const [sentences, setSentences] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  const store = useStore();
  const due = dueCards(store).length;
  const bar = barTools(store.settings);
  const on = activeTab(bar, route.page);
  useEffect(() => {
    Promise.all([loadData(), initStore()]).then(
      ([data]) => {
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
      <main>
        {error ? <p class="empty">Couldn't load the dictionary: {error}</p> : ready && (sentences || NO_SENTENCES.has(route.page)) ? <Page route={route} /> : <Loading />}
      </main>
      <nav class="tabbar">
        {bar.map((t) => (
          <a key={t.tab} data-tab={t.tab} class={[t.tab === on && "on", t.group].filter(Boolean).join(" ")} href={t.href}>
            {t.path ? (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d={t.path} />
              </svg>
            ) : (
              <span aria-hidden="true">{t.icon}</span>
            )}
            {t.short ?? t.label}
            {t.tab === "review" && due > 0 && <b class="tab-badge">{due}</b>}
          </a>
        ))}
      </nav>
      {ready && <Welcome />}
      {ready && <Tour />}
    </>
  );
}

function Loading() {
  return <p class="loading">Loading dictionary…</p>;
}

render(<App />, document.getElementById("app")!);

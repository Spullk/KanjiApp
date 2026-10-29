import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { loadData } from "./data";
import { href, useRoute, type Route } from "./router";
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
import { PracticePage } from "./pages/PracticePage";
import { WritePage } from "./pages/WritePage";
import { SentencesPage } from "./pages/SentencesPage";
import { StoriesPage } from "./pages/StoriesPage";
import { StoryPage } from "./pages/StoryPage";
import { dueCards, getStore, initStore, requestPersistence, useStore } from "./srs";
import { initNative, isNative } from "./native";
import { initSync } from "./sync";
import { Tour } from "./components/Tour";
import { initUpdates } from "./update";
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
      return <SettingsPage />;
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
    case "practice":
      return <PracticePage key={route.set} set={route.set} />;
    default:
      return <HomePage />;
  }
}

/** The tab bar, and which pages light up each tab. */
const TABS: { tab: string; icon: string; label: string; href: string; pages: Route["page"][] }[] = [
  { tab: "home", icon: "根", label: "Home", href: href.home(), pages: ["home", "lessons", "lesson"] },
  { tab: "review", icon: "復", label: "Review", href: href.review(), pages: ["review", "learn"] },
  { tab: "read", icon: "読", label: "Read", href: href.read(), pages: ["read", "sentences", "story"] },
  { tab: "search", icon: "探", label: "Search", href: href.search(), pages: ["search"] },
  { tab: "progress", icon: "進", label: "Progress", href: href.progress(), pages: ["progress", "settings", "known", "practice", "write"] },
];

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  const due = dueCards(useStore()).length;
  useEffect(() => {
    Promise.all([loadData(), initStore()]).then(
      () => {
        setReady(true);
        initNative(getStore);
        initSync();
      },
      (e) => setError(String(e)),
    );
  }, []);

  return (
    <>
      <main>
        {error ? <p class="empty">Couldn't load the dictionary: {error}</p> : ready ? <Page route={route} /> : <Loading />}
      </main>
      <nav class="tabbar">
        {TABS.map((t) => (
          <a key={t.tab} data-tab={t.tab} class={t.pages.includes(route.page) ? "on" : ""} href={t.href}>
            <span aria-hidden="true">{t.icon}</span>
            {t.label}
            {t.tab === "review" && due > 0 && <b class="tab-badge">{due}</b>}
          </a>
        ))}
      </nav>
      {ready && <Tour />}
    </>
  );
}

function Loading() {
  return <p class="loading">Loading dictionary…</p>;
}

render(<App />, document.getElementById("app")!);

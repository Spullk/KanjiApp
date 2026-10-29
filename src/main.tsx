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
import { ReadPage } from "./pages/ReadPage";
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
      return <LearnPage />;
    case "progress":
      return <ProgressPage />;
    case "settings":
      return <SettingsPage />;
    case "known":
      return <KnownPage />;
    case "write":
      return <WritePage c={route.c} />;
    case "read":
      return <ReadPage />;
    case "practice":
      return <PracticePage key={route.set} set={route.set} />;
    default:
      return <HomePage />;
  }
}

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
        <a data-tab="home" class={route.page === "home" ? "on" : ""} href={href.home()}>
          <span aria-hidden="true">根</span>Home
        </a>
        <a data-tab="review" class={route.page === "review" || route.page === "learn" ? "on" : ""} href={href.review()}>
          <span aria-hidden="true">復</span>Review
          {due > 0 && <b class="tab-badge">{due}</b>}
        </a>
        <a data-tab="search" class={route.page === "search" ? "on" : ""} href={href.search()}>
          <span aria-hidden="true">探</span>Search
        </a>
        <a data-tab="lessons" class={route.page.startsWith("lesson") ? "on" : ""} href={href.lessons()}>
          <span aria-hidden="true">課</span>Lessons
        </a>
        <a data-tab="progress" class={route.page === "progress" || route.page === "settings" || route.page === "known" || route.page === "practice" || route.page === "write" || route.page === "read" ? "on" : ""} href={href.progress()}>
          <span aria-hidden="true">進</span>Progress
        </a>
      </nav>
      {ready && <Tour />}
    </>
  );
}

function Loading() {
  return <p class="loading">Loading dictionary…</p>;
}

render(<App />, document.getElementById("app")!);

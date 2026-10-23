import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { registerSW } from "virtual:pwa-register";
import { loadData } from "./data";
import { href, useRoute, type Route } from "./router";
import { HomePage } from "./pages/HomePage";
import { KanjiPage } from "./pages/KanjiPage";
import { WordPage } from "./pages/WordPage";
import { RadicalPage } from "./pages/RadicalPage";
import { LessonPage, LessonsPage } from "./pages/LessonPages";
import { SearchPage } from "./pages/SearchPage";
import "./style.css";

registerSW({ immediate: true });

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
    default:
      return <HomePage />;
  }
}

function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const route = useRoute();
  useEffect(() => {
    loadData().then(() => setReady(true), (e) => setError(String(e)));
  }, []);

  return (
    <>
      <main>
        {error ? <p class="empty">Couldn't load the dictionary: {error}</p> : ready ? <Page route={route} /> : <Loading />}
      </main>
      <nav class="tabbar">
        <a class={route.page === "home" ? "on" : ""} href={href.home()}>
          <span aria-hidden="true">根</span>Home
        </a>
        <a class={route.page === "search" ? "on" : ""} href={href.search()}>
          <span aria-hidden="true">探</span>Search
        </a>
        <a class={route.page.startsWith("lesson") ? "on" : ""} href={href.lessons()}>
          <span aria-hidden="true">課</span>Lessons
        </a>
      </nav>
    </>
  );
}

function Loading() {
  return <p class="loading">Loading dictionary…</p>;
}

render(<App />, document.getElementById("app")!);

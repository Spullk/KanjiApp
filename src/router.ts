import { useEffect, useState } from "preact/hooks";

// Hash routes, so the app works from any static host (GitHub Pages) and offline.
export type Route =
  | { page: "home" }
  | { page: "search"; q: string }
  | { page: "lessons" }
  | { page: "review" }
  | { page: "learn" }
  | { page: "progress" }
  | { page: "settings" }
  | { page: "known" }
  | { page: "lesson"; id: number }
  | { page: "kanji"; c: string }
  | { page: "radical"; c: string }
  | { page: "word"; id: string };

export const href = {
  home: () => "#/",
  search: (q = "") => `#/search${q ? "?q=" + encodeURIComponent(q) : ""}`,
  lessons: () => "#/lessons",
  review: () => "#/review",
  learn: () => "#/learn",
  progress: () => "#/progress",
  settings: () => "#/settings",
  known: () => "#/known",
  lesson: (id: number) => `#/lesson/${id}`,
  kanji: (c: string) => `#/k/${encodeURIComponent(c)}`,
  radical: (c: string) => `#/r/${encodeURIComponent(c)}`,
  word: (id: string) => `#/w/${id}`,
};

export function parse(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const seg = path.split("/").filter(Boolean).map(decodeURIComponent);
  switch (seg[0]) {
    case "search":
      return { page: "search", q: new URLSearchParams(query).get("q") ?? "" };
    case "lessons":
      return { page: "lessons" };
    case "review":
      return { page: "review" };
    case "learn":
      return { page: "learn" };
    case "progress":
      return { page: "progress" };
    case "settings":
      return { page: "settings" };
    case "known":
      return { page: "known" };
    case "lesson":
      return { page: "lesson", id: Number(seg[1]) };
    case "k":
      return { page: "kanji", c: seg[1] };
    case "r":
      return { page: "radical", c: seg[1] };
    case "w":
      return { page: "word", id: seg[1] };
    default:
      return { page: "home" };
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

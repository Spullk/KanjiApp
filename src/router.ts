import { useEffect, useState } from "preact/hooks";
import type { PracticeSet } from "./srs";

// Hash routes, so the app works from any static host (GitHub Pages) and offline.
export type Route =
  | { page: "home" }
  | { page: "search"; q: string }
  | { page: "lessons" }
  | { page: "review" }
  | { page: "learn"; story?: string }
  | { page: "progress" }
  | { page: "settings" }
  | { page: "known" }
  | { page: "practice"; set: PracticeSet }
  | { page: "extra" }
  | { page: "write"; c?: string }
  | { page: "read" }
  | { page: "sentences" }
  | { page: "story"; id: string }
  | { page: "grammar" }
  | { page: "grammarPoint"; id: string }
  | { page: "kana" }
  | { page: "kanaRow"; id: string }
  | { page: "kanaPractice"; script: "hira" | "kata" | "both"; missed: boolean }
  | { page: "lesson"; id: number }
  | { page: "kanji"; c: string }
  | { page: "radical"; c: string }
  | { page: "word"; id: string };

export const href = {
  home: () => "#/",
  search: (q = "") => `#/search${q ? "?q=" + encodeURIComponent(q) : ""}`,
  lessons: () => "#/lessons",
  review: () => "#/review",
  learn: (story?: string) => `#/learn${story ? "/" + story : ""}`,
  progress: () => "#/progress",
  settings: () => "#/settings",
  known: () => "#/known",
  practice: (set: PracticeSet) => `#/practice/${set}`,
  extra: () => "#/practice",
  read: () => "#/read",
  sentences: () => "#/sentences",
  story: (id: string) => `#/story/${id}`,
  grammar: () => "#/grammar",
  grammarPoint: (id: string) => `#/grammar/${id}`,
  kana: () => "#/kana",
  kanaRow: (id: string) => `#/kana/row/${id}`,
  kanaPractice: (script: "hira" | "kata" | "both", opts: { missed?: boolean } = {}) =>
    `#/kana/practice/${script}${opts.missed ? "/missed" : ""}`,
  write: (c?: string) => `#/write${c ? "/" + encodeURIComponent(c) : ""}`,
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
      return { page: "learn", story: seg[1] };
    case "progress":
      return { page: "progress" };
    case "settings":
      return { page: "settings" };
    case "known":
      return { page: "known" };
    case "read":
      return { page: "read" };
    case "sentences":
      return { page: "sentences" };
    case "story":
      return { page: "story", id: seg[1] };
    case "grammar":
      return seg[1] ? { page: "grammarPoint", id: seg[1] } : { page: "grammar" };
    case "kana":
      if (seg[1] === "row") return { page: "kanaRow", id: seg[2] };
      if (seg[1] === "practice") {
        const script = ["hira", "kata"].includes(seg[2]) ? (seg[2] as "hira" | "kata") : "both";
        return { page: "kanaPractice", script, missed: seg.includes("missed") };
      }
      return { page: "kana" };
    case "write":
      return { page: "write", c: seg[1] };
    case "practice":
      return ["mistakes", "leeches", "recent"].includes(seg[1]) ? { page: "practice", set: seg[1] as PracticeSet } : { page: "extra" };
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

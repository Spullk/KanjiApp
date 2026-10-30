// Nekko's tools. Home is always first on the bottom bar; you pick the other four in Settings, and every tool is
// on Home's tool grid, so one you don't pin is never out of reach.

import { href, type Route } from "./router";
import type { Settings } from "./srs";

export type Tool = { tab: string; icon: string; label: string; href: string; pages: Route["page"][]; about: string };

export const HOME: Tool = { tab: "home", icon: "根", label: "Home", href: href.home(), pages: ["home"], about: "" };

export const TOOLS: Tool[] = [
  { tab: "review", icon: "復", label: "Review", href: href.review(), pages: ["review", "learn"], about: "Learn new items and do your reviews" },
  { tab: "lessons", icon: "課", label: "Lessons", href: href.lessons(), pages: ["lessons", "lesson"], about: "All 2,136 kanji in 206 lessons" },
  { tab: "read", icon: "読", label: "Read", href: href.read(), pages: ["read", "sentences", "story"], about: "Stories and sentences you can read" },
  { tab: "search", icon: "探", label: "Search", href: href.search(), pages: ["search"], about: "Kanji, words, readings, meanings" },
  { tab: "grammar", icon: "文", label: "Grammar", href: href.grammar(), pages: ["grammar", "grammarPoint"], about: "Start here, grammar, numbers, phrases" },
  { tab: "kana", icon: "あ", label: "Kana", href: href.kana(), pages: ["kana", "kanaRow", "kanaPractice"], about: "Learn kana and drill them any time" },
  { tab: "write", icon: "筆", label: "Writing", href: href.write(), pages: ["write"], about: "Draw kanji with stroke order" },
  {
    tab: "progress",
    icon: "進",
    label: "Progress",
    href: href.progress(),
    pages: ["progress", "practice", "settings", "known", "write"],
    about: "Stats, calendar and extra practice",
  },
  { tab: "known", icon: "知", label: "Known", href: href.known(), pages: ["known"], about: "Mark what you know, import from WaniKani or Anki" },
  { tab: "settings", icon: "設", label: "Settings", href: href.settings(), pages: ["settings"], about: "Sign in, study order, card types" },
];

export const DEFAULT_TABS = ["review", "read", "search", "progress"];
/** For someone brand new: kana and grammar first. */
export const BEGINNER_TABS = ["grammar", "kana", "review", "progress"];
export const PICKS = 4;

/** The bottom bar: Home, then your picks. */
export function barTools(settings: Settings): Tool[] {
  const picks = (settings.tabs ?? DEFAULT_TABS).map((t) => TOOLS.find((x) => x.tab === t)).filter((t): t is Tool => !!t);
  return [HOME, ...picks.slice(0, PICKS)];
}

/** Which bar tab lights up on a page: the most specific tool on the bar that has it, else Home. */
export function activeTab(bar: Tool[], page: Route["page"]): string {
  const on = bar.filter((t) => t.pages.includes(page)).sort((a, b) => a.pages.length - b.pages.length)[0];
  return on?.tab ?? "home";
}

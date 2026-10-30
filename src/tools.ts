// The bottom bar: Home and Progress always sit at the ends (plain icons: they're places, not tools), and you pick
// the three tools between them in Settings. Every tool is on Home in its colour group, so one you don't pin is
// never out of reach.

import { href, type Route } from "./router";
import type { Settings } from "./srs";

export type Group = "study" | "read" | "basics";

export type Tool = {
  tab: string;
  /** A kanji for tools; Home and Progress draw `path` as a line icon instead. */
  icon: string;
  path?: string;
  label: string;
  /** A shorter label for the bottom bar. */
  short?: string;
  href: string;
  pages: Route["page"][];
  about: string;
  group?: Group;
};

export const GROUPS: { group: Group; title: string }[] = [
  { group: "study", title: "Study" },
  { group: "read", title: "Read and look up" },
  { group: "basics", title: "Foundations" },
];

export const HOME: Tool = { tab: "home", icon: "", path: "M3 11l9-7 9 7v9h-6v-6H9v6H3z", label: "Home", href: href.home(), pages: ["home"], about: "" };

export const PROGRESS: Tool = {
  tab: "progress",
  icon: "",
  path: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  label: "Progress",
  href: href.progress(),
  pages: ["progress", "settings", "known"],
  about: "",
};

export const TOOLS: Tool[] = [
  { tab: "review", icon: "復", label: "Review", href: href.review(), pages: ["review", "learn"], about: "Due reviews and new items", group: "study" },
  { tab: "lessons", icon: "課", label: "Lessons", href: href.lessons(), pages: ["lessons", "lesson"], about: "All 2,136 kanji in 206 lessons", group: "study" },
  { tab: "write", icon: "筆", label: "Writing", href: href.write(), pages: ["write"], about: "Draw kanji with stroke order", group: "study" },
  { tab: "practice", icon: "練", label: "Extra practice", short: "Practice", href: href.extra(), pages: ["extra", "practice"], about: "Mistakes, leeches, this week's items", group: "study" },
  { tab: "read", icon: "読", label: "Read", href: href.read(), pages: ["read", "sentences", "story"], about: "Stories and sentences", group: "read" },
  { tab: "search", icon: "探", label: "Search", href: href.search(), pages: ["search"], about: "Kanji, words, readings, meanings", group: "read" },
  { tab: "grammar", icon: "文", label: "Grammar", href: href.grammar(), pages: ["grammar", "grammarPoint"], about: "Start here, N5, numbers, phrases", group: "basics" },
  { tab: "kana", icon: "あ", label: "Kana", href: href.kana(), pages: ["kana", "kanaRow", "kanaPractice"], about: "Learn kana and drill them", group: "basics" },
];

export const DEFAULT_TABS = ["review", "read", "search"];
/** For someone brand new: kana and grammar first. */
export const BEGINNER_TABS = ["grammar", "kana", "review"];
export const PICKS = 3;

/** Your three picks, falling back to the defaults for any that aren't tools (older saves picked four, Progress included). */
export function pickedTools(settings: Settings): Tool[] {
  const picks = [...(settings.tabs ?? []), ...DEFAULT_TABS, ...TOOLS.map((t) => t.tab)];
  return [...new Set(picks)]
    .map((t) => TOOLS.find((x) => x.tab === t))
    .filter((t): t is Tool => !!t)
    .slice(0, PICKS);
}

/** The bottom bar: Home, your picks, Progress. */
export function barTools(settings: Settings): Tool[] {
  return [HOME, ...pickedTools(settings), PROGRESS];
}

/** Which bar tab lights up on a page: the tool on the bar that has it, else Home. */
export function activeTab(bar: Tool[], page: Route["page"]): string {
  return bar.find((t) => t.pages.includes(page))?.tab ?? "home";
}

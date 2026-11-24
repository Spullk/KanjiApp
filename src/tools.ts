// The bottom bar: Home (根) always sits in the middle, with two tools you pick on each side (Settings → Toolbar).
// Every tool you don't pin hangs on Home's plaque rack, with Progress, so nothing is ever out of reach.

import { href, type Route } from "./router";
import type { Settings } from "./srs";

export type Group = "study" | "read" | "basics";

export type Tool = {
  tab: string;
  /** The kanji drawn on the bar and on Home's plaques. */
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

export const HOME: Tool = { tab: "home", icon: "根", label: "Home", href: href.home(), pages: ["home"], about: "" };

export const PROGRESS: Tool = {
  tab: "progress",
  icon: "進",
  label: "Progress",
  href: href.progress(),
  pages: ["progress", "settings", "known"],
  about: "Your kanji, stats and settings",
};

export const TOOLS: Tool[] = [
  { tab: "review", icon: "復", label: "Review", href: href.review(), pages: ["review", "learn"], about: "Due reviews and new items", group: "study" },
  { tab: "lessons", icon: "課", label: "Lessons", href: href.lessons(), pages: ["lessons", "lesson"], about: "All 2,136 kanji in 206 lessons", group: "study" },
  { tab: "write", icon: "筆", label: "Writing", href: href.write(), pages: ["write"], about: "Draw kanji with stroke order", group: "study" },
  { tab: "practice", icon: "練", label: "Extra practice", short: "Practice", href: href.extra(), pages: ["extra", "practice"], about: "Mistakes, leeches, this week's items", group: "study" },
  { tab: "read", icon: "読", label: "Read", href: href.read(), pages: ["read", "sentences", "story"], about: "Stories and sentences", group: "read" },
  { tab: "songs", icon: "歌", label: "Songs", href: href.songs(), pages: ["songs", "songAdd", "song"], about: "Learn the words of any song", group: "read" },
  { tab: "search", icon: "探", label: "Search", href: href.search(), pages: ["search"], about: "Kanji, words, readings, meanings", group: "read" },
  { tab: "grammar", icon: "文", label: "Grammar", href: href.grammar(), pages: ["grammar", "grammarPoint"], about: "From your first sentence up to N3", group: "basics" },
  { tab: "kana", icon: "あ", label: "Kana", href: href.kana(), pages: ["kana", "kanaRow", "kanaPractice"], about: "Learn kana and drill them", group: "basics" },
];

export const DEFAULT_TABS = ["lessons", "review", "search", "write"];
/** For someone brand new: kana and grammar first. */
export const BEGINNER_TABS = ["kana", "grammar", "review", "search"];
export const PICKS = 4;

/** Your four picks (two left of Home, two right), falling back to the defaults for any that aren't tools. Saves from
 * before Home moved to the middle (`tabs`, three picks) are ignored, so everyone starts on the new default bar. */
export function pickedTools(settings: Settings): Tool[] {
  const picks = [...(settings.bar ?? []), ...DEFAULT_TABS, ...TOOLS.map((t) => t.tab)];
  return [...new Set(picks)]
    .map((t) => TOOLS.find((x) => x.tab === t))
    .filter((t): t is Tool => !!t)
    .slice(0, PICKS);
}

/** The bottom bar: two picks, Home in the middle, two picks. */
export function barTools(settings: Settings): Tool[] {
  const p = pickedTools(settings);
  return [p[0], p[1], HOME, p[2], p[3]];
}

/** Home's plaque rack: Progress, then every tool that isn't on the bar, in this order. */
const RACK_ORDER = ["practice", "kana", "grammar", "read", "songs", "lessons", "review", "search", "write"];
export function rackTools(settings: Settings): Tool[] {
  const bar = pickedTools(settings);
  return [PROGRESS, ...RACK_ORDER.map((t) => TOOLS.find((x) => x.tab === t)!).filter((t) => !bar.includes(t))];
}

/** Which bar tab lights up on a page: the tool on the bar that has it, else Home. */
export function activeTab(bar: Tool[], page: Route["page"]): string {
  return bar.find((t) => t.pages.includes(page))?.tab ?? "home";
}

/** Puts `items` in the order of `order`, with anything it doesn't list after, in their own order. */
function ordered<T>(items: T[], key: (t: T) => string, order: string[] = []): T[] {
  const rank = (t: T) => {
    const i = order.indexOf(key(t));
    return i < 0 ? order.length + items.indexOf(t) : i;
  };
  return [...items].sort((a, b) => rank(a) - rank(b));
}

/** Home's tool groups and the tools in each, in your order. */
export function homeGroups(settings: Settings): { group: Group; title: string; tools: Tool[] }[] {
  const tools = ordered(TOOLS, (t) => t.tab, settings.homeTools);
  return ordered(GROUPS, (g) => g.group, settings.homeGroups).map(({ group, title }) => ({
    group,
    title,
    tools: tools.filter((t) => t.group === group),
  }));
}

/** Moves one tool (or group) a step earlier or later in a saved order, returning the new order. */
export function moveIn(all: string[], key: string, by: -1 | 1): string[] {
  const out = [...all];
  const i = out.indexOf(key);
  const j = i + by;
  if (i < 0 || j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Puts `tool` in bar spot `slot`; if it was already on the bar, the two swap places. */
export function placeTool(settings: Settings, slot: number, tool: string): string[] {
  const tabs = pickedTools(settings).map((t) => t.tab);
  const was = tabs.indexOf(tool);
  if (was >= 0) tabs[was] = tabs[slot];
  tabs[slot] = tool;
  return tabs;
}

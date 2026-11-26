// "Places in the tree" (Lucas OK'd 2026-11-24, built 2026-11-26): every menu is a different spot in the same tree
// world behind Home. Foundations (Kana, Grammar) sit down in the soil with the roots, study (Lessons, Review,
// Writing, Practice and the kanji, radical and word pages) sits at the trunk, and reading and looking up (Read,
// Songs, Search) sit up in the leaves. Progress shows the whole world, faintly. Settings stays plain paper.
// Flat tones only, kept to the edges, drawn over the page colour so the status bar strip still matches.
// The bottom bar stays the same on every screen (Lucas 2026-11-26), so places never change it.

import { useEffect, useState } from "preact/hooks";
import type { Route } from "./router";
import { seasonOf, worldSVG, LEAF, mix, type Season } from "./season";

export type Place = "soil" | "trunk" | "canopy" | "world";

const PLACES: Partial<Record<Route["page"], Place>> = {
  kana: "soil",
  kanaRow: "soil",
  kanaPractice: "soil",
  grammar: "soil",
  grammarPoint: "soil",
  lessons: "trunk",
  lesson: "trunk",
  learn: "trunk",
  review: "trunk",
  write: "trunk",
  practice: "trunk",
  extra: "trunk",
  kanji: "trunk",
  radical: "trunk",
  word: "trunk",
  read: "canopy",
  story: "canopy",
  sentences: "canopy",
  songs: "canopy",
  songAdd: "canopy",
  song: "canopy",
  search: "canopy",
  progress: "world",
};

export function placeOf(page: Route["page"]): Place | undefined {
  return PLACES[page];
}

function soilSVG(d: boolean): string {
  const s1 = d ? "#211b15" : "#ddd3bc";
  const s2 = d ? "#2a2119" : "#cfc0a1";
  const root = d ? "#4a3626" : "#9a7a5c";
  const pebble = d ? "#352d25" : "#bcae95";
  const roots: [string, number][] = [
    ["M40 0 C 45 60, 20 110, 30 170 S 10 260, 0 300", 7],
    ["M45 70 C 70 100, 80 130, 70 170", 3],
    ["M250 0 C 240 50, 265 100, 255 150 S 280 230, 270 280", 6],
    ["M255 90 C 225 120, 220 150, 230 190", 3],
    ["M140 0 C 150 20, 135 40, 145 60", 3],
  ];
  return `<svg viewBox="0 0 280 560" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path d="M0 360 C 70 350, 140 372, 280 352 V560 H0Z" fill="${s1}"/><path d="M0 450 C 90 440, 170 462, 280 444 V560 H0Z" fill="${s2}"/>
    ${roots.map(([p, w]) => `<path d="${p}" fill="none" stroke="${root}" stroke-width="${w}" stroke-linecap="round" opacity="${d ? 0.5 : 0.35}"/>`).join("")}
    ${[[30, 400, 5], [70, 470, 4], [210, 420, 6], [250, 500, 4], [150, 520, 5]].map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="${r * 1.4}" ry="${r}" fill="${pebble}"/>`).join("")}</svg>`;
}

function trunkSVG(d: boolean): string {
  const b1 = d ? "#3a2c21" : "#a9896a";
  const b2 = d ? "#2c2119" : "#8e6e52";
  const moss = d ? "#3e5a2a" : "#86a35a";
  const moss2 = d ? "#4d6e30" : "#a5bd76";
  const ridges = (x0: number, dir: number) =>
    Array.from({ length: 5 }, (_, i) => {
      const x = x0 + dir * i * 6;
      return `<path d="M${x} 0 C ${x + dir * 4} 80, ${x - dir * 3} 160, ${x + dir * 2} 240 S ${x - dir * 4} 400, ${x} 560" fill="none" stroke="${i % 2 ? b2 : b1}" stroke-width="${i % 2 ? 2 : 3.5}" opacity=".6"/>`;
    }).join("");
  return `<svg viewBox="0 0 280 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path d="M0 0 H22 C 18 140, 28 300, 20 560 H0Z" fill="${b1}" opacity=".5"/><path d="M280 0 H258 C 262 160, 252 320, 262 560 H280Z" fill="${b1}" opacity=".5"/>
    ${ridges(4, 1)}${ridges(276, -1)}
    <path d="M0 470 C 20 450, 40 462, 55 480 C 45 500, 20 505, 0 500Z" fill="${moss}"/><path d="M0 490 C 25 480, 40 490, 48 505 L0 512Z" fill="${moss2}"/>
    <path d="M280 120 C 262 112, 248 126, 252 142 C 262 150, 274 146, 280 140Z" fill="${moss}"/>
    <path d="M280 430 C 255 420, 236 438, 240 458 C 255 468, 272 462, 280 455Z" fill="${moss2}"/></svg>`;
}

function canopySVG(d: boolean, season: Season): string {
  const L = [...LEAF[season], LEAF[season][0]].map((c) => (d ? mix(c, "#11160f", 0.45) : c));
  const branch = d ? "#3a2c21" : "#8e6e52";
  const cl = (cx: number, cy: number, n: number, s: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = i * 2.4;
      const r = 6 + ((i * 7) % 22);
      const x = (cx + Math.cos(a) * r).toFixed(1);
      const y = (cy + Math.sin(a) * r * 0.7).toFixed(1);
      return `<ellipse cx="${x}" cy="${y}" rx="${7 * s}" ry="${3.6 * s}" transform="rotate(${(i * 47) % 180} ${x} ${y})" fill="${L[i % 3]}" opacity="${d ? 0.75 : 0.8}"/>`;
    }).join("");
  const drift = Array.from({ length: 5 }, (_, i) => {
    const x = (i * 67 + 30) % 280;
    const y = 150 + i * 80;
    return `<ellipse cx="${x}" cy="${y}" rx="5" ry="2.6" transform="rotate(${i * 50} ${x} ${y})" fill="${L[i % 3]}" opacity=".45"/>`;
  }).join("");
  // The branch and big leaf clusters stay in the top corners, above the page title's line.
  return `<svg viewBox="0 0 280 560" preserveAspectRatio="xMidYMin slice" aria-hidden="true">
    <path d="M-5 16 C 50 12, 110 26, 180 10 S 260 2, 290 6" fill="none" stroke="${branch}" stroke-width="4" stroke-linecap="round" opacity=".8"/>
    ${cl(14, 14, 12, 0.9)}${cl(266, 10, 12, 0.9)}${cl(272, 300, 8, 0.9)}${cl(6, 420, 9, 0.9)}${drift}</svg>`;
}

export function placeSVG(place: Place, dark: boolean): string {
  switch (place) {
    case "soil":
      return soilSVG(dark);
    case "trunk":
      return trunkSVG(dark);
    case "canopy":
      return canopySVG(dark, seasonOf());
    case "world":
      return worldSVG(dark);
  }
}

/** Follows the phone's light or dark setting live. */
export function useDark(): boolean {
  const query = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : undefined;
  const [dark, setDark] = useState(!!query?.matches);
  useEffect(() => {
    if (!query) return;
    const on = () => setDark(query.matches);
    query.addEventListener("change", on);
    return () => query.removeEventListener("change", on);
  }, []);
  return dark;
}

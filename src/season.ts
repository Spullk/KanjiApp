// The world behind Home: the season follows the real month and the sky follows the time of day. The season also
// sets the accent colour (style.css, `:root[data-season]`), so the whole app shifts a little through the year.

export type Season = "spring" | "summer" | "autumn" | "winter";
export type DayTime = "day" | "dusk" | "night";

export function seasonOf(d = new Date()): Season {
  const m = d.getMonth();
  return m < 2 || m === 11 ? "winter" : m < 5 ? "spring" : m < 8 ? "summer" : "autumn";
}

export function timeOf(d = new Date()): DayTime {
  const h = d.getHours();
  return h >= 7 && h < 17 ? "day" : (h >= 17 && h < 20) || (h >= 5 && h < 7) ? "dusk" : "night";
}

/** Puts the season on <html> for the accent colour, and keeps it right if the app stays open across a month. */
export function initSeason() {
  const set = () => (document.documentElement.dataset.season = seasonOf());
  set();
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && set());
}

/** The two hand-drawn fonts the new look uses, cut down to the characters it draws in them (a few kilobytes,
 * kept offline by the service worker). Until they arrive, the device's own fonts stand in. */
export function loadLookFonts() {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.crossOrigin = "anonymous";
  const hand = "根課復探筆練読歌文あ進学";
  const nums = "0123456789+";
  link.href = `https://fonts.googleapis.com/css2?family=Klee+One:wght@600&family=Shippori+Mincho:wght@700&text=${encodeURIComponent(hand + nums)}&display=swap`;
  document.head.appendChild(link);
}

const SKY = {
  day: { spring: ["#d9e4ec", "#f6ece6"], summer: ["#cadde2", "#eef0dc"], autumn: ["#e3d3be", "#f5e9d4"], winter: ["#cfdbe4", "#eef2f4"] },
  dusk: ["#7f6c93", "#eeb68a"],
  night: ["#161c30", "#343a57"],
  darkDay: ["#26313f", "#4d5c5e"],
  darkDusk: ["#2f2740", "#7a5552"],
  darkNight: ["#0f1322", "#232842"],
} as const;
const GROUND = {
  day: { spring: ["#a7ba78", "#8ea262"], summer: ["#8fa65c", "#76904d"], autumn: ["#b39a5a", "#937b46"], winter: ["#e7ecef", "#ccd6dd"] },
  dusk: { spring: ["#8c8a62", "#6f6a4c"], summer: ["#77804c", "#5e663d"], autumn: ["#987a4b", "#775d39"], winter: ["#b9b3be", "#9a95a6"] },
  night: { spring: ["#3d4a3c", "#2c3630"], summer: ["#354532", "#263227"], autumn: ["#4a4232", "#352f25"], winter: ["#6c7489", "#4f566a"] },
} as const;
const LEAF = { spring: ["#d9789a", "#efaec2"], summer: ["#466e36", "#6a903b"], autumn: ["#bf4a29", "#efb440"], winter: ["#a9845a", "#c9d4dd"] } as const;

function mix(a: string, b: string, t: number): string {
  const h = (x: string) => {
    const n = parseInt(x.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const A = h(a);
  const B = h(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** True when the sky is dark enough that text on it should be light. */
export function darkSky(dark: boolean, t = timeOf()): boolean {
  return dark || t !== "day";
}

/** The sky, hills, sun or moon, and falling petals or snow, as SVG markup (all shapes are fixed numbers, no user text). */
export function worldSVG(dark: boolean, season = seasonOf(), t = timeOf(), seed = 9): string {
  const sky = dark ? (t === "day" ? SKY.darkDay : t === "dusk" ? SKY.darkDusk : SKY.darkNight) : t === "day" ? SKY.day[season] : SKY[t];
  const gr = dark ? (t === "dusk" ? GROUND.dusk[season] : GROUND.night[season]).map((c) => mix(c, "#0f1322", 0.15)) : GROUND[t][season];
  const leaf = LEAF[season];
  const tint = t === "night" || dark ? (x: string) => mix(x, "#1b2338", 0.45) : t === "dusk" ? (x: string) => mix(x, "#c2724a", 0.18) : (x: string) => x;
  const far = mix(gr[0], sky[0], 0.45);
  const night = t === "night" || (dark && t !== "dusk");
  const stars = night
    ? Array.from({ length: 14 }, (_, i) => `<circle cx="${(i * 73 + seed * 31) % 270}" cy="${((i * 37 + seed * 17) % 200) + 10}" r="${i % 3 ? 0.8 : 1.3}" fill="#fff" opacity="${0.35 + (i % 4) * 0.12}"/>`).join("")
    : "";
  const sun =
    t === "night" || dark
      ? `<circle cx="205" cy="70" r="12" fill="#e9e4cf" opacity=".85"/>`
      : `<circle cx="205" cy="${t === "dusk" ? 270 : 80}" r="${t === "dusk" ? 32 : 20}" fill="${t === "dusk" ? "#f6cf9a" : "#fff8e8"}" opacity="${t === "dusk" ? 0.9 : 0.7}"/>`;
  const petals =
    season === "spring" || season === "autumn"
      ? Array.from({ length: 8 }, (_, i) => {
          const x = (i * 61 + seed * 23) % 270;
          const y = ((i * 89 + seed * 11) % 460) + 30;
          return `<ellipse cx="${x}" cy="${y}" rx="3" ry="1.7" transform="rotate(${i * 40} ${x} ${y})" fill="${tint(leaf[i % 2])}" opacity=".7"/>`;
        }).join("")
      : "";
  const snow =
    season === "winter"
      ? Array.from({ length: 14 }, (_, i) => `<circle cx="${(i * 47 + seed * 29) % 270}" cy="${(i * 67 + seed * 13) % 520}" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity=".7"/>`).join("")
      : "";
  return `<svg viewBox="0 0 270 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
    <linearGradient id="ws" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${gr[0]}"/><stop offset="1" stop-color="${gr[1]}"/></linearGradient></defs>
    <rect width="270" height="560" fill="url(#ws)"/>${stars}${sun}
    <path d="M0 ${300 - (seed % 3) * 8} C 55 275, 110 300, 165 ${272 + (seed % 2) * 8} S 245 260, 270 282 V560 H0Z" fill="${far}" opacity=".75"/>
    <path d="M0 340 C 65 ${315 + (seed % 3) * 5}, 135 335, 190 318 S 252 322, 270 316 V560 H0Z" fill="url(#wg)"/>
    <path d="M-10 430 C 70 410, 155 435, 280 412 V560 H-10Z" fill="${gr[1]}"/>${petals}${snow}</svg>`;
}

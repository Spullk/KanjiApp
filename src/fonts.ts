// Kanji in other typefaces, so you learn to recognise them in print, handwriting and brush as well as in your
// device's font. Fonts come from Google Fonts, cut down to just the characters on the card.

export const REVIEW_FONTS = ["Noto Serif JP", "Klee One", "Zen Kurenaido", "Yuji Syuku", "Zen Maru Gothic", "Kaisei Opti"];

const loaded = new Set<string>();

/** Loads `family` for these characters only (a few kilobytes). Without a connection the card keeps the usual font. */
export function loadFont(family: string, text: string) {
  const key = family + "|" + text;
  if (loaded.has(key) || typeof document === "undefined") return;
  loaded.add(key);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&text=${encodeURIComponent(text)}&display=swap`;
  document.head.appendChild(link);
}

/** A font for this card, the same one all day, and the device's own font now and then. */
export function fontFor(cardId: string, day = new Date().toDateString()): string | undefined {
  let h = 0;
  for (const c of cardId + day) h = (h * 31 + c.charCodeAt(0)) | 0;
  const i = Math.abs(h) % (REVIEW_FONTS.length + 1);
  return REVIEW_FONTS[i];
}

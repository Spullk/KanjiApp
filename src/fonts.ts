// Kanji in other typefaces, so you learn to recognise them in print, handwriting and brush as well as in your
// device's font. Fonts come from Google Fonts, cut down to just the characters on the card.

export const REVIEW_FONTS = ["Noto Serif JP", "Klee One", "Zen Kurenaido", "Yuji Syuku", "Zen Maru Gothic", "Kaisei Opti"];

/** How long a card waits for its font before showing the usual one instead (slow or no connection). */
export const FONT_WAIT_MS = 1500;

// Each family + text has one download. `true` once the font is ready to draw, `false` if it couldn't be had.
const loads = new Map<string, Promise<boolean>>();
const settled = new Map<string, boolean>();

/** Loads `family` for these characters only (a few kilobytes). Resolves true once the text can be drawn in it. */
export function loadFont(family: string, text: string): Promise<boolean> {
  const key = family + "|" + text;
  const known = loads.get(key);
  if (known) return known;
  if (typeof document === "undefined") return Promise.resolve(false);
  const load = new Promise<boolean>((resolve) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.crossOrigin = "anonymous"; // so the offline copy (vite.config.ts) can keep it
    link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}&text=${encodeURIComponent(text)}&display=block`;
    link.onerror = () => resolve(false);
    // The stylesheet only declares the font; ask for the file itself and wait until it's in.
    link.onload = () =>
      (document.fonts?.load(`1em "${family}"`, text) ?? Promise.resolve([]))
        .then((faces) => resolve(faces.length > 0))
        .catch(() => resolve(false));
    document.head.appendChild(link);
  }).then((ok) => {
    settled.set(key, ok);
    return ok;
  });
  loads.set(key, load);
  return load;
}

/** Whether the font for this text has finished loading: true (ready), false (failed), undefined (still coming). */
export function fontState(family: string, text: string): boolean | undefined {
  return settled.get(family + "|" + text);
}

/** A font for this card, the same one all day, and the device's own font now and then. */
export function fontFor(cardId: string, day = new Date().toDateString()): string | undefined {
  let h = 0;
  for (const c of cardId + day) h = (h * 31 + c.charCodeAt(0)) | 0;
  const i = Math.abs(h) % (REVIEW_FONTS.length + 1);
  return REVIEW_FONTS[i];
}

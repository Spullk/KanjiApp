/**
 * Makes the website behave like a phone app (the NATIVE APP RULE in style.css and docs/design-rules.md).
 * CSS does most of it; this file covers what iPhones only let script do.
 */
export function initAppFeel() {
  // Pinch zoom: iPhones ignore "user-scalable=no" in the viewport tag, but cancelling Safari's gesture events stops
  // the pinch. Browsers without gesture events (Android) keep to the viewport tag; there two-finger moves are
  // cancelled as a backup.
  if ("ongesturestart" in window) {
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    }
  } else {
    document.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length > 1) e.preventDefault();
      },
      { passive: false },
    );
  }
  // iPhones only show a button's pressed look (:active) when the page listens for touches at all.
  document.addEventListener("touchstart", () => {}, { passive: true });
  blockEdgeSwipe();

  // On-screen keyboard: --kb is how much of the screen it covers and --vv-top how far the phone has slid the view
  // up to show the field. Sheets pinned to the bottom (the song chat) use them to sit above the keyboard.
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement.style;
  let last = "";
  const place = () => {
    const kb = Math.max(0, Math.round(document.documentElement.clientHeight - vv.height - vv.offsetTop));
    const top = Math.max(0, Math.round(vv.offsetTop));
    const key = `${kb}/${top}`;
    if (key === last) return;
    last = key;
    root.setProperty("--kb", `${kb}px`);
    root.setProperty("--vv-top", `${top}px`);
    document.documentElement.classList.toggle("kb-open", kb > 80);
  };
  vv.addEventListener("resize", place);
  vv.addEventListener("scroll", place);
  place();
}

/** Width of the strip along each side where iPhones start their swipe-back (and swipe-forward) gesture. */
const EDGE = 20;

/**
 * Turns off the phone's swipe from the screen edge to go back: the tab bar and the page's own Back do that job,
 * and Learn new uses sideways swipes itself (Lucas, 2026-11-27). Safari only lets a page stop it by cancelling the
 * touch that starts in the edge strip, which also cancels the tap and the scroll that touch would have made, so
 * both are done by hand for touches that start there: a touch that doesn't move becomes a tap, and an up-down drag
 * scrolls whatever is under the finger (without the fling at the end).
 */
function blockEdgeSwipe() {
  let edge: { el: Element; x: number; y: number; moved: boolean; box: Element | null } | null = null;
  document.addEventListener(
    "touchstart",
    (e) => {
      edge = null;
      const t = e.touches[0];
      if (e.touches.length !== 1 || (t.clientX > EDGE && t.clientX < window.innerWidth - EDGE)) return;
      const el = e.target as Element;
      if (el?.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      edge = { el, x: t.clientX, y: t.clientY, moved: false, box: scrollBox(el) };
    },
    { passive: false },
  );
  document.addEventListener(
    "touchmove",
    (e) => {
      const t = e.touches[0];
      if (!edge || !t) return;
      if (Math.hypot(t.clientX - edge.x, t.clientY - edge.y) > 10) edge.moved = true;
      if (edge.moved && edge.box) edge.box.scrollTop -= t.clientY - edge.y;
      edge.y = t.clientY;
      edge.x = t.clientX;
    },
    { passive: true },
  );
  document.addEventListener("touchend", () => {
    const tap = edge && !edge.moved ? edge.el : null;
    edge = null;
    // A real click event, not el.click(): the finger often lands on an icon's <svg>/<path>, which has no click().
    tap?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  document.addEventListener("touchcancel", () => (edge = null));
}

/** The nearest thing that scrolls up and down from `el`: a scrolling box (a sheet, a list) or else the page. */
function scrollBox(el: Element | null): Element | null {
  for (let e = el; e && e !== document.body; e = e.parentElement) {
    const y = getComputedStyle(e).overflowY;
    if ((y === "auto" || y === "scroll") && e.scrollHeight > e.clientHeight) return e;
  }
  return document.scrollingElement;
}

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

import type { RefObject } from "preact";
import { useEffect } from "preact/hooks";

/**
 * Stops a finger on this element from scrolling the page. CSS touch-action alone isn't enough in iPhone Safari
 * and home-screen apps, so touches are cancelled here (listeners must be non-passive to be allowed to).
 */
export function useNoScroll(ref: RefObject<Element>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    return () => {
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
    };
  });
}

import { useEffect, useRef, useState } from "preact/hooks";

/**
 * Sideways swipes on an area, for flipping between cards. The card follows the finger while you drag and springs
 * back if you let go early; vertical moves still scroll the page. A drag that turned into a swipe doesn't also
 * count as a tap on the link underneath.
 */
export function useSwipe({
  onLeft,
  onRight,
  distance = 60,
}: {
  onLeft?: () => void;
  onRight?: () => void;
  distance?: number;
}) {
  // A callback ref, so the listeners go on even when the area only appears after a loading screen.
  const [el, ref] = useState<HTMLElement | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onLeft, onRight });
  handlers.current = { onLeft, onRight };

  useEffect(() => {
    if (!el) return;
    let start: { x: number; y: number; id: number } | null = null;
    let sideways = false;
    let swiped = false;
    const move = (dx: number, animate: boolean) => {
      const c = card.current;
      if (!c) return;
      c.style.transition = animate ? "transform 0.18s ease-out, opacity 0.18s ease-out" : "none";
      c.style.transform = dx ? `translateX(${dx}px) rotate(${dx / 40}deg)` : "";
      c.style.opacity = dx ? String(Math.max(0.4, 1 - Math.abs(dx) / 500)) : "";
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      sideways = false;
      swiped = false;
    };
    const drag = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!sideways) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          start = null; // a scroll, not a swipe
          return;
        }
        if (Math.abs(dx) < 12) return;
        sideways = true;
      }
      // Nothing that way: the card only gives a little.
      const can = dx < 0 ? handlers.current.onLeft : handlers.current.onRight;
      move(can ? dx : dx / 4, false);
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      start = null;
      if (!sideways) return;
      swiped = true;
      const go = dx <= -distance ? handlers.current.onLeft : dx >= distance ? handlers.current.onRight : undefined;
      if (go) {
        move(0, false);
        go();
      } else move(0, true);
    };
    const cancel = () => {
      if (start && sideways) move(0, true);
      start = null;
    };
    const click = (e: MouseEvent) => {
      if (!swiped) return;
      swiped = false;
      e.preventDefault();
      e.stopPropagation();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", drag);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", drag);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("click", click, true);
    };
  }, [el, distance]);

  return { ref, card };
}

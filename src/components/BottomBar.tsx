import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useLayoutEffect, useState } from "preact/hooks";

/** Where page action bars go: a row inside the dock, straight above the tab bar (see docs/design-rules.md). */
export const DOCK_SLOT = "dock-actions";

/**
 * A page's bottom action bar (Show answer, the grade buttons, Next, a word's meaning while reading).
 * It isn't positioned by the page: it's moved into the dock, which stacks it above the tab bar in normal layout,
 * so it can never end up underneath the tab bar, whatever height the bar or the phone's home strip has.
 */
export function BottomBar({ class: cls, children }: { class?: string; children: ComponentChildren }) {
  const [slot, setSlot] = useState<HTMLElement | null>(() => document.getElementById(DOCK_SLOT));
  useLayoutEffect(() => {
    if (!slot) setSlot(document.getElementById(DOCK_SLOT));
  }, []);
  if (!slot) return null;
  return createPortal(<div class={["answer-bar", cls].filter(Boolean).join(" ")}>{children}</div>, slot);
}

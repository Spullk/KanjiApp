// Edit the bottom bar: every tool with what it's for, the ones already on the bar greyed out. Tap a spot on the
// bar and then a tool, or drag a tool onto a spot.

import { useRef, useState } from "preact/hooks";
import { update, useStore } from "../srs";
import { HOME, pickedTools, placeTool, PROGRESS, TOOLS, type Tool } from "../tools";

function Icon({ t }: { t: Tool }) {
  return t.path ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={t.path} />
    </svg>
  ) : (
    <span aria-hidden="true" lang="ja">
      {t.icon}
    </span>
  );
}

type Drag = { tool: string; x: number; y: number; moved: boolean };

export function ToolbarEditor({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const picked = pickedTools(store.settings);
  const [slot, setSlot] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);

  const place = (spot: number, tool: string) => {
    update((s) => (s.settings.tabs = placeTool(s.settings, spot, tool)));
    setSlot((spot + 1) % picked.length);
  };

  // Dragging by the handle works with a finger or a mouse: pointer events on the window, then the bar spot under
  // the pointer when it's let go. The handle doesn't scroll the page; the rest of the row does, and a tap on it
  // places the tool in the selected spot.
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const down = (tool: string) => (e: PointerEvent) => {
    e.preventDefault();
    const from = { x: e.clientX, y: e.clientY };
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      moved ||= Math.hypot(ev.clientX - from.x, ev.clientY - from.y) > 8;
      if (moved) setDrag({ tool, x: ev.clientX, y: ev.clientY, moved });
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDrag(null);
      if (ev.type === "pointercancel") return;
      if (moved) {
        const spot = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-slot]");
        if (spot) place(Number(spot.dataset.slot), tool);
      } else place(slotRef.current, tool);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };
  const dragged = drag?.moved ? TOOLS.find((t) => t.tab === drag.tool) : undefined;

  return (
    <div class="toolbar-editor">
      <p class="hint">Tap a spot on the bar, then the tool you want there, or drag a tool onto a spot. Home and Progress stay at the ends.</p>
      <div class="bar-preview">
        <span class="bar-spot fixed">
          <Icon t={HOME} />
          {HOME.label}
        </span>
        {picked.map((t, i) => (
          <button key={i} data-slot={i} class={`bar-spot ${t.group ?? ""} ${i === slot ? "selected" : ""}`} onClick={() => setSlot(i)}>
            <Icon t={t} />
            {t.short ?? t.label}
          </button>
        ))}
        <span class="bar-spot fixed">
          <Icon t={PROGRESS} />
          {PROGRESS.label}
        </span>
      </div>
      <ul class="tool-picker">
        {TOOLS.map((t) => {
          const on = picked.includes(t);
          return (
            <li key={t.tab}>
              <div class={`tool-pick ${t.group ?? ""} ${on ? "on-bar" : ""}`}>
                <button class="tool-pick-main" onClick={() => place(slot, t.tab)}>
                  <span class="tool-icon" lang="ja">
                    {t.icon}
                  </span>
                  <span class="tool-pick-text">
                    <b>{t.label}</b>
                    <span>{t.about}</span>
                  </span>
                  {on && <small class="tool-pick-tag">On the bar</small>}
                </button>
                <span class="drag-handle" onPointerDown={down(t.tab)} aria-label={`Drag ${t.label} onto the bar`} role="button">
                  ⠿
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {dragged && (
        <div class="tool-ghost" style={{ left: drag!.x, top: drag!.y }} aria-hidden="true">
          <span lang="ja">{dragged.icon}</span> {dragged.short ?? dragged.label}
        </div>
      )}
      <button class="primary wide" onClick={onDone}>
        Done
      </button>
    </div>
  );
}

# Nekko layout rules

Rules every screen follows, so the same kind of bug can't come back. `node scripts/layout_check.cjs` checks them
on three phone sizes (run it next to `npx vite --port 5173`); run it after any layout change.

## 1. Bars are rows in the layout, never laid over the page

The app is one column with three parts, top to bottom:

```
┌──────────────────────┐
│ main (the page)      │  grows, scrolls with the page
├──────────────────────┤
│ dock: action bar     │  Show answer / grade buttons / Next / a word's meaning (only when a page has one)
│ dock: tab bar        │  + the phone's home strip as padding
└──────────────────────┘
```

- The **dock** (`.dock` in `src/main.tsx`) comes after `main` in the page and is `position: sticky; bottom: 0`, so
  it stays on screen while scrolling but still takes up its own space. The end of a page can never be hidden
  behind it, and nothing has to know how tall it is.
- A page's bottom buttons go in the dock with the **`BottomBar`** component (`src/components/BottomBar.tsx`).
  It stacks them above the tab bar. Never put buttons on screen with `position: fixed` and a guessed
  `bottom: 58px`: that's what hid Show answer under the tab bar (the guess missed the iPhone home strip).
- `position: fixed` is only for things that cover the whole screen on purpose (welcome, confirm screens, the tour
  dimmer). If an overlay must sit above the dock, use `var(--dock-h)`; page layout never uses it.
- No hard-coded "room for the tab bar" padding (`padding-bottom: 88px` and similar). The dock is in the flow, so
  the room is already there.

## 2. Notches and the home strip are handled in one place each

- `viewport-fit=cover` is on, so the app draws under the notch and home strip.
- Top notch: `main`'s top padding uses `env(safe-area-inset-top)`. Home strip: only the tab bar's bottom padding
  uses `env(safe-area-inset-bottom)`. Left/right: `main`'s side padding. Nothing else reads these values.

## 3. The page never scrolls sideways

- Anything too wide cuts itself off with an ellipsis, wraps, or scrolls inside its own box.
- Grids with a fixed number of columns use `minmax(0, 1fr)`, not `1fr`. Flex and grid children that hold text
  get `min-width: 0`. Images and video get `max-width: 100%`. Long words wrap (`overflow-wrap: break-word` on body).
- `overflow-x: clip` on `html`/`body` is the safety net, not the fix: if it's hiding something, fix that thing.

## 4. Check at phone size before shipping

- Screenshots at iPhone size (390 × 664 and the small 320 × 568), light and dark if colours changed.
- `scripts/layout_check.cjs` fails if a page is wider than the screen, an action bar sits under the tab bar,
  a bottom button can't be tapped, or the end of a page is hidden behind the dock. It also fakes a home strip
  arriving late, the way iOS sometimes reports it.

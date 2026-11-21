// Layout check: opens every main screen at phone sizes and fails if a layout rule from docs/design-rules.md breaks.
//   1. The page never scrolls sideways (nothing wider than the screen).
//   2. A page's action bar (Show answer, grade buttons, Next) sits fully above the tab bar, never under it.
//   3. Scrolled to the very end, the last thing on the page is above the dock, not hidden behind it.
//
// Run it next to the dev server:   npx vite --port 5173   then   node scripts/layout_check.cjs
// Needs Playwright (pre-installed in Claude's cloud sessions). Set SHOTS=dir to also save a screenshot per screen.
const { chromium, devices } = require("playwright");

const BASE = process.env.BASE || "http://127.0.0.1:5173/";
const SHOTS = process.env.SHOTS;
const PHONES = ["iPhone SE", "iPhone 13", "Pixel 7"];

const ROUTES = ["#/", "#/lessons", "#/lesson/1", "#/k/日", "#/r/日", "#/search?q=hi", "#/progress", "#/settings", "#/read", "#/sentences", "#/grammar", "#/kana", "#/write", "#/practice", "#/known"];

async function measure(p) {
  return p.evaluate(() => {
    window.scrollTo(0, document.documentElement.scrollHeight);
    const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const tab = box(".tabbar");
    const bar = box(".dock-actions .answer-bar");
    const dock = box(".dock");
    const kids = [...document.querySelectorAll("main *")].filter((e) => e.getClientRects().length && getComputedStyle(e).position !== "fixed");
    const lastBottom = Math.max(0, ...kids.map((e) => e.getBoundingClientRect().bottom));
    return {
      wide: document.documentElement.scrollWidth - innerWidth,
      barUnderTabs: bar && tab ? bar.bottom - tab.top : 0,
      endHidden: dock ? lastBottom - dock.top : 0,
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const phone of PHONES) {
    const ctx = await browser.newContext({ ...devices[phone], deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    const check = async (name) => {
      await p.waitForTimeout(700);
      // Desktop browsers have no iPhone home strip, so add one late, the way iOS sometimes reports it (this is
      // exactly what pushed Show answer under the tab bar before the dock existed).
      await p.addStyleTag({ content: ".tabbar { padding-bottom: 40px !important }" });
      await p.waitForTimeout(150);
      const m = await measure(p);
      if (m.wide > 1) problems.push(`${phone} ${name}: page is ${m.wide}px wider than the screen`);
      if (m.barUnderTabs > 0.5) problems.push(`${phone} ${name}: action bar is ${m.barUnderTabs.toFixed(0)}px under the tab bar`);
      if (m.endHidden > 0.5) problems.push(`${phone} ${name}: end of the page is ${m.endHidden.toFixed(0)}px behind the dock`);
      if (SHOTS) await p.screenshot({ path: `${SHOTS}/${phone.replace(/ /g, "-")}_${name.replace(/[^\w]+/g, "_")}.png` });
    };
    const tap = (loc, where) =>
      loc.click({ timeout: 3000 }).then(
        () => true,
        () => (problems.push(`${where}: a button can't be tapped, something covers it`), false),
      );
    await p.goto(BASE);
    await p.getByText("I can read kana").click();
    await p.waitForTimeout(500);
    const skip = p.getByRole("button", { name: "Skip" });
    if (await skip.count()) await skip.first().click(); // the first-run tour
    for (const r of ROUTES) {
      await p.goto(BASE + r);
      await check(r);
    }
    // Study screens with an action bar: learn, then review (front and back), then practice.
    await p.goto(BASE + "#/learn");
    await check("learn");
    for (let i = 0; i < 8; i++) {
      const next = p.getByRole("button", { name: /Got it, next|Start reviews/ });
      if (!(await next.count())) break;
      // A real tap: fails if anything (like the tab bar) covers the button.
      if (!(await tap(next.first(), `${phone} learn`))) break;
      await p.waitForTimeout(250);
    }
    await check("review-front");
    const show = p.getByRole("button", { name: "Show answer" });
    if (await show.count()) {
      if (await tap(show, `${phone} review`)) await check("review-back");
    } else problems.push(`${phone}: no Show answer button on the review screen`);
    await ctx.close();
  }
  await browser.close();
  if (problems.length) {
    console.log(problems.join("\n"));
    process.exit(1);
  }
  console.log(`Layout OK on ${PHONES.join(", ")}`);
})();

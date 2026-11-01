/**
 * Round eighty-five, agent U: outside review A16f. My plants still shifted 0.206 on a cold, throttled phone (421 plants;
 * Chromium, 1.6 Mbit/s, 150 ms, CPU x4): the backup line under the search reflowed from three lines to two when Public
 * Sans arrived after the list was drawn, and the list under it moved up. Round eighty-four's test (r84u-frame P2) served
 * the fonts at once from the local server, so the swap came before the list and nothing moved.
 *
 * Here the three web fonts are held back until the list is drawn, as a phone's network holds them, and the layout shifts
 * are read from the first frame. The line is now set in the web font's metric-matched stand-in face, which is there at
 * the first paint, so its arrival does not reflow it.
 *
 * On r85base: 0.2234 at 375 px (the line 79 px tall in the stand-in, 58 px once Public Sans came; the list moved 21 px).
 */
import { test, expect } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';
import { goneQuiet, framesSettled } from './helpers/settled';
import { chromiumOnly } from './helpers/engines';

const CDP_ONLY = "a CPU throttle through the DevTools protocol of Chromium, which WebKit and Firefox do not have; r84u-frame P2, A12, B4 reads the same page every frame in every engine";
import { writeWait } from './helpers/pace';

test.use({ serviceWorkers: 'block' });

const notPersisted = () => {
  const s = navigator.storage as StorageManager & { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> };
  if (s) { s.persisted = () => Promise.resolve(false); s.persist = () => Promise.resolve(false); }
};
const plants = (n: number): Row[] => {
  const rows: Row[] = [['location', 'gh', 'name', 'Bench']];
  for (let i = 1; i <= n; i++) rows.push(['accession', `t${i}`, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', `t${i}`, 'taxonName', i % 3 ? 'Copiapoa cinerea' : 'Echeveria elegans'], ['accession', `t${i}`, 'status', 'growing'], ['accession', `t${i}`, 'nameKind', 'species'], ['accession', `t${i}`, 'locationId', 'gh']);
  return rows;
};

for (const width of [320, 375, 414]) test(`A16f: My plants with 421 plants holds still when the fonts arrive after the list (${width} px) @phone-only`, chromiumOnly(CDP_ONLY), async ({ context, page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width, height: 664 });
  await context.addInitScript(notPersisted);
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: writeWait(15_000, 50) });
  await inject(page, plants(421), Date.now() - 86_400_000, 'r85uuuuuuuuuuuu9');
  await context.addInitScript(() => {
    const w = window as unknown as { __cls: Array<{ v: number; src: string[] }> };
    w.__cls = [];
    new PerformanceObserver((l) => { for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node }> }>) if (!e.hadRecentInput) w.__cls.push({ v: e.value, src: (e.sources ?? []).map((s) => (s.node instanceof Element ? `${s.node.tagName}.${s.node.className}#${s.node.id}` : String(s.node?.nodeName))) }); }).observe({ type: 'layout-shift', buffered: true });
  });
  // The fonts held until the list is on screen, then let through: the swap comes after the first full layout.
  let release!: () => void;
  const fontsHeld = new Promise<void>((r) => { release = r; });
  // A font request the page gave up meanwhile (its navigation replaced) has nothing to continue: that is not the test's failure.
  await page.route(/\.woff2(\?|$)/, async (route) => { await fontsHeld; await route.continue().catch(() => { /* the request was cancelled by the page */ }); });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    await page.goto('/plants', { waitUntil: 'commit' });
    await expect(page.locator('a.accrow').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('#backup-nudge')).toBeVisible();
    release();
    // The swap's reflow, and any late one: read once the page has stopped asking for anything and has drawn two frames
    // since (the merge: in place of a 300 ms sleep, outside review A23).
    await goneQuiet(page);
    await framesSettled(page);
  } finally {
    release();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  expect(loaded.length, 'the web fonts did arrive').toBeGreaterThan(0);
  const shifts = await page.evaluate(() => (window as unknown as { __cls: Array<{ v: number; src: string[] }> }).__cls);
  const cls = shifts.reduce((a, s) => a + s.v, 0);
  console.log(`r85u A16f at ${width}: CLS ${cls.toFixed(4)} ${JSON.stringify(shifts)}`);
  expect(cls).toBeLessThan(0.01);
});

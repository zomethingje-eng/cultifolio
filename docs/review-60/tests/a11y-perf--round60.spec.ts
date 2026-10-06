/**
 * Round sixty, accessibility and performance review (area "a11y-perf"): reproductions.
 *
 * Every test here FAILS on current code (commit 21257b7) and passes once its finding is fixed. Finding numbers refer to
 * /tmp/r60rev/out/a11y-perf.md.
 *
 * To run: copy into tests/e2e/ and run
 *   PW_REUSE=1 npx playwright test tests/e2e/a11y-perf--round60.spec.ts
 * (or without PW_REUSE to build and serve on 4173 as the suite does). Chromium only: the CLS tests use the
 * layout-shift entry and CDP CPU throttling.
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** As smoke.spec.ts's helper: wait for the page's own stores, write rows, drop the fold snapshot. */
async function inject(page: Page, rows: Array<[string, string, string, unknown]>, wall = Date.now() - 86_400_000, writer = 'a11yperf00000000') {
  await page.evaluate(async ({ rows, wall, writer }) => {
    let db: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !db; i++) {
      const d = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (d && d.objectStoreNames.contains('changes') && d.objectStoreNames.contains('meta')) db = d;
      else { d?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!db) throw new Error('no stores');
    const tx = db.transaction(['changes', 'meta'], 'readwrite');
    rows.forEach(([kind, id, field, value], i) => tx.objectStore('changes').put({ t: `${String(wall + i).padStart(13, '0')}-0000-${writer}`, kind, id, field, value }));
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
  }, { rows, wall, writer });
}
function plants(n: number): Array<[string, string, string, unknown]> {
  const rows: Array<[string, string, string, unknown]> = [['location', 'gh', 'name', 'Greenhouse'], ['location', 'gh', 'type', 'greenhouse']];
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  for (let i = 1; i <= n; i++) {
    const id = `ap${i}`;
    rows.push(['accession', id, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis'], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'], ['accession', id, 'locationId', 'gh']);
    rows.push(['event', `w${id}`, 'acc', id], ['event', `w${id}`, 'd', old], ['event', `w${id}`, 't', 'water'], ['event', `w${id}`, 'note', null]);
  }
  return rows;
}
/** Keep the one-time persistence toast and the backup nudge out of the way of the test's own toasts. */
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
});

test('a11y-perf 2: Water in select mode keeps keyboard focus on a control, and Tab then reaches the toast\'s Undo', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(3));
  await page.goto('/plants'); await ready(page);
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast .undo')).toBeVisible();
  // Today: the button is `disabled` while it saves, focus falls to <body>, the toast records no origin, and Tab skips its Undo.
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  await page.keyboard.press('Tab');
  await expect(page.locator('.toast .undo')).toBeFocused();
});

test('a11y-perf 1: a toast with an action is never a keyboard trap, even when it was raised with focus on the page', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(3));
  await page.goto('/plants'); await ready(page);
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-water').click(); // with a pointer: focus is nowhere in particular when the toast is raised
  await expect(page.locator('.toast .undo')).toBeVisible();
  await page.locator('.toast .undo').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  // Today: onKey() swallows Tab on the toast's last button and back() has nowhere to go; the toast holds its timer while
  // focused, so focus stays on Undo for good. Measured: 14 Tabs and 25 s later, still on Undo.
  expect(await page.evaluate(() => !!document.activeElement?.closest('.toast'))).toBe(false);
});

test('a11y-perf 6: in forced colours the current tab in the phone tab bar is drawn in HighlightText on Highlight', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, forcedColors: 'active', colorScheme: 'dark' });
  const page = await ctx.newPage();
  await page.goto('/plants'); await ready(page);
  const c = await page.evaluate(() => {
    const a = document.querySelector('#tabbar a[aria-current="page"]')!;
    const probe = document.createElement('span'); probe.style.color = 'HighlightText'; document.body.append(probe);
    const want = getComputedStyle(probe).color; probe.remove();
    return { got: getComputedStyle(a).color, want };
  });
  // Today: #tabbar a.on { color: var(--accent) } outranks the forced-colours rule: rgb(95,184,148) on cyan, 1.6:1.
  expect(c.got).toBe(c.want);
  await ctx.close();
});

test('a11y-perf 4: the sample collection\'s bar does not shift a server-rendered page (CLS under 0.1)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/\.woff2$/, (r) => r.abort()); // the font swap is measured apart (finding 12); this is the bar alone
  await page.goto('/'); await ready(page);
  await page.evaluate(() => sessionStorage.setItem('cultifolio.demo', '1'));
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.demobar')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // a mid-range phone; at 1x the bar can land before first paint
  await page.addInitScript(() => { (window as unknown as { __cls: number }).__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  // A server-rendered page with no photographs, so nothing else moves (the species page measures 0.53 with its photo strip).
  await page.goto('/about/how'); await ready(page);
  await page.waitForTimeout(1500);
  // Today: DemoBar renders only after mount and pushes the whole page down by its own height.
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
});

test('a11y-perf 5: Today with 300 plants does not shift as the collection opens (CLS under 0.1 at 4x CPU)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(300));
  await page.goto('/plants'); await expect(page.locator('a.accrow').first()).toBeVisible({ timeout: 60_000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => { (window as unknown as { __cls: number }).__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#calendar')).toBeAttached({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  // Today: 0.25 to 0.29; the frost watch is drawn under "Opening the collection…" and pushed off the screen by the stops.
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
});

test('a11y-perf 9: the sample\'s locked Sync page still has a visible h1', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.evaluate(() => sessionStorage.setItem('cultifolio.demo', '1'));
  await page.goto('/sync'); await ready(page);
  await expect(page.locator('#demo-locked')).toBeVisible();
  // Today: `body.demo-locked #main > :not(.demobar):not(.demolock)…` hides the page head with everything else.
  await expect(page.locator('h1')).toBeVisible();
});

test('a11y-perf 7: at 320 px with 200% text, the Wanted note form and Today\'s calendar button do not scroll sideways', async ({ baseURL }) => {
  const { chromium } = await import('@playwright/test');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-a11yperf-'));
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: 32, default_fixed_font_size: 26 } } }));
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, locale: 'en-GB', viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); } catch { /* fine */ } });
    await page.goto('/plants'); await ready(page);
    await inject(page, [...plants(2), ['taxon', 'refusia-testii', 'name', 'Refusia testii'], ['taxon', 'refusia-testii', 'followed', true]]);
    const wide: string[] = [];
    const sideways = async (label: string) => { const [s, c] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]); if (s > c) wide.push(`${label} ${s}>${c}`); };
    await page.goto('/plants'); await ready(page);
    await page.locator('#wanted button.linkish').first().click();
    await sideways('Wanted form'); // today 411>320
    await page.goto('/today'); await ready(page);
    await page.locator('#calendar summary').click();
    await sideways('calendar'); // today 489>320
    await page.goto('/plants'); await ready(page);
    await page.locator('#select-toggle').click(); await page.locator('.selrow input').first().check(); await page.locator('#sel-move').click();
    await sideways('select: move'); // today 440>320
    await page.goto('/species/refusia-testii'); await ready(page);
    await sideways('refusal pills'); // today 417>320
    expect(wide).toEqual([]);
  } finally {
    await ctx.close();
  }
});

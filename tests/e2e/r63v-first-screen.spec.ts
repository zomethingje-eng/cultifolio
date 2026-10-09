/**
 * Round sixty-three, agent V (V4): the phone's first screen, measured where the owner sees it. Round sixty-two measured
 * 390 × 844, the iPhone's whole screen; Safari's page is about 390 × 664, and there the tab bar began right under the
 * chips and no catalogue row showed (docs/REVIEW-ROUND-62.md, section 7). The photo strip is drawn after the first rows on
 * a phone now, as the feature is on a desktop. Measured with the live-shaped front page round sixty-two built
 * (`r62w-shapes.ts`), at Safari's page sizes on an iPhone 12 to 15 (390 × 664), an iPhone SE (375 × 548) and a common
 * Android phone (360 × 640), with the welcome line shown (a visitor) and dismissed.
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r63v-first-screen.spec.ts
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { servePhotos, liveShapedHome } from './r62w-shapes';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 });
}

/** The front page drawn from the live-shaped data: a client-side visit from another page, as round sixty-two's test did. */
async function liveHome(browser: Browser, baseURL: string | undefined, width: number, height: number, welcomed: boolean) {
  const ctx = await browser.newContext({ baseURL, viewport: { width, height }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
  if (welcomed) await ctx.addInitScript(() => { try { localStorage.setItem('cultifolio.welcomed', '1'); } catch { /* fine */ } });
  const page = await ctx.newPage();
  await servePhotos(page);
  await liveShapedHome(page);
  await page.goto('/about/how');
  await ready(page);
  await page.locator('#tabbar a[href="/"]').first().click();
  await page.waitForURL(/\/$/);
  await expect(page.locator('.letters a')).toHaveCount(25);
  await expect(page.locator('.rows .grow').first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
  return { ctx, page };
}

const measure = (page: Page) => page.evaluate(() => {
  const b = (s: string) => document.querySelector(s)!.getBoundingClientRect();
  const shown = (s: string) => { const e = document.querySelector<HTMLElement>(s); return !!e && e.offsetParent !== null && e.getBoundingClientRect().height > 0; };
  return {
    scrollY,
    tab: b('#tabbar').top,
    welcome: shown('#welcome'),
    search: b('.toolrow .searchbar').bottom,
    group: b('.tools .seg').bottom,
    chips: b('.tools .chiprow').bottom,
    az: b('.tools .azbtn').bottom,
    rowTop: b('.rows .grow').top,
    row: b('.rows .grow').bottom,
    // The strip that is drawn, wherever it is: on a phone it follows the first rows.
    strips: [...document.querySelectorAll<HTMLElement>('section.featured')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().top)
  };
});

for (const [width, height] of [[390, 664], [375, 548], [360, 640]] as const) {
  for (const welcomed of [false, true]) {
    test(`r63v V4: at ${width} × ${height}, welcome ${welcomed ? 'dismissed' : 'shown'}, the search, every grouping control and one whole row are above the tab bar`, { tag: '@phone-only' }, async ({ browser, baseURL }) => {
      const { ctx, page } = await liveHome(browser, baseURL, width, height, welcomed);
      const m = await measure(page);
      expect(m.scrollY).toBe(0);
      expect(m.welcome).toBe(!welcomed);
      for (const [k, y] of Object.entries({ search: m.search, group: m.group, chips: m.chips, az: m.az, row: m.row })) expect(y, `${k} bottom ${y} against the tab bar at ${m.tab}`).toBeLessThanOrEqual(m.tab);
      // One strip drawn, and after the first row, not above the search.
      expect(m.strips.length).toBe(1);
      expect(m.strips[0]).toBeGreaterThan(m.rowTop);
      // Its photographs still come in: the strip is the same twelve tiles, further down.
      await expect(page.locator('section.featured:visible .ftile')).toHaveCount(12);
      await ctx.close();
    });
  }
}

test('r63v V4: on a phone a chip click moves no row', { tag: '@phone-only' }, async ({ browser, baseURL }) => {
  const { ctx, page } = await liveHome(browser, baseURL, 390, 664, false);
  const before = await measure(page);
  await page.locator('.chiprow a', { hasText: 'Climate known' }).click();
  await page.waitForURL(/chip=climate/);
  await expect(page.locator('.chiprow a.on')).toContainText('Climate known');
  const after = await measure(page);
  expect(Math.abs(after.chips - before.chips)).toBeLessThan(2);
  expect(Math.abs(after.rowTop - before.rowTop)).toBeLessThan(2);
  await ctx.close();
});

test('r63v V4: on a desktop the strip stays above the search, and the feature follows the first rows', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/');
  await ready(page);
  const g = await page.evaluate(() => {
    const strips = [...document.querySelectorAll<HTMLElement>('section.featured')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().top + scrollY);
    const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top + scrollY;
    return { strips, search: top('.toolrow .searchbar'), row: top('.rows .grow'), feature: top('section.feature') };
  });
  expect(g.strips.length).toBe(1);
  expect(g.strips[0]).toBeLessThan(g.search);
  expect(g.feature).toBeGreaterThan(g.row);
  await ctx.close();
});

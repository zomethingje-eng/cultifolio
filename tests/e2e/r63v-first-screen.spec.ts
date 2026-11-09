/**
 * Round sixty-three, agent V (V4): the phone's first screen, measured where the owner sees it. Round sixty-two measured
 * 390 × 844, the iPhone's whole screen; Safari's page is about 390 × 664, and there the tab bar began right under the
 * chips and no catalogue row showed (docs/REVIEW-ROUND-62.md, section 7). V4 drew the photo strip after the first rows on
 * a phone. Round seventy-six (the owner's decision) put it back above the search, where a desktop has it: after the rows
 * it read as three random plants dropped into the A section. So the first screen now holds the strip and the search, and
 * the first row follows them; the tests below say so, and that the search is still reached at once. Measured with the
 * live-shaped front page round sixty-two built
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
    // The strip that is drawn, and how many are in the page (one since round seventy-six).
    strips: [...document.querySelectorAll<HTMLElement>('section.featured')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().top),
    stripBottom: document.querySelector('section.featured')!.getBoundingClientRect().bottom,
    searchTop: b('.toolrow .searchbar').top,
    leadBottom: b('section.lead h1').bottom,
    searchButton: b('#topbar .searchicon').bottom,
    inPage: document.querySelectorAll('section.featured').length
  };
});

for (const [width, height] of [[390, 664], [375, 548], [360, 640]] as const) {
  for (const welcomed of [false, true]) {
    // Round seventy-six: the strip above the search, as on a desktop, and the list under the search unbroken. Round sixty-three
    // had the search, the grouping, the chips and one whole row above the tab bar here, with the strip after the rows; the
    // owner chose the strip at the top instead, so the row now comes after a short scroll. The search is still on the
    // first screen on the owner's iPhone (390 × 664) and a common Android phone (360 × 640); on an iPhone SE (375 × 548) its
    // top is, and its foot a short flick under the tab bar.
    test(`r63v V4: at ${width} × ${height}, welcome ${welcomed ? 'dismissed' : 'shown'}, the lead and the top bar's search are on the first screen, and the strip comes before the search with no row between them`, { tag: '@phone-only' }, async ({ browser, baseURL }) => {
      const { ctx, page } = await liveHome(browser, baseURL, width, height, welcomed);
      const m = await measure(page);
      console.log(`r63v V4 ${width} × ${height}, welcome ${welcomed ? 'dismissed' : 'shown'}: lead to ${Math.round(m.leadBottom)}, strip ${Math.round(m.strips[0])}–${Math.round(m.stripBottom)}, search ${Math.round(m.searchTop)}–${Math.round(m.search)}, chips ${Math.round(m.chips)}, row ${Math.round(m.rowTop)}, tab bar ${Math.round(m.tab)}`);
      expect(m.scrollY).toBe(0);
      expect(m.welcome).toBe(!welcomed);
      // One strip, drawn once, above the search; the first row after the search.
      expect(m.inPage).toBe(1);
      expect(m.strips.length).toBe(1);
      expect(m.stripBottom).toBeLessThanOrEqual(m.searchTop);
      expect(m.rowTop).toBeGreaterThan(m.search);
      // Round eighty-seven (plan D1, DESIGN-87: the owner's front page leads with one figure and its trail): the first
      // screen is the lead's sentence, whole, and the search is reached at once from the top bar's search button, which
      // takes the cursor to the catalogue's box; the strip, the box and the rows follow the lead, Browse and the welcome.
      expect(m.leadBottom, `the lead's sentence against the tab bar at ${m.tab}`).toBeLessThanOrEqual(m.tab);
      expect(m.searchButton, `the top bar's search against the tab bar at ${m.tab}`).toBeLessThanOrEqual(m.tab);
      await page.locator('#topbar .searchicon').click();
      await expect(page.locator('.toolrow .searchbar')).toBeFocused();
      // Its photographs come in: the same twelve tiles, at the top.
      await expect(page.locator('section.featured:visible .ftile')).toHaveCount(12);
      await ctx.close();
    });
  }
}

test('r63v V4: on a phone a chip click moves no row', { tag: '@phone-only' }, async ({ browser, baseURL }) => {
  const { ctx, page } = await liveHome(browser, baseURL, 390, 664, false);
  // Where a reader is when they press a chip: since round eighty-seven the chips follow the lead and the strip.
  await page.locator('.chiprow').scrollIntoViewIfNeeded();
  const before = await measure(page);
  await page.locator('.chiprow a', { hasText: 'Climate known' }).click();
  await page.waitForURL(/chip=climate/);
  await expect(page.locator('.chiprow a.on')).toContainText('Climate known');
  const after = await measure(page);
  expect(Math.abs(after.chips - before.chips)).toBeLessThan(2);
  expect(Math.abs(after.rowTop - before.rowTop)).toBeLessThan(2);
  await ctx.close();
});

test('r63v V4: on a desktop the strip stays above the search, and the search above the first rows', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/');
  await ready(page);
  const g = await page.evaluate(() => {
    const strips = [...document.querySelectorAll<HTMLElement>('section.featured')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().top + scrollY);
    const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top + scrollY;
    return { strips, search: top('.toolrow .searchbar'), row: top('.rows .grow') };
  });
  expect(g.strips.length).toBe(1);
  expect(g.strips[0]).toBeLessThan(g.search);
  expect(g.search).toBeLessThan(g.row); // round seventy-four: the feature that followed the rows is gone (the owner's decision 3)
  await ctx.close();
});

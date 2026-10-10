/**
 * Round sixty-seven, the harness (triage-66 H3; S-E11, R45-28): the Chromium-only tests in a form every engine runs.
 *
 * Twenty-two tests were left out of WebKit (tests/e2e/helpers/engines.ts) because they used what only Chromium has: the
 * accessibility tree through CDP, a CDP CPU throttle, a Chrome profile's text size, the Layout Instability API. Safari is
 * where the iPhone meets those faults, so each kind gets a portable form here:
 *   - the accessibility tree: `toMatchAriaSnapshot`, Playwright's own, in every engine (r62a 61-8);
 *   - the dark theme on paper: `emulateMedia` alone, the photographs refused with the worker blocked (r63fv front 2);
 *   - 200% text: the root's font size at 200% (helpers/text-size.ts `rootText`) at 320 px (smoke's "round sixty: at 320
 *     px with the browser's text at 200%", and the other 200% tests' pages);
 *   - layout shift: element positions read on every frame (helpers/positions.ts), as the web fonts arrive late (r62ba
 *     N10) and as an example page is drawn (r61g 6);
 *   - the 6x CPU throttle's numbering race: the collection opened late instead, which smoke's next test already does
 *     ("round sixty: with the collection slow to open, the numbering controls wait for it…"), in every engine.
 * The originals stay, in Chromium, where they read what only Chromium can. WebKit is not installed where the suite is
 * written: these were run in Chromium here, and written against Playwright's API for the others.
 */
import { test, expect, type Page } from '@playwright/test';
import { positionsFromStart, positionMoves } from './helpers/positions';
import { rootText } from './helpers/text-size';
import { ownPages } from './helpers/r63v-own';

const quiet = () => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => { await context.addInitScript(quiet); await context.addInitScript(ownPages); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
/** Two frames drawn after the fonts: what was going to move has moved. */
async function drawn(p: Page) {
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test("r67h engines 1: the toast's live region is in the accessibility tree, empty, before any toast (r62a 61-8, in every engine)", async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const region = page.locator('.toastregion [role=status]');
  await expect(region).toHaveCount(1);
  await expect(region).toHaveText('');
  // Exposed as a status, not hidden from the tree (an `aria-hidden` or a `display: none` ancestor would leave it out).
  await expect(page.locator('.toastregion')).toMatchAriaSnapshot('- status');
});

test("r67h engines 2: a photograph's placeholder prints dark on white in the dark theme (r63fv front 2, in every engine)", async ({ page }) => {
  await page.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u.href), (r) => r.abort());
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/'); await ready(page);
  const ini = page.locator('.featured .ph .ini').first();
  await expect(ini).toBeAttached({ timeout: 20_000 });
  const lightness = () => ini.evaluate((el) => { const [r, g, b] = getComputedStyle(el).color.match(/[\d.]+/g)!.map(Number); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255; });
  expect(await lightness()).toBeGreaterThan(0.6); // on screen, the dark theme's light initial
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  expect(await lightness()).toBeLessThan(0.45); // on paper, the light theme's dark one
});

test('r67h engines 3: at 320 px with the text at 200%, no page scrolls sideways and the tab bar keeps Today on screen (the 200% tests, in every engine)', async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL, locale: 'en-GB', viewport: { width: 320, height: 700 }, serviceWorkers: 'block' });
  await ctx.addInitScript(quiet);
  await ctx.addInitScript(ownPages);
  await rootText(ctx, 200);
  const page = await ctx.newPage();
  try {
    await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    await page.getByRole('button', { name: /^Add/ }).click();
    await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
    const plant = new URL(page.url()).pathname;
    await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
    await page.fill('#s-count', '10');
    await page.getByRole('button', { name: 'Start batch' }).click();
    await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
    const batch = new URL(page.url()).pathname;
    const sideways: string[] = [];
    for (const route of ['/', '/species/copiapoa-cinerea', '/plants', plant, '/plants/new', '/plants/import', '/today', '/places', '/propagation', batch, '/labels', '/settings', '/sync', '/backup']) {
      await page.goto(route); await ready(page);
      await expect(page.locator('#tabbar')).toBeVisible();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), route).toBe('32px');
      await drawn(page);
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (scroll > client) sideways.push(`${route} ${scroll}>${client}`);
      const today = await page.locator('#tabbar a', { hasText: 'Today' }).boundingBox();
      expect(today, route).not.toBeNull();
      expect(today!.x + today!.width, route).toBeLessThanOrEqual(321);
    }
    expect(sideways).toEqual([]);
  } finally {
    await ctx.close();
  }
});

for (const path of ['/', '/species/copiapoa-cinerea']) {
  test(`r67h engines 4: at 390 px, ${path} keeps its headings and text in place when the web fonts arrive late (r62ba N10, in every engine)`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    // The fallback faces are tuned for Linux's, Windows' and Apple's fonts (r62ba N10 says how); elsewhere a move would say
    // nothing about them.
    test.skip(!['linux', 'win32', 'darwin'].includes(process.platform), `the fallback faces are tuned for Linux's, Windows' and Apple's fonts, not ${process.platform}'s`);
    const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, locale: 'en-GB', serviceWorkers: 'block' });
    await ctx.addInitScript(quiet);
    await ctx.addInitScript(ownPages);
    await ctx.route(/inaturalist|wikimedia|staticflickr|gbif\.org\/.*\.(jpe?g|png)|api\.gbif\.org\/v1\/image/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.continue()));
    await ctx.route(/\.woff2(\?|$)/, async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); });
    // What a reader's eye is on as the page settles: the page's title, the first heading and paragraph of the content,
    // and the tab bar.
    await positionsFromStart(ctx, ['h1', 'main h2', 'main p', '#tabbar']);
    const page = await ctx.newPage();
    await page.goto(path); await ready(page);
    await drawn(page);
    await page.waitForTimeout(2_000);
    const { moves, frames } = await positionMoves(page, 4);
    expect(frames, 'frames were read').toBeGreaterThan(10);
    expect(moves).toEqual([]);
    await ctx.close();
  });
}

test("r67h engines 5: an example page is drawn with the example's bar from the first frame, and nothing below it moves (r61g 6, in every engine)", async ({ browser, baseURL }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ baseURL, locale: 'en-GB', serviceWorkers: 'block' });
  await ctx.addInitScript(quiet);
  const page = await ctx.newPage();
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 60_000 });
  await positionsFromStart(page, ['.demobar', 'h1', 'main p']);
  await page.goto('/about/how'); await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-demo', '1');
  await expect(page.locator('.demobar')).toBeVisible();
  await drawn(page);
  await page.waitForTimeout(1_000);
  const { moves, frames } = await positionMoves(page, 4);
  expect(frames).toBeGreaterThan(10);
  expect(moves).toEqual([]);
  await ctx.close();
});

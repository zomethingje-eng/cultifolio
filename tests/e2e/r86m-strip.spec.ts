/**
 * Round eighty-six, the maps agent (the coordinator's follow-up to outside review B's 4): the species page's strip of
 * thumbnails under the name card waits for the lead photograph. Asked for as the page was laid out, the six thumbnails
 * (247 kB on Monstera deliciosa) shared a throttled phone's line with the lead, the page's largest paint, and it came
 * 1.2 s later than with them answered by nothing.
 *
 * 1. While the lead is on its way no thumbnail is asked for, their squares are kept, and nothing moves when they come.
 * 2. A lead that fails lets them go at once; a lead that never comes, 2.5 s after the page could start waiting.
 * 3. With no script the thumbnails load as before (from the strip's <noscript>), one in each square.
 *
 * On r86base (9cf3077): 1 FAILED (every thumbnail asked for while the lead was held); 2 FAILED (with the lead never
 * answered, every thumbnail asked for within 1.5 s); 3 passes (it guards the page without a script, which loaded them
 * already).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGNoWJAARww4OQBgthIBDttNdgAAAABJRU5ErkJggg==', 'base64');
const PHOTO_HOST = /^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org)\//;
/** The thumbnails' addresses: as the strip's <noscript> holds them (text to a browser running scripts), or as given. */
const stripUrls = (page: Page) => page.locator('.thumbstrip .tb').evaluateAll((tbs) => tbs.map((t) => /src="([^"]+)"/.exec(t.querySelector('noscript')?.textContent ?? '')?.[1].replace(/&amp;/g, '&') ?? t.querySelector('img')?.getAttribute('src') ?? ''));

/** Every photograph answered with a pixel, the lead (its medium or large size) as `lead` says; each request noted with when. */
async function photos(page: Page, lead: (r: Route) => Promise<void>) {
  const asked: Array<{ url: string; at: number }> = [];
  const t0 = Date.now();
  await page.route(PHOTO_HOST, async (r) => {
    asked.push({ url: r.request().url(), at: Date.now() - t0 });
    if (/\/(medium|large)\.\w+$/.test(r.request().url()) && r.request().url().includes('/photos/')) return lead(r);
    return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  return asked;
}
const geometry = (page: Page) => page.locator('.thumbstrip').evaluate((s) => ({ top: Math.round(s.getBoundingClientRect().top + scrollY), h: Math.round(s.getBoundingClientRect().height), squares: [...s.querySelectorAll('.tb')].map((t) => [Math.round(t.getBoundingClientRect().width), Math.round(t.getBoundingClientRect().height)]) }));

test('r86m strip 1: no thumbnail while the lead is on its way; squares kept; nothing moves when they come @phone', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((ok) => (release = ok));
  const asked = await photos(page, async (r) => { await held; await r.fulfill({ status: 200, contentType: 'image/png', body: PNG }); });
  await page.goto('/species/copiapoa-cinerea', { waitUntil: 'domcontentloaded' }); await ready(page);
  const strip = await stripUrls(page);
  expect(strip.length).toBeGreaterThan(2);
  await page.waitForTimeout(1500); // a negative: no thumbnail is asked for while the lead is held, so there is no state to wait for
  expect(asked.filter((a) => strip.includes(a.url)).map((a) => a.url)).toEqual([]);
  const before = await geometry(page);
  for (const [w, h] of before.squares) { expect(w).toBe(72); expect(h).toBe(72); }
  release();
  await expect.poll(() => asked.filter((a) => strip.includes(a.url)).length).toBe(strip.length);
  await expect.poll(() => page.locator('.thumbstrip .tb img').evaluateAll((xs) => xs.every((x) => (x as HTMLImageElement).complete && (x as HTMLImageElement).naturalWidth > 0))).toBe(true);
  expect(await geometry(page)).toEqual(before);
  // The alt text and the credit are each thumbnail's, as before.
  expect(await page.locator('.thumbstrip .tb img').first().getAttribute('alt')).toMatch(/^Copiapoa cinerea, photograph /);
  expect(await page.locator('.thumbstrip .tb img').first().getAttribute('title')).toBeTruthy();
});

test('r86m strip 2: a lead that fails lets the strip go at once; one that never comes, after 2.5 s @phone', async ({ page }) => {
  const failed = await photos(page, (r) => r.abort());
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const strip = await stripUrls(page);
  await expect.poll(() => failed.filter((a) => strip.includes(a.url)).length, { timeout: 2000 }).toBe(strip.length);
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  const stalled = await photos(page, () => new Promise<void>(() => { /* never answered */ }));
  await page.goto('/species/welwitschia-mirabilis', { waitUntil: 'domcontentloaded' }); await ready(page);
  const ready0 = Date.now();
  const strip2 = await stripUrls(page);
  expect(strip2.length).toBeGreaterThan(2);
  await page.waitForTimeout(1500); // a negative: with the lead stalled, nothing is asked for before the 2.5 s release
  expect(stalled.filter((a) => strip2.includes(a.url))).toEqual([]);
  await expect.poll(() => stalled.filter((a) => strip2.includes(a.url)).length, { timeout: 4000 }).toBe(strip2.length);
  expect(Date.now() - ready0).toBeLessThan(6000);
});

test('r86m strip 3: with no script the thumbnails load as before, one in each square @phone', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', viewport: test.info().project.use.viewport ?? undefined });
  const page = await ctx.newPage();
  await page.route(PHOTO_HOST, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.goto('/species/copiapoa-cinerea');
  const shown = await page.locator('.thumbstrip .tb').evaluateAll((tbs) => tbs.map((t) => [...t.querySelectorAll('img')].filter((i) => getComputedStyle(i).display !== 'none').map((i) => (i as HTMLImageElement).getAttribute('src'))));
  expect(shown.length).toBeGreaterThan(2);
  for (const s of shown) { expect(s).toHaveLength(1); expect(s[0]).toMatch(/small/); }
  await expect.poll(() => page.locator('.thumbstrip .tb noscript img, .thumbstrip .tb img[src]').evaluateAll((xs) => xs.filter((x) => (x as HTMLImageElement).complete && (x as HTMLImageElement).naturalWidth > 0).length)).toBe(shown.length);
  await ctx.close();
});

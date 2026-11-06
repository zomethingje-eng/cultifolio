/**
 * Round eighty-six, the maps agent: outside review B's 4 and review P's P9 (a species page fetched its maps' files, the
 * close-up's coastline 100 kB of them, as it was read, three screens above the maps, while a phone was still fetching the
 * lead photograph), and review C's C4 (the two coastlines were in no cache a page opened offline could use).
 *
 * 1. On a phone, a species page asks for no map file while its maps are far below; their room is kept (no shift when they
 *    draw) and the range is said beside them; scrolled near, the files come and the shapes are drawn.
 * 2. A print draws every map without a scroll.
 * 3. With the service worker: its install keeps the two coastlines; a page read online and not scrolled hands the worker
 *    its region files; with the network gone the page opens and its maps draw.
 *
 * On r86base (1b663ea): 1 FAILED (every map file asked for as the page loaded, the close-up's /maps/land50.svg and
 * /maps/r/ files with them, more than a screen above); 2 FAILED on the phone the same way (nothing deferred); 3 FAILED
 * (the install kept neither coastline).
 */
import { test, expect, type Page } from '@playwright/test';
import { cuttableNetwork, type Cut } from './helpers/cut';
import { controlledBy } from './helpers/controlled';
import { ready } from './helpers/smoke';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function noPhotos(page: Page) {
  await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.continue()));
}
const mapFiles = (page: Page) => {
  const asked: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/maps/')) asked.push(u.pathname); });
  return asked;
};
/** The map row's place in the page and each map's size, in CSS pixels. */
const geometry = (page: Page) => page.locator('.maprow').evaluate((row) => ({ top: Math.round(row.getBoundingClientRect().top + scrollY), maps: [...row.querySelectorAll('svg.map')].map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }));

test.describe('maps near the viewport', () => {
  test.use({ serviceWorkers: 'block' });

  test('r86m 1: no map file for a map more than a screen below; room kept; drawn when scrolled near @phone-only', async ({ page }) => {
    await noPhotos(page);
    const asked = mapFiles(page);
    await page.goto('/species/welwitschia-mirabilis'); await ready(page);
    await page.waitForLoadState('networkidle'); // every request the load makes has been made, so a map file not asked by now is not asked
    const before = await geometry(page);
    // The fixture's page is short: its world map begins within a screen of the first and is drawn at once, as it should
    // be; the close-up, under it on a phone, begins more than a screen below, and asks for nothing (a rich page's maps
    // are both three screens down: the measures in the round's report).
    const far = await page.locator('.mapbox svg.map-region').evaluate((s) => s.getBoundingClientRect().top + scrollY - 2 * innerHeight);
    expect(far, 'the close-up begins more than a screen below the first').toBeGreaterThan(0);
    expect(asked.filter((f) => f === '/maps/land50.svg' || f.startsWith('/maps/r/'))).toEqual([]);
    expect(await page.locator('.mapbox svg.map-region use[data-href]').count()).toBeGreaterThan(2);
    // The room kept: two maps at 3:2, the page's width.
    expect(before.maps).toHaveLength(2);
    for (const [w, h] of before.maps) { expect(w).toBeGreaterThan(200); expect(Math.abs(w / h - 1.5)).toBeLessThan(0.02); }
    // The range is said in words beside them, drawn or not.
    await expect(page.locator('#range-caption')).not.toBeEmpty();
    // Scrolled to the maps: the files come and the shapes are drawn.
    await page.locator('.mapbox svg.map-region').scrollIntoViewIfNeeded();
    await expect.poll(() => [...new Set(asked)].sort()).toEqual(['/maps/land110.svg', '/maps/land50.svg', '/maps/r/r-ANG.svg', '/maps/r/r-NAM.svg', '/maps/w/w-ANG.svg', '/maps/w/w-NAM.svg']);
    await expect.poll(() => page.locator('.mapbox svg.map-world use.range').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().height))).toBeGreaterThan(8);
    await expect.poll(() => page.locator('.mapbox svg.map-region use.land').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().width))).toBeGreaterThan(1);
    expect(await page.locator('.maprow use[data-href]').count()).toBe(0);
    // Nothing moved when they drew.
    expect(await geometry(page)).toEqual(before);
  });

  test('r86m 2: a print draws every map without a scroll @phone', async ({ page }) => {
    await noPhotos(page);
    const asked = mapFiles(page);
    await page.goto('/species/welwitschia-mirabilis'); await ready(page);
    await page.waitForLoadState('networkidle'); // every request the load makes has been made, so a map file not asked by now is not asked
    if (test.info().project.name.startsWith('phone')) expect(asked.filter((f) => f === '/maps/land50.svg')).toEqual([]); // the close-up is more than a screen below (1)
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
    expect(await page.locator('.maprow use[data-href]').count()).toBe(0);
    expect(await page.locator('.maprow use[href]').count()).toBeGreaterThan(5);
    await expect.poll(() => [...new Set(asked)].sort()).toEqual(['/maps/land110.svg', '/maps/land50.svg', '/maps/r/r-ANG.svg', '/maps/r/r-NAM.svg', '/maps/w/w-ANG.svg', '/maps/w/w-NAM.svg']);
    await expect.poll(() => page.locator('.mapbox svg.map-region use.land').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().width))).toBeGreaterThan(1);
  });
});

test.describe('maps offline', () => {
  let net: Cut;
  test.beforeEach(async ({ baseURL }) => { net = await cuttableNetwork(baseURL!); });
  test.afterEach(async () => { await net.close(); });

  test('r86m 3: the install keeps the coastlines, a page read and not scrolled keeps its region files, and offline its maps draw @phone', async ({ browser }) => {
    test.setTimeout(120_000);
    const use = test.info().project.use;
    const ctx = await browser.newContext({ baseURL: net.origin, locale: 'en-GB', viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor });
    const page = await ctx.newPage();
    const held = (path: string) => page.evaluate(async (p) => { for (const k of await caches.keys()) if (await (await caches.open(k)).match(p)) return true; return false; }, path);
    await page.goto('/plants'); await ready(page);
    await controlledBy(page);
    // The install: both coastlines, before any species page is read (review C's C4).
    await expect.poll(() => held('/maps/land50.svg'), { timeout: 30_000 }).toBe(true);
    expect(await held('/maps/land110.svg')).toBe(true);
    expect(await held('/maps/r/r-NAM.svg')).toBe(false);
    // A species page read online, not scrolled: its maps' region files handed to the worker once it has loaded.
    await page.goto('/species/welwitschia-mirabilis'); await ready(page);
    for (const f of ['/maps/w/w-NAM.svg', '/maps/w/w-ANG.svg', '/maps/r/r-NAM.svg', '/maps/r/r-ANG.svg']) await expect.poll(() => held(f), { timeout: 20_000, message: f }).toBe(true);
    // The network gone: the page opens and its maps draw from what the device holds.
    net.cut();
    await page.goto('/species/welwitschia-mirabilis'); await ready(page);
    await page.locator('.maprow').scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('.mapbox svg.map-world use.range').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().height))).toBeGreaterThan(8);
    await expect.poll(() => page.locator('.mapbox svg.map-world use.land').evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().width))).toBeGreaterThan(300);
    await expect.poll(() => page.locator('.mapbox svg.map-region use.range').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().height))).toBeGreaterThan(0);
    await ctx.close();
  });
});

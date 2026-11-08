/**
 * Round eighty-six, the maps agent: outside review B's 4 and review P's P9 (a species page fetched its maps' files, the
 * close-up's coastline 100 kB of them, as it was read, three screens above the maps, while a phone was still fetching the
 * lead photograph), and review C's C4 (the two coastlines were in no cache a page opened offline could use).
 *
 * 1. On a phone, a species page asks for no map file of a map far below while its lead photograph is on its way; their
 *    room is kept (no shift when they draw) and the range is said beside them; once the lead has come and the browser is
 *    idle, the files come and the shapes are drawn with no scroll (the final review's U1); 1b scrolled near, a map is
 *    drawn sooner, the lead still on its way.
 * 2. With no scroll, the page as printed holds every map and the gallery's photographs (page.pdf, read with poppler's
 *    pdftoppm); 2b the same of the print-media screenshot, in every engine. Until the final review (U1) this test sent
 *    `beforeprint` itself and read the DOM, which passed while Chromium printed the close-up as sea: its print does not
 *    wait for a `<use href>` set in `beforeprint`, nor for a lazy photograph made eager there.
 * 3. With the service worker: its install keeps the two coastlines; a page read online and not scrolled hands the worker
 *    its region files; with the network gone the page opens and its maps draw.
 *
 * On r86base (1b663ea): 1 FAILED (every map file asked for as the page loaded, the close-up's /maps/land50.svg and
 * /maps/r/ files with them, more than a screen above); 2 FAILED on the phone the same way (nothing deferred); 3 FAILED
 * (the install kept neither coastline).
 * On the final review's base (bac6183): 1 FAILED (no close-up file asked for once the lead had come, until scrolled);
 * 2 FAILED on the phone (printed with no scroll: 82 % of the land, the close-up's sea alone, and 69 % of the
 * photographs' red, the gallery's tiles empty), and passes on the desktop, where the fixture's maps and gallery are
 * within reach of the first screen; 2b FAILED on the phone (the close-up undrawn).
 */
import { test, expect, type Page } from '@playwright/test';
import { cuttableNetwork, type Cut } from './helpers/cut';
import { controlledBy } from './helpers/controlled';
import { ready } from './helpers/smoke';
import { framesSettled } from './helpers/settled';
import { chromiumOnly } from './helpers/engines';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const mapFiles = (page: Page) => {
  const asked: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/maps/')) asked.push(u.pathname); });
  return asked;
};
/** A 4 × 3 red PNG: every photograph answered with it, so a photograph printed is counted by its red. */
const RED = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGP4z8AARww4OQD1MQv1NXv7ggAAAABJRU5ErkJggg==', 'base64');
async function redPhotos(page: Page) {
  await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: RED }) : r.continue()));
}
/** The maps' land (theme.css `--map-land`, #e7e2d4, the light theme a print takes) and the photographs' red, counted in RGB pixels. */
function counted(px: Uint8Array | Uint8ClampedArray, step: 3 | 4) {
  let land = 0, red = 0;
  for (let i = 0; i + 2 < px.length; i += step) {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    if (Math.abs(r - 0xe7) <= 3 && Math.abs(g - 0xe2) <= 3 && Math.abs(b - 0xd4) <= 3) land++;
    else if (r > 220 && g < 40 && b < 40) red++;
  }
  return { land, red };
}
const PDFTOPPM = (() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
/** Every page of a PDF drawn at 60 dpi (poppler's pdftoppm), its land and red counted. */
function printed(pdf: Buffer) {
  const dir = mkdtempSync(join(tmpdir(), 'r86m-print-'));
  try {
    writeFileSync(join(dir, 'p.pdf'), pdf);
    execFileSync('pdftoppm', ['-r', '60', join(dir, 'p.pdf'), join(dir, 'p')]);
    const sum = { land: 0, red: 0 };
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.ppm'))) {
      const b = readFileSync(join(dir, f));
      // P6: "P6", width, height, maxval, each after white space, then the RGB bytes.
      const head = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(b.subarray(0, 64).toString('latin1'))!;
      const c = counted(b.subarray(head[0].length), 3);
      sum.land += c.land; sum.red += c.red;
    }
    return sum;
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
/** A screenshot's land and red, counted in the page's own canvas. */
const shot = (page: Page, png: Buffer) => page.evaluate(async (b64) => {
  const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const x = c.getContext('2d')!; x.drawImage(im, 0, 0);
  const px = x.getImageData(0, 0, c.width, c.height).data;
  let land = 0, red = 0;
  for (let i = 0; i < px.length; i += 4) {
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    if (Math.abs(r - 0xe7) <= 3 && Math.abs(g - 0xe2) <= 3 && Math.abs(b - 0xd4) <= 3) land++;
    else if (r > 220 && g < 40 && b < 40) red++;
  }
  return { land, red };
}, png.toString('base64'));
/** Every map and photograph scrolled to, top to foot, and each drawn and loaded: the print a reader who scrolled would get. */
async function scrolledThrough(page: Page) {
  await page.emulateMedia({ media: 'screen' });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 300) { await page.evaluate((t) => scrollTo(0, t), y); await framesSettled(page); }
  await expect.poll(() => page.locator('.maprow use[data-href]').count()).toBe(0);
  await expect.poll(() => page.locator('.mapbox svg.map-region use.land').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().width))).toBeGreaterThan(1);
  await expect.poll(() => page.locator('article.species img').evaluateAll((ims) => ims.filter((i) => (i as HTMLImageElement).getBoundingClientRect().width > 0 && !(i as HTMLImageElement).complete).length)).toBe(0);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => scrollTo(0, 0));
  await page.emulateMedia({ media: null }); // page.pdf prints the screen's styles while the screen is emulated
}
/** The map row's place in the page and each map's size, in CSS pixels. */
const geometry = (page: Page) => page.locator('.maprow').evaluate((row) => ({ top: Math.round(row.getBoundingClientRect().top + scrollY), maps: [...row.querySelectorAll('svg.map')].map((s) => { const r = s.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }));

test.describe('maps near the viewport', () => {
  test.use({ serviceWorkers: 'block' });

  test('r86m 1: no map file for a map more than a screen below while the lead photograph comes; room kept; drawn after it with no scroll @phone-only', async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((ok) => (release = ok));
    const small: string[] = [];
    await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, async (r) => {
      if (r.request().resourceType() !== 'image') return r.continue();
      if (/\/(medium|large)\.\w+$/.test(r.request().url())) await held; // the lead (and the gallery's tiles, which wait for it)
      else small.push(r.request().url());
      await r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
    });
    const asked = mapFiles(page);
    await page.goto('/species/welwitschia-mirabilis', { waitUntil: 'domcontentloaded' }); await ready(page);
    // The strip's thumbnails asked for: its own 2.5 s wait for the lead has run out (r86m strip 2), and the close-up's
    // files, which wait longer, are still not asked for.
    await expect.poll(() => small.length, { timeout: 6000 }).toBeGreaterThan(0);
    const before = await geometry(page);
    // The fixture's page is short: its world map begins within a screen of the first and is drawn at once, as it should
    // be; the close-up, under it on a phone, begins more than a screen below, and asks for nothing while the lead
    // photograph, the page's largest paint, is on its way (a rich page's maps are both three screens down: the measures
    // in the round's report).
    const far = await page.locator('.mapbox svg.map-region').evaluate((s) => s.getBoundingClientRect().top + scrollY - 2 * innerHeight);
    expect(far, 'the close-up begins more than a screen below the first').toBeGreaterThan(0);
    expect(asked.filter((f) => f === '/maps/land50.svg' || f.startsWith('/maps/r/'))).toEqual([]);
    expect(await page.locator('.mapbox svg.map-region use[data-href]').count()).toBeGreaterThan(2);
    // The room kept: two maps at 3:2, the page's width.
    expect(before.maps).toHaveLength(2);
    for (const [w, h] of before.maps) { expect(w).toBeGreaterThan(200); expect(Math.abs(w / h - 1.5)).toBeLessThan(0.02); }
    // The range is said in words beside them, drawn or not.
    await expect(page.locator('#range-caption')).not.toBeEmpty();
    // The lead come and the browser idle: the files come and the shapes are drawn with no scroll (U1: a print taken
    // then holds them; Chromium's print does not wait for a file asked for in `beforeprint`).
    release();
    await expect.poll(() => [...new Set(asked)].sort()).toEqual(['/maps/land110.svg', '/maps/land50.svg', '/maps/r/r-ANG.svg', '/maps/r/r-NAM.svg', '/maps/w/w-ANG.svg', '/maps/w/w-NAM.svg']);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await expect.poll(() => page.locator('.mapbox svg.map-world use.range').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().height))).toBeGreaterThan(8);
    await expect.poll(() => page.locator('.mapbox svg.map-region use.land').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().width))).toBeGreaterThan(1);
    expect(await page.locator('.maprow use[data-href]').count()).toBe(0);
    // Nothing moved when they drew.
    expect(await geometry(page)).toEqual(before);
  });

  test('r86m 1b: scrolled near, a map is drawn while the lead photograph is still on its way @phone-only', async ({ page }) => {
    await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, async (r) => {
      if (r.request().resourceType() !== 'image') return r.continue();
      if (/\/(medium|large)\.\w+$/.test(r.request().url())) return; // never answered
      await r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL });
    });
    const asked = mapFiles(page);
    await page.goto('/species/welwitschia-mirabilis', { waitUntil: 'domcontentloaded' }); await ready(page);
    expect(asked.filter((f) => f === '/maps/land50.svg')).toEqual([]);
    await page.locator('.mapbox svg.map-region').scrollIntoViewIfNeeded();
    await expect.poll(() => asked.includes('/maps/land50.svg'), { timeout: 3000 }).toBe(true);
    await expect.poll(() => page.locator('.mapbox svg.map-region use.land').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().width))).toBeGreaterThan(1);
  });

  // What a print holds (round eighty-six, the final review's U1): r86m 2 dispatched `beforeprint` itself and read the DOM
  // after, where the files had time to come; Chromium's own print does not wait for an SVG `<use href>` set in
  // `beforeprint`, nor for a lazy photograph switched to eager there, and printed the close-up as sea and the gallery
  // as empty squares. So these read the print itself, taken with no scroll once the page has settled, against the same
  // print taken after every map and photograph has been scrolled to.
  test('r86m 2: with no scroll, the page as printed holds every map and the gallery\'s photographs @phone', chromiumOnly('page.pdf, which only Chromium prints; r86m 2b reads the print-media screenshot in every engine'), async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!PDFTOPPM, 'pdftoppm (poppler) is not on this machine to read the print; r86m 2b reads the print-media screenshot');
    await redPhotos(page);
    await page.goto('/species/welwitschia-mirabilis'); await ready(page);
    await page.waitForLoadState('networkidle');
    if (test.info().project.name.startsWith('phone')) expect(await page.locator('.mapbox svg.map-region').evaluate((s) => s.getBoundingClientRect().top - 2 * innerHeight), 'the close-up begins more than a screen below').toBeGreaterThan(0);
    const first = printed(await page.pdf());
    await scrolledThrough(page);
    const all = printed(await page.pdf());
    test.info().annotations.push({ type: 'printed', description: JSON.stringify({ first, all }) });
    expect(all.land, 'the print after a scroll holds land').toBeGreaterThan(1000);
    expect(all.red, 'the print after a scroll holds photographs').toBeGreaterThan(1000);
    expect(first.land / all.land, 'the land of both maps, printed with no scroll').toBeGreaterThan(0.99);
    expect(first.red / all.red, "the gallery's photographs, printed with no scroll").toBeGreaterThan(0.99);
  });

  test('r86m 2b: with no scroll and no print yet, every map is drawn and every photograph loaded once the page has settled @phone', async ({ page }) => {
    await redPhotos(page);
    await page.goto('/species/welwitschia-mirabilis'); await ready(page);
    await page.waitForLoadState('networkidle');
    // Nothing has scrolled and no print event was sent: the maps' files and the photographs are the page's own doing. Read
    // before the print's layout is taken, which moves the maps up within reach of their observer.
    await expect.poll(() => page.locator('.maprow use[data-href]').count(), { message: 'every map drawn with no scroll' }).toBe(0);
    await expect.poll(() => page.locator('.mapbox svg.map-region use.land').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().width))).toBeGreaterThan(1);
    await expect.poll(() => page.locator('article.species img').evaluateAll((ims) => ims.filter((i) => !(i as HTMLImageElement).complete).length), { message: 'every photograph has loaded' }).toBe(0);
    await page.emulateMedia({ media: 'print' });
    const seen = async () => shot(page, await page.screenshot({ fullPage: true }));
    const first = await seen();
    await scrolledThrough(page);
    await page.emulateMedia({ media: 'print' });
    const all = await seen();
    expect(first.land / all.land, 'the land of both maps, as a print lays them out').toBeGreaterThan(0.99);
    expect(first.red / all.red, "the gallery's photographs, as a print lays them out").toBeGreaterThan(0.99);
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

/**
 * Round eighty (U): Back to the catalogue, on a catalogue the live site's size (the phone review's 1 and 8).
 *
 * 1. A genus row opened, a species tile tapped, the browser's Back: on the live site the page ran to the end of the list and
 *    kept loading rows (scroll 13,014 to 206,123 px on the phone review's iPhone, 2,780 rows), a blank screen with a
 *    collection on the device. The fixture holds four genera, so the catalogue here is the live one's shape, 3,000 genera
 *    (`__data.json` and `/api/rows` answered by the test, as r62w-shapes does for the front page). Back must put the tile
 *    the reader left where it was on the screen, load only the rows around it, and stay there.
 * 2. The same with a plant on the device (the review's blank screen).
 * 3. The top bar's "‹" after a browser Back and Forward goes to the page before, the opened row, not the front page.
 *
 * On r80f: 1 and 2 FAILED at both widths (the tile thousands of pixels above the screen, hundreds of rows asked for), 3
 * FAILED (the "‹" went to `/`).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as devalue from 'devalue';
import { ready, addPlant } from './helpers/smoke';

// No service worker: it would answer `__data.json` and `/api/rows` past the test's routes in some engines.
test.use({ serviceWorkers: 'block' });
// A data request still in the test's route when the test ends is let go, not reported against it.
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const N = 3000;
const OPEN = 1500;
const LETTERS = 'ABCDEFGHIJKLMNOPRSTUVWXYZ'.split('');
const PER = Math.ceil(N / LETTERS.length);
const id = (i: number) => `g${String(i).padStart(4, '0')}`;
const letterOf = (i: number) => LETTERS[Math.floor(i / PER)];
const row = (i: number) => ({ id: id(i), label: `${letterOf(i)}enus${String(i).padStart(4, '0')}`, sub: 'Testaceae', count: 3, withClimate: 1, notChecked: 0, pending: 0, letter: letterOf(i) });

/** The catalogue at the live site's size: the server's window for `?open=` (fifteen rows above the row) and the API's chunks. */
async function liveSizedCatalogue(page: Page, asked: string[]) {
  // The opened row's tiles: the fixture's Copiapoa cinerea (the tile tapped) among forty-one made-up ones.
  const item = (k: number) => (k === 20 ? { key: 'k2735933', gbif: 5384013, slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', family: 'Cactaceae', origin: ['Chile North'], photos: 0, open: 20, climate: 'ok' } : { key: `kf${k}`, gbif: 900000 + k, slug: `fakeus-number${k}`, name: `Fakeus number${k}`, family: 'Testaceae', origin: ['Chile North'], photos: 0, open: 3, climate: 'ok' });
  const items = Array.from({ length: 42 }, (_, k) => item(k));
  await page.route(/\/__data\.json/, async (route: Route) => {
    const res = await route.fetch();
    const body = await res.text();
    const j = JSON.parse(body.split('\n')[0]) as { type: string; nodes: Array<{ type: string; data?: unknown[] }> };
    const open = new URL(route.request().url()).searchParams.get('open');
    for (const n of j.nodes) {
      if (n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as Record<string, unknown> & { rows: Array<Record<string, unknown>> };
      if (!('featured' in d) || !('rows' in d)) continue;
      const at = open ? Math.max(0, Number(open.slice(1)) - 15) : 0;
      d.rows = Array.from({ length: 80 }, (_, k) => at + k).filter((i) => i < N).map((i) => (id(i) === open ? { ...row(i), items, itemsAt: 0, itemsCount: items.length } : row(i)));
      d.start = at;
      d.rowCount = N;
      d.open = open;
      d.letters = LETTERS;
      d.letterAt = Object.fromEntries(LETTERS.map((l, k) => [l, k * PER]));
      n.data = JSON.parse(devalue.stringify(d));
    }
    await route.fulfill({ response: res, body: JSON.stringify(j) });
  });
  await page.route(/\/api\/rows\?/, async (route: Route) => {
    const u = new URL(route.request().url());
    const at = Number(u.searchParams.get('at'));
    const n = Number(u.searchParams.get('n'));
    asked.push(`${at}+${n}`);
    const rows = Array.from({ length: n }, (_, k) => at + k).filter((i) => i < N).map(row);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ at, count: N, rows }) });
  });
}

/** A client-side visit, as a reader's tap is: a link put in the page and pressed. */
async function visit(page: Page, href: string) {
  await page.evaluate((h) => { const a = document.createElement('a'); a.href = h; a.id = 'r80u-go'; a.textContent = 'go'; document.body.insertBefore(a, document.body.firstChild); }, href);
  await page.evaluate(() => document.getElementById('r80u-go')!.click()); // a click event, without scrolling the page to the link
}

const tile = (page: Page) => page.locator('.hgrid.opened a.tile[href="/species/copiapoa-cinerea"]');
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

async function openThenBack(page: Page) {
  const asked: string[] = [];
  await liveSizedCatalogue(page, asked);
  await page.goto('/about/how'); await ready(page);
  await visit(page, `/?by=genus&open=${id(OPEN)}`);
  await expect(page.locator(`#g-${id(OPEN)}`)).toBeVisible();
  await expect(tile(page)).toBeAttached();
  // The reader scrolls down into the opened row's tiles, as one does before tapping a species.
  await page.waitForTimeout(800); // a negative: the rows the page fills above the opened row on its own come in first
  await tile(page).scrollIntoViewIfNeeded();
  await page.evaluate(() => { const t = document.querySelector('.hgrid.opened a.tile[href="/species/copiapoa-cinerea"]')!; window.scrollBy(0, t.getBoundingClientRect().top - window.innerHeight / 2); });
  await settle(page);
  const before = await tile(page).boundingBox();
  const left = await page.evaluate(() => scrollY);
  await tile(page).click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await ready(page);
  const at = asked.length;
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`open=${id(OPEN)}`));
  await expect(tile(page)).toBeAttached();
  await page.waitForTimeout(1000); // a negative: whether the page runs away after Back can only be read after a while
  const one = { box: await tile(page).boundingBox(), y: await page.evaluate(() => scrollY), rows: await page.locator('.rows a.grow').count() };
  await page.waitForTimeout(2000);
  const three = { box: await tile(page).boundingBox(), y: await page.evaluate(() => scrollY), rows: await page.locator('.rows a.grow').count() };
  const report = JSON.stringify({ left, before, one, three, askedAfterBack: asked.slice(at) });
  // The tile is where the reader left it, and stays there.
  expect(Math.abs(three.box!.y - before!.y), report).toBeLessThanOrEqual(4);
  expect(three.y, report).toBe(one.y);
  // Only the rows around it: the server's window and a chunk or two, not the rest of the catalogue.
  expect(three.rows, report).toBeLessThan(500);
  expect(asked.length - at, report).toBeLessThanOrEqual(3);
  return report;
}

test('r80u back 1: Back from a species page to a catalogue the live size puts the tile where it was and loads only the rows around it @phone', async ({ page }) => {
  await openThenBack(page);
});

test('r80u back 2: the same with a plant on the device, the page is the catalogue at the tile, not a blank screen @phone', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  await openThenBack(page);
  await expect(page.locator('#topbar')).toBeVisible();
  await expect(page.locator(`#g-${id(OPEN)}`)).toBeAttached();
});

test('r80u back 3: the top bar\'s Back after the browser\'s Back and Forward goes to the opened row, not the front page @phone', async ({ page }) => {
  // The phone review's steps: the opened row is the first page of the visit.
  await page.goto('/?by=genus&open=copiapoa'); await ready(page);
  const cinerea = page.locator('a.tile[href="/species/copiapoa-cinerea"]');
  await cinerea.click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await ready(page);
  await page.goBack();
  await expect(page).toHaveURL(/open=copiapoa/);
  await expect(cinerea).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await ready(page);
  await page.locator('#topbar a[aria-label="Back"]').click();
  await expect(page).toHaveURL(/open=copiapoa/);
  await expect(cinerea).toBeVisible();
});

test('r80u back 4: a reader who scrolled on past the server\'s window comes back to the row they were on @phone', async ({ page }) => {
  const asked: string[] = [];
  await liveSizedCatalogue(page, asked);
  await page.goto('/about/how'); await ready(page);
  await visit(page, `/?by=genus&open=${id(OPEN)}`);
  await expect(page.locator(`#g-${id(OPEN)}`)).toBeVisible();
  // On down the list, a hundred and fifty rows past the opened one, which the page appends as the reader goes.
  const far = id(OPEN + 150);
  // Scrolled by the page's own scrollBy, not the mouse wheel: mobile WebKit has no wheel, and Chromium's wheel scrolls on
  // after the call returns, so the row at the top when the reader left was not the one measured (owner's PC, round eighty).
  await expect.poll(async () => { await page.evaluate(() => window.scrollBy(0, 3000)); return page.locator(`#g-${far}`).count(); }, { timeout: 20_000 }).toBe(1);
  // Placed 300 px down, and read again once the page has stopped adding rows and moving: the place left is the place measured.
  await expect.poll(async () => {
    await page.evaluate((f) => { const r = document.getElementById(`g-${f}`)!; window.scrollBy(0, r.getBoundingClientRect().top - 300); }, far);
    await settle(page);
    await page.waitForTimeout(300);
    return page.evaluate((f) => Math.abs(document.getElementById(`g-${f}`)!.getBoundingClientRect().top - 300) <= 1, far);
  }, { timeout: 15_000 }).toBe(true);
  const before = (await page.locator(`#g-${far}`).boundingBox())!.y;
  await visit(page, '/about/how');
  await expect(page).toHaveURL(/\/about\/how$/);
  await ready(page);
  const at = asked.length;
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`open=${id(OPEN)}`));
  await expect(page.locator(`#g-${far}`)).toBeAttached();
  await page.waitForTimeout(1500); // a negative: the place is read once the page has had time to run away, if it would
  const after = (await page.locator(`#g-${far}`).boundingBox())!.y;
  const report = JSON.stringify({ before, after, askedAfterBack: asked.slice(at), rows: await page.locator('.rows a.grow').count() });
  expect(Math.abs(after - before), report).toBeLessThanOrEqual(4);
  expect(await page.locator('.rows a.grow').count(), report).toBeLessThan(500);
});

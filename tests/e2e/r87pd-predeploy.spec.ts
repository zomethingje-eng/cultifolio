/**
 * Round eighty-seven, the owner's predeploy (WebKit, the WebKit phone, Firefox): the site's half of what failed there,
 * each written so Chromium shows it here too.
 *
 * 1. The species page's trail is a whole number of px high (smoke-3's round forty-two in Firefox: the photograph's 150 px
 *    box read as 150.0000076, its top at 83.59 px under a trail 19.59 px high).
 * 2. On a phone the open filters sheet keeps the page as wide as the screen (r87b 4 in the WebKit phone: a tip's 44 px
 *    target reached 391.4 px, Chromium widened its viewport to 391, Safari's engine scrolled sideways).
 * 3. The strip's thumbnails, let go after the lead, are asked for at once, not lazily (r86m strip 2 in the WebKit phone:
 *    with the lead never answered none of the six was asked for).
 * 4. A browse view's row of actions holds the pin's room until the collection opens (r87b 5 in the WebKit phone: the
 *    pin arrived as the region was pressed and moved the results map's table 48 px down).
 * 5. The add form does not move when the collection opens (smoke-1 in WebKit: "It will be numbered 2026-0001" wrapped
 *    to a second line and moved "More: …" 23 px down as it was pressed).
 * 6. Back to the catalogue holds the tile when the page above it changes after the first moment (r80u back 1 in WebKit:
 *    the strip's photograph failed a second after Back, past the 900 ms hold, and the tile was 71.7 px off).
 * 7. The backup page holds the room of its notice ("Your plants live only in this browser") while the browser's answer is
 *    awaited (smoke-1's backup in WebKit, the third predeploy: the notice came as Merge was pressed, and the press was lost).
 * 8. The search box pressed before the collection has opened lists the pinned views once it has (r87b 2 in WebKit, the
 *    third predeploy: the pins were read at the press, found none, and the list stayed without them).
 *
 * The collection is opened 3 s late in 4 and 5, and they watch from the fonts' arrival to its opening (fromFontsToCollection).
 * On r87final (b0c34d3): 1 FAILED (19.59 px); 2 FAILED (391 px); 3 FAILED (lazy); 4 FAILED (the table moved 48 px);
 * 5 FAILED (the summary moved 23 px); 6 FAILED (the tile moved by the block put above it); 7 FAILED (Merge moved down); 8 FAILED (no pinned row).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';
import { startPositions, positionMoves } from './helpers/positions';
import { framesSettled, goneQuiet } from './helpers/settled';
import { inject } from './helpers/inject';
import { pinIdOf } from '../../src/lib/browse/pins';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGNoWJAARww4OQBgthIBDttNdgAAAABJRU5ErkJggg==', 'base64');
const PHOTO_HOST = /^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org)\//;

/** The collection's database answers 3 s late, as on a slow phone (smoke-4's numbering test waits 1.5 s). */
async function collectionLate(page: Page) {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<typeof open>) {
      const req = open.apply(this, a);
      const add = req.addEventListener.bind(req);
      req.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'success' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn(ev) : fn.handleEvent(ev)), 3000) : fn, ...(rest as []))) as typeof req.addEventListener;
      return req;
    } as typeof open;
  });
}

/**
 * Where the page stands once its fonts have come and before the collection opens: what these tests watch is the
 * collection's opening. Recorded from the first frame, the web font's arrival moved the CSV link 3 px sideways at 213 to
 * 560 ms on the owner's PC (the fallback faces match the font's width on average, not each line's), a second and more
 * before the collection opened (the owner's second predeploy, the Chromium and WebKit phones).
 */
async function fromFontsToCollection(page: Page, held: string, selectors: string[]) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await expect(page.locator(held), 'the collection still unopened as the recording starts').toHaveCount(1);
  await startPositions(page, selectors);
}

test('r87pd 1: the species page\'s trail is a whole number of px high, so the photograph\'s box starts on a whole pixel', async ({ page }) => {
  await page.route(PHOTO_HOST, () => new Promise(() => {}));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/species/copiapoa-cinerea', { waitUntil: 'domcontentloaded' });
  // The faces asked for by name, not `document.fonts.ready`: Safari's engine resolves that with the page's load, which the
  // photograph held here never lets come (the owner's third predeploy: 60 s, twice).
  await page.evaluate(() => Promise.all([document.fonts.load('400 16px "Source Sans 3"'), document.fonts.load('italic 400 16px "Source Serif 4"')]).then(() => undefined));
  const h = await page.locator('.spcrumb').evaluate((e) => e.getBoundingClientRect().height);
  expect(h).toBe(20); // 1.25rem, the genus in the serif adding nothing
  const box = await page.locator('.hero.photo > a:first-child').evaluate((e) => e.getBoundingClientRect());
  expect(box.height).toBe(150);
});

test('r87pd 2: on a phone the open filters sheet keeps the page as wide as the screen @phone-only', async ({ page }) => {
  await page.goto('/browse'); await ready(page);
  await page.locator('.phonebar .filters').click();
  await expect(page.locator('.bv .rail .tip button').first()).toBeVisible();
  await framesSettled(page);
  const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, screen: document.documentElement.clientWidth }));
  expect(w.scroll, JSON.stringify(w)).toBeLessThanOrEqual(w.screen);
});

test('r87pd 3: the strip\'s thumbnails, let go after the lead, are asked for at once, not lazily @phone', async ({ page }) => {
  const asked: string[] = [];
  await page.route(PHOTO_HOST, async (r) => {
    asked.push(r.request().url());
    if (/\/photos\/\d+\/(medium|large)\./.test(r.request().url())) return new Promise<void>(() => { /* the lead never answered */ });
    return r.fulfill({ status: 200, contentType: 'image/png', body: PNG });
  });
  await page.goto('/species/welwitschia-mirabilis', { waitUntil: 'domcontentloaded' }); await ready(page);
  const imgs = page.locator('.thumbstrip .tb img');
  expect(await imgs.count()).toBeGreaterThan(2);
  // Let go 2.5 s after the page could start waiting (the app's own rule, `afterLead`): each then has its address.
  await expect.poll(() => imgs.evaluateAll((xs) => xs.every((x) => !!x.getAttribute('src'))), { timeout: 6000 }).toBe(true);
  expect(await imgs.evaluateAll((xs) => xs.map((x) => (x as HTMLImageElement).loading))).toEqual(Array(await imgs.count()).fill('eager'));
  await expect.poll(() => asked.filter((u) => /\/small\./.test(u)).length).toBe(await imgs.count());
});

test('r87pd 4: a browse view\'s actions hold the pin\'s room until the collection opens, so the results map\'s table never moves @phone-only', async ({ page }) => {
  await collectionLate(page);
  await page.goto('/browse?r=NAM&view=map'); await ready(page);
  await fromFontsToCollection(page, '.bv .acts .pin.hold', ['.rmap table.rt', '.bv .acts a[download]']);
  await expect(page.getByRole('button', { name: 'Pin this view' })).toBeVisible({ timeout: 15_000 }); // the collection open
  await framesSettled(page);
  const { moves, frames } = await positionMoves(page);
  expect(frames).toBeGreaterThan(5);
  expect(moves).toEqual([]);
});

test('r87pd 5: the add form does not move when the collection opens and the next number comes', async ({ page }) => {
  await collectionLate(page);
  await page.goto('/plants/new'); await ready(page);
  await fromFontsToCollection(page, '.phead .accno.pending', ['details.moredetails > summary', '#f-date']);
  await expect(page.locator('.phead .accno')).toHaveText(/^\d{4}-\d{4}$/, { timeout: 15_000 }); // the collection open
  await framesSettled(page);
  const { moves, frames } = await positionMoves(page);
  expect(frames).toBeGreaterThan(5);
  expect(moves).toEqual([]);
  // And a press on "More" as the number comes is a press on "More".
  await page.locator('details.moredetails > summary').click();
  await expect(page.locator('#f-field')).toBeVisible();
});

test('r87pd 6: Back to the catalogue holds the tile when the page above it changes after the first moment', async ({ page }) => {
  await page.route(PHOTO_HOST, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto('/?by=genus&open=copiapoa'); await ready(page);
  // Safari's engine has no scroll anchoring: Chromium's kept the tile in place on its own when the block went in above
  // it, and this test passed on r87final until anchoring was turned off here as WebKit has it.
  await page.addStyleTag({ content: '*, html, body { overflow-anchor: none !important; }' });
  const tile = page.locator('.hgrid.opened a.tile[href="/species/copiapoa-cinerea"]');
  await expect(tile).toBeVisible();
  await goneQuiet(page); // a negative: the rows the page fills on its own come in first
  await page.evaluate(() => { const t = document.querySelector('.hgrid.opened a.tile[href="/species/copiapoa-cinerea"]')!; window.scrollBy(0, t.getBoundingClientRect().top - window.innerHeight / 2); });
  // The whole tile in view, so the press does not scroll it first: at 480 px high a 264 px tile from the middle down is
  // not, and Playwright's click scrolled it 24 px after `before` was read (the place kept with the page is the click's).
  await tile.scrollIntoViewIfNeeded();
  await framesSettled(page);
  const before = (await tile.boundingBox())!.y;
  await tile.click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await ready(page);
  await page.goBack();
  await expect(page).toHaveURL(/open=copiapoa/);
  await expect(tile).toBeAttached();
  // 1.5 s after Back, past the hold's first 900 ms, the page above the catalogue grows by 70 px, as a photograph above it
  // that failed and became its placeholder changed it. Put in by the page's own timer, so the test waits for its state.
  await page.evaluate(() => { setTimeout(() => { const b = document.createElement('div'); b.id = 'r87pd-above'; b.style.height = '70px'; const m = document.getElementById('main')!; m.insertBefore(b, m.firstChild); }, 1500); });
  await page.locator('#r87pd-above').waitFor({ state: 'attached' });
  await framesSettled(page);
  const after = (await tile.boundingBox())!.y;
  expect(Math.abs(after - before), JSON.stringify({ before, after })).toBeLessThanOrEqual(4);
});

test('r87pd 7: the backup page does not move when the browser says it has not promised to keep the collection', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  // The browser's answer 2 s late, after the collection has opened, as Safari's engine gave it on the owner's PC.
  await page.addInitScript(() => {
    const was = StorageManager.prototype.persisted;
    StorageManager.prototype.persisted = function (this: StorageManager) { return new Promise((r) => setTimeout(() => r(was.call(this)), 2000)); };
  });
  await page.goto('/backup'); await ready(page);
  await page.locator('html[data-collection="open"]').waitFor({ state: 'attached' });
  await framesSettled(page);
  await expect(page.locator('.cult.warn')).toBeHidden(); // the collection open, the answer not in yet: its room held unseen, or (before) nothing
  await startPositions(page, ['#bk-export', '#bk-file']);
  await expect(page.locator('.cult.warn:not(.hold)')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.cult.warn')).toContainText('Your plants live only in this browser.');
  await framesSettled(page);
  const { moves, frames } = await positionMoves(page);
  expect(frames).toBeGreaterThan(5);
  expect(moves).toEqual([]);
});

test('r87pd 8: the search box pressed before the collection has opened lists the pinned views once it has', async ({ page }) => {
  await page.goto('/browse'); await ready(page);
  const view = '?r=NAM', id = pinIdOf(view);
  await inject(page, [['setting', id, 'href', `/browse${view}`], ['setting', id, 'view', view], ['setting', id, 'label', 'Species native to Namibia'], ['setting', id, 'made', '2026-10-01'], ['setting', id, 'seen', '2026-10-12'], ['setting', id, 'n', 2], ['setting', id, 'keys', null]], Date.now() - 86_400_000);
  await collectionLate(page);
  await page.goto('/genus'); await ready(page);
  await page.locator('#site-search').click(); // before the collection opens, 3 s late
  await expect(page.locator('#site-search-list .opt.pinned')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.locator('#site-search-list .opt.pinned')).toContainText('Species native to Namibia');
});

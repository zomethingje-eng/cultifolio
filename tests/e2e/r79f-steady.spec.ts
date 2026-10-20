/**
 * Round seventy-nine (F): what arrives late moves nothing under a finger, in two more places, as round seventy-eight's
 * r78m-verbs-steady does for the plant page's offer line.
 *
 * 1. A plant page with the reference's photographs switched on: the species' photograph arrived as a hero above the
 *    card when the sheet answered and moved the card and the verb bar down by its height. Its room is now held while
 *    the sheet is asked (`heroHeld` in the plant page).
 * 2. A species page: when the collection opened, "Your notes: none yet" arrived above the cultivation cards and moved
 *    them about 34 px. In the owner's WebKit run of r69p P5 that move came between the mouse down and the mouse up of
 *    the press on the first card's summary ("Seasons"), and the press was lost. The line's room is now held while the
 *    collection opens. The collection is held back here by an init script that keeps the database's open from
 *    answering until the test has measured.
 *
 * On r79base: 1 FAILED at both widths (the bar lower once the hero came), 2 FAILED (no `.notesline.hold`; the summary
 * lower once the collection opened).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';

// No service worker: it answers /api/sheets itself, and a page's route does not see the worker's requests in every engine.
test.use({ serviceWorkers: 'block' });

/** One pixel, a PNG: the reference's photograph, answered here, since the image host is not reachable from a test. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const top = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!.y;

for (const size of [{ name: 'desktop', width: 1280, height: 800 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`r79f steady 1, ${size.name}: with the reference's photographs on, the verb bar does not move when the species' photograph arrives`, async ({ page }) => {
    await page.addInitScript(() => { try { localStorage.setItem('cultifolio.prefs', JSON.stringify({ referencePhotos: true })); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
    await page.route(/inaturalist-open-data\.s3\.amazonaws\.com\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/plants/new?species=Copiapoa%20cinerea'); await ready(page);
    await addPlant(page);
    const at = page.url();
    let release!: () => void;
    const held = new Promise<void>((r) => (release = r));
    await page.route('**/api/sheets**', async (route) => { await held; await route.continue(); });
    await page.goto(at);
    await expect(page.locator('.quickbar')).toBeVisible();
    await expect(page.locator('.acts .skelbtn')).toBeAttached(); // still asking
    await expect(page.locator('.hero.hold')).toBeAttached(); // the hero's room, unseen
    await expect(page.locator('.hero.hold')).toBeHidden();
    await expect(page.locator('.hero.hold')).toHaveAttribute('aria-hidden', 'true');
    const bar = await top(page, '.quickbar'), card = await top(page, '.idcard');
    release();
    await expect(page.locator('#species-link')).toBeVisible();
    await expect(page.locator('.hero img.spthumb')).toBeVisible(); // the photograph that arrived
    await expect(page.locator('.hero.hold')).toHaveCount(0);
    expect(await top(page, '.idcard')).toBe(card);
    expect(await top(page, '.quickbar')).toBe(bar);
  });
}

test('r79f steady 1b: with the reference\'s photographs off, the offer line is held as before and no hero room (guard)', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cultifolio.prefs', JSON.stringify({ referencePhotos: false })); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
  await page.goto('/plants/new?species=Copiapoa%20cinerea'); await ready(page);
  await addPlant(page);
  const at = page.url();
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/api/sheets**', async (route) => { await held; await route.continue(); });
  await page.goto(at);
  await expect(page.locator('.rpo.hold')).toBeAttached();
  await expect(page.locator('.hero.hold')).toHaveCount(0);
  release();
  await expect(page.locator('#species-link')).toBeVisible();
});

test('r79f steady 2: a species page\'s cultivation cards do not move when the collection opens', async ({ page }) => {
  // The database's open answers only once the test says so: `success` listeners on the grower's database are held.
  await page.addInitScript(() => {
    const w = window as unknown as { __openIdb?: () => void };
    const queue: Array<() => void> = [];
    let holding = true;
    w.__openIdb = () => { holding = false; for (const f of queue.splice(0)) f(); };
    const real = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...args: Parameters<IDBFactory['open']>) {
      const req = real.apply(this, args);
      if (args[0] !== 'cultifolio') return req;
      const add = req.addEventListener.bind(req);
      req.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
        if (type !== 'success') return add(type, fn, opts);
        const call = (e: Event) => (typeof fn === 'function' ? fn.call(req, e) : fn.handleEvent(e));
        return add(type, (e: Event) => { if (holding) queue.push(() => call(e)); else call(e); }, opts);
      }) as typeof req.addEventListener;
      return req;
    };
    try { sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ }
  });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const sum = 'details.cult.acc >> nth=0 >> :scope > summary';
  await expect(page.locator(sum)).toBeVisible();
  await expect(page.locator('html[data-collection]')).toHaveCount(0); // the collection is still opening
  await expect(page.locator('.notesline.hold')).toBeAttached(); // the line's room, unseen
  await expect(page.locator('.notesline.hold')).toBeHidden();
  await expect(page.locator('.notesline.hold')).toHaveAttribute('aria-hidden', 'true');
  const before = await top(page, sum);
  await page.evaluate(() => (window as unknown as { __openIdb: () => void }).__openIdb());
  await expect(page.locator('html[data-collection="open"]')).toBeAttached();
  await expect(page.locator('.notesline:not(.hold)')).toBeVisible(); // the line that arrived
  await expect(page.locator('.notesline.hold')).toHaveCount(0);
  expect(await top(page, sum)).toBe(before);
  // and the press that was lost lands: one press opens it
  await page.locator(sum).click();
  await expect(page.locator('details.cult.acc >> nth=0')).toHaveAttribute('open', '');
});

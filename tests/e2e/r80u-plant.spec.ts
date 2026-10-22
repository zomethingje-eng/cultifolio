/**
 * Round eighty (U): the plant page's first screen once it has photographs (the phone review's 2 and 4).
 *
 * 1. With two photographs the strip of them sits between the hero and the plant's card, and the card's negative margin
 *    (made for overlapping the hero) put it over the bottom 26 px of every thumbnail and its date: a tap there landed on
 *    the card. The card now starts below the strip.
 * 2. On a phone the grower's photograph was a 150 px slice in a 260 px box, over a 110 px band of black (the theme's
 *    `.hero img { max-height: 150px }`, a species page's rule); the reference's photograph the same. Each now fills its box.
 *
 * On r80f: 1 FAILED on the phone (the card's top 26 px above the strip's foot) and on a desktop (44 px); 2 and 2b FAILED on
 * the phone (150 against 260).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';

async function jpegs(p: Page): Promise<Buffer[]> {
  const b64 = await p.evaluate(() => ['#2a6', '#c63'].map((fill) => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const g = c.getContext('2d')!;
    g.fillStyle = fill; g.fillRect(0, 0, 640, 480);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }));
  return b64.map((x) => Buffer.from(x, 'base64'));
}

async function plantWithTwoPhotos(page: Page) {
  await page.addInitScript(() => { try { sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  const [a, b] = await jpegs(page);
  await page.locator('#acc-photo-file').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: a }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: b }]);
  await expect(page.locator('#photo-timeline .strip li')).toHaveCount(2);
  await page.reload(); await ready(page);
  await expect(page.locator('#photo-timeline .strip li')).toHaveCount(2);
  await expect(page.locator('.hero.own img')).toBeVisible();
}

test('r80u plant 1: with two photographs the card starts below the strip of them, and a tap on a thumbnail\'s foot lands on the thumbnail @phone', async ({ page }) => {
  await plantWithTwoPhotos(page);
  await page.evaluate(() => document.fonts.ready);
  const strip = (await page.locator('#photo-timeline .strip').boundingBox())!;
  const card = (await page.locator('.idcard').boundingBox())!;
  expect(card.y, JSON.stringify({ strip, card })).toBeGreaterThanOrEqual(strip.y + strip.height - 1);
  // The thumbnail's own foot, where its date is, is the thumbnail's.
  const th = (await page.locator('#photo-timeline .strip li button').first().boundingBox())!;
  const hit = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#photo-timeline'), [th.x + th.width / 2, th.y + th.height - 4]);
  expect(hit).toBe(true);
});

test('r80u plant 2: the grower\'s photograph fills the hero\'s box, on a phone too @phone', async ({ page }) => {
  await plantWithTwoPhotos(page);
  const box = (await page.locator('.hero.own').boundingBox())!;
  const img = (await page.locator('.hero.own img').boundingBox())!;
  expect(Math.abs(img.height - box.height), JSON.stringify({ box, img })).toBeLessThanOrEqual(1);
});

/** One pixel, a PNG: the reference's photograph, answered here, since the image host is not reachable from a test. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

// No service worker: in WebKit a page the worker controls sends its requests past the test's route, so the photograph went
// to the real host and did not load (the owner's PC, round eighty). The worker takes no part in what this test reads.
test.describe('the reference photograph', () => {
test.use({ serviceWorkers: 'block' });
test('r80u plant 2b: with the reference\'s photographs on, the species\' photograph fills the hero\'s box on a phone too @phone', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cultifolio.prefs', JSON.stringify({ referencePhotos: true })); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
  await page.route(/inaturalist-open-data\.s3\.amazonaws\.com\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  await expect(page.locator('.hero img.spthumb')).toBeVisible();
  const box = (await page.locator('.hero:has(img.spthumb)').boundingBox())!;
  const img = (await page.locator('.hero img.spthumb').boundingBox())!;
  expect(Math.abs(img.height - box.height), JSON.stringify({ box, img })).toBeLessThanOrEqual(1);
});
});

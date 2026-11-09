/**
 * Round eighty-seven, stage 2 (browse, C6 to C9) in the browser, over the fixture corpus (five species): a view pinned,
 * kept in the log across a reload, listed in the empty search box, unpinned; a pin whose species differ from the view's
 * now opened from the box, with what it gained and lost; the map picker by keyboard and by its list, its files fetched
 * only when it opens; the results map, its files only on its view; the collection lens on a region page, worked out with
 * no name of a plant sent; the record low "not in this index"; next door on a region page.
 *
 * Fails on the base (r85m head), where none of these pages exists, and on stage 1, where none of this is on them.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';
import { inject } from './helpers/inject';
import { encodeKeys, pinIdOf } from '../../src/lib/browse/pins';

test.use({ serviceWorkers: 'block' });

const total = async (p: Page) => Number((await p.locator('.bv .head .count .num').innerText()).replace(/,/g, ''));
const DAY = 86_400_000;
async function openBox(page: Page) {
  const box = page.locator('#site-search');
  await box.click();
  return page.locator('#site-search-list');
}

test('r87b 1: a view pinned is kept in the log, listed in the empty search box, and unpinned', async ({ page }) => {
  await page.goto('/browse?r=NAM');
  await ready(page);
  const pin = page.getByRole('button', { name: 'Pin this view' });
  await pin.click();
  await expect(page.locator('.bv .pin .on')).toContainText('Pinned');
  await page.reload(); await ready(page);
  await expect(page.locator('.bv .pin .on')).toContainText('Pinned');
  await expect(page.locator('.bv .pin .on')).toContainText(/no change since/);
  const list = await openBox(page);
  const row = list.locator('.opt.pinned');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Species native to Namibia');
  await expect(row).toContainText('2 species when last seen');
  await page.keyboard.press('Escape');
  await page.goto('/browse?r=NAM'); await ready(page);
  await page.getByRole('button', { name: 'Unpin' }).click();
  await expect(page.getByRole('button', { name: 'Pin this view' })).toBeVisible();
  await page.reload(); await ready(page);
  await expect(page.getByRole('button', { name: 'Pin this view' })).toBeVisible();
});

test('r87b 2: a pin opened from the search box shows what the view gained and lost since it was last seen, then counts from today', async ({ page }) => {
  await page.goto('/browse'); await ready(page);
  const view = '?r=NAM', id = pinIdOf(view);
  // A pin last seen when the view held Welwitschia and Copiapoa cinerea: since then it gained Refusia testii and lost the Copiapoa.
  await inject(page, [
    ['setting', id, 'href', `/browse${view}`], ['setting', id, 'view', view], ['setting', id, 'label', 'Species native to Namibia'],
    ['setting', id, 'made', '2026-10-01'], ['setting', id, 'seen', '2026-10-12'], ['setting', id, 'n', 2], ['setting', id, 'keys', encodeKeys(['k339841', 'k2735933'])]
  ], Date.now() - DAY);
  await page.goto('/genus'); await ready(page);
  const list = await openBox(page);
  await list.locator('.opt.pinned').click();
  await expect(page).toHaveURL(/\/browse\?r=NAM$/);
  const since = page.locator('#bv-since');
  await expect(since).toContainText('New since you pinned, 12 Oct');
  await expect(since).toContainText('Added to this view: 1');
  await expect(since).toContainText('Refusia testii');
  await expect(since).toContainText('Taken out of this view: 1');
  await expect(since.locator('li', { hasText: 'Copiapoa cinerea' })).toContainText('still in the reference');
  // Seen: the pin now counts from today's species.
  await expect(page.locator('.bv .pin .on')).toContainText('no change since');
  await page.reload(); await ready(page);
  await expect(page.locator('#bv-since')).toHaveCount(0);
  await expect(page.locator('.bv .pin .on')).toContainText('no change since');
});

test('r87b 3: the map picker fetches its files only when opened, ticks by keyboard and by its list, and shows what it gives', async ({ page }) => {
  const maps: string[] = [];
  page.on('request', (r) => { if (/\/maps\/|\/browse\/data/.test(r.url())) maps.push(r.url()); });
  await page.goto('/browse'); await ready(page);
  expect(maps).toEqual([]);
  await page.getByRole('button', { name: 'Pick regions on a map' }).click();
  const dlg = page.getByRole('dialog', { name: 'Where do they grow wild?' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('.listcol')).toContainText('Southern Africa', { timeout: 20_000 }); // the regions' counts read whole on a loaded machine
  expect(maps.some((u) => u.includes('/maps/regions110.svg'))).toBe(true);
  expect(maps.some((u) => /part=regions/.test(u))).toBe(true);
  // By the list: Namibia, in Southern Africa.
  await dlg.getByRole('button', { name: /^Southern Africa/ }).click();
  await dlg.locator('label', { hasText: /^\s*Namibia/ }).locator('input').check();
  await expect(dlg.locator('.go')).toHaveText('Show 2 species');
  // By keyboard: the map reached, a region moved to and ticked, and said.
  const map = dlg.getByRole('application', { name: "Map of TDWG's level-3 regions" });
  await map.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(dlg.getByRole('status')).toContainText(/not ticked/);
  const before = (await dlg.locator('.chosen').innerText());
  await page.keyboard.press('Space');
  await expect(dlg.getByRole('status')).toContainText(/, ticked/);
  await expect(dlg.locator('.chosen')).not.toHaveText(before);
  await page.keyboard.press('Space');
  await expect(dlg.locator('.go')).toHaveText('Show 2 species');
  await dlg.locator('.go').click();
  await expect(page).toHaveURL(/\/browse\?r=NAM$/);
  await expect.poll(() => total(page)).toBe(2);
});

test('r87b 4: on a phone the map picker is a sheet over the whole screen @phone-only', async ({ page }) => {
  await page.goto('/browse'); await ready(page);
  await page.locator('.phonebar .filters').click();
  await page.getByRole('button', { name: 'Pick regions on a map' }).click();
  const dlg = page.getByRole('dialog', { name: 'Where do they grow wild?' });
  await expect(dlg.locator('.listcol')).toContainText('Southern Africa', { timeout: 20_000 }); // the regions' counts read whole on a loaded machine
  const box = (await dlg.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(vp.width - 1);
  expect(box.height).toBeGreaterThanOrEqual(vp.height - 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dlg.getByRole('button', { name: 'Close the map' }).click();
  await expect(dlg).toBeHidden();
});

test('r87b 5: the results map: its regions with their counts, a press narrows to all of them, its files only on its view @phone', async ({ page }) => {
  const maps: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/maps/')) maps.push(r.url()); });
  await page.goto('/browse?view=list'); await ready(page);
  expect(maps).toEqual([]);
  await page.goto('/browse?r=NAM&view=map'); await ready(page);
  const rm = page.locator('.rmap');
  await expect(rm).toContainText('Where these 2 species are native');
  await expect(rm.locator('.legend')).toContainText('the region you filtered by: all 2');
  const angola = rm.locator('table.rt tr', { hasText: 'Angola' });
  await expect(angola.locator('td')).toHaveText('1');
  await expect.poll(() => maps.some((u) => u.includes('/maps/regions110.svg'))).toBe(true);
  await angola.locator('a').click();
  await expect(page).toHaveURL(/r=NAM,ANG&m=all&view=map/);
  await expect.poll(() => total(page)).toBe(1);
});

test('r87b 6: the collection lens on a region page, worked out in the browser: the plants that belong, Yours and Not yours, and no name of a plant sent @phone', async ({ page }) => {
  const sent: string[] = [];
  page.on('request', (r) => sent.push(r.url()));
  await page.goto('/plants'); await ready(page);
  await inject(page, [
    ['accession', 'r87b1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r87b1', 'status', 'growing'], ['accession', 'r87b1', 'acc', '2026-0871'],
    ['accession', 'r87b2', 'taxonName', 'Welwitschia mirabilis'], ['accession', 'r87b2', 'status', 'growing'], ['accession', 'r87b2', 'acc', '2026-0872']
  ], Date.now() - DAY);
  sent.length = 0;
  await page.goto('/region/chile-north'); await ready(page);
  const lens = page.locator('section.lens');
  await expect(lens).toContainText('You grow 1 of the 2 species native here');
  await expect(lens.locator('.mine')).toContainText('Copiapoa cinerea');
  await expect(lens.locator('.mine')).toContainText('2026-0871');
  await expect(page.locator('.tiles li.yours')).toHaveCount(1);
  await lens.getByRole('button', { name: 'Yours', exact: true }).click();
  await expect(page.locator('.tiles li')).toHaveCount(1);
  await lens.getByRole('button', { name: 'Not yours' }).click();
  await expect(page.locator('.tiles li')).toHaveCount(1);
  await expect(page.locator('.tiles li')).toContainText('Copiapoa humilis');
  expect(page.url()).toMatch(/\/region\/chile-north$/); // the lens is in no address
  // Asked by hash group only: no request names a plant's species or number.
  const after = sent.filter((u) => !u.includes('/region/chile-north'));
  for (const u of after) { expect(u, u).not.toMatch(/cinerea|welwitschia|2026-087/i); }
  expect(after.some((u) => /\/api\/entries\?b=/.test(u))).toBe(true);
  // Next door: the regions whose outlines touch, with how many of each the grower grows.
  await expect(page.locator('.ehead .near', { hasText: 'Next door:' })).toContainText('Peru');
  await page.goto('/region/namibia'); await ready(page);
  await expect(page.locator('section.lens')).toContainText('You grow 1 of the 2 species native here');
  await expect(page.locator('section.lens .next')).toContainText('Angola, you grow 1 of its 1');
});

test('r87b 7: an index without record lows says so in the list and offers no order by it', async ({ page }) => {
  await page.goto('/browse?view=list'); await ready(page);
  await expect(page.locator('table.list thead')).toContainText('Record low');
  const cells = page.locator('table.list td[data-label="Record low"]');
  await expect(cells).toHaveCount(5);
  for (const t of await cells.allInnerTexts()) expect(t).toBe('not in this index');
  await expect(page.locator('.bv .sort')).not.toContainText('record low');
  // The column's footnote is in its header's tip, a button.
  await page.getByRole('button', { name: 'About Record low' }).click();
  await expect(page.getByRole('note')).toContainText('holds no record lows');
  await page.goto('/browse?view=list&sort=low'); await ready(page);
  await expect(page.locator('table.list tbody tr')).toHaveCount(5);
});

test('r87b 8: a grower\'s front page lists the pinned views with what changed since, and a pin opens its view with its changes @phone', async ({ page }) => {
  // Round eighty-seven, stage 2 (the integration): PinnedViews mounted on the grower's front page, after Following.
  await page.goto('/plants'); await ready(page);
  const view = '?r=NAM', id = pinIdOf(view);
  // A grower who follows one species, with a pin last seen when the view held Welwitschia and Copiapoa cinerea: since
  // then it gained Refusia testii and lost the Copiapoa.
  await inject(page, [
    ['taxon', 'copiapoa-humilis', 'name', 'Copiapoa humilis'], ['taxon', 'copiapoa-humilis', 'followed', true],
    ['setting', id, 'href', `/browse${view}`], ['setting', id, 'view', view], ['setting', id, 'label', 'Species native to Namibia'],
    ['setting', id, 'made', '2026-10-01'], ['setting', id, 'seen', '2026-10-12'], ['setting', id, 'n', 2], ['setting', id, 'keys', encodeKeys(['k339841', 'k2735933'])]
  ], Date.now() - DAY);
  await page.goto('/'); await ready(page);
  const pins = page.locator('section.pins');
  await expect(pins.locator('h2')).toHaveText('Your pinned views');
  // After the Following tiles (base: no such section on the front page).
  expect(await pins.evaluate((s) => { const f = [...document.querySelectorAll('h2.grouptitle')].find((h) => h.textContent?.trim() === 'Following'); return !!f && !!(f.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); })).toBe(true);
  const row = pins.locator('li', { hasText: 'Species native to Namibia' });
  await expect(row).toContainText('2 species');
  await expect(row.locator('.ch')).toContainText('+1 · −1 since 12 Oct');
  await row.getByRole('link', { name: 'Species native to Namibia' }).click();
  await expect(page).toHaveURL(/\/browse\?r=NAM$/);
  await expect(page.locator('#bv-since')).toContainText('Refusia testii');
  // No horizontal scroll on a phone's width.
  await page.goto('/'); await ready(page);
  await expect(page.locator('section.pins')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

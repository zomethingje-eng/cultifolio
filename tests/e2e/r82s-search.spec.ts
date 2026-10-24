/**
 * Round eighty-two (S): what the catalogue's rows and the species picker say of names (review 1's 3 and 17).
 *
 * 1. A hit found by a name its record writes by another author than the page of that name (`hom` in the index, with the
 *    record's authors, `homBy`) says "older name under another author: Sempervivum montanum Sibth. & Sm.", never "older
 *    name: Sempervivum montanum", and its link carries `?was=` as an older name's does. Where the record gives no author,
 *    the row says so.
 * 2. The species picker shows and writes a name below the species with its rank word ("Lithops lesliei var.
 *    luteoviridis", where it showed "Lithops lesliei luteoviridis · variety"), and the pick files the variety's key.
 *
 * The server's answers are the test's: the search's ranking and the index's `hom` are proved in
 * tests/unit/r82s-search.test.ts and r82s-homonyms.test.ts. Written for WebKit and Firefox as well as Chromium: the
 * service worker blocked (the routes must see every request), and every wait on what the page shows.
 *
 * FAILS on r82base: 1 (the row says nothing of the name, and its link has no `?was=`: the base reads no `hom`), 2 (the row
 * reads "Lithops lesliei luteoviridis · variety", and the field is given "Lithops lesliei luteoviridis").
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const entry = (o: Record<string, unknown>) => ({ family: 'Crassulaceae', origin: ['Alps'], photos: 0, open: 3, climate: 'ok', ...o });
const HITS = [
  entry({ key: 'k9300001', gbif: 9300001, slug: 'sempervivum-montanum', name: 'Sempervivum montanum', common: 'Mountain houseleek' }),
  entry({ key: 'k9300002', gbif: 9300002, slug: 'sempervivum-tectorum', name: 'Sempervivum tectorum', common: 'House-leek', syn: ['Sempervivum requienii'], hom: ['Sempervivum montanum'], homBy: [['Sibth. & Sm.']] }),
  entry({ key: 'k9300003', gbif: 9300003, slug: 'sempervivum-wulfenii', name: 'Sempervivum wulfenii', hom: ['Sempervivum montanum'] })
];

test('r82s 1: a hit found by a name by another author says so, with the record\'s author @phone', async ({ page }) => {
  await page.route(/\/api\/search\?/, (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-search-total': '3' }, body: JSON.stringify({ hits: HITS, total: 3 }) }));
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search the whole species catalogue').fill('Sempervivum montanum');
  const rows = page.locator('.hits a.hitrow');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).not.toContainText('older name');
  await expect(rows.nth(1)).toContainText('older name under another author: Sempervivum montanum Sibth. & Sm.'); // base: nothing
  await expect(rows.nth(1)).not.toContainText('older name: Sempervivum montanum');
  await expect(rows.nth(1)).toHaveAttribute('href', '/species/sempervivum-tectorum?was=Sempervivum%20montanum'); // base: no ?was=
  await expect(rows.nth(2)).toContainText('older name under another author: Sempervivum montanum, with no author in the record');
  // An older name of the species' own is said as before.
  await page.getByLabel('Search the whole species catalogue').fill('Sempervivum requienii');
  await expect(rows.nth(1)).toContainText('older name: Sempervivum requienii');
});

/** /api/names answered by the test. */
async function names(p: Page, rows: object[]) {
  await p.route(/\/api\/names\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) }));
}

test('r82s 2: the picker shows and writes a variety with "var.", and files its key @phone', async ({ page }) => {
  await names(page, [
    { key: 3084001, canonicalName: 'Lithops lesliei', rank: 'SPECIES', family: 'Aizoaceae', status: 'ACCEPTED' },
    { key: 3084002, canonicalName: 'Lithops lesliei luteoviridis', rank: 'VARIETY', family: 'Aizoaceae', status: 'ACCEPTED' }
  ]);
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Lithops lesliei lut');
  const opt = page.locator('.picker [role=option]', { hasText: 'Lithops lesliei var. luteoviridis' }); // base: no such row
  await expect(opt).toBeVisible();
  await expect(opt).not.toContainText('· variety');
  await opt.click();
  await expect(input).toHaveValue('Lithops lesliei var. luteoviridis'); // base: "Lithops lesliei luteoviridis"
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF 3084002');
});

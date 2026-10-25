/**
 * Round eighty-three (K): what the catalogue's rows and the species picker say of a hit found by the name of a page merged
 * into it (round eighty-two's merges; the index's `merged`).
 *
 * 1. "Echeveria peacockii", merged into Echeveria desmetiana and held by Kew's file under Dudleya pulverulenta too: the
 *    server lists E. desmetiana first (the order is tests/unit/r83k-merged.test.ts's), and its row says "Echeveria
 *    peacockii is merged into this page", where it said "older name: Echeveria peacockii", and opens the page as itself,
 *    with no `?was=` (which would say the name is held by another species too). Dudleya's row says "older name" as before.
 * 2. The species picker says the same on the kept page's row.
 *
 * The server's answers are the test's. Written for WebKit and Firefox as well as Chromium: the service worker blocked (the
 * routes must see every request), and every wait on what the page shows.
 *
 * FAILS on r83base: 1 (the row reads "older name: Echeveria peacockii" and its link carries `?was=`), 2 (the row reads
 * "its species is in the reference; no key filed").
 */
import { test, expect, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const entry = (o: Record<string, unknown>) => ({ family: 'Crassulaceae', origin: ['Mexico Southwest'], photos: 0, open: 3, climate: 'ok', ...o });
const HITS = [
  entry({ key: 'k2781125', slug: 'echeveria-desmetiana', name: 'Echeveria desmetiana', syn: ['Cotyledon desmetiana', 'Echeveria subsessilis', 'Echeveria peacockii'], merged: ['Echeveria peacockii'] }),
  entry({ key: 'k2778991', gbif: 2985894, slug: 'dudleya-pulverulenta', name: 'Dudleya pulverulenta', origin: ['California'], syn: ['Cotyledon peacockii', 'Echeveria peacockii', 'Echeveria pulverulenta'] })
];
const answer = (r: Route) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-search-total': '2' }, body: JSON.stringify(new URL(r.request().url()).searchParams.get('shape') === '2' ? { hits: HITS, total: 2 } : HITS) });

test('r83k 1: the kept page\'s row says the old name is merged into it, and opens it as itself @phone', async ({ page }) => {
  await page.route(/\/api\/search\?/, answer);
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search the whole species catalogue').fill('Echeveria peacockii');
  const rows = page.locator('.hits a.hitrow');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Echeveria peacockii is merged into this page'); // base: "older name: Echeveria peacockii"
  await expect(rows.nth(0)).not.toContainText('older name');
  await expect(rows.nth(0)).toHaveAttribute('href', '/species/echeveria-desmetiana'); // base: ?was=Echeveria%20peacockii
  await expect(rows.nth(1)).toContainText('older name: Echeveria peacockii');
  await expect(rows.nth(1)).toHaveAttribute('href', '/species/dudleya-pulverulenta?was=Echeveria%20peacockii');
  // Another older name of the kept page is said as before.
  await page.getByLabel('Search the whole species catalogue').fill('Echeveria subsessilis');
  await expect(rows.nth(0)).toContainText('older name: Echeveria subsessilis');
});

test('r83k 2: the picker\'s row of the kept page says the old name is merged into it @phone', async ({ page }) => {
  await page.route(/\/api\/search\?/, answer);
  await page.route(/\/api\/names\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ key: 7530398, canonicalName: 'Echeveria peacockii', rank: 'SPECIES', family: 'Crassulaceae', status: 'ACCEPTED' }]) }));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Echeveria peacockii');
  const opts = page.locator('.picker [role=option]');
  const kept = opts.filter({ hasText: 'Echeveria desmetiana' });
  await expect(kept).toContainText('Echeveria peacockii is merged into this page; no key filed'); // base: "its species is in the reference"
  await expect(opts.first()).toContainText('Echeveria desmetiana');
  await expect(opts.filter({ hasText: 'Dudleya pulverulenta' })).not.toContainText('merged');
});

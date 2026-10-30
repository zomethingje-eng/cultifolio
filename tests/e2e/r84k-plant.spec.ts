/**
 * Round eighty-four (K): the names on the add form and the plant page.
 *
 * 1. W5 (review-w), A9 (outside review A), S3 (review-s): "Echeveria ’Lola’", typed with a phone's quotes, is a cultivar
 *    whose species is not stated: the picker says so, asks for no parentage, and the plant page says "cultivar, species
 *    not stated", never "hybrid".
 * 2. W5's old records: a plant an earlier version filed as a hybrid from a cultivar under its genus is read as written,
 *    and its page offers to file it as a cultivar, which the log records.
 * 3. W6 (review-w): a plant filed under an older name ("Aloe aristata", with GBIF's synonym key) says so when asked, links
 *    the page, and files it there, the old name kept as received.
 * 4. W9 (review-w): a field number left blank is "not stated", never "none".
 * 5. P6 (review-p): Back with the Record form open keeps what was typed and says so; Cancel drops it.
 *
 * FAILS on r84base: 1 (the pill reads "hybrid, parentage not stated" and the page "hybrid"), 2 (no offer), 3 (nothing
 * said of the older name), 4 ("none"), 5 (Back says nothing; Cancel keeps the text for the next Record…).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { injectChanges } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const W = 'abcdefabcdef0000';
const stamp = (wall: number, count = 0) => `${String(wall).padStart(13, '0')}-${count.toString(16).padStart(4, '0')}-${W}`;
const plant = (id: string, wall: number, fields: Record<string, unknown>) => Object.entries(fields).map(([field, value], i) => ({ t: stamp(wall, i), kind: 'accession', id, field, value }));
const json = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const press = async (page: Page, loc: ReturnType<Page['locator']>) => { if (test.info().project.name.startsWith('phone')) await loc.tap(); else await loc.click(); };
async function seed(page: Page, id: string, fields: Record<string, unknown>) {
  await page.goto('/plants'); await ready(page);
  await injectChanges(page, plant(id, Date.now() - 3_600_000, { status: 'growing', ...fields }));
  await page.goto(`/plants/${fields.acc}`); await ready(page);
}

test('r84k-p 1: a cultivar under a genus, in a phone\'s quotes, is a cultivar with its species not stated @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [{ key: 8237614, canonicalName: 'Echeveria', family: 'Crassulaceae', rank: 'GENUS', status: 'ACCEPTED' }]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Echeveria ’Lola’');
  await expect(page.locator('.picker .pill', { hasText: 'cultivar' })).toHaveText('cultivar, species not stated'); // base: no cultivar pill (the quotes were not read)
  await expect(page.locator('.picker .pill', { hasText: 'hybrid' })).toHaveCount(0);
  await expect(page.locator('#f-parentage')).toHaveCount(0);
  await expect(page.locator('.picker .status')).toContainText('Filed under the genus Echeveria');
  await press(page, page.locator('form button[type=submit].add'));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1.sci')).toContainText('‘Lola’');
  await expect(page.locator('.idcard .vern').first()).toContainText('cultivar, species not stated');
  await expect(page.locator('.idcard')).not.toContainText('hybrid');
  await expect(page.locator('#name-not-in-reference')).toHaveCount(0);
});

test('r84k-p 2: a hybrid an earlier version filed from a cultivar under its genus can be filed as a cultivar in one tap @phone', async ({ page }) => {
  await seed(page, 'r-lola', { acc: '2026-0041', taxonName: 'Echeveria', cultivar: 'Lola', nameKind: 'hybrid' });
  await expect(page.locator('.idcard .kind')).toHaveText('hybrid'); // read as written
  const offer = page.locator('#file-as-cultivar');
  await expect(offer).toHaveText('File it as a cultivar, species not stated');
  await press(page, offer);
  await expect(page.locator('#species-not-stated')).toHaveText(', species not stated');
  await expect(page.locator('.idcard .kind')).toHaveText('cultivar');
  await expect(page.locator('.tl')).toContainText('Now recorded as a cultivar, species not stated');
});

test('r84k-p 3: a plant under an older name says so when asked, links the page and files it there @phone', async ({ page }) => {
  let asked = '';
  await page.route(/\/api\/search\?/, (r) => { asked = new URL(r.request().url()).searchParams.get('q') ?? ''; return json(r, [{ key: 'k5', slug: 'aristaloe-aristata', name: 'Aristaloe aristata', gbif: 2777000, family: 'Asphodelaceae', origin: ['Cape Provinces'], photos: 0, open: 3, climate: 'ok', syn: ['Aloe aristata'] }]); });
  await seed(page, 'r-aa', { acc: '2026-0042', taxonName: 'Aloe aristata', taxonKey: 2777555 });
  await expect(page.locator('#name-not-in-reference')).toHaveText('No species page under this name'); // base: nothing, with a key
  expect(asked).toBe(''); // the page asks by hash group; the name goes to the search only when the grower asks
  await press(page, page.locator('#look-older'));
  await expect(page.locator('#older-name-of')).toHaveText('An older name of Aristaloe aristata');
  expect(asked).toBe('Aloe aristata');
  await expect(page.locator('#older-name-of a')).toHaveAttribute('href', '/species/aristaloe-aristata');
  await press(page, page.locator('#file-under-older'));
  await expect(page.locator('h1.sci')).toContainText('Aristaloe aristata');
  await expect(page.locator('.idcard .vern').first()).toContainText('received as Aloe aristata');
  await expect(page.locator('.tl')).toContainText('Renamed from Aloe aristata to Aristaloe aristata');
});

test('r84k-p 4: a field number left blank is "not stated"', async ({ page }) => {
  await seed(page, 'r-fn', { acc: '2026-0043', taxonName: 'Copiapoa cinerea', sourceFrom: 'club sale' });
  await expect(page.locator('.factgrid div', { hasText: 'Field number' })).toHaveText('Field numbernot stated'); // base: "none"
});

test('r84k-p 5: Back with the Record form open keeps the note and says so; Cancel drops it @phone', async ({ page }) => {
  await seed(page, 'r-rec', { acc: '2026-0044', taxonName: 'Copiapoa cinerea' });
  const record = page.getByRole('button', { name: 'Record…', exact: true });
  await press(page, record);
  await page.locator('#ev-note').fill('top dressed');
  await page.goBack();
  await expect(page.locator('#ev-note')).toHaveCount(0);
  await expect(page).toHaveURL(/\/plants\/2026-0044$/);
  await expect(page.locator('.toast')).toContainText('What you typed is kept'); // base: nothing said
  await press(page, record);
  await expect(page.locator('#ev-note')).toHaveValue('top dressed');
  await press(page, page.locator('form.evform').getByRole('button', { name: 'Cancel' }));
  await press(page, record);
  await expect(page.locator('#ev-note')).toHaveValue(''); // base: Cancel kept it
});

/**
 * Round eighty-six, names: the add form's name check and GBIF's name for a renamed page, in the browser.
 *
 * 1. C2 (review-c): Enter in the name field, then Add 200 ms later while the reference's search is held 1.5 s and the
 *    name service fails: the reference's key is filed, and "Add as typed" was never shown before the search answered.
 * 2. S3, P10, W1 (review-s, review-p, review-w): "Ceropegia alstonii", GBIF's name for Hoodia alstonii's key, typed and
 *    left: the line says "GBIF's name for Hoodia alstonii" and that "Add as typed" keeps it; the button already reads so,
 *    and one press files it, with `olderOf`; the plant's page says "GBIF's name for Hoodia alstonii".
 * 3. S3: an older name ("Trichocaulon alstonii") typed and left: "An older name of", and one press files it.
 * 4. W3 (review-w): the page's row picked for an older name typed in full keeps the name typed as the name as received.
 * 5. W2 (review-w): the front page's tile of a name kept as typed says what the plant's page says, never "not in the
 *    reference".
 * 6. P5 (review-p), a guard: with the name service failing, a press straight from the field shows "Checking the name…"
 *    no longer than the reference's own search takes, then "Add as typed". Review P's five seconds did not reproduce here
 *    (base and this branch: "Checking" for about 120 ms after the search answered, the line already saying the service
 *    did not answer); this holds the bound.
 *
 * Routes answer `/api/search`, `/api/names`, `/api/sheets` and `/api/entries`; the service worker is blocked.
 *
 * On r86base (a build of 1b663ea, Chromium, port 4321): 1 FAILED ("Add as typed" shown 200 ms after Enter, before the
 * search answered); 2 FAILED ("An older name of Hoodia alstonii … Add keeps exactly what you typed", the button "Add");
 * 3 FAILED (the same line, the button "Add"); 4 FAILED (no line of the name as received); 5 FAILED (the first press only
 * armed: "Add"); 3b and 6, guards, passed.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const json = (r: Route, body: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const later = (ms: number) => new Promise((res) => setTimeout(res, ms));
const entry = (o: Record<string, unknown>) => ({ family: 'Apocynaceae', origin: ['Cape Provinces'], photos: 0, open: 3, climate: 'ok', ...o });
const HOODIA = entry({ key: 'k506502', slug: 'hoodia-alstonii', name: 'Hoodia alstonii', gbif: 9269454, syn: ['Trichocaulon alstonii', 'Trichocaulon halenbergense', 'Ceropegia alstonii'], gname: 'Ceropegia alstonii' });
const HUMILIS = entry({ key: 'k1', slug: 'copiapoa-humilis', name: 'Copiapoa humilis', gbif: 5384126, family: 'Cactaceae', origin: ['Chile North'] });
const row = (key: number, name: string, status = 'ACCEPTED', rank = 'SPECIES') => ({ key, canonicalName: name, family: 'Apocynaceae', rank, status });
const SHEET = { key: 'k506502', gbif: 9269454, slug: 'hoodia-alstonii', name: { scientific: 'Hoodia alstonii', family: 'Apocynaceae' }, centroid: null, habitatLat: null, climate: { status: 'none' } };
/** The copy of Hoodia alstonii's sheet the build files under GBIF's name for its key (`via: 'gbif'`). */
const GBIF_COPY = { ...SHEET, slug: 'ceropegia-alstonii', via: 'gbif', page: 'hoodia-alstonii' };

const isPhone = () => test.info().project.name.startsWith('phone');
const press = async (loc: ReturnType<Page['locator']>) => { if (isPhone()) await loc.tap(); else await loc.click(); };
const leave = async (page: Page) => press(page.locator('h1').first());
const add = (page: Page) => page.locator('form button[type=submit].add');
async function stored(page: Page, field: string): Promise<unknown[]> {
  return page.evaluate(async (f) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown; t: string }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    d.close();
    return all.filter((c) => c.kind === 'accession' && c.field === f).sort((a, b) => a.t.localeCompare(b.t)).map((c) => c.value);
  }, field);
}

test('r86n 1: Enter, then Add while the reference\'s search is out, files the reference\'s key @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => r.abort());
  let answered = 0;
  await page.route(/\/api\/search\?/, async (r) => { await later(1500); answered = Date.now(); await json(r, [HUMILIS]); });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa humilis');
  await input.press('Enter');
  await later(200);
  // Before the reference answers, the button is never "Add as typed": read once, at the moment of the press (base:
  // "Add as typed", and the press filed the plant with no key).
  expect(answered).toBe(0);
  expect(await add(page).textContent()).not.toMatch(/as typed/);
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/, { timeout: 15_000 });
  expect(answered).toBeGreaterThan(0);
  await expect.poll(() => stored(page, 'taxonKey'), { timeout: 15_000 }).toEqual([5384126]); // base: [null]
});

test("r86n 2: GBIF's name for a renamed page is said so, and one press keeps it as typed @phone", async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(9269454, 'Ceropegia alstonii')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/sheets\?/, (r) => json(r, [SHEET, GBIF_COPY]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Ceropegia alstonii');
  await leave(page);
  const line = page.locator('.picker .status .hint');
  await expect(line).toContainText("GBIF's name for Hoodia alstonii, which has a species page"); // base: "An older name of"
  await expect(line).toContainText('press “Add as typed” to keep exactly what you typed');
  await expect(add(page)).toHaveText('Add as typed');
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/); // base: the first press only armed
  expect(await stored(page, 'taxonName')).toEqual(['Ceropegia alstonii']);
  expect(await stored(page, 'olderOf')).toEqual(['Hoodia alstonii']);
  await expect(page.locator('#found-by')).toHaveText("GBIF's name for Hoodia alstonii");
});

test('r86n 3: an older name typed and left is filed as typed on one press @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(7312999, 'Trichocaulon alstonii', 'SYNONYM')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/sheets\?/, (r) => json(r, [SHEET]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Trichocaulon alstonii');
  await leave(page);
  const line = page.locator('.picker .status .hint');
  await expect(line).toContainText('An older name of Hoodia alstonii, which has a species page: pick it, or press “Add as typed” to keep exactly what you typed.');
  await expect(add(page)).toHaveText('Add as typed');
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'taxonName')).toEqual(['Trichocaulon alstonii']);
  await expect(page.locator('#found-by')).toHaveText('An older name of Hoodia alstonii');
});

test('r86n 3b: guard: a press straight from the field, with no line shown yet, still asks first', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(7312999, 'Trichocaulon alstonii', 'SYNONYM')]));
  await page.route(/\/api\/search\?/, async (r) => { await later(400); await json(r, [HOODIA]); });
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Trichocaulon alstonii');
  await press(add(page));
  await expect(add(page)).toHaveText('Add as typed');
  await expect(page.locator('.picker .status .hint')).toContainText('An older name of Hoodia alstonii');
  expect(page.url()).toMatch(/\/plants\/new/);
  expect(await stored(page, 'taxonName')).toEqual([]);
});

test("r86n 4: the page's row picked for an older name keeps the name typed as received", async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, []));
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Trichocaulon alstonii');
  await page.locator('.picker [role=option]', { hasText: 'Hoodia alstonii' }).click();
  await expect(page.locator('#species-name')).toHaveValue('Hoodia alstonii');
  await expect(page.locator('.picker .status')).toContainText('What you typed, “Trichocaulon alstonii”, is kept as the name as received.');
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'nameAsReceived')).toEqual(['Trichocaulon alstonii']); // base: []
  expect(await stored(page, 'taxonKey')).toEqual([9269454]);
});

test('r86n 5: the front page\'s tile of a name kept as typed says what its plant\'s page says', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(9269454, 'Ceropegia alstonii')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/sheets\?/, (r) => json(r, [SHEET, GBIF_COPY]));
  await page.route(/\/api\/entries\?/, (r) => json(r, [])); // no page answers to "Ceropegia alstonii" by its own address
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Ceropegia alstonii');
  await leave(page);
  await expect(add(page)).toHaveText('Add as typed');
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  await ready(page);
  const tile = page.locator('a.tile[href="/species/ceropegia-alstonii"]').first();
  await expect(tile).toContainText("GBIF's name for Hoodia alstonii", { timeout: 15_000 }); // base: "not in the reference"
  await expect(tile).not.toContainText('not in the reference');
});

test('r86n 6: with the name service failing, "Checking the name…" lasts no longer than the reference\'s search', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => r.abort());
  await page.route(/\/api\/search\?/, async (r) => { await later(300); await json(r, []); });
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Aloe nonexistens');
  const t0 = Date.now();
  await press(add(page));
  await expect(add(page)).toHaveText('Add as typed', { timeout: 10_000 });
  expect(Date.now() - t0).toBeLessThan(2500);
});

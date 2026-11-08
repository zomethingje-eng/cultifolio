/**
 * Round eighty-six, the final review's U3 and U4, in the browser.
 *
 * U3. The front page's "You grow" tile of a name kept as typed (`olderOf`) says "GBIF's name for" or "an older name of"
 *     only once the copy of the page's sheet filed under the name has been read: with its group not reached, it says
 *     only that the reference files it under that page, never "an older name of" for what is GBIF's name (W1's wording).
 * U4. The batch form's Start batch and the plant page's edit Save, pressed while the reference's search is out, file the
 *     reference's key, as the add form's Add does since C2 (r86n 1): they saved the picker's key as it stood, none.
 *
 * On the final review's base (bac6183): U3 1 FAILED ("an older name of Hoodia alstonii" with the sheets not reached);
 * U3 2 passes (a guard: a true older name still says so); U4 1 and 2 FAILED (taxonKey [null]).
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
const GBIF_COPY = { ...SHEET, slug: 'ceropegia-alstonii', via: 'gbif', page: 'hoodia-alstonii' };

const isPhone = () => test.info().project.name.startsWith('phone');
const press = async (loc: ReturnType<Page['locator']>) => { if (isPhone()) await loc.tap(); else await loc.click(); };
const leave = async (page: Page) => press(page.locator('h1').first());
const add = (page: Page) => page.locator('form button[type=submit].add');
async function stored(page: Page, kind: string, field: string): Promise<unknown[]> {
  return page.evaluate(async ([k, f]) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown; t: string }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    d.close();
    return all.filter((c) => c.kind === k && c.field === f).sort((a, b) => a.t.localeCompare(b.t)).map((c) => c.value);
  }, [kind, field] as const);
}
/** A name kept as typed on the add form, its line naming Hoodia alstonii's page (r86n 5's steps). */
async function keptAsTyped(page: Page, typed: string) {
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill(typed);
  await leave(page);
  await expect(add(page)).toHaveText('Add as typed');
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'accession', 'olderOf')).toEqual(['Hoodia alstonii']);
}

test("r86f U3 1: with the sheets not reached, the tile of GBIF's name says only that the reference files it under the page @phone", async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(9269454, 'Ceropegia alstonii')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/entries\?/, (r) => json(r, []));
  await page.route(/\/api\/sheets\?/, (r) => json(r, [SHEET, GBIF_COPY]));
  await keptAsTyped(page, 'Ceropegia alstonii');
  await page.unroute(/\/api\/sheets\?/);
  await page.route(/\/api\/sheets\?/, (r) => r.abort()); // the group not reached
  await page.goto('/');
  await ready(page);
  const tile = page.locator('a.tile[href="/species/ceropegia-alstonii"]').first();
  await expect(tile).toContainText('the reference files it under Hoodia alstonii', { timeout: 15_000 }); // base: "an older name of Hoodia alstonii"
  await expect(tile).not.toContainText('an older name of');
  await expect(tile).not.toContainText('not in the reference');
  // Reached on the next look: GBIF's name, as the plant's page says.
  await page.unroute(/\/api\/sheets\?/);
  await page.route(/\/api\/sheets\?/, (r) => json(r, [SHEET, GBIF_COPY]));
  await page.reload();
  await ready(page);
  await expect(page.locator('a.tile[href="/species/ceropegia-alstonii"]').first()).toContainText("GBIF's name for Hoodia alstonii", { timeout: 15_000 });
});

test('r86f U3 2: guard: an older name, the sheets read, still says "an older name of" @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(1, 'Trichocaulon alstonii', 'SYNONYM')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/entries\?/, (r) => json(r, []));
  await page.route(/\/api\/sheets\?/, (r) => json(r, [SHEET]));
  await keptAsTyped(page, 'Trichocaulon alstonii');
  await page.goto('/');
  await ready(page);
  await expect(page.locator('a.tile[href="/species/trichocaulon-alstonii"]').first()).toContainText('an older name of Hoodia alstonii', { timeout: 15_000 });
});

test("r86f U4 1: Enter, then Start batch while the reference's search is out, files the reference's key @phone", async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => r.abort());
  let answered = 0;
  await page.route(/\/api\/search\?/, async (r) => { await later(1500); answered = Date.now(); await json(r, [HUMILIS]); });
  await page.goto('/propagation/new');
  await ready(page);
  await page.locator('#s-count').fill('20');
  const input = page.locator('#species-name');
  await input.fill('Copiapoa humilis');
  await input.press('Enter');
  await later(200);
  expect(answered).toBe(0);
  await press(page.locator('form button[type=submit].pri'));
  await expect(page).not.toHaveURL(/\/propagation\/new/, { timeout: 15_000 });
  expect(answered).toBeGreaterThan(0);
  await expect.poll(() => stored(page, 'sowing', 'taxonKey'), { timeout: 15_000 }).toEqual([5384126]); // base: [null]
});

test("r86f U4 2: a species typed in the plant's edit, Save pressed while the reference's search is out, files the reference's key @phone", async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await press(page.getByRole('button', { name: /^Add/ }));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.route(/\/api\/names\?/, (r) => r.abort());
  let answered = 0;
  await page.route(/\/api\/search\?/, async (r) => { await later(1500); answered = Date.now(); await json(r, [HUMILIS]); });
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  const input = page.locator('#ed-name');
  await input.fill('Copiapoa humilis');
  await input.press('Enter');
  await later(200);
  expect(answered).toBe(0);
  await press(page.locator('.editform button[type=submit]'));
  await expect(page.locator('.editform')).toHaveCount(0, { timeout: 15_000 });
  expect(answered).toBeGreaterThan(0);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa humilis');
  await expect.poll(() => stored(page, 'accession', 'taxonKey'), { timeout: 15_000 }).toEqual([5384013, 5384126]); // base: [5384013, null]
});

/**
 * Round eighty-five (K): the add form, with the reference's search held back and GBIF's name service failing or slow.
 *
 * 1. S1, P2 (review-s, review-p): an accepted name another page holds under another author ("Aloe vera", held by Aloe
 *    succotrina as Aloe vera Mill.) draws no "An older name of" line and is filed on one press. The same for "Crassula
 *    ovata 'Gollum'", with the search held 600 ms.
 * 2. C2 (review-c): the name service answers at once with GBIF's synonym key; the search, 600 ms later, with the page Kew's
 *    name heads. Left and added, or added straight from the field: the reference's key is filed.
 * 3. C3 (review-c): Add tapped twice, 120 ms apart: one plant.
 * 4. A13 (outside review A): the name service never answers; the reference's search does: Add files the reference's key
 *    on one press, without waiting for GBIF.
 * 5. A13: the name service fails (a 502) and the search is held 800 ms: the reference's key, on one press.
 * 6. A16b (outside review A): with a phone's keyboard up (375 × 500), no row of the list runs under the pinned bar.
 * 7. P5 (review-p): an accepted name typed in full narrows the list to its own row, and a tap on Acquired reaches it.
 * 8. S7 (review-s): "Crassula ovata „Gollum“" is the species with a cultivar.
 * 9. A16g (outside review A): the reference's rows sit under one heading, "Species pages"; no row shows "has a species
 *    page" (a screen reader still hears it on each).
 * 10. A16a (outside review A): a name kept as typed after the older-name line opens on a plant page that names the page.
 *
 * The routes answer `/api/search`, `/api/names` and `/api/sheets`; the service worker is blocked so they see every
 * request. Waits are on what the page shows; the delays are the routes' own.
 *
 * FAILS on r85base: 1 (the line, and the first press arms "Add as typed"), 2 (GBIF's key 5525665 is filed), 3 (two
 * plants), 4 (Add waits for the name service for ever), 5 (filed with no key: the check gave up on the failure before the
 * search), 6 (rows under the bar), 7 (the list keeps every row, and the tap picks one), 8 (no cultivar), 9 (the words on
 * every row, no heading), 10 ("No species page under this name").
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const json = (r: Route, body: unknown, status = 200, headers: Record<string, string> = {}) => r.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
const later = (ms: number) => new Promise((res) => setTimeout(res, ms));
const entry = (o: Record<string, unknown>) => ({ family: 'Asphodelaceae', origin: ['Oman'], photos: 0, open: 3, climate: 'ok', ...o });
const ALOE_VERA = entry({ key: 'k298116', slug: 'aloe-vera', name: 'Aloe vera', gbif: 2777724, hom: ['Aloe humilis'], homBy: [['Blanco']] });
const SUCCOTRINA = entry({ key: 'k1', slug: 'aloe-succotrina', name: 'Aloe succotrina', gbif: 2777999, hom: ['Aloe vera'], homBy: [['Mill.']] });
const OVATA = entry({ key: 'k2741970', slug: 'crassula-ovata', name: 'Crassula ovata', gbif: 5362063, family: 'Crassulaceae', common: 'Jade plant' });
const SARMENTOSA = entry({ key: 'k2', slug: 'crassula-sarmentosa', name: 'Crassula sarmentosa', gbif: 5362999, family: 'Crassulaceae', hom: ['Crassula ovata'], homBy: [['Druce']] });
const HOODIA = entry({ key: 'k506502', slug: 'hoodia-alstonii', name: 'Hoodia alstonii', gbif: 9269454, family: 'Apocynaceae', syn: ['Trichocaulon alstonii', 'Ceropegia alstonii'] });
const row = (key: number, name: string, status = 'ACCEPTED', rank = 'SPECIES', family = 'Asphodelaceae') => ({ key, canonicalName: name, family, rank, status });

const isPhone = () => test.info().project.name.startsWith('phone');
const press = async (loc: ReturnType<Page['locator']>) => { if (isPhone()) await loc.tap(); else await loc.click(); };
const leave = async (page: Page) => press(page.locator('h1').first());

/** Each plant's stored field, read from the collection's log, in the order written. Polled for the line awaited first: WebKit's
 * IndexedDB on the owner's PC writes after the page has moved on (the merge, round eighty-five). */
async function stored(page: Page, field: string): Promise<unknown[]> {
  return page.evaluate(async (f) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown; t: string }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    d.close();
    return all.filter((c) => c.kind === 'accession' && c.field === f).sort((a, b) => a.t.localeCompare(b.t)).map((c) => c.value);
  }, field);
}
const add = (page: Page) => page.locator('form button[type=submit].add');

test('r85k 1: an accepted name another page holds under another author draws no older-name line and files on one press @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(2777724, 'Aloe vera')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [SUCCOTRINA, ALOE_VERA])); // the holder first: the line must not read the first row
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Aloe vera');
  await expect(page.locator('.picker [role=option]', { hasText: 'Aloe vera' }).first()).toBeVisible();
  await leave(page);
  await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 2777724');
  await expect(page.locator('.picker .status')).not.toContainText('An older name of'); // base: "An older name of Aloe succotrina"
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/); // base: the first press armed "Add as typed"
  await expect.poll(() => stored(page, 'taxonKey'), { timeout: 15_000 }).toEqual([2777724]);
  expect(await stored(page, 'olderOf')).toEqual([]);
});

test('r85k 1b: a cultivar of an accepted name, the search held, files on one press with no line', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(5362063, 'Crassula ovata', 'ACCEPTED', 'SPECIES', 'Crassulaceae')]));
  await page.route(/\/api\/search\?/, async (r) => { await later(600); await json(r, [SARMENTOSA, OVATA]); });
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill("Crassula ovata 'Gollum'");
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/); // base: "Add as typed", and the line names Crassula sarmentosa
  await expect.poll(() => stored(page, 'taxonKey'), { timeout: 15_000 }).toEqual([5362063]);
  expect(await stored(page, 'cultivar')).toEqual(['Gollum']);
});

for (const how of ['leave', 'enter', 'straight'] as const) {
  test(`r85k 2 (${how}): the reference's key wins over the name service's synonym key, whichever answered first`, async ({ page }) => {
    // GBIF's suggest knows the name as a synonym of another of its own names, with a key of its own.
    await page.route(/\/api\/names\?/, (r) => json(r, [row(5525665, 'Hoodia alstonii', 'SYNONYM', 'SPECIES', 'Apocynaceae')]));
    await page.route(/\/api\/search\?/, async (r) => { await later(600); await json(r, [HOODIA]); });
    await page.goto('/plants/new');
    await ready(page);
    const input = page.locator('#species-name');
    await input.fill('Hoodia alstonii');
    if (how === 'leave') await leave(page);
    if (how === 'enter') await input.press('Enter');
    if (how !== 'straight') await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 9269454'); // base: GBIF 5525665
    await press(add(page));
    await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
    await expect.poll(() => stored(page, 'taxonKey'), { timeout: 15_000 }).toEqual([9269454]); // base: 5525665
    await expect(page.locator('#key-differs')).toHaveCount(0);
  });
}

test('r85k 3: two taps on Add, 120 ms apart, file one plant @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(5362063, 'Crassula ovata', 'ACCEPTED', 'SPECIES', 'Crassulaceae')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [OVATA]));
  await page.goto('/plants/new');
  await ready(page);
  // The plant page's code is held, as a slow phone holds it: the form stays between the plant written and the page shown.
  await page.route(/\/_app\/immutable\/(?:nodes|chunks)\//, async (r) => { await later(1500); await r.continue(); });
  await page.locator('#species-name').fill('Crassula ovata');
  await leave(page);
  await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 5362063');
  const box = (await add(page).boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const tap = () => (isPhone() ? page.touchscreen.tap(at.x, at.y) : page.mouse.click(at.x, at.y));
  await tap();
  await expect.poll(() => stored(page, 'taxonName')).toEqual(['Crassula ovata']);
  await later(120); // the grower's second tap, as review-c C3 tapped: the time is the case
  await tap();
  await later(250);
  await tap();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'taxonName')).toEqual(['Crassula ovata']); // base: two or three
});

test('r85k 4: the name service never answers; the reference does, and Add files its key on one press @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, () => new Promise(() => {})); // held for ever
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Hoodia alstonii');
  await expect(page.locator('.picker [role=option]', { hasText: 'Hoodia alstonii' })).toBeVisible();
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/, { timeout: 4000 }); // base: "Checking the name…" until GBIF answers
  expect(await stored(page, 'taxonKey')).toEqual([9269454]);
});

test('r85k 5: the name service fails and the search is held: the reference\'s key on one press', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, { error: 'backbone unreachable' }, 502));
  await page.route(/\/api\/search\?/, async (r) => { await later(800); await json(r, [HOODIA]); });
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Hoodia alstonii');
  await leave(page);
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'taxonKey')).toEqual([9269454]);
});

test('r85k 6: with a phone\'s keyboard up, no row of the list runs under the pinned bar @phone-only', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 500 });
  const many = Array.from({ length: 7 }, (_, i) => entry({ key: `k${i}`, slug: `copiapoa-x${i}`, name: `Copiapoa x${'abcdefg'[i]}`, gbif: 100 + i, family: 'Cactaceae' }));
  await page.route(/\/api\/names\?/, (r) => json(r, []));
  await page.route(/\/api\/search\?/, (r) => json(r, many));
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.tap();
  await input.fill('Copiapoa x');
  const menu = page.locator('.picker .menu');
  await expect(menu).toBeVisible();
  await expect(page.locator('.picker [role=option]')).toHaveCount(7);
  // The list's foot against the bar's top, both where they are drawn now.
  await expect.poll(async () => { const m = (await menu.boundingBox())!; const bar = (await page.locator('.actions.sticky').boundingBox())!; return Math.round(m.y + m.height) - Math.round(bar.y); }).toBeLessThanOrEqual(0); // base: 555 against 380
  // Every row is still there, the list scrolling within its room.
  const last = page.locator('.picker [role=option]').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
});

test('r85k 7: an accepted name typed in full narrows the list to its own row, and a tap on Acquired reaches it @phone', async ({ page }) => {
  const others = [entry({ key: 'k7', slug: 'crassula-ovata-x', name: 'Crassula obovata', gbif: 5362100, family: 'Crassulaceae' }), entry({ key: 'k8', slug: 'crassula-ovalis', name: 'Crassula ovalis', gbif: 5362101, family: 'Crassulaceae' })];
  await page.route(/\/api\/names\?/, (r) => json(r, [row(5362063, 'Crassula ovata', 'ACCEPTED', 'SPECIES', 'Crassulaceae'), row(5362200, 'Crassula ovata var. x', 'ACCEPTED', 'VARIETY', 'Crassulaceae')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [OVATA, ...others]));
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Crassula ova');
  await expect(page.locator('.picker [role=option]')).toHaveCount(4); // still choosing: every row
  await input.fill('Crassula ovata');
  await expect(page.locator('.picker [role=option]')).toHaveCount(1); // base: four
  await expect(page.locator('.picker [role=option]')).toContainText('Crassula ovata');
  await press(page.locator('#f-date'));
  await expect(page.locator('#f-date')).toBeFocused(); // base: the tap picked a row under it
  await expect(input).toHaveValue('Crassula ovata');
});

test('r85k 8: a cultivar in „…“ is a cultivar of the species @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(5362063, 'Crassula ovata', 'ACCEPTED', 'SPECIES', 'Crassulaceae')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [OVATA]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Crassula ovata „Gollum“');
  await expect(page.locator('.picker .pill', { hasText: 'cultivar' })).toHaveText('cultivar'); // base: no cultivar pill
  await leave(page);
  await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 5362063'); // base: "not in the backbone"
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'cultivar')).toEqual(['Gollum']);
});

test('r85k 9: the reference\'s rows sit under "Species pages", and no row shows "has a species page"', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, [row(5362063, 'Crassula ovata', 'ACCEPTED', 'SPECIES', 'Crassulaceae'), row(5362300, 'Crassula ovalis', 'ACCEPTED', 'SPECIES', 'Crassulaceae')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [OVATA, SARMENTOSA]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Crassula ov');
  const menu = page.locator('.picker .menu');
  await expect(menu.locator('li.grp').first()).toHaveText('Species pages'); // base: no heading
  await expect(menu.locator('li.grp').nth(1)).toHaveText("GBIF's names");
  // What the screen shows: each row without its words for a screen reader alone.
  const shown = await menu.locator('[role=option]').evaluateAll((els) => els.map((e) => { const c = e.cloneNode(true) as HTMLElement; c.querySelectorAll('.sr').forEach((x) => x.remove()); return c.textContent ?? ''; }));
  expect(shown.filter((t) => t.includes('has a species page'))).toEqual([]); // base: on every reference row
  // A screen reader still hears it on each reference row.
  await expect(menu.locator('[role=option]', { hasText: 'Crassula sarmentosa' })).toContainText('has a species page');
});

test('r85k 10: a name kept as typed after the older-name line opens on a plant page that names the page @phone', async ({ page }) => {
  const ARIS = entry({ key: 'k5', slug: 'aristaloe-aristata', name: 'Aristaloe aristata', gbif: 2777000, syn: ['Aloe aristata'] });
  await page.route(/\/api\/names\?/, (r) => json(r, [row(2777555, 'Aloe aristata', 'SYNONYM')]));
  await page.route(/\/api\/search\?/, (r) => json(r, [ARIS]));
  await page.route(/\/api\/sheets\?/, (r) => json(r, [{ key: 'k5', gbif: 2777000, slug: 'aristaloe-aristata', name: { scientific: 'Aristaloe aristata', family: 'Asphodelaceae' }, centroid: null, habitatLat: null, climate: { status: 'none' } }]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Aloe aristata');
  await press(add(page));
  await expect(add(page)).toHaveText('Add as typed');
  await press(add(page));
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'olderOf')).toEqual(['Aristaloe aristata']);
  await expect(page.locator('#found-by')).toHaveText('An older name of Aristaloe aristata'); // base: "No species page under this name"
  await expect(page.locator('#found-by a')).toHaveAttribute('href', '/species/aristaloe-aristata');
  await expect(page.locator('#name-not-in-reference')).toHaveCount(0);
  await expect(page.locator('#key-differs')).toHaveCount(0);
});

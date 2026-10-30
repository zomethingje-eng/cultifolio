/**
 * Round eighty-four (K): the species picker on the add form.
 *
 * 1. C1 (review-c): the list never opens after the field is left. The test types, leaves the field while
 *    `/api/search` and `/api/names` are held, then lets them answer: the list stays closed, and a tap on the next field
 *    picks nothing.
 * 2. C2 (review-c), the WebKit state: Add pressed right after typing, the name service answered (without the exact
 *    name) and the reference's search still out. The press waits for the search and adds the plant with the reference's
 *    key, on one press; the list does not open under it.
 * 3. A22 (outside review A): a press on Add while the check's words arrive. The room under the field holds its height
 *    from the finger going down until the press is over, so Add does not move from under it and the press is taken.
 * 4. S8 (review-s): a reference row found by an older name says so.
 * 5. S9 (review-s): a pasted label with authors, ranks and a field number is offered the reference's species.
 * 6. W6 (review-w): a name that is an older name of a reference page asks once, naming the page.
 *
 * The routes answer `/api/search` and `/api/names`; the service worker is blocked so they see every request. Waits are
 * on what the page shows, never fixed sleeps.
 *
 * FAILS on r84base: 1 (the list opens over the form when the answers land), 2 (the first press arms "Add as typed"),
 * 3 (Add moves under the press, and the press is lost), 4 ("has a species page, under another genus" and no older
 * name), 5 (no reference row), 6 ("Not a reference name. Did you mean").
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

type Gate = { open: () => void; shut: Promise<void> };
const gate = (): Gate => { let open = () => {}; const shut = new Promise<void>((r) => (open = r)); return { open, shut }; };
const json = (r: Route, body: unknown, status = 200, headers: Record<string, string> = {}) => r.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });
const entry = (o: Record<string, unknown>) => ({ family: 'Cactaceae', origin: ['Chile'], photos: 0, open: 3, climate: 'ok', ...o });
const CINEREA = entry({ key: 'k1', slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', gbif: 5384013 });
const HUMILIS = entry({ key: 'k2', slug: 'copiapoa-humilis', name: 'Copiapoa humilis', gbif: 5384999 });
const ROW_CINEREA = { key: 5384013, canonicalName: 'Copiapoa cinerea', family: 'Cactaceae', rank: 'SPECIES', status: 'ACCEPTED' };
const ROW_GENUS = { key: 2779581, canonicalName: 'Copiapoa', family: 'Cactaceae', rank: 'GENUS', status: 'ACCEPTED' };

/** Each plant's stored key, read from the collection's log. */
async function storedKeys(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    d.close();
    return all.filter((c) => c.kind === 'accession' && c.field === 'taxonKey').map((c) => c.value);
  });
}
const leave = async (page: Page) => {
  // A grower leaves the field to choose a space: a tap on the page's heading (the keyboard goes), or Tab on a desktop.
  if (test.info().project.name.startsWith('phone')) await page.locator('h1').first().tap();
  else await page.locator('h1').first().click();
};

test('r84k 1: an answer that lands after the field is left never opens the list, and a tap on the next field picks nothing @phone', async ({ page }) => {
  const held = gate();
  let searches = 0, names = 0;
  await page.route(/\/api\/search\?/, async (r) => { searches++; await held.shut; await json(r, [CINEREA, HUMILIS]); });
  await page.route(/\/api\/names\?/, async (r) => { names++; await held.shut; await json(r, [ROW_CINEREA, ROW_GENUS]); });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa');
  await expect.poll(() => searches + names).toBe(2); // both asked, neither answered
  await leave(page);
  await expect(input).not.toBeFocused();
  // The leave's own close runs on the page's 150 ms timer, which shows nothing to wait for: an answer landing before it
  // is closed by it, and the case under test is the answer that lands after it (review-c C1 saw 0.6 to 2.1 s live).
  await page.waitForTimeout(400);
  held.open();
  // The answers are read: the genus's key comes from the leave's check.
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF 2779581');
  await expect(page.locator('.picker .menu')).toBeHidden(); // base: open, seven rows over Space and Acquired
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  // The tap meant for the next field lands on it.
  const space = page.locator('#f-loc');
  if (test.info().project.name.startsWith('phone')) await space.tap(); else await space.click();
  await expect(input).toHaveValue('Copiapoa'); // base: "Copiapoa cinerea", picked by the tap
  // Back in the field, the list is there again.
  await input.focus();
  await expect(page.locator('.picker .menu')).toBeVisible();
});

test('r84k 2: Add pressed while the reference\'s search is out waits for it, and files its key on one press @phone', async ({ page }) => {
  const held = gate();
  let searchAsked = false;
  // The name service answers at once, without the exact name (as GBIF's suggest does for a name it does not hold).
  await page.route(/\/api\/names\?/, (r) => json(r, [ROW_CINEREA]));
  await page.route(/\/api\/search\?/, async (r) => { searchAsked = true; await held.shut; await json(r, [HUMILIS]); });
  await page.goto('/plants/new');
  await ready(page);
  const input = page.locator('#species-name');
  await input.fill('Copiapoa humilis');
  // The list from the name service, the search still out.
  await expect(page.locator('.picker [role=option]', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await expect.poll(() => searchAsked).toBe(true);
  const add = page.locator('form button[type=submit].add');
  if (test.info().project.name.startsWith('phone')) await add.tap(); else await add.click();
  await expect(add).toHaveText('Checking the name…'); // waiting for the search, not armed
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  held.open();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/); // base: the first press armed "Add as typed"
  await expect.poll(() => storedKeys(page)).toEqual([5384999]);
});

test('r84k 3: the room under the field holds its height under a press on Add, so the press is taken', async ({ page }) => {
  // A narrow screen with room to spare: the action bar sits in the page's flow under the form, where words arriving
  // above it move it.
  await page.setViewportSize({ width: 320, height: 1800 });
  const held = gate();
  await page.route(/\/api\/search\?/, (r) => json(r, []));
  // The name service's refusal, in the server's own long words, arrives while the finger is down.
  await page.route(/\/api\/names\?/, async (r) => { await held.shut; await json(r, { error: 'not asked: this site asked this device to wait, because many names were looked up from this address in the last few minutes' }, 429); });
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Copiapoa zzyzx');
  const status = page.locator('.picker .status');
  const add = page.locator('form button[type=submit].add');
  await expect(add).toBeEnabled();
  const before = (await add.boundingBox())!;
  const h0 = (await status.boundingBox())!.height;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down(); // the field is left: its check asks the name service, which is held
  held.open();
  await expect(status).toContainText('The name service was not asked');
  const during = (await add.boundingBox())!;
  expect(Math.round(during.y)).toBe(Math.round(before.y)); // base: Add moved down under the finger
  expect(Math.round((await status.boundingBox())!.height)).toBe(Math.round(h0));
  await page.mouse.up();
  // The press was taken: the name nothing resolved is asked about once (base: the click missed Add, which still says "Add").
  await expect(add).toHaveText('Add as typed');
  // And the room is released: the words that arrived are shown whole.
  await expect.poll(async () => (await status.boundingBox())!.height).toBeGreaterThan(h0);
});

test('r84k 4: a reference row found by an older name says which, as the catalogue\'s row does @phone', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, []));
  await page.route(/\/api\/search\?/, (r) => json(r, [entry({ key: 'k3', slug: 'aloe-humilis', name: 'Aloe humilis', gbif: 2777030, family: 'Asphodelaceae', syn: ['Haworthia fasciata subsp. armata'] })]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Haworthia fasciata');
  await expect(page.locator('.picker [role=option]', { hasText: 'Aloe humilis' })).toContainText('older name: Haworthia fasciata subsp. armata'); // base: "has a species page, under another genus"
});

test('r84k 5: a pasted label with authors, ranks and a field number is offered the reference\'s species', async ({ page }) => {
  await page.route(/\/api\/names\?/, (r) => json(r, []));
  const lesliei = entry({ key: 'k4', slug: 'lithops-lesliei', name: 'Lithops lesliei', gbif: 3084520, family: 'Aizoaceae' });
  await page.route(/\/api\/search\?/, (r) => json(r, [lesliei], 200, { 'x-search-relaxed': encodeURIComponent('Lithops lesliei subsp. lesliei var. lesliei'), 'x-search-left': encodeURIComponent('(N.E.Br.) N.E.Br. C001 Kimberley') }));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Lithops lesliei (N.E.Br.) N.E.Br. subsp. lesliei var. lesliei C001 Kimberley');
  await expect(page.locator('.picker [role=option]', { hasText: 'Lithops lesliei' }).first()).toContainText('species page'); // base: no reference row
});

test('r84k 6: a name that is an older name of a reference page asks once, naming the page @phone', async ({ page }) => {
  // GBIF keeps the old name as a synonym, with a key of its own.
  await page.route(/\/api\/names\?/, (r) => json(r, [{ key: 2777555, canonicalName: 'Aloe aristata', family: 'Asphodelaceae', rank: 'SPECIES', status: 'SYNONYM' }]));
  await page.route(/\/api\/search\?/, (r) => json(r, [entry({ key: 'k5', slug: 'aristaloe-aristata', name: 'Aristaloe aristata', gbif: 2777000, family: 'Asphodelaceae', syn: ['Aloe aristata'] })]));
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill('Aloe aristata');
  await expect(page.locator('.picker [role=option]', { hasText: 'Aristaloe aristata' })).toContainText('older name: Aloe aristata');
  const add = page.locator('form button[type=submit].add');
  if (test.info().project.name.startsWith('phone')) await add.tap(); else await add.click();
  await expect(add).toHaveText('Add as typed'); // base: filed at once under the synonym's key
  const line = page.locator('.picker .status .hint');
  await expect(line).toContainText('An older name of Aristaloe aristata, which has a species page');
  // Picking it from the line files the reference's page.
  await line.getByRole('button', { name: 'Aristaloe aristata' }).click();
  await expect(page.locator('#species-name')).toHaveValue('Aristaloe aristata');
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF 2777000');
  await expect(add).toHaveText('Add');
});

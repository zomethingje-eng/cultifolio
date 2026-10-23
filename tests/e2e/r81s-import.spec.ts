/**
 * Round eighty-one (S; review-w 4): an import's older names. Pasted "Aloe aristata", the review said "ambiguous, another
 * name suggested", offered one "Use it" per line and no way to take the suggestion for every line, and the plants were
 * filed as "Name not in the reference", though the reference holds the name under one species (Aristaloe aristata, to
 * which `/species/aloe-aristata` redirects). Now the line says it is an older name and of which species, one press takes
 * the reference's name on every such line, or on every line of one name, and each plant keeps the sheet's name as
 * received.
 *
 * The fixture corpus holds three species, so the search's answer for the older name is the test's. FAILS on r81base:
 * the review says "ambiguous", and there is neither button.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { allowWrites } from './helpers/pace';

test.use({ serviceWorkers: 'block', locale: 'en-GB' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
async function filed(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; id: string; field: string; value: unknown }>>((res) => { const q = db.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    const by: Record<string, Record<string, unknown>> = {};
    for (const c of all) if (c.kind === 'accession') (by[c.id] ??= { id: c.id })[c.field] = c.value;
    return Object.values(by);
  });
}
const ARISTALOE = { key: 'k7000001', gbif: 7000001, slug: 'aristaloe-aristata', name: 'Aristaloe aristata', family: 'Asphodelaceae', origin: ['Cape Provinces'], syn: ['Aloe aristata'], photos: 0, open: 3, climate: 'ok' };
const KROENLEINIA = { key: 'k7000002', gbif: 7000002, slug: 'kroenleinia-grusonii', name: 'Kroenleinia grusonii', family: 'Cactaceae', origin: ['Mexico Central'], syn: ['Echinocactus grusonii'], photos: 0, open: 3, climate: 'ok' };
async function olderNames(page: Page) {
  await page.route(/\/api\/search\?/, (r: Route) => {
    const q = (new URL(r.request().url()).searchParams.get('q') ?? '').toLowerCase();
    const hits = /aloe aristata|aristaloe/.test(q) ? [ARISTALOE] : /grusonii/.test(q) ? [KROENLEINIA] : null;
    return hits ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-search-total': String(hits.length) }, body: JSON.stringify(hits) }) : r.continue();
  });
}

test('r81s import 1: older names are said as older names, and one press files every such line under the reference\'s name @phone', async ({ page }) => {
  allowWrites(400);
  await olderNames(page);
  await page.goto('/plants/import'); await ready(page);
  await page.fill('#imp-text', 'Aloe aristata\nEchinocactus grusonii\nAloe aristata\nCopiapoa cinerea\nAloe aristata');
  await page.click('#imp-check');
  await page.locator('#imp-review-h').waitFor();
  const summary = page.locator('#imp-summary');
  await expect(summary).toContainText("an older name, the reference's name for it suggested: 4");
  await expect(summary).not.toContainText('ambiguous'); // base: "ambiguous, another name suggested: 4"
  const line1 = page.locator('.rvrow').first();
  await expect(line1).toContainText('an older name: the reference has this species as Aristaloe aristata');
  await expect(line1.getByRole('button', { name: 'Use Aristaloe aristata on all 3 lines of Aloe aristata' })).toBeVisible();
  await page.locator('#imp-use-older').click(); // base: no such button
  await expect(summary).toContainText('Matched in the reference: 5');
  await expect(page.locator('#imp-use-older')).toHaveCount(0);
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const got = await filed(page);
  const aris = got.filter((a) => a.taxonName === 'Aristaloe aristata');
  expect(aris).toHaveLength(3);
  for (const a of aris) expect(a).toMatchObject({ taxonKey: 7000001, nameAsReceived: 'Aloe aristata' });
  expect(got.find((a) => a.taxonName === 'Kroenleinia grusonii')).toMatchObject({ taxonKey: 7000002, nameAsReceived: 'Echinocactus grusonii' });
});

test('r81s import 2: "on all lines of this name" takes one name\'s lines and leaves the others to the grower', async ({ page }) => {
  await olderNames(page);
  await page.goto('/plants/import'); await ready(page);
  await page.fill('#imp-text', 'Aloe aristata\nEchinocactus grusonii\nAloe aristata');
  await page.click('#imp-check');
  await page.locator('#imp-review-h').waitFor();
  await page.getByRole('button', { name: 'Use Aristaloe aristata on all 2 lines of Aloe aristata' }).first().click();
  await expect(page.locator('.rvrow').nth(0).locator('input.nm')).toHaveValue('Aristaloe aristata');
  await expect(page.locator('.rvrow').nth(2).locator('input.nm')).toHaveValue('Aristaloe aristata');
  await expect(page.locator('.rvrow').nth(1).locator('input.nm')).toHaveValue('Echinocactus grusonii');
  await expect(page.locator('#imp-summary')).toContainText("an older name, the reference's name for it suggested: 1");
});

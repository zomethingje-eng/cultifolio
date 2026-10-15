/**
 * Round seventy-one, agent D: the import in the browser (the self-review's D1, D2 and D4). A second Aloe vera bought the
 * same day from the same nursery, its line's Locality left empty, was taken for the plant imported with a locality:
 * "Nothing is left to add", one plant (D1). A sheet that lost its Locality column offered one of its two plants again,
 * without a word (D2). A sheet of short dates written year first was asked day first or month first only, with no year
 * in either answer's words, and read in the wrong year whichever was chosen (D4). Each fails on r71base.
 */
import { test, expect, type Page } from '@playwright/test';
import { openDisclosure } from './helpers/disclosure';
test.use({ locale: 'en-GB' });
test.describe.configure({ timeout: 180_000 });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
async function sheet(page: Page, text: string) {
  await page.goto('/plants/import'); await ready(page);
  await page.locator('#imp-mode-csv').click();
  await openDisclosure(page, '#imp-csv-paste-box');
  await page.fill('#imp-csv-text', text);
  await page.locator('#imp-csv-read').click();
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
}
async function plants(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; id: string; field: string; value: unknown }>>((res) => { const q = db.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    const by: Record<string, Record<string, unknown>> = {};
    for (const c of all) if (c.kind === 'accession') (by[c.id] ??= { id: c.id })[c.field] = c.value;
    return Object.values(by).map((p) => `${p.acc} ${p.taxonName} ${String(p.notes ?? '').replace(/\n/g, ' / ')}`);
  });
}
test('r71d 1 (D1): a new plant without a locality, beside one imported with it, is offered, not taken as already here', async ({ page }) => {
  await sheet(page, 'species,acquired,source,locality\nAloe vera,2024-05-01,Kakteen Haage,Totoral\n');
  await expect(page.locator('#imp-add')).toHaveText('Add 1 plant');
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  // The grower buys a second Aloe vera the same day from the same nursery, with no locality, and adds its line.
  await sheet(page, 'species,acquired,source,locality\nAloe vera,2024-05-01,Kakteen Haage,Totoral\nAloe vera,2024-05-01,Kakteen Haage,\n');
  const words = await page.locator('main').innerText();
  console.log('SECOND RUN:', words.slice(words.indexOf('Check'), words.indexOf('Check') + 600).replace(/\n+/g, ' | '));
  console.log('PLANTS:', await plants(page));
  await expect(page.locator('#imp-add')).toHaveText('Add 1 plant');
});
test('r71d 2 (D2): a sheet that has lost its locality column offers none of its plants again', async ({ page }) => {
  await sheet(page, 'species,acquired,source,locality\nAloe vera,2024-05-01,Kakteen Haage,Totoral\nAloe vera,2024-05-01,Kakteen Haage,\n');
  await expect(page.locator('#imp-add')).toHaveText('Add 2 plants');
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  await sheet(page, 'species,acquired,source\nAloe vera,2024-05-01,Kakteen Haage\nAloe vera,2024-05-01,Kakteen Haage\n');
  const words = await page.locator('main').innerText();
  console.log('SECOND RUN:', words.slice(words.indexOf('Check'), words.indexOf('Check') + 600).replace(/\n+/g, ' | '));
  const add = page.locator('#imp-add');
  if (await add.count()) console.log('ADD BUTTON:', await add.innerText());
  expect(await add.count() ? await add.innerText() : 'none').toBe('Add 0 plants');
});

test('r71d 3 (D4): a sheet of short dates written year first is offered year first, and each answer says its year', async ({ page }) => {
  await page.goto('/plants/import'); await ready(page);
  await page.locator('#imp-mode-csv').click();
  await openDisclosure(page, '#imp-csv-paste-box');
  await page.fill('#imp-csv-text', 'species,acquired\nAloe vera,10-04-15\nAloe ferox,11-06-20\n');
  await page.locator('#imp-csv-read').click();
  const q = page.locator('#imp-dates');
  await expect(q).toContainText('Day first (10 April 2015)');
  await expect(q).toContainText('Month first (4 October 2015)');
  await expect(q.locator('#imp-date-ymd')).toHaveCount(1); // base: no year first
  await expect(q).toContainText('Year first, with two digits (15 April 2010)');
  await q.locator('#imp-date-ymd').check();
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await expect(page.locator('#imp-add')).toHaveText('Add 2 plants');
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const acquired = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown }>>((res) => { const q = db.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    return all.filter((c) => c.kind === 'accession' && c.field === 'acquired').map((c) => c.value).sort();
  });
  expect(acquired).toEqual(['2010-04-15', '2011-06-20']);
});

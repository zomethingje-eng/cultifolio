/**
 * Round seventy-two, reviewer E (triage E1): a sheet of year-first short dates of 2013 on read no date two ways with its
 * year last, so the date question was never put and every date went to the notes. FAILS on r72base: no #imp-dates.
 */
import { test, expect, type Page } from '@playwright/test';
import { openDisclosure } from './helpers/disclosure';
test.use({ locale: 'en-GB' });
test.describe.configure({ timeout: 180_000 });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
test('r72e (dates): a sheet of year-first short dates of recent years is asked, and read year first', async ({ page }) => {
  await page.goto('/plants/import'); await ready(page);
  await page.locator('#imp-mode-csv').click();
  await openDisclosure(page, '#imp-csv-paste-box');
  await page.fill('#imp-csv-text', 'species,acquired\nAloe vera,19-05-23\nAloe ferox,21-08-14\n');
  await page.locator('#imp-csv-read').click();
  const q = page.locator('#imp-dates');
  await expect(q).toContainText('could be written with its two-digit year first or last');
  await expect(q).toContainText('Year first, with two digits (23 May 2019)');
  await q.locator('#imp-date-ymd').check();
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const acquired = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown }>>((res) => { const q = db.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    return all.filter((c) => c.kind === 'accession' && c.field === 'acquired').map((c) => c.value).sort();
  });
  expect(acquired).toEqual(['2019-05-23', '2021-08-14']);
});

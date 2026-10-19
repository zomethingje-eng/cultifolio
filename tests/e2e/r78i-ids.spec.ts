/**
 * Round seventy-eight (I): pages keyed by Kew's plant_name_id. On the fixture corpus (three species with Kew's entries,
 * one without): the API answers a page's id and moves a GBIF key to it; a species page names itself by its id and gives
 * the grower its GBIF key, which is what a plant records; a plant whose key is not the reference's is told the GBIF key,
 * never the page's id; a plant's species is matched on the front page by its GBIF key. Each FAILED on the base, where a
 * page's key was its GBIF key and no id existed.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

test.use({ serviceWorkers: 'block' });
const ready = (p: Page) => p.locator('html[data-ready]').waitFor({ state: 'attached' });

test('/api/dossier answers a page\'s id, and a GBIF key moves to it', async ({ page }) => {
  const byId = await page.request.get('/api/dossier/k2735933');
  expect(byId.status()).toBe(200);
  const d = await byId.json();
  expect([d.v, d.key, d.ids.gbif, d.slug]).toEqual([3, 'k2735933', 5384013, 'copiapoa-cinerea']);
  const byGbif = await page.request.get('/api/dossier/5384013', { maxRedirects: 0 });
  expect(byGbif.status()).toBe(302);
  expect(byGbif.headers()['location']).toBe('/api/dossier/k2735933');
  expect((await (await page.request.get('/api/dossier/5384013')).json()).key).toBe('k2735933');
  // A page Kew's file was not read for keeps its GBIF key as its id.
  expect((await (await page.request.get('/api/dossier/999')).json()).key).toBe('g999');
  expect((await page.request.get('/api/dossier/2735933')).status()).toBe(404); // Kew's number is not a GBIF key
  expect((await page.request.get('/api/dossier/x1')).status()).toBe(400);
});

test('a species page is its id, and gives the grower its GBIF key: the add links, the follow and the plant all carry 5384013', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await expect(page.locator('.note-slot')).toHaveAttribute('data-key', 'k2735933');
  const add = page.getByRole('link', { name: 'Add one to my plants' }).first();
  await expect(add).toHaveAttribute('href', /[?&]key=5384013(&|$)/);
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}');
  expect(JSON.stringify(ld)).toContain('"propertyID":"GBIF","value":"5384013"');
  await add.click();
  await expect(page).toHaveURL(/\/plants\/new\?/);
  await ready(page);
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF 5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  // The plant records the GBIF key, which is the reference's: no notice that they differ.
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#key-differs')).toHaveCount(0);
});

test('a plant under another key is told the reference\'s GBIF key, and takes it with one press; never a page id', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  await inject(page, [['accession', 'r-r78i-a', 'acc', '2026-0078'], ['accession', 'r-r78i-a', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r-r78i-a', 'taxonKey', 777], ['accession', 'r-r78i-a', 'status', 'growing']], Date.now() - 60_000);
  await page.goto('/plants/r-r78i-a');
  const notice = page.locator('#key-differs');
  await expect(notice).toContainText('The reference files Copiapoa cinerea under GBIF key 5384013; this plant records key 777');
  await expect(notice).not.toContainText('k2735933');
  await notice.getByRole('button', { name: "Use the reference's key" }).click();
  await expect(notice).toHaveCount(0);
  const key = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ id: string; field: string; value: unknown }>>((res) => { const r = db.transaction('changes').objectStore('changes').getAll(); r.onsuccess = () => res(r.result); });
    return all.filter((c) => c.id === 'r-r78i-a' && c.field === 'taxonKey').map((c) => c.value);
  });
  expect(key).toEqual([777, 5384013]);
});

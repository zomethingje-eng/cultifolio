/**
 * Round seventy-nine (K): a page without a GBIF key (the owner's decision 1). The fixture Hesperocyparis lusitanica
 * (k457911) was built from Kew's file: GBIF's backbone holds its name only as a synonym, so GBIF's records were not asked.
 * Its page says each thing made from them is not checked, with why; the search finds it by its name and by Kew's older
 * name; a plant of it is filed with no GBIF key and its page says why it has no habitat; a plant that records a GBIF key
 * for it is told that key is compared with no page. FAILED on r79base: the fixture did not exist (the schema required
 * `ids.gbif`), so the page was a 404 and the search found nothing.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

test.use({ serviceWorkers: 'block' });
const ready = (p: Page) => p.locator('html[data-ready]').waitFor({ state: 'attached' });
const WHY = "GBIF's backbone holds no one accepted species of this name";

test('the API answers the page by its Kew id, with no GBIF key and no GBIF link', async ({ page }) => {
  const r = await page.request.get('/api/dossier/k457911');
  expect(r.status()).toBe(200);
  const d = await r.json();
  expect([d.v, d.key, d.slug, d.ids.gbif, d.links.gbif]).toEqual([3, 'k457911', 'hesperocyparis-lusitanica', undefined, undefined]);
  expect(d.upstream['gbif.occurrences'].status).toBe('skipped');
  // Kew's number is not a GBIF key, and GBIF's key for the synonym is no page's.
  expect((await page.request.get('/api/dossier/457911')).status()).toBe(404);
  expect((await page.request.get('/api/dossier/2684069')).status()).toBe(404);
});

test('the species page says GBIF\'s records, the map, the climate and the nearest climates were not checked, and why', async ({ page }) => {
  await page.goto('/species/hesperocyparis-lusitanica');
  await ready(page);
  await expect(page.locator('h1.sci')).toContainText('Hesperocyparis lusitanica');
  await expect(page.locator('.note-slot')).toHaveAttribute('data-key', 'k457911');
  // The pill under the name, its reason on a press.
  const pill = page.locator('.idcard .pills details.nc').first();
  await expect(pill).toContainText('Climate not checked');
  await pill.locator('summary').click();
  await expect(pill).toContainText(WHY);
  await expect(page.locator('#no-gbif-climate')).toContainText(`Not checked. ${WHY}`);
  await expect(page.locator('.mapcap').nth(1)).toContainText(`Records not checked: ${WHY}`);
  await expect(page.locator('.factgrid')).toContainText("GBIF's records not checked");
  await expect(page.locator('.facts')).toContainText('not checked');
  await expect(page.locator('#near-not-checked')).toContainText('Not checked');
  // Kew's range and names stand; the registers are Kew's and Wikidata's, with no GBIF link; the older names are Kew's.
  await expect(page.locator('.factgrid')).toContainText('Mexico Central');
  const links = page.locator('#s-registers ~ .links a');
  await expect(links.filter({ hasText: 'POWO' })).toHaveCount(1);
  await expect(links.filter({ hasText: 'GBIF' })).toHaveCount(0);
  await expect(page.locator('.names').first()).toContainText('(WCVP, RBG Kew)');
  // No word of "pending" anywhere a reader would read it as a build still to come.
  await expect(page.locator('article.species')).not.toContainText('Climate pending');
  // The add link files no GBIF key: there is none.
  await expect(page.getByRole('link', { name: 'Add one to my plants' }).first()).toHaveAttribute('href', '/plants/new?species=Hesperocyparis%20lusitanica');
  const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent()) ?? '{}');
  expect(JSON.stringify(ld)).toContain('"propertyID":"IPNI","value":"60451554-2"');
  expect(JSON.stringify(ld)).not.toContain('"GBIF"');
});

test('the search finds it by its name and by Kew\'s older name, as a page with no GBIF key', async ({ page }) => {
  for (const q of ['Hesperocyparis lusitanica', 'Cupressus lusitanica']) {
    const r = await page.request.get(`/api/search?q=${encodeURIComponent(q)}`);
    expect(r.status()).toBe(200);
    const hits = (await r.json()) as Array<{ key: string; gbif?: number; name: string }>;
    const hit = hits.find((h) => h.key === 'k457911');
    expect(hit, q).toBeTruthy();
    expect(hit!.name).toBe('Hesperocyparis lusitanica');
    expect(hit!.gbif).toBeUndefined();
  }
  // Kew's older name as an address moves to the page, and says whose name it is: Kew's, not GBIF's backbone's.
  await page.goto('/species/cupressus-lusitanica');
  await expect(page).toHaveURL(/\/species\/hesperocyparis-lusitanica\?was=Cupressus%20lusitanica$/);
  await expect(page.locator('#was-synonym')).toHaveText("Cupressus lusitanica is an older name of this species: Kew's World Checklist files it under Hesperocyparis lusitanica, and the reference files it under that name.");
  // On the front page, its tile says the climate was not checked, never pending.
  await page.goto('/');
  await ready(page);
  await page.getByRole('searchbox').first().fill('Hesperocyparis');
  const tile = page.locator('a[href="/species/hesperocyparis-lusitanica"]').first();
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('climate not checked');
  await expect(tile).not.toContainText('pending');
});

test('a plant of it is filed with no GBIF key, and its page says why there is no habitat to compare', async ({ page }) => {
  await page.goto('/species/hesperocyparis-lusitanica');
  await ready(page);
  await page.getByRole('link', { name: 'Add one to my plants' }).first().click();
  await expect(page).toHaveURL(/\/plants\/new\?species=Hesperocyparis%20lusitanica$/);
  await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1.sci')).toContainText('Hesperocyparis lusitanica');
  await expect(page.locator('#key-differs')).toHaveCount(0);
  await expect(page.locator('#key-no-page')).toHaveCount(0);
  const season = page.locator('.card', { hasText: 'Habitat rain season' });
  await expect(season).toContainText('Climate not checked');
  await expect(season).toContainText('No season is read');
  await expect(page.locator('a[href^="/species/hesperocyparis-lusitanica"]').first()).toBeVisible();
  const key = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ id: string; field: string; value: unknown }>>((res) => { const r = db.transaction('changes').objectStore('changes').getAll(); r.onsuccess = () => res(r.result); });
    return all.filter((c) => c.field === 'taxonKey').map((c) => c.value);
  });
  expect(key.every((v) => v == null)).toBe(true);
});

test('a plant that records a GBIF key for it is told the key is compared with no page; in a space, the habitat comparison says why it is not there', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  await inject(page, [
    ['location', 'r79k-b', 'name', 'Bench 79'], ['location', 'r79k-b', 'type', 'bench'],
    ['accession', 'r-r79k-a', 'acc', '2026-0079'], ['accession', 'r-r79k-a', 'taxonName', 'Hesperocyparis lusitanica'], ['accession', 'r-r79k-a', 'taxonKey', 2684069], ['accession', 'r-r79k-a', 'status', 'growing'], ['accession', 'r-r79k-a', 'locationId', 'r79k-b']
  ], Date.now() - 60_000);
  await page.goto('/plants/r-r79k-a');
  const notice = page.locator('#key-no-page');
  await expect(notice).toContainText(`The reference holds Hesperocyparis lusitanica without a GBIF key: ${WHY}`);
  await expect(notice).toContainText('This plant records GBIF key 2684069, which no species page holds');
  await expect(page.locator('#key-differs')).toHaveCount(0);
  await expect(page.locator('#habitat-not-checked')).toContainText(`Habitat against this space: not checked. ${WHY}`);
});

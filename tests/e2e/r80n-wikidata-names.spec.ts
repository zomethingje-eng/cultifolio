/**
 * Round eighty (N): a page without a GBIF key takes its English common names from its Wikidata item (the owner's
 * decision). The fixture Hesperocyparis lusitanica (k457911) holds two names made by the round's rule from statements
 * written for the test (scripts/dev/r80n-fixture-names.ts; the live item held none on 2026-10-21). Its page shows them
 * under the name and says they are Wikidata's, with the item and the day; its record of sources names the row; the
 * search, the API and the front page's tiles find it by them; a page with a GBIF key says nothing of Wikidata's names.
 * FAILED on r80base: the page had no common name, no `#names-source`, and "mexican cypress" found nothing.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
const ready = (p: Page) => p.locator('html[data-ready]').waitFor({ state: 'attached' });

test('the page shows its names from Wikidata and says whose they are, with the item and the day', async ({ page }) => {
  await page.goto('/species/hesperocyparis-lusitanica');
  await ready(page);
  await expect(page.locator('.idcard p.vern').first()).toHaveText('Mexican cypress; Cedar of Goa');
  const line = page.locator('#names-source');
  await expect(line).toHaveText('English names from Wikidata, item Q50843040, read 2026-10-21 (CC0).');
  await expect(line.locator('a')).toHaveAttribute('href', 'https://www.wikidata.org/wiki/Q50843040');
  // GBIF's names are still not asked, and the record of sources says both.
  const html = await page.content();
  expect(html).toContain('Wikidata common names');
  expect(html).toContain('wikidata.names');
  expect(html).toContain('GBIF common names');
});

test('the search and the API find it by its new names, as they find a page by GBIF\'s', async ({ page }) => {
  for (const [q, common] of [['mexican cypress', 'Mexican cypress'], ['Cedar of Goa', 'Mexican cypress']]) {
    const r = await page.request.get(`/api/search?q=${encodeURIComponent(q)}`);
    expect(r.status()).toBe(200);
    const hits = (await r.json()) as Array<{ key: string; gbif?: number; common?: string }>;
    expect(hits[0]?.key, q).toBe('k457911');
    expect(hits[0]?.common).toBe(common);
    expect(hits[0]?.gbif).toBeUndefined();
  }
  const d = await (await page.request.get('/api/dossier/k457911')).json();
  expect(d.name.vernacular.map((v: { name: string; source: string }) => `${v.name} (${v.source})`)).toEqual(['Cedar of Goa (Wikidata)', 'Mexican cypress (Wikidata)']);
  expect(d.upstream['wikidata.names'].status).toBe('ok');
  // The front page's search: its tile carries the name.
  await page.goto('/');
  await ready(page);
  await page.getByRole('searchbox').first().fill('Mexican cypress');
  const tile = page.locator('a[href="/species/hesperocyparis-lusitanica"]').first();
  await expect(tile).toBeVisible();
  await expect(tile).toContainText('Mexican cypress');
});

test('a page with a GBIF key says nothing of Wikidata\'s names', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#names-source')).toHaveCount(0);
});

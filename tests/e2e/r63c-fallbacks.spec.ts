/**
 * Round sixty-three, agent C: a dossier and an index built before this round read as they did. The fixture corpus was
 * built before the year's rain median, the substance stamp, the index's photo credits and the builder's full clauses,
 * so every surface must show the old, still true, words: the rain under "sum of monthly medians", the tile's host, the
 * refusal's bare form given its article and time, and the sitemap's fallback (unit tests in tests/unit/r63c-* cover the
 * new forms).
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r63c-fallbacks.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

test('a species page from a dossier with no median keeps "sum of monthly medians" on the card and in the preview', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await expect(page.locator('.glance .card .lab', { hasText: /^Rain a year \(sum of monthly medians\)$/ })).toHaveCount(1);
  await expect(page.locator('.glance .card .lab', { hasText: /median across the range/ })).toHaveCount(0);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /of rain a year \(sum of monthly medians, CHELSA\)/);
});

test('compare: two dossiers with no median compare their monthly medians added, under that name', async ({ page }) => {
  await page.goto('/compare?s=copiapoa-cinerea,copiapoa-humilis');
  await ready(page);
  await expect(page.locator('[role="rowheader"]', { hasText: /^Rain a year \(sum of monthly medians\)/ })).toHaveCount(1);
});

test("a dossier built before the full clauses still reads its refusal as one, with its article and its time", async ({ page }) => {
  await page.goto('/species/refusia-testii');
  await ready(page);
  await expect(page.locator('.notice', { hasText: 'Occurrence source' }).first()).toContainText('The occurrence source refused the request when this page was built.');
  await expect(page.locator('body')).not.toContainText('when this page was built when this page was built');
});

test("the sitemap's species pages carry no date the fixture does not have, and the fixed pages none", async ({ request }) => {
  const r = await request.get('/sitemap-1.xml');
  expect(r.status()).toBe(200);
  const xml = await r.text();
  expect(xml).toContain('<loc>http');
  expect(xml).toMatch(/<url><loc>https:\/\/cultifolio\.com\/<\/loc><\/url>/);
  expect(xml).toMatch(/<loc>https:\/\/cultifolio\.com\/species\/copiapoa-cinerea<\/loc>/);
});

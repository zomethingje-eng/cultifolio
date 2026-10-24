/**
 * Round seventy-eight, agent B: a species page's literature and summary under the build's new sources.
 *
 *   - A page built since literature was set aside (the fixture Copiapoa humilis carries the record the builder now
 *     writes) says "Not checked." under Papers, with why in one sentence, and never reads as having no papers. FAILED on
 *     r78base: the page said "Not asked. OpenAlex was not asked when this page was built."
 *   - A dossier built before keeps what it holds until it is built again: Welwitschia's paper is listed (guard).
 *   - The summary is quoted and credited as before, with its licence and the article's address (guard: the batched
 *     source writes the same fields).
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

// Round eighty-two (the independent review's 23): no Papers section or tab while papers are not asked; the record of
// sources says it (r82u-pages.spec.ts 2). On r78base the page said "Not asked. OpenAlex was not asked when this page was built."
test('r78b: a page built now has no Papers section, and its record says the papers are not checked, and why @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-humilis');
  await ready(page);
  await expect(page.locator('#s-research')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('OpenAlex was not asked');
  await expect(page.locator('a[href="#s-research"]')).toHaveCount(0);
  // The record says it, beside "not asked", never "nothing to report".
  await page.locator('details.prov summary').click();
  const row = page.locator('details.prov .row', { hasText: 'OpenAlex papers' });
  await expect(row).toContainText('not asked');
  await expect(row).toContainText("not yet asked for this reference; a later fill takes the papers from OpenAlex's snapshot");
  await expect(row).not.toContainText('nothing to report');
});

test('r78b: a page built before keeps its papers, and its summary is quoted and credited as before @phone', async ({ page }) => {
  await page.goto('/species/welwitschia-mirabilis');
  await ready(page);
  await expect(page.locator('#s-research')).toHaveText('Papers naming this species');
  await expect(page.locator('.paper a').first()).toHaveText('The biology of Welwitschia mirabilis (fixture)');
  await expect(page.locator('main')).not.toContainText('Papers are not yet asked');
  await expect(page.locator('#s-summary')).toHaveText('Summary');
  const credit = page.locator('#s-summary ~ p.small.muted').first();
  await expect(credit).toContainText('Quoted from');
  await expect(credit.locator('a')).toHaveAttribute('href', 'https://en.wikipedia.org/wiki/Welwitschia');
  await expect(credit).toContainText('CC BY-SA 4.0');
});

test('r78b: a cultivated photograph is marked as grown in cultivation, as the page words it (guard) @phone', async ({ page }) => {
  // The cultivated set's rule changed in round seventy-eight (observations marked captive whose identifications agree);
  // the page shows them as it showed the set before: a "cultivated" mark on the thumbnail, "in cultivation" in its credit.
  await page.goto('/species/welwitschia-mirabilis');
  await ready(page);
  const all = page.locator('#s-photos ~ p.credits button', { hasText: 'Show all' });
  if (await all.count()) await all.click();
  const cult = page.locator('#s-photos ~ .grid a.ph:has(.tag)').first();
  await expect(cult.locator('.tag')).toHaveText('cultivated');
  await expect(cult).toHaveAttribute('title', /· in cultivation$/);
  await expect(cult).toHaveAttribute('aria-label', /, in cultivation: photograph/);
});

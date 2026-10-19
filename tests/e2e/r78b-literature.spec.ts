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

test('r78b: a page built now says its papers are not checked, and why, in one sentence @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-humilis');
  await ready(page);
  const papers = page.locator('#s-research');
  await expect(papers).toHaveText('Papers naming this species');
  const notice = page.locator('#s-research + .notice');
  await expect(notice).toHaveText("Not checked. Papers are not yet asked for this reference; a later fill takes them from OpenAlex's free snapshot.");
  await expect(page.locator('main')).not.toContainText('OpenAlex was not asked');
  // The page's tab to the section is there, so a reader finds the sentence, not a silence.
  await expect(page.locator('a[href="#s-research"]')).toHaveCount(1);
  // The record says the same, beside "not asked", never "nothing to report".
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

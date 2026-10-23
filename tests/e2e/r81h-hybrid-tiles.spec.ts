/**
 * Round eighty-one, H (review-w 10 of round eighty): a real backup of 300 plants made on the live site by the round-eighty
 * app (review W's import of 2026-10-23), restored here through the backup page, and the "You grow" tiles it gives.
 *
 * On r81base the plant "Aloe × nobilis" showed as "Aloe nobilis · not in the reference", and the plant filed under its
 * genus ("Echeveria 'Perle von Nurnberg'") as "Echeveria · not in the reference". Now the hybrid keeps its sign (the
 * reference here, the fixture corpus, holds no Aloe, so "not in the reference" is true of it), and the genus is a genus
 * tile whose link, `/species/echeveria`, the species route answers with the genus's row (or, where the reference holds
 * none of it, a page that says so).
 *
 * The merge (M) made its wait hold in WebKit as smoke-3's restore of 400 plants does: the restore's 5,486 changes are about
 * 16,500 IndexedDB requests, about five and a half minutes at Safari's engine's pace on the owner's PC (helpers/pace.ts),
 * so the test's time grows by twice that there, and the wait follows the database's own progress (`watchStorage`, which
 * `whileStoring` reads: without it the count never moved and the wait gave up after its first five seconds).
 */
import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { watchStorage, whileStoring } from './helpers/progress';
import { allowWrites, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

test.use({ serviceWorkers: 'block' });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

test('r81h tiles 1: the real round-eighty backup restores, and its hybrid and genus tiles say what they are', async ({ page }) => {
  test.setTimeout(180_000);
  allowWrites(2 * 16_500 * WEBKIT_MS_PER_REQUEST);
  await watchStorage(page);
  await page.goto('/backup');
  await ready(page);
  const buffer = readFileSync('tests/unit/fixtures/r81h-backup-r80-300.cultifolio.zip');
  await page.locator('#bk-file').setInputFiles({ name: 'cultifolio-2026-10-23.cultifolio.zip', mimeType: 'application/zip', buffer });
  await expect(page.locator('.preview')).toContainText('300 plants', { timeout: 60_000 });
  await page.click('#bk-merge');
  await whileStoring(page, (timeout) => expect(page.locator('#bk-done')).toContainText('300 plants', { timeout }), 45_000);

  await page.goto('/');
  await ready(page);
  const grow = page.locator('.hgrid.mine').first();
  await expect(grow.locator('a.tile')).toHaveCount(43, { timeout: 30_000 });
  const aloe = grow.locator('a.tile[href="/species/aloe-nobilis"]');
  await expect(aloe.locator('.nm')).toHaveText('Aloe × nobilis');
  await expect(aloe).toContainText('not in the reference', { timeout: 30_000 });
  const genus = grow.locator('a.tile[href="/species/echeveria"]');
  await expect(genus.locator('.nm')).toHaveText('Echeveria');
  await expect(genus).toContainText('genus: its row of the catalogue');
  await expect(genus).not.toContainText('not in the reference');
});

/**
 * Round ninety-two in the browser: a species page whose flowering is counted from GBIF's download of iNaturalist's
 * research-grade observations (the fixture's Welwitschia mirabilis) cites the download as GBIF asks, GBIF.org, the day
 * GBIF made it and its DOI as the link, and says what was counted: research grade, openly licensed, under the page's
 * GBIF keys. A page still on iNaturalist's API count (Copiapoa cinerea) keeps its own line, its day and its link to
 * iNaturalist's search, so neither form is mistaken for the other.
 *
 * On 0509684 (before this round): FAILED. The fixture held no download's count, and the section read only the API's form
 * (a page with no iNaturalist taxon said "Not asked: this page has no iNaturalist taxon to ask").
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });

test('r92a 1: a page counted from the download cites GBIF.org, its day and its DOI, and says what it counted @phone', async ({ page }) => {
  await page.goto('/species/welwitschia-mirabilis'); await ready(page);
  const src = page.locator('section#flowering #flowering-source');
  await expect(src).toHaveAttribute('data-source', 'gbif');
  await expect(src).toContainText("Flowering observations of wild plants on iNaturalist, as iNaturalist shares them with GBIF: GBIF.org (2026-11-15) GBIF Occurrence Download");
  await expect(src.locator('a')).toHaveAttribute('href', 'https://doi.org/10.15468/dl.fx92wm');
  await expect(src.locator('a')).toHaveText('https://doi.org/10.15468/dl.fx92wm');
  await expect(src).toContainText("20 observations, research grade, openly licensed (CC0, CC BY or CC BY-NC), counted under the page's GBIF keys.");
  await expect(src).not.toContainText('read 2026');
  await expect(page.locator('section#flowering ol.months li')).toHaveCount(12);
  await expect(page.locator('section#flowering ol.months li').first()).toContainText('3');
});

test('r92a 2: a page still on the API count keeps the API line and its link to iNaturalist', async ({ page }) => {
  await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => r.abort());
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const src = page.locator('section#flowering #flowering-source');
  await expect(src).toHaveAttribute('data-source', 'api');
  await expect(src).toContainText('Flowering observations of wild plants, iNaturalist, read 2026-11-09');
  await expect(src.locator('a')).toHaveAttribute('href', /^https:\/\/www\.inaturalist\.org\/observations\?taxon_id=135254&/);
  await expect(src).not.toContainText('GBIF');
});

/**
 * Round 128 (SPECIES 20, the lens's Another species; docs/REVIEW-ROUND-128.md), on Copiapoa cinerea's page:
 *
 * - "Another species" searches with the catalogue's own answers, reads the species picked from its page's JSON, draws
 *   its medians dashed and says the four lines, each with two figures, and links "The full comparison" to /compare.
 * - A species in the other hemisphere is moved six months, and the card says so.
 * - A species whose page holds no habitat climate is said as such, and nothing is compared.
 *
 * The test corpus holds one climate (Copiapoa's), so the other species' search answer and JSON are the page data of
 * Fenestraria rhopalophylla (tests/unit/fixtures/r128a-k2808089.json), served as the site serves them.
 *
 * On 9176178: FAILED, every test (no "Another species" in the row).
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const FE = JSON.parse(readFileSync('tests/unit/fixtures/r128a-k2808089.json', 'utf8'));
const FORBIDDEN = /\b(will|should|needs?|wants?|tolerates?|survive|die|safe)\b/i;

async function serveOther(page: Page, lat: number) {
  const hit = { key: 'k2808089', slug: 'fenestraria-rhopalophylla', name: 'Fenestraria rhopalophylla', photos: 0, open: 0, climate: '' };
  await page.route('**/api/search?**', (r) => (new URL(r.request().url()).searchParams.get('q')?.toLowerCase().startsWith('fen') ? r.fulfill({ json: [hit] }) : r.continue()));
  await page.route('**/api/dossier/k2808089*', (r) => r.fulfill({ json: { ...FE, climate: { ...FE.climate, at: { ...FE.climate.at, lat } } } }));
}
async function pick(page: Page, q: string, name: string) {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('#lens-row').getByRole('button', { name: 'Another species' }).click();
  await page.fill('#lens-sp-q', q);
  await page.locator('#lens-sp-hits').getByRole('button', { name, exact: true }).click();
}

test('r128b 1: a species picked from the search: its four lines, two figures each, and the full comparison @phone', async ({ page }) => {
  await serveOther(page, FE.climate.at.lat);
  await pick(page, 'fenes', 'Fenestraria rhopalophylla');
  await expect(page.locator('#lens-sp-nights')).toContainText('for Fenestraria rhopalophylla;');
  await expect(page.locator('#lens-sp-nights')).toContainText('for Copiapoa cinerea.');
  await expect(page.locator('#lens-sp-rain')).toContainText('Rain a year: 56 mm for Fenestraria rhopalophylla;');
  await expect(page.locator('#lens-sp-days')).toContainText("The warmest month's average day:");
  await expect(page.locator('#lens-sp-shift')).toHaveCount(0); // both south of the equator: no month moved
  await expect(page.locator('#lens-sp-full')).toHaveAttribute('href', '/compare?s=copiapoa-cinerea,fenestraria-rhopalophylla');
  for (const t of await page.locator('#lens-card p[id^=lens-sp-]').allTextContents()) expect(t).not.toMatch(FORBIDDEN);
  expect(await page.locator('#year-panel svg path.sitew').count()).toBeGreaterThan(0); // its medians drawn dashed
});

test('r128b 2: a species in the other hemisphere is moved six months, and the card says so', async ({ page }) => {
  await serveOther(page, 28.5);
  await pick(page, 'fenes', 'Fenestraria rhopalophylla');
  await expect(page.locator('#lens-sp-shift')).toContainText('its months are moved six');
});

test('r128b 3: a species whose page holds no habitat climate is said so, and nothing is compared', async ({ page }) => {
  await pick(page, 'welwitschia', 'Welwitschia mirabilis');
  await expect(page.locator('#lens-card')).toContainText('Its page holds no habitat climate, so nothing is compared.');
  await expect(page.locator('#lens-sp-nights')).toHaveCount(0);
});

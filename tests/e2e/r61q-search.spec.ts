/**
 * Round sixty-one, decision 7 (the corpus review, 5 and 1): the species picker offers no retried answer as a match, and a
 * species picked for a name typed below species rank keeps the typed rank and epithet; the front page's search reads a
 * title-case common name whole.
 */
import { test, expect } from '@playwright/test';

test('the picker offers no retried species for a variety, and a picked species keeps the typed rank and epithet', async ({ page }) => {
  await page.goto('/plants/new');
  const input = page.locator('#species-name');
  // The reference files the variety under its species, so its search answers only by the retry: not offered as a match.
  const searched = page.waitForResponse((r) => r.url().includes('/api/search') && r.url().includes('columna'));
  await input.fill('Copiapoa cinerea var. columna-alba');
  const r = await searched;
  expect(r.headers()['x-search-relaxed']).toBeTruthy(); // the server did retry: the picker is what must not offer it
  await expect(page.locator('.picker [role=option]', { hasText: 'has a species page' })).toHaveCount(0); // base: one, "Copiapoa cinerea"
  // A direct hit for a name with a rank: picking the species keeps "var. c" (base: the field became "Copiapoa cinerea").
  await input.fill('Copiapoa cinerea var. c');
  const opt = page.locator('.picker [role=option]', { hasText: 'has a species page' }).first();
  await expect(opt).toBeVisible();
  await opt.click();
  await expect(input).toHaveValue('Copiapoa cinerea var. c');
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF');
});

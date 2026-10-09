/**
 * Round sixty-one, decision 7 (the corpus review, 5 and 1): the species picker offers no retried answer as a match, and a
 * species picked for a name typed below species rank keeps the typed rank and epithet. Changed in round sixty-two
 * (decision 3): the picker asks about the species part only, and files a key only for the name picked itself.
 */
import { test, expect } from '@playwright/test';

test('the picker offers no retried species for a variety, and a picked species keeps the typed rank and epithet', async ({ page }) => {
  // Changed in round sixty-two (decision 3; the corpus review, 2 and 3; B3): the picker asks about the species part only,
  // so the variety's species is a direct hit, offered as the species compared, filed with no key; and the typed rest is
  // kept only when it is a rank with a complete epithet ("var. c" is not one).
  await page.route(/\/api\/names\?/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/plants/new');
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  const input = page.locator('#species-name');
  // Changed again in round sixty-two's second pass (the verification review's search 6; the grower review, 9): the
  // catalogue is sent the text whole, and its retry on the genus and epithet is offered as the variety's species.
  const searched = page.waitForResponse((r) => r.url().includes('/api/search') && new URL(r.url()).searchParams.get('q') === 'Copiapoa cinerea var. columna-alba');
  await input.fill('Copiapoa cinerea var. columna-alba');
  const r = await searched;
  expect(decodeURIComponent(r.headers()['x-search-relaxed'] ?? '')).toBe('Copiapoa cinerea'); // the retry, said
  await expect(page.locator('.picker [role=option]', { hasText: 'has a species page' })).toHaveCount(0);
  const cmp = page.locator('.picker [role=option]', { hasText: 'its species is in the reference; no key filed' }).first();
  await expect(cmp).toBeVisible();
  await cmp.click();
  await expect(input).toHaveValue('Copiapoa cinerea var. columna-alba');
  await expect(page.locator('.picker .pill.ok')).toHaveCount(0);
  await input.fill('Copiapoa cinerea var. c');
  const opt = page.locator('.picker [role=option]', { hasText: 'has a species page' }).first();
  await expect(opt).toBeVisible();
  await opt.click();
  await expect(input).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF');
});

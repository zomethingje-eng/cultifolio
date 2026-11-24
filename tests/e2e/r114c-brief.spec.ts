/**
 * Round 114 (SPECIES 18 d): "Habitat in brief" in the HTML the server sends, without any script; a real heading in the
 * page's outline; the title and description from the same figures; and none on a page without a habitat climate.
 *
 * On 1764df3 there is no paragraph and the title has no "hardiness zone" or "minimum temperature": every test FAILED.
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test('r114c 1: a request without script gets the label and the paragraph in the HTML, and the title says what the page holds', async ({ request }) => {
  const r = await request.get('/species/copiapoa-cinerea');
  expect(r.status()).toBe(200);
  const html = await r.text();
  expect(html).toContain('<h2 id="brief-h" class="brief-h');
  expect(html).toMatch(/Habitat in brief<\/h2>/);
  expect(html).toMatch(/In habitat, (<!--[^>]*-->)*<i[^>]*>Copiapoa cinerea<\/i>/); // the server's markers between runs
  expect(html).toMatch(/1 night in 100 is colder at a typical spot/);
  expect(html).toMatch(/<title>Copiapoa cinerea[^<]*: hardiness zone, minimum temperature, habitat climate · Cultifolio<\/title>/);
  expect(html).toMatch(/<meta name="description" content="Copiapoa cinerea in habitat: nights rarely below /);
  expect(html).toMatch(/"description":"In habitat, Copiapoa cinerea /); // the Taxon block, as plain text
});

test('r114c 2: the label is a heading in the outline, the figures bold, the sources on the line under it @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Habitat in brief' })).toBeVisible();
  const b = page.locator('section.brief');
  await expect(b.locator('.brieftext b').first()).toHaveCSS('font-weight', '600');
  await expect(b.locator('.briefsrc')).toContainText('NASA POWER');
  await expect(b.locator('.brieftext')).not.toContainText(/hardy to|tolerates|survives|needs/);
});

test('r114c 3: a page without a habitat climate has no label and no paragraph, and its title as before', async ({ page }) => {
  await page.goto('/species/welwitschia-mirabilis'); // the fixture set's page with its climate pending
  await ready(page);
  await expect(page.locator('section.brief')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Habitat in brief' })).toHaveCount(0);
  await expect(page).not.toHaveTitle(/hardiness zone|minimum temperature/);
});

/**
 * Round seventy, triage-69 C5 (S-C14), the species page: the photo strip under the name card (72-pixel boxes) and the
 * Related tiles (132 pixels) load the photograph's small size (`photoAt(…, 'small')`), as the front page's tiles do,
 * not the 500-pixel tile. FAILED on the base: both loaded `medium.jpg`.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

test('r70n C5: the strip and the Related tiles load the small size', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const strip = await page.locator('.thumbstrip img').evaluateAll((xs) => xs.map((x) => x.getAttribute('src') ?? ''));
  expect(strip.length).toBeGreaterThan(0);
  for (const src of strip) expect(src).toMatch(/\/small\.jpe?g$/);
  await page.goto('/species/copiapoa-humilis'); await ready(page);
  const related = await page.locator('.reltile img').evaluateAll((xs) => xs.map((x) => x.getAttribute('src') ?? ''));
  expect(related.length).toBeGreaterThan(0);
  for (const src of related) expect(src).toMatch(/\/small\.jpe?g$/);
});

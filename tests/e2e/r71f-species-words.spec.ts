/**
 * Round seventy-one, agent F (REVIEW-TRIAGE-70, S-F7): the line under a species' name says the group as the archetype
 * table's listing, with a way to the section that explains it, never as what the plant is. FAILED on r71base: the line
 * read "Cactaceae · … · cactus or succulent".
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

test('r71f S-F7: the group under the name is "listed by its genus as a cactus or succulent", linked to Cultivation', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const chip = page.locator('#group-chip');
  await expect(chip).toHaveText('listed by its genus as a cactus or succulent');
  await expect(chip).toHaveAttribute('href', '#s-cultivation');
  await expect(page.locator('p.vern.meta')).not.toContainText(/· cactus or succulent$/);
});

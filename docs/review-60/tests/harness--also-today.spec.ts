import { test, expect, type Page } from '@playwright/test';

/**
 * Harness review of round sixty: "Also today" is hidden by two CSS rules in src/routes/today/+page.svelte. The first hides
 * it when nothing but its heading is inside (right). The second, `:global(#rest:not(:has(.today))) { display: none; }`,
 * hides the whole section whenever the Today component draws no line, which also hides the Firsts list and the watering
 * calendar under it. A grower whose plants are all watered and who has hidden the backup reminder ("Hide") sees no
 * "First flowers" line and no calendar download.
 *
 * The round's own e2e test of Firsts (r60-grow.spec.ts, "r60 7") reads `#firsts` with toContainText, which passes on an
 * element that is display:none, so it cannot see this.
 *
 * FAILS on round-sixty code (a reproduction). Run against a server with the four-species fixture:
 *   npx playwright test -c <config> harness--also-today.spec.ts
 */
async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  await request.get('/', { timeout: 110_000 });
});

test('harness: a first flowering stays visible on Today when Today itself has no line to draw', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.locator('.quickbar .more').click();
  await page.locator('.quickbar').getByRole('button', { name: 'Flower', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Flowered' })).toHaveCount(1);
  await page.goto('/today');
  await ready(page);
  await expect(page.locator('#firsts')).toContainText('First flowers on'); // what the round's own test checks: passes hidden or not
  // Hide whatever line Today itself draws (the backup reminder has a Hide button), so the Today component draws nothing.
  for (let i = 0; i < 5; i++) {
    const hide = page.locator('.today button', { hasText: 'Hide' });
    if (!(await hide.count())) break;
    await hide.first().click();
  }
  await expect(page.locator('.today')).toHaveCount(0);
  await expect(page.locator('#firsts')).toBeVisible(); // FAILS: the section is display:none
  await expect(page.locator('#rest-h')).toBeVisible();
});

/**
 * Round 129 (SPECIES 20, "At home, aim for" goes; docs/REVIEW-ROUND-129.md): the species page has no "At home, aim for"
 * section; its four figures are where they are read with the rest (the Cold, Heat and Air answers, the panel's table rows,
 * Under lights' last row); the address #at-home lands on the year panel; the "At home" tab takes the reader to the
 * cultivation cards.
 *
 * On 9176178: FAILED (the section was there, #at-home its heading).
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });

test('r129b 1: no "At home, aim for"; #at-home lands on the year panel; its grow light is Under lights\' last row @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea#at-home'); await ready(page);
  await expect(page.getByRole('heading', { name: /At home, aim for/ })).toHaveCount(0);
  await expect(page.locator('#year-panel #at-home')).toHaveCount(1);
  await expect(page.locator('#year-panel h3#yp-h')).toBeInViewport();
  await page.locator('#lens-row').getByRole('button', { name: 'Under lights' }).click();
  await expect(page.locator('#lamp-table tbody tr').last()).toContainText("The year's mean");
});

/**
 * Self-review of round sixty-one, corpus area. REPRODUCTION: FAILS on f4ab4f8 (both tests).
 * 1. The species picker lower-cases the name before it asks /api/search (SpeciesPicker.svelte, `needle`), so the round's
 *    author rule, which reads capitals, never applies there: "Copiapoa cinerea Britton & Rose" (as POWO and Kew print it)
 *    is answered only by the retry, and the picker, which no longer offers a retried answer, offers nothing from the
 *    reference. The front page's search answers the same text directly.
 * 2. Picking the species for "Copiapoa cinerea var" writes "Copiapoa cinerea var" into the field.
 * Run against a built server: npx playwright test tests/e2e/corpus--picker-author.spec.ts
 */
import { test, expect } from '@playwright/test';

test('the picker offers the species for a name pasted with its author', async ({ page }) => {
  await page.goto('/plants/new');
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  await page.locator('#species-name').fill('Copiapoa cinerea Britton & Rose');
  await expect(page.locator('.picker [role=option]', { hasText: 'has a species page' }).first()).toBeVisible(); // f4ab4f8: no option
});

test('a half-typed rank is not written into the name by a pick', async ({ page }) => {
  await page.goto('/plants/new');
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  const input = page.locator('#species-name');
  await input.fill('Copiapoa cinerea var');
  const opt = page.locator('.picker [role=option]', { hasText: 'has a species page' }).first();
  await expect(opt).toBeVisible();
  await opt.click();
  await expect(input).toHaveValue('Copiapoa cinerea'); // f4ab4f8: "Copiapoa cinerea var"
});

/**
 * Grower review of round sixty: the labels page.
 *
 * STATUS: both tests FAIL on 21257b7 (reproductions).
 *  1. The sheet and options a grower picks are forgotten on the next load: the page's $effect writes the defaults to
 *     localStorage before onMount (which awaits collection.load()) reads them back.
 *  2. In print, body keeps its 16 px side padding, so the sheet is 16 px wider than the paper and every browser's
 *     default "fit to page" shrinks it to about 98%: on Avery 5167 (20 rows of 12.7 mm) row 20's text starts 1 mm inside
 *     row 19's label (measured from page.pdf at 300 dpi).
 * Run (copied to tests/e2e/, server on 4173): PW_REUSE=1 npx playwright test tests/e2e/grower--labels.spec.ts
 */
import { test, expect } from '@playwright/test';

test.use({ locale: 'en-GB' });

test('the label sheet a grower picks is still picked on the next visit', async ({ page }) => {
  await page.goto('/labels');
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  const sheet = page.locator('select').first();
  await expect(sheet).toHaveValue('L7160'); // A4 for en-GB (round sixty)
  await sheet.selectOption('5167');
  await page.waitForTimeout(300);
  await page.reload();
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  await page.waitForTimeout(1500);
  await expect(page.locator('select').first()).toHaveValue('5167'); // today: back to L7160
});

test('the printed sheet is exactly the paper width, so nothing is shrunk to fit', async ({ page }) => {
  await page.goto('/labels');
  await page.locator('html[data-ready]').waitFor({ state: 'attached' });
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
  const r = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, left: document.querySelector('.page')!.getBoundingClientRect().left }));
  expect(r.left).toBe(0); // today: 16 (body padding-inline)
  expect(r.scrollW).toBeLessThanOrEqual(794); // today: 810, so the print is scaled 794/810
});

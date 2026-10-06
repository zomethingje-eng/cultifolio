import { test, expect, type Page } from '@playwright/test';

/**
 * Harness review of round sixty: the e2e suites hard-code the year. r60-grow.spec.ts "r60 1" and "r60 3", and smoke.spec.ts
 * (e.g. lines 650, 1990, 2028-2032, 2090-2093, 2157-2161, 2610, 2624, 2654, 2665, 2933) expect plants added today to be
 * numbered 2026-NNNN; the numbers follow the year the plant was acquired, which is today's. From 1 January 2027 they fail.
 * This is "r60 1" verbatim, with the browser's clock set to 2 January 2027.
 * FAILS on round-sixty code (a reproduction of the time bomb, not of an app bug). The fix is in the tests: read the year
 * from the browser (`localDay(0).slice(0, 4)`, as "r60 8" already does) or install a fixed clock (`page.clock.install`).
 */
async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
test('harness: r60 1 on 2 January 2027', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-01-02T10:00:00') });
  await page.goto('/plants/import');
  await ready(page);
  await page.fill('#imp-text', 'Copiapoa cinerea\nCopiapoa cinera; ; ; club sale\nNotagenus fakeus; ; 2026-0001; ; a note\nCopiapoa humilis; ; 2026-0001');
  await page.click('#imp-check');
  await expect(page.locator('#imp-summary')).toContainText('Matched in the reference: 2');
  await expect(page.locator('#imp-renumbered')).toContainText('2026-0001 → 2026-0004'); // FAILS: 2026-0001 → 2027-0001
});

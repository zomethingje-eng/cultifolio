import { test, expect, type Page } from '@playwright/test';

/**
 * The e2e suites past New Year (round sixty-one; docs/review-60/harness.md 2, adopted from
 * docs/review-60/tests/harness--year.spec.ts and inverted). Round sixty's tests wrote 2026 for the number of a plant added
 * today; the numbers follow the year the plant was acquired, which is today's, so from 1 January 2027 they failed. The
 * suites now read the year from the machine's calendar. This runs "r60 1" with the browser's clock on 2 January 2027 and
 * the year read from the browser's own calendar (its clock is the one moved here), so the numbering the tests rely on is
 * shown to follow the year, not 2026.
 */
async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
test('r61h year: "r60 1" on 2 January 2027 numbers the plants 2027-NNNN', async ({ page }) => {
  await page.clock.install({ time: new Date('2027-01-02T10:00:00') });
  await page.goto('/plants/import');
  await ready(page);
  const y = await page.evaluate(() => String(new Date().getFullYear()));
  expect(y).toBe('2027');
  await page.fill('#imp-text', `Copiapoa cinerea\nCopiapoa cinera; ; ; club sale\nNotagenus fakeus; ; ${y}-0001; ; a note\nCopiapoa humilis; ; ${y}-0001`);
  await page.click('#imp-check');
  // The first page of a new device: in Safari's engine the name checks were "still checking" past 5 s, most likely queued
  // behind the installing service worker's fetches (round sixty-five; the all-engines rerun). A check ends by 10 s either way.
  await expect(page.locator('#imp-summary')).not.toContainText('still checking', { timeout: 15_000 });
  await expect(page.locator('#imp-summary')).toContainText('Matched in the reference: 2');
  await expect(page.locator("#imp-dupes")).toContainText(`${y}-0001 → ${y}-0004`); // a number given twice in the sheet is said as that (round sixty-one, agent G)
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText(`4 plants added, numbered ${y}-0001 to ${y}-0004`);
});

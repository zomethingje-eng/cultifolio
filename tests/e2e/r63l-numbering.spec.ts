import { test, expect, type Page } from '@playwright/test';

/**
 * Round sixty-three (agent L), L3 in the browser: a line the import renumbers follows the sheet's own numbering, and the
 * review says which numbering it follows; "Newest first" orders numbers as numbers; a search that is a plant's whole
 * number lists that plant first (the round-sixty grower review, finding 10).
 */
async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
const year = () => String(new Date().getFullYear());

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  await request.get('/', { timeout: 110_000 });
});

test('r63l numbering: renumbered lines follow the sheet, the list orders numbers as numbers, a whole number is found first', async ({ page }) => {
  const y = year();
  await page.goto('/plants/import');
  await ready(page);
  await page.fill('#imp-text', 'Copiapoa cinerea; ; 0001\nCopiapoa humilis; ; 0002\nLithops lesliei; ; 0002');
  await page.click('#imp-check');
  await expect(page.locator('#imp-dupes')).toContainText('0002 → 0003');
  await expect(page.locator('#imp-numbered-on')).toContainText("Renumbered lines carry on your sheet's own numbering, from its highest number, 0002.");
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('3 plants added, numbered 0001 to 0003');

  await page.goto('/plants/import');
  await ready(page);
  await page.fill('#imp-text', `Aloe vera; ; A9\nAloe ferox; ; A95\nAloe arborescens; ; A77\nAloe striata; ; 2014-0001\nAloe marlothii; ; A9`);
  await page.click('#imp-check');
  await expect(page.locator('#imp-dupes')).toContainText(`A9 → ${y}-0001`);
  await expect(page.locator('#imp-numbered-on')).toContainText("take this collection's next number, since the numbers in your sheet do not all follow one pattern");
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('5 plants added');

  await page.goto('/plants?show=all');
  await ready(page);
  const nos = await page.locator('.rows .accno').allTextContents();
  const a = (n: string) => nos.indexOf(n);
  expect(a('A95')).toBeGreaterThanOrEqual(0);
  expect(a('A95')).toBeLessThan(a('A77'));
  expect(a('A77')).toBeLessThan(a('A9'));
  expect(a('0003')).toBeLessThan(a('0002'));

  await page.fill('#plants-q', '0001');
  await expect(page.locator('.rows .accno').first()).toHaveText('0001');
  await expect(page.locator('.rows .accno')).toHaveCount(3); // 0001, 2014-0001 and this year's 0001
});

/**
 * Round sixty-one self-review, the grower: three reproductions in the browser.
 *
 * All three FAIL on f4ab4f8:
 *  1. A place page's "Select these" link, followed inside the app (the only way it is used), opens My plants filtered to the
 *     place but NOT in select mode: SelectMode reads `start` in its own onMount, which runs before the page's onMount has
 *     read `?select=1`. A full page load works (that is what r61a 12 tests), a click does not.
 *  2. The sheet's date choice and "Add them to each plant's notes" stay on screen, live, above the review once "Check names"
 *     has run; changing either changes nothing: the review and the plants added keep the earlier reading.
 *  3. Today with the species sheets refused (offline, or /api/sheets failing) lists plants in their habitat's rest as plainly
 *     due, and says nowhere that the habitat was not checked (rule 2: a source that did not answer is "not checked").
 * Run: PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/grower--r61rev.spec.ts   (lives in tests/e2e/)
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
async function pasteImport(page: Page, csv: string) {
  await page.goto('/plants/import'); await ready(page);
  await page.click('#imp-mode-csv');
  await page.locator('#imp-csv-paste-box > summary').click();
  await page.fill('#imp-csv-text', csv);
  await page.click('#imp-csv-read');
}

test('grower 1: "Select these" on a place page opens My plants in select mode when followed as a link', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await pasteImport(page, 'Name,Place\nCopiapoa cinerea,Greenhouse › Bench 1\nCopiapoa humilis,Greenhouse › Bench 1\nLithops lesliei,Cold frame\n');
  await page.click('#imp-check');
  await page.locator('#imp-make-places').check();
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('3 plants added');
  await page.goto('/places'); await ready(page);
  await page.locator('main a', { hasText: 'Bench 1' }).first().click();
  await expect(page.locator('#select-these')).toBeVisible();
  await page.locator('#select-these').click(); // in the app, as a grower taps it
  await expect(page).toHaveURL(/\/plants\?place=/);
  await expect(page.locator('#select-toggle')).toHaveText('Done selecting'); // f4ab4f8: "Select"
  await expect(page.getByRole('button', { name: 'Tick all 2' })).toBeVisible();
});

test('grower 2: a date choice made after "Check names" is the one the plants are added with (or the review says to check again)', async ({ page }) => {
  await pasteImport(page, 'Name,Date acquired,Locality\nCopiapoa cinerea,09/03/2024,"Totoral, Chile"\n');
  await page.click('#imp-check');
  await expect(page.locator('.rvrow[data-line="2"]')).toContainText('left as written');
  // The grower reads the line, scrolls up, and answers the question that is still there.
  await page.getByRole('radio', { name: /^Day first/ }).check();
  await page.locator('#imp-extra').uncheck();
  // Either the review follows the choice, or "Add" is held until the names are checked again: never the old reading added silently.
  const addable = (await page.locator('#imp-add').count()) > 0 && (await page.locator('#imp-add').getAttribute('aria-disabled')) !== 'true';
  if (addable) {
    await expect(page.locator('.rvrow[data-line="2"]')).not.toContainText('left as written'); // f4ab4f8: still "left as written"
    await expect(page.locator('.rvrow[data-line="2"]')).not.toContainText('Locality: Totoral');
  }
});

test('grower 3: Today says the habitat was not checked when the species sheets do not answer', async ({ page, context }) => {
  page.on('dialog', (d) => d.accept());
  await pasteImport(page, 'Name,Place\nCopiapoa cinerea,Kitchen\nCopiapoa humilis,Kitchen\n');
  await page.click('#imp-check');
  await page.locator('#imp-make-places').check();
  const monthAgo = await page.evaluate(() => { const d = new Date(Date.now() - 40 * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await page.fill('#imp-watered', monthAgo); // past the 21-day default: both plants are due
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('2 plants added');
  await context.route(/\/api\/sheets/, (r) => r.abort('internetdisconnected'));
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#water')).not.toContainText('Reading the species sheets', { timeout: 30_000 });
  await expect(page.locator('#water')).toContainText('Copiapoa cinerea'); // listed (no watering recorded)
  await expect(page.locator('#water')).toContainText(/not checked/i); // f4ab4f8: nothing says the habitat's rest was not read
});

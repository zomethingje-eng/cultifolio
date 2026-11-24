/**
 * Round 118 (SPECIES 19, docs/REVIEW-ROUND-118.md): the year at the habitat as one panel on the species page.
 *
 * - Three charts on one month axis (temperature, rain, light) and the thin rows (day length, humidity, VPD, wind), each
 *   named with its unit and its figure for this month.
 * - Chart | Table: the table is the charts' text, twelve rows, each figure with its 10th to 90th span where the span
 *   differs; a CSV of it made in the browser, and the page's JSON.
 * - My months | Its months for a reader in the other hemisphere: Copiapoa cinerea's habitat is southern, so a northern
 *   reader (or one whose hemisphere is not known) reads the year in their own months, the habitat's under each.
 * - The halves: the year said in two halves, in sentences filled by code.
 * - The one chart of rounds 61 to 117 is kept, folded under the panel.
 *
 * On 19ec7a8: FAILED, every test (there is no #year-panel).
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

test('r118b 1: three charts and four thin rows, each named with its unit and this month\'s figure @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const yp = page.locator('#year-panel');
  await expect(yp.getByRole('heading', { name: 'The year at the habitat' })).toBeVisible();
  const names = yp.locator('.chartname');
  await expect(names.nth(0)).toContainText('Temperature, °C');
  await expect(names.nth(1)).toContainText('Rain, mm');
  await expect(names.nth(2)).toContainText('Light, DLI under open sky');
  await expect(yp.locator('.chartname.thin').first()).toContainText('Day length');
  for (let i = 0; i < 3; i++) await expect(names.nth(i).locator('.nowfig')).toContainText('now');
  await expect(page.locator('#one-chart-fold > summary')).toHaveText('The year as one chart');
  await expect(page.locator('#one-chart-fold figure.climo')).toBeHidden();
});

test('r118b 2: the table is twelve months, in the reader\'s months or the habitat\'s, with day length', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const yp = page.locator('#year-panel');
  await yp.getByRole('button', { name: 'Table', exact: true }).click();
  const rows = yp.locator('table.wx tbody tr');
  await expect(rows).toHaveCount(12);
  await expect(yp.getByRole('button', { name: 'My months', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(yp.locator('table.wx thead th').nth(1)).toHaveText('At the habitat');
  await expect(rows.first().locator('td').nth(0)).toHaveText('Jan');
  await expect(rows.first().locator('td').nth(1)).toHaveText('Jul'); // a northern January is the habitat's July
  await yp.getByRole('button', { name: 'Its months', exact: true }).click();
  await expect(yp.locator('table.wx thead th')).not.toContainText(['At the habitat']);
  await expect(rows.first().locator('td').nth(1)).toHaveText('2220–24'); // January's day, its span under it
  // Day length at the habitat's latitude, about 25° S: a January day of 13 to 14 hours, a July day of 10 to 11.
  const dayH = async (r: number) => Number(await rows.nth(r).locator('td').last().innerText());
  expect(await dayH(0)).toBeGreaterThan(13); expect(await dayH(0)).toBeLessThan(14);
  expect(await dayH(6)).toBeGreaterThan(10); expect(await dayH(6)).toBeLessThan(11);
});

test('r118b 3: the CSV is the table as shown, made in the browser, with its source', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const yp = page.locator('#year-panel');
  await yp.getByRole('button', { name: 'Table', exact: true }).click();
  await expect(yp.getByRole('link', { name: 'JSON' })).toHaveAttribute('href', /^\/api\/dossier\//);
  const [dl] = await Promise.all([page.waitForEvent('download'), yp.getByRole('button', { name: 'CSV' }).click()]);
  expect(dl.suggestedFilename()).toBe('copiapoa-cinerea-months.csv');
  const text = await (await dl.createReadStream()).toArray().then((b) => Buffer.concat(b).toString('utf8'));
  const lines = text.trim().split('\n');
  expect(lines[0]).toMatch(/^# Copiapoa cinerea, the habitat's months .*CHELSA V2\.1, 1981–2010/);
  expect(lines[1].split(',')[0]).toBe('month');
  expect(lines).toHaveLength(14);
});

test('r118b 4: the year in two halves, said in sentences @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const halves = page.locator('#year-panel .halves p');
  await expect(halves).toHaveCount(2);
  await expect(halves.first()).toContainText(/^The (wet|dry|warmer six|cooler six) months, .* at the habitat/);
  await expect(halves.first()).toContainText('apart');
});

/**
 * Round sixty-one, agent G: the import (decision 3), labels (decision 4) and the sample collection (decision 10), in the
 * browser. Adopts the grower review's labels spec (docs/review-60/tests/grower--labels.spec.ts) as tests 1 and 2.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ locale: 'en-GB' });

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  await request.get('/', { timeout: 110_000 });
});

test('r61g 1: the label sheet a grower picks is still picked on the next visit (the grower review, 1)', async ({ page }) => {
  await page.goto('/labels');
  await ready(page);
  const sheet = page.locator('#lb-sheet');
  await expect(sheet).toHaveValue('L7160'); // A4 for en-GB (round sixty)
  await sheet.selectOption('5167');
  await page.getByLabel('Care line').uncheck();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cultifolio.labels'))).toContain('"sheetK":"5167"');
  await page.reload();
  await ready(page);
  await page.locator('#lb-noplants').waitFor(); // the collection has opened: the old code wrote the defaults over the choice by now
  await expect(page.locator('#lb-sheet')).toHaveValue('5167');
  await expect(page.getByLabel('Care line')).not.toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cultifolio.labels') ?? '{}'))).toMatchObject({ sheetK: '5167', withCare: false });
});

test('r61g 2: the printed sheet is exactly the paper width, so nothing is shrunk to fit (the grower review, 2)', async ({ page }) => {
  await page.goto('/labels');
  await ready(page);
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
  const r = await page.evaluate(() => ({ scrollW: document.documentElement.scrollWidth, left: document.querySelector('.page')!.getBoundingClientRect().left, width: document.querySelector('.page')!.getBoundingClientRect().width }));
  expect(r.left).toBe(0);
  expect(r.scrollW).toBeLessThanOrEqual(794);
  expect(Math.round(r.width)).toBe(794); // 210 mm: the sheet at 100%
});

/** Paste a list and add it, as a grower would. */
async function importList(page: Page, text: string) {
  await page.goto('/plants/import');
  await ready(page);
  await page.fill('#imp-text', text);
  await page.click('#imp-check');
  await expect(page.locator('#imp-review-h')).toBeFocused();
  await page.click('#imp-add');
  await expect(page.locator('#imp-done-h')).toBeFocused();
}

test('r61g 3: one name that cannot be cut cleanly fails no code: every label on the sheet keeps its QR code (the records review, 3)', async ({ page }) => {
  await importList(page, `Copiapoa cinerea; Snow ${'x'.repeat(36)}🌵 Queen\nCopiapoa humilis\nLithops lesliei`);
  await page.click('a:has-text("Labels for these")');
  await ready(page);
  await expect(page.locator('.sheets .label .qr svg')).toHaveCount(3);
});

test('r61g 4: a sheet\'s unmatched columns are listed and kept, its dates asked about once, and 300 rows add in seconds; a second run skips what is already in (the grower review, 3, 4 and 6; the records review, 16)', async ({ page }) => {
  test.setTimeout(300_000);
  const names = ['Copiapoa cinerea', 'Copiapoa humilis', 'Lithops lesliei', 'Welwitschia mirabilis', 'Mammillaria cf. bombycina'];
  const lines = ['Acc No.,Genus,Species,Locality,Date Acq.,Notes'];
  for (let i = 1; i <= 300; i++) { const [g, s] = names[i % names.length].split(/ (.*)/); lines.push(`${String(i).padStart(4, '0')},${g},${s},"Locality ${i}, Chile",${i === 7 ? '09/03/2024' : i === 8 ? 'August 2017' : '2024-05-01'},note ${i}`); }
  await page.goto('/plants/import');
  await ready(page);
  await page.click('#imp-mode-csv');
  await page.locator('#imp-csv-paste-box > summary').click();
  await page.fill('#imp-csv-text', lines.join('\n'));
  await page.click('#imp-csv-read');
  await expect(page.locator('#imp-unmapped')).toContainText('Not matched to a field: Locality');
  await expect(page.locator('#imp-extra')).toBeChecked();
  await expect(page.locator('#imp-dates')).toContainText('One date in this sheet, like 09/03/2024');
  await page.getByRole('radio', { name: /^Day first/ }).check();
  await page.click('#imp-check');
  await expect(page.locator('#imp-summary')).toContainText('300 lines', { timeout: 60_000 });
  await page.locator('#imp-only-needs').check();
  await expect(page.locator('.rvrow').first()).toBeVisible();
  await expect.poll(() => page.locator('.rvrow').count()).toBeLessThan(300); // the filter's render is not instant under load (round sixty-one, at the merge)
  await page.fill('#imp-watered', '2026-10-01');
  const t0 = Date.now();
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('300 plants added', { timeout: 200_000 });
  const ms = Date.now() - t0;
  console.log(`r61g 4: 300 rows added in ${ms} ms`);
  // A loose bound for a shared machine: measured 6.7 to 9 s here at a load of 8 to 20 on 2 CPUs (the round-sixty code: 11 to
  // 13 s for 300, 54 s for 600, growing with the square). The planner's own cost is pinned in r61g-label-code.test.ts.
  expect(ms).toBeLessThan(90_000);
  await expect(page.locator('#imp-done')).toContainText('Last watered on 2026-10-01: recorded on 300 plants');
  // The second run of the same sheet: every line is already in, so nothing would be added twice.
  await page.goto('/plants/import');
  await ready(page);
  await page.click('#imp-mode-csv');
  await page.locator('#imp-csv-paste-box > summary').click();
  await page.fill('#imp-csv-text', lines.join('\n'));
  await page.click('#imp-csv-read');
  await page.click('#imp-check');
  await expect(page.locator('#imp-already')).toContainText('300 lines look already imported', { timeout: 60_000 });
  await expect(page.locator('#imp-add')).toHaveText('Add 0 plants');
  // What the first run kept: the locality in the notes, the date read day first, the month-only date at its precision.
  await page.goto('/plants/0007');
  await ready(page);
  await expect(page.locator('main')).toContainText('Locality: Locality 7, Chile');
  await expect(page.locator('main')).toContainText('2024-03-09');
  await page.goto('/plants/0008');
  await ready(page);
  await expect(page.locator('main')).toContainText('2017-08');
});

test('r61g 5: leaving while the import adds is asked about first (the grower review, 6)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/plants/import');
  await ready(page);
  await page.fill('#imp-text', Array.from({ length: 200 }, (_, i) => `Copiapoa cinerea; ; ${i + 1}`).join('\n'));
  await page.click('#imp-check');
  await expect(page.locator('#imp-add')).toHaveText('Add 200 plants');
  await page.click('#imp-add');
  await expect(page.locator('#imp-add')).toContainText('Adding');
  const blocked = await page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  expect(blocked).toBe(true);
  await expect(page.locator('#imp-done')).toContainText('200 plants added', { timeout: 150_000 });
});

test('r61g 6: the sample is marked before the first paint, does not shift the page, keeps Settings shut under its heading, and its choices stay in the tab (the accessibility review, 4 and 10; the grower review, 14)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants');
  await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 20_000 });
  // A server-drawn page: the bar is in its HTML and shown from the first paint, so nothing moves when the scripts run.
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/about/how');
  await ready(page);
  await expect(page.locator('html')).toHaveAttribute('data-demo', '1');
  await expect(page.locator('.demobar')).toBeVisible();
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.05);
  // Settings: shut, with its heading.
  await page.goto('/settings');
  await ready(page);
  await expect(page.locator('#demo-locked')).toContainText('Settings are off in the sample collection.');
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(page.locator('#main button:visible')).toHaveText(['Leave the sample']);
  // A label stock picked in the sample is the tab's, not the device's.
  await page.goto('/labels');
  await ready(page);
  await page.locator('#lb-sheet').selectOption('5163');
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('cultifolio.demo.labels'))).toContain('5163');
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.labels'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBeNull();
  await page.getByRole('button', { name: 'Leave the sample' }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((k) => k.startsWith('cultifolio.demo')))).toEqual([]);
});

test('r61g 7: a second sample tab is told plainly when the sample closes, and a sample left behind is deleted on the next load outside it (the records review, 13)', async ({ page, context }) => {
  test.setTimeout(90_000);
  await page.goto('/plants');
  await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 20_000 });
  const [second] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open('/today'); })]);
  await ready(second);
  await expect(second.locator('.demobar')).toBeVisible();
  await page.getByRole('button', { name: 'Leave the sample' }).click();
  await expect(second).toHaveURL(/^http:\/\/[^/]+\/$/, { timeout: 10_000 });
  await expect(second.locator('.toast')).toContainText('The sample collection was closed in another tab. This is your own collection.');
  await expect(second.locator('.demobar')).toBeHidden();
  await second.close();
  // A sample tab closed without Leave: its database stays until the next load outside the sample.
  await page.goto('/plants');
  await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 20_000 });
  const outside = await context.newPage(); // a new tab: no flag, so the grower's own collection
  await page.close();
  await outside.goto('/plants');
  await ready(outside);
  await expect.poll(() => outside.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name))), { timeout: 10_000 }).not.toContain('cultifolio-demo');
});

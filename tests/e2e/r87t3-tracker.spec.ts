/**
 * Round eighty-seven, t3: the tracker's new parts in the browser (plans F7, F9, F11, F12).
 *
 * 1. F7: a plant resting this month by its own season is listed on Today as resting, with why, and no Water button; a
 *    plant beside it with no season is due as before.
 * 2. F7: a plant's page suggests a season from its species page's reading, says it is a suggestion and the rule, and
 *    writes nothing until it is confirmed; confirmed, it says what was set.
 * 3. F9: a paper added to a plant is listed with its kind, opens and downloads as its own file, and is in the backup.
 * 4. F11: the collection report lists the plants with their numbers and papers, and prints without the app around it.
 * 5. F12: the lock is set only with a way back; a new tab is locked, the about pages are not; the passcode opens it; a
 *    backup file of the collection opens it and takes the passcode off.
 */
import { test, expect, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import { readFileSync } from 'node:fs';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const thisMonth = () => new Date().getMonth() + 1;
const plant = (id: string, no: string, name: string, more: Record<string, unknown> = {}): Row[] => Object.entries({ acc: no, taxonName: name, status: 'growing', nameKind: 'species', locationId: 'b1', ...more }).map(([f, v]) => ['accession', id, f, v] as Row);
async function open(page: Page, rows: Row[], writer: string) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, [['location', 'b1', 'name', 'Bench'], ...rows], Date.now() - 40 * DAY, writer);
}

test('r87t3 2.1: a plant resting this month by its own season is listed as resting on Today, with why and no Water button (F7) @phone', async ({ page }) => {
  await open(page, [...plant('t1', '2026-0001', 'Refusia testii', { season: 'winter', restMonths: [thisMonth()], seasonFrom: 'grower' }), ...plant('t2', '2026-0002', 'Refusia otheri')], 'r87t3tttttttt001');
  await page.goto('/today'); await ready(page);
  const stop = page.locator('#water .stop', { hasText: 'Bench' });
  const rest = stop.locator('.row.ownrest');
  await expect(rest).toContainText('Resting, not counted as due: A winter-grower resting');
  await expect(rest).toContainText('as you set it');
  await expect(rest.locator('.chip')).toHaveCount(1);
  await expect(rest.locator('.chip')).toContainText('2026-0001');
  await expect(rest.getByRole('button')).toHaveCount(0);
  // the plant beside it, with no season, is due as before
  await expect(stop.getByRole('button', { name: 'Water 1 here' })).toBeVisible();
  await expect(stop.locator('.row.unknown .chip')).toContainText('2026-0002');
  await page.locator('#how-today summary').click();
  await expect(page.locator('#how-today')).toContainText("a plant's own rest months");
});

test('r87t3 2.2: a plant\'s page suggests a season by its species page\'s rule and writes nothing until it is confirmed (F7) @phone', async ({ page }) => {
  await open(page, plant('c1', '2026-0001', 'Copiapoa cinerea'), 'r87t3tttttttt002');
  await page.goto('/plants/2026-0001'); await ready(page);
  const box = page.locator('#growing-season');
  await expect(box.locator('#season-suggested')).toContainText('Suggested:', { timeout: 20_000 });
  await expect(box.locator('#season-suggested')).toContainText('by the');
  await expect(box).toContainText('nothing changes until you confirm it');
  await box.locator('#season-confirm').click();
  await expect(box.locator('#season-set')).toContainText('confirmed by you from its species page');
  // the change set and cleared through its form
  await box.locator('#season-change').click();
  await box.getByLabel('All year, no rest').check();
  await box.locator('#season-save').click();
  await expect(box.locator('#season-set')).toContainText('No rest; set by you');
  await box.locator('#season-change').click();
  await box.locator('#season-clear').click();
  await expect(box.locator('#season-suggested')).toBeVisible();
});

test('r87t3 2.3: a paper kept with a plant opens, downloads and is in the backup, as stored (F9)', async ({ page }) => {
  await open(page, plant('a1', '2026-0001', 'Refusia testii'), 'r87t3tttttttt003');
  await page.goto('/plants/2026-0001'); await ready(page);
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
  await page.locator('#att-add').click();
  await page.locator('#att-file').setInputFiles({ name: 'CITES 2026.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.locator('#att-doc').selectOption('cites');
  await page.locator('#att-caption').fill('Permit 26-GB-0001');
  await page.locator('#att-save').click();
  const row = page.locator('#attachments .files li');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('CITES permit or certificate · Permit 26-GB-0001');
  await expect(row).toContainText('CITES 2026.pdf · PDF');
  // a file that is not a PDF, a JPEG or a PNG is refused, in a sentence
  await page.locator('#att-add').click();
  await page.locator('#att-file').setInputFiles({ name: 'evil.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html><script>alert(1)</script>') });
  await page.locator('#att-save').click();
  await expect(page.locator('#att-msg')).toContainText('is not a PDF, a JPEG or a PNG');
  // Download: the file itself, under its own name
  const dl = page.waitForEvent('download');
  await row.getByRole('button', { name: 'Download' }).click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe('CITES 2026.pdf');
  expect(readFileSync((await d.path())!).equals(pdf)).toBe(true);
  // the backup holds it as a photograph's entry: the envelope, then the file whole
  await page.goto('/backup'); await ready(page);
  const bk = page.waitForEvent('download');
  await page.locator('#bk-export').click();
  const zip = unzipSync(readFileSync((await (await bk).path())!));
  const entries = Object.keys(zip).filter((k) => k.startsWith('photos/') && !k.endsWith('.t.jpg'));
  expect(entries).toHaveLength(1);
  const stored = Buffer.from(zip[entries[0]]);
  expect(stored.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
  expect(stored.subarray(159).equals(pdf)).toBe(true);
  expect(new TextDecoder().decode(zip['plants.csv'])).toContain('CITES permit or certificate: CITES 2026.pdf');
});

test('r87t3 2.4: the collection report lists the plants, and prints without the app around it (F11) @phone', async ({ page }) => {
  await open(page, [...plant('r1', '2026-0001', 'Refusia testii', { price: '£6', fieldNumber: 'KK 1001', provenance: 'wild' }), ...plant('r2', '2026-0002', 'Refusia otheri', { status: 'dead' })], 'r87t3tttttttt004');
  await page.goto('/plants'); await ready(page);
  await page.locator('#plants-menu-btn').click();
  await page.locator('#plants-report').click();
  await expect(page).toHaveURL(/\/plants\/report$/);
  await expect(page.locator('#report .plant')).toHaveCount(1);
  await expect(page.locator('#report .plant').first()).toContainText('2026-0001');
  await expect(page.locator('#report .plant').first()).toContainText('KK 1001');
  await expect(page.locator('#report .plant').first()).toContainText('wild-collected');
  await expect(page.locator('#report')).not.toContainText('£6'); // prices only when chosen
  await page.locator('#rp-prices').check();
  await expect(page.locator('#report .rhead')).toContainText('£6');
  await page.locator('#rp-which').selectOption('all');
  await expect(page.locator('#report .plant')).toHaveCount(2);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#topbar')).toBeHidden();
  await expect(page.locator('.ui')).toBeHidden();
  await expect(page.locator('#report')).toBeVisible();
});

test('r87t3 2.5: the lock: set only with a way back, a new tab locked but not the about pages, opened by the passcode or a backup file (F12)', async ({ page, context }) => {
  test.setTimeout(90_000);
  await open(page, plant('l1', '2026-0001', 'Refusia testii'), 'r87t3tttttttt005');
  await page.goto('/settings'); await ready(page);
  await expect(page.locator('#lock-what')).toContainText('not encrypted');
  await expect(page.locator('#lock-wayback')).toBeVisible(); // no sync, no backup yet
  await expect(page.locator('#lock-set')).toHaveAttribute('aria-disabled', 'true');
  // a backup made: now it can be set
  await page.goto('/backup'); await ready(page);
  const bk = page.waitForEvent('download');
  await page.locator('#bk-export').click();
  const file = (await (await bk).path())!;
  await page.goto('/settings'); await ready(page);
  await page.locator('#lock-pass1').fill('2468');
  await page.locator('#lock-pass2').fill('2468');
  await page.locator('#lock-set').click();
  await expect(page.locator('#lock-on')).toBeVisible();
  // this tab stays open; a new one is locked
  const two = await context.newPage();
  await two.goto('/plants'); await ready(two);
  await expect(two.locator('#lockscreen')).toBeVisible();
  await expect(two.locator('#main')).toHaveAttribute('inert', '');
  await two.locator('#lock-pass').fill('1111');
  await two.locator('#lock-open').click();
  await expect(two.locator('#lock-msg')).toContainText('not the passcode');
  await two.locator('#lock-pass').fill('2468');
  await two.locator('#lock-open').click();
  await expect(two.locator('#lockscreen')).toHaveCount(0);
  await expect(two.locator('a.accrow')).toHaveCount(1);
  // the about pages are never behind it
  const three = await context.newPage();
  await three.goto('/about/how#lock'); await ready(three);
  await expect(three.locator('#lockscreen')).toHaveCount(0);
  await expect(three.locator('#lock')).toContainText('The app lock');
  // forgotten: a backup file of this collection opens it and takes the passcode off
  await three.goto('/today'); await ready(three);
  await expect(three.locator('#lockscreen')).toBeVisible();
  await three.locator('#lock-forgot').click();
  await three.locator('#lock-file').setInputFiles(file);
  await expect(three.locator('#lockscreen')).toHaveCount(0, { timeout: 15_000 });
  const four = await context.newPage();
  await four.goto('/plants'); await ready(four);
  await expect(four.locator('a.accrow')).toHaveCount(1);
  await expect(four.locator('#lockscreen')).toHaveCount(0);
});

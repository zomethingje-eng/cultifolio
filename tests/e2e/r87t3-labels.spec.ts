/**
 * Round eighty-seven, t3 (plan F10, and review-86's W12): the labels page in the browser.
 *
 * 1. W12: /labels with 420 plants does not move as the collection opens and its list arrives. Review W measured 0.035 at
 *    376 plants (and 0 at 32) on round eighty-six; round eighty-five's test (r85m 1) holds 30 plants, where the page
 *    picks every plant only up to 24 and so prints none. Read with a layout-shift observer: Chromium's alone.
 * 2. The QR code carries the plant's number: the address it encodes is /plants/<number>, and that address opens the
 *    plant on this device with the network cut (the collection is on the device). A code printed before, by identity,
 *    still opens it.
 * 3. Tape: 12, 18 and 24 mm stock prints one label per page of the tape's width; the backup label carries the number
 *    alone; the large number is larger.
 */
import { test, expect } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';
import { framesSettled, goneQuiet } from './helpers/settled';
import { chromiumOnly } from './helpers/engines';

test.use({ serviceWorkers: 'block' });
const SHIFTS = 'a layout-shift reading, which only Chromium reports; the page drawn is what every engine draws';
const plants = (n: number): Row[] => [['location', 'gh', 'name', 'Bench'], ...Array.from({ length: n }, (_, k) => k + 1).flatMap((i) => [['accession', `p${i}`, 'taxonName', i % 3 ? 'Copiapoa cinerea' : 'Echeveria elegans'], ['accession', `p${i}`, 'status', 'growing'], ['accession', `p${i}`, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', `p${i}`, 'locationId', 'gh'], ['accession', `p${i}`, 'fieldNumber', i % 5 ? null : `KK ${1000 + i}`]] as Row[])];

const observe = () => {
  const w = window as unknown as { __cls: Array<{ v: number; src: string[] }> };
  w.__cls = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node }> }>) if (!e.hadRecentInput) w.__cls.push({ v: e.value, src: (e.sources ?? []).map((s) => (s.node instanceof Element ? `${s.node.tagName}.${s.node.className}#${s.node.id}` : String(s.node?.nodeName))) }); }).observe({ type: 'layout-shift', buffered: true });
};

for (const n of [420]) test(`r87t3 1: /labels with ${n} plants does not move as they arrive (W12) @phone`, chromiumOnly(SHIFTS), async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(n), Date.now() - 86_400_000, 'r87t3lllllllll01');
  await page.addInitScript(observe);
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('.picklist label.pick').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.sheets')).toBeAttached();
  await goneQuiet(page);
  await framesSettled(page);
  const shifts = await page.evaluate(() => (window as unknown as { __cls: Array<{ v: number; src: string[] }> }).__cls);
  const cls = shifts.reduce((a, s) => a + s.v, 0);
  console.log(`r87t3 1 (${n}): CLS ${cls.toFixed(6)} ${JSON.stringify(shifts)}`);
  expect(cls).toBeLessThan(0.005); // round eighty-six: 0.035 at 376 plants (review W)
});

/**
 * 1b. W12 as review W met it: with every plant picked, the codes and the care lines of 420 labels arrive well after the
 * pick (a shift within 500 ms of an input is the input's), and each label's text moved as its code took the room beside
 * it and its care line the room under it. Round eighty-six: about 0.03 on a desktop.
 */
test('r87t3 1b: /labels with 420 plants picked does not move as their codes and care lines arrive (W12) @phone', chromiumOnly(SHIFTS), async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(420), Date.now() - 86_400_000, 'r87t3lllllllll02');
  await page.addInitScript(observe);
  // Picked by the address, as a space's Labels link picks its plants: no input of the reader's to excuse a shift.
  await page.goto('/labels?loc=gh'); await ready(page);
  await expect(page.locator('#lb-print')).toHaveText('Print 420 labels', { timeout: 60_000 });
  await expect(page.locator('.label .qr svg')).toHaveCount(420, { timeout: 60_000 });
  await goneQuiet(page);
  await framesSettled(page);
  const shifts = await page.evaluate(() => (window as unknown as { __cls: Array<{ v: number; src: string[] }> }).__cls);
  const cls = shifts.reduce((a, s) => a + s.v, 0);
  console.log(`r87t3 1b: CLS ${cls.toFixed(6)} ${JSON.stringify(shifts.slice(0, 5))}`);
  expect(cls).toBeLessThan(0.005);
});

const one = (): Row[] => [['location', 'gh', 'name', 'Bench'], ...Object.entries({ acc: '2026-0007', taxonName: 'Copiapoa cinerea', status: 'growing', nameKind: 'species', locationId: 'gh' }).map(([f, v]) => ['accession', 'pq7', f, v] as Row)];

test('r87t3 2: the code\'s address is the plant\'s number, which opens it as its identity does; a label naming another plant says so @phone', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, one(), Date.now() - 86_400_000, 'r87t3lllllllll03');
  // the number, as the new code carries it
  await page.goto('/plants/2026-0007#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#label-other')).toHaveCount(0);
  // the identity, as every code printed before carries it
  await page.goto('/plants/pq7#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  // another collection's 2026-0007, scanned here: said, and its species offered
  await page.goto('/plants/2026-0007#s=aloe-vera&n=Aloe%20vera'); await ready(page);
  await expect(page.locator('#label-other')).toContainText('This label names Aloe vera, and your 2026-0007 is Copiapoa cinerea');
});

test('r87t3 3: label tape prints one label a page of its width; a backup label is the number alone; the large number is larger @phone', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, one(), Date.now() - 86_400_000, 'r87t3lllllllll04');
  await page.goto('/labels?acc=2026-0007'); await ready(page);
  await expect(page.locator('#lb-print')).toHaveText('Print 1 label');
  const before = await page.locator('.label .no').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  await page.locator('#lb-big').check();
  const big = await page.locator('.label .no').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(big).toBeGreaterThan(before * 1.4);
  await page.locator('#lb-big').uncheck();
  await page.locator('#lb-sheet').selectOption('tape24');
  await expect(page.locator('#lb-skip')).toHaveCount(0); // no cells to skip on tape
  await expect(page.locator('#lb-tape-note')).toContainText('70 mm long and 24 mm high');
  const mm = (px: number) => (px * 25.4) / 96;
  const box = await page.locator('.sheets .page').first().boundingBox();
  expect(Math.round(mm(box!.width))).toBe(70);
  expect(Math.round(mm(box!.height))).toBe(24);
  await expect(page.locator('.label .qr svg')).toHaveCount(1);
  await page.locator('#lb-backup').check();
  await expect(page.locator('#lb-print')).toHaveText('Print 2 labels');
  await expect(page.locator('.sheets .page')).toHaveCount(2);
  await expect(page.locator('.label.backup .bkno')).toHaveText('2026-0007');
  await expect(page.locator('.label.backup .qr, .label.backup .sci')).toHaveCount(0);
  const bk = await page.locator('.sheets .page.bk').boundingBox();
  expect(Math.round(mm(bk!.width))).toBe(34);
  // the choices are this device's, kept for the next visit
  await page.reload(); await ready(page);
  await expect(page.locator('#lb-sheet')).toHaveValue('tape24');
  await expect(page.locator('#lb-backup')).toBeChecked();
});

/**
 * Round 122 (MYPLANTS 29, second part; docs/REVIEW-ROUND-122.md): the walking order and the move sheet.
 *
 * - On Spaces a handle moves a space among its siblings (here by the arrow keys); Today and the plant list's chips follow.
 * - Each space shows its plants' photographs, where it has some, and what is to look at, in words.
 * - Moving three plants is one tap on a sheet of spaces; the space they are in is shown and cannot be chosen; three log
 *   lines, and one Undo takes all three back.
 *
 * On aa450b2: FAILED, every test (no handle, a select and a Move button).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const plant = (id: string, no: string, loc: string): Row[] =>
  Object.entries({ acc: no, taxonName: 'Refusia testii', status: 'growing', nameKind: 'species', locationId: loc, waterDays: 7 }).map(([f, v]) => ['accession', id, f, v] as Row);
const space = (id: string, name: string, sort: number): Row[] => [['location', id, 'name', name], ['location', id, 'type', 'bench'], ['location', id, 'sort', sort]];

async function open(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, [
    ...space('s1', 'Bench 1', 1), ...space('s2', 'Bench 2', 2), ...space('s3', 'Cold frame', 3),
    ...plant('p1', '2026-0001', 's1'), ...plant('p2', '2026-0002', 's1'), ...plant('p3', '2026-0003', 's1'),
    ...plant('p4', '2026-0004', 's2'), ...plant('p5', '2026-0005', 's3')
  ], Date.now() - 30 * DAY, 'r122bbbbbbbbb001');
}

test('r122b 1: a handle moves a space in the walking order; Today and the chips follow @phone', async ({ page }) => {
  await open(page);
  await page.goto('/places'); await ready(page);
  await expect(page.locator('.tree .row .name')).toHaveText(['Bench 1', 'Bench 2', 'Cold frame']);
  await expect(page.locator('#row-s1 .spacestate')).toHaveText('3 to look at');
  await page.locator('#h-s3').focus();
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('#walk-say')).toContainText('Cold frame: 2 of 3 in walking order.');
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.tree .row .name')).toHaveText(['Cold frame', 'Bench 1', 'Bench 2']);
  await expect(page.locator('#h-s3')).toBeFocused();
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#water .stop .sname')).toHaveText(['Cold frame', 'Bench 1', 'Bench 2']);
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.spacechips button')).toHaveText([/^All/, /^Cold frame/, /^Bench 1/, /^Bench 2/]);
});

test('r122b 2: three plants moved with one tap on the sheet; their space is not offered; one Undo takes all three back', async ({ page }) => {
  await open(page);
  await page.goto('/plants?place=s1&select=1'); await ready(page);
  await page.getByRole('button', { name: 'Tick all 3' }).click();
  await page.locator('#sel-move').click();
  const sheet = page.locator('#sel-sheet');
  await expect(sheet.locator('button', { hasText: 'Bench 1' })).toHaveAttribute('aria-disabled', 'true');
  await expect(sheet.locator('button', { hasText: 'Bench 1' })).toContainText('where they are now');
  await expect(page.locator('.sheetfoot a')).toHaveText('+ New space');
  await sheet.locator('button', { hasText: 'Bench 2' }).click();
  await expect(page.locator('.toast')).toContainText('3 moved to Bench 2.');
  await page.goto('/plants/2026-0001'); await ready(page);
  await expect(page.locator('.tl')).toContainText('Moved');
  await page.goto('/plants?place=s2&select=1'); await ready(page);
  await expect(page.locator('.selrow')).toHaveCount(4);
});

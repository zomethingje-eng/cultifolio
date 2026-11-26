/**
 * Round 125 (MYPLANTS 31, second part; docs/REVIEW-ROUND-125.md): a plant page's actions and figures.
 *
 * - Water and Record… lead; Record… opens with the kinds as a grid, one tap each, then the date and a note.
 * - Move and Archive are in the "···" menu with Edit, Label and the rest; the "More ▾" row is gone.
 * - Two figures: since watered, with "you average N d" from three gaps; the size, or "Measure it" opening Record… on Measured.
 * - The log shows its latest three, then "All N".
 *
 * On 7ab8194: FAILED, every test (a select of kinds, a row of verbs behind More, no average, five lines of log).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const ago = (n: number) => { const d = new Date(Date.now() - n * DAY); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
let ev = 0;
const water = (d: string): Row[] => { const id = `e${++ev}r125`; return [['event', id, 'acc', 'p1'], ['event', id, 'd', d], ['event', id, 't', 'water']]; };
async function open(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  const rows: Row[] = Object.entries({ acc: '2026-0001', taxonName: 'Lithops lesliei', status: 'growing', nameKind: 'species' }).map(([f, v]) => ['accession', 'p1', f, v] as Row);
  await inject(page, [...rows, ...water(ago(40)), ...water(ago(30)), ...water(ago(20)), ...water(ago(10))], Date.now() - 60 * DAY, 'r125bbbbbbbbb001');
  await page.goto('/plants/2026-0001'); await ready(page);
}

test('r125b 1: Record… is a grid of kinds, one tap each; Move and Archive are in the menu @phone', async ({ page }) => {
  await open(page);
  await expect(page.locator('.quickbar .more')).toHaveCount(0);
  await page.getByRole('button', { name: 'Record…' }).click();
  const kinds = page.locator('#ev-kinds input[type=radio]');
  expect(await kinds.count()).toBeGreaterThan(8);
  await page.locator('#ev-kinds label', { hasText: 'Fed' }).click();
  await expect(page.locator('.evform .sum')).toContainText('Record: Fed');
  await page.fill('#ev-note', 'quarter strength');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'quarter strength' })).toBeVisible();
  await page.locator('.idcard .cardmenu > button').click();
  await expect(page.locator('#menu-move')).toBeVisible();
  await expect(page.locator('#menu-archive')).toBeVisible();
});

test('r125b 2: since watered says the average from three gaps; "Measure it" opens Record… on Measured; the log shows three', async ({ page }) => {
  await open(page);
  await expect(page.locator('#water-avg')).toHaveText(' · you average 10 d');
  // The figures row is drawn again as the collection's figures arrive; the press is the one that opens the form (round
  // 125's first gate: in Firefox once, the click met the row as it was replaced).
  await expect(async () => {
    await page.locator('#measure-it').click();
    await expect(page.locator('.evform .sum')).toContainText('Record: Measured', { timeout: 1500 });
  }).toPass({ timeout: 10_000 });
  await expect(page.locator('#ev-kinds input[value="measure"]')).toBeChecked();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.tl .tlrow:not(.tlmore)')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /^All 4 entries$/ })).toBeVisible();
});

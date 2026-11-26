/**
 * Round 123 (MYPLANTS 30; docs/REVIEW-ROUND-123.md): a space's page, and a label for the space.
 *
 * - Its own and its inherited conditions as figures, each "from <space>" when inherited; one set nowhere not shown.
 * - "Watered <space>" records every growing plant in the space and those inside it, as Water all did.
 * - Every action of the old row of nine is still reachable, in the "···" menu.
 * - The audit row says when it was last done; the space's label prints its name and a code that opens its page.
 *
 * On aa450b2: FAILED, every test (cards, nine buttons, no space label).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const plant = (id: string, no: string, loc: string): Row[] =>
  Object.entries({ acc: no, taxonName: 'Refusia testii', status: 'growing', nameKind: 'species', locationId: loc }).map(([f, v]) => ['accession', id, f, v] as Row);

async function open(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, [
    ['location', 'gh', 'name', 'Greenhouse'], ['location', 'gh', 'type', 'greenhouse'], ['location', 'gh', 'floorC', 5], ['location', 'gh', 'floorHeld', true], ['location', 'gh', 'waterDays', 10], ['location', 'gh', 'dryMonths', [12, 1, 2]],
    ['location', 'b2', 'name', 'Bench 2'], ['location', 'b2', 'type', 'bench'], ['location', 'b2', 'parentId', 'gh'], ['location', 'b2', 'waterDays', 14],
    ['location', 't1', 'name', 'Tray A'], ['location', 't1', 'type', 'tray'], ['location', 't1', 'parentId', 'b2'],
    ['location', 'ws', 'name', 'Windowsill'], ['location', 'ws', 'type', 'windowsill'],
    ...plant('p1', '2026-0001', 'b2'), ...plant('p2', '2026-0002', 't1'), ...plant('p3', '2026-0003', 'ws')
  ], Date.now() - 20 * DAY, 'r123bbbbbbbbb001');
}

test('r123b 1: own and inherited conditions as figures, and none for a space with none set @phone', async ({ page }) => {
  await open(page);
  await page.goto('/places/b2'); await ready(page);
  const conds = page.locator('#space-conds .cond');
  await expect(conds).toHaveCount(3);
  await expect(conds.nth(0)).toContainText('held at');
  await expect(conds.nth(0)).toContainText('from Greenhouse');
  await expect(conds.nth(1)).toContainText('14 days');
  await expect(conds.nth(1)).not.toContainText('from');
  await expect(conds.nth(2)).toContainText('kept dry');
  await expect(conds.nth(2)).toContainText('from Greenhouse');
  await page.goto('/places/ws'); await ready(page);
  await expect(page.locator('#space-conds')).toHaveCount(0);
});

test('r123b 2: Watered records the space and those inside it; the menu holds every other action @phone', async ({ page }) => {
  await open(page);
  await page.goto('/places/b2'); await ready(page);
  await page.getByRole('button', { name: 'Watered Bench 2' }).click();
  await expect(page.locator('.toast')).toContainText('Watered 2 plants');
  await page.locator('#space-menu-btn').click();
  const menu = page.locator('#space-menu');
  for (const n of ['Feed all', 'Move plants here', 'Start a batch here', 'Labels', 'Select', 'Edit', 'Remove space']) await expect(menu.getByText(n, { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(page.locator('#space-menu-btn')).toBeFocused();
  await page.goto('/plants/2026-0003'); await ready(page);
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(0); // the windowsill was not
});

test('r123b 3: the audit row says when it was last done; the space\'s label is its name and a code to its page', async ({ page }) => {
  await open(page);
  await page.goto('/places/b2'); await ready(page);
  await expect(page.locator('#audit-start')).toContainText('never audited');
  await page.locator('#space-label').click();
  await expect(page).toHaveURL(/\/labels\?space=b2$/);
  await expect(page.locator('#space-label-page .no')).toHaveText('Bench 2');
  await expect(page.locator('#space-label-page .src')).toHaveText('Greenhouse › Bench 2');
  await expect(page.locator('#space-label-page .qr svg')).toHaveCount(1);
  await expect(page.locator('#space-label-help')).toContainText('opens Safari');
  await expect(page.locator('#lb-print')).toHaveText('Print the label for Bench 2');
});

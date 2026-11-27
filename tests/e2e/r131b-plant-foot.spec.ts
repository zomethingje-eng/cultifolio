/**
 * Round 131 (MYPLANTS 31, item 8; docs/REVIEW-ROUND-131.md): "No longer held…" is the plant page's last line, a quiet
 * link; "Remove" is in the plant's "···" menu, with "No longer held…" beside it, and the removal is asked at the foot
 * only once the menu's Remove… is pressed.
 *
 * On 9176178: FAILED (the foot held a button row and "Remove this plant", in red, on every plant).
 */
import { test, expect } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });

test('r131b 1: the foot is a quiet link; Remove and No longer held are in the menu; Remove asks before it removes @phone', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  await inject(page, Object.entries({ acc: '2026-0001', taxonName: 'Copiapoa cinerea', status: 'growing', nameKind: 'species' }).map(([f, v]) => ['accession', 'p1', f, v] as Row), Date.now() - 86_400_000, 'r131bbbbbbbbb001');
  await page.goto('/plants/2026-0001'); await ready(page);
  await expect(page.getByRole('button', { name: 'Remove this plant' })).toHaveCount(0);
  await expect(page.locator('.dangerrow')).toHaveCount(0);
  await expect(page.locator('#deacc-open')).toHaveClass(/linkish/);
  await page.locator('.idcard .cardmenu > button').click();
  const menu = page.locator('#card-menu');
  await expect(menu.getByRole('menuitem', { name: 'No longer held…', exact: true })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Remove…', exact: true }).click();
  await expect(page.locator('.dangerrow')).toContainText('Remove is for a record made by mistake.');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();
  await expect(page.locator('.dangerrow')).toHaveCount(0);
  await page.locator('.idcard .cardmenu > button').click();
  await menu.getByRole('menuitem', { name: 'No longer held…', exact: true }).click();
  await expect(page.locator('#deacc-form')).toBeVisible();
});

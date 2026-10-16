/**
 * Round seventy-three, agent P (H's evidence): a toast was put away at a navigation that landed more than 600 ms after
 * it was raised. The removals and the single add raise their toast as their own navigation begins, so on a phone that
 * took over 0.6 s to draw the next page, "2026-0001 removed. Undo" never showed. The age is judged at the navigation's
 * start now. The slow device is staged by holding `history.pushState` 800 ms (the router's own step before the page it
 * lands on is drawn); the clock is not held.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const plant = (id: string, no: string, name: string): Array<[string, string, string, string]> => [['accession', id, 'acc', no], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing']];

/** Every pushState held `ms` while `window.__slow` is set: the next page lands that much later. */
function slowPush() {
  const push = history.pushState.bind(history);
  history.pushState = (...a: Parameters<History['pushState']>) => {
    const ms = (window as unknown as { __slow?: number }).__slow ?? 0;
    const t = Date.now();
    while (Date.now() - t < ms) { /* a slow device drawing the next page */ }
    return push(...a);
  };
}

test('r73p toast 1: on a slow device the removal\'s Undo is shown on the page it lands on, and brings the plant back', async ({ page }) => {
  await page.addInitScript(slowPush);
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('r-a', '2026-0001', 'Copiapoa cinerea'), Date.now() - 3_600_000);
  await page.goto('/plants/2026-0001'); await ready(page);
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await page.evaluate(() => { (window as unknown as { __slow: number }).__slow = 800; });
  await page.getByRole('button', { name: 'Yes, remove 2026-0001' }).click();
  await expect(page).toHaveURL(/\/plants$/);
  // r73base: put away as /plants landed, 800 ms after it was raised.
  await expect(page.locator('.toast')).toContainText('2026-0001 removed.');
  await page.evaluate(() => { (window as unknown as { __slow: number }).__slow = 0; });
  await page.locator('.toast .undo').click();
  await expect(page).toHaveURL(/\/plants\/2026-0001$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
});

test('r73p toast 2: a toast raised well before an unrelated navigation still goes with it (guard)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-a', '2026-0001', 'Copiapoa cinerea'), ...plant('r-b', '2026-0002', 'Copiapoa humilis')], Date.now() - 3_600_000);
  await page.goto('/plants/2026-0001'); await ready(page);
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await page.getByRole('button', { name: 'Yes, remove 2026-0001' }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await expect(page.locator('.toast')).toContainText('2026-0001 removed.');
  await page.waitForTimeout(1200); // the toast is older than 600 ms when the next navigation begins
  await page.locator('a.accrow', { hasText: '2026-0002' }).click();
  await expect(page).toHaveURL(/2026-0002/);
  await expect(page.locator('.toast .undo')).toHaveCount(0);
});

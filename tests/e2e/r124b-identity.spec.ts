/**
 * Round 124 (MYPLANTS 31, the identity check; docs/REVIEW-ROUND-124.md): a plant's name as received, checked by me (its
 * day and what against), or verified by someone (their name and the day), kept in the ITF2 fields and shown on its page.
 *
 * On 589c330: FAILED, every test (no Identity block).
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
async function open(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: 20_000 });
  const rows: Row[] = Object.entries({ acc: '2026-0001', taxonName: 'Lithops lesliei', status: 'growing', nameKind: 'species' }).map(([f, v]) => ['accession', 'p1', f, v] as Row);
  await inject(page, rows, Date.now() - 10 * DAY, 'r124bbbbbbbbb001');
  await page.goto('/plants/2026-0001'); await ready(page);
}

test('r124b 1: a new plant\'s name is as received; checked by me says its day and what against @phone', async ({ page }) => {
  await open(page);
  await expect(page.locator('#id-state')).toHaveText('As received');
  await page.locator('#id-change').click();
  await page.getByLabel('Checked by me').check();
  await page.fill('#id-on', '2026-11-20');
  await page.fill('#id-who', "Cole's Lithops key");
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#id-state')).toHaveText("Checked by you, 2026-11-20, against Cole's Lithops key");
  await page.reload(); await ready(page);
  await expect(page.locator('#id-state')).toHaveText("Checked by you, 2026-11-20, against Cole's Lithops key");
});

test('r124b 2: verified by someone needs their name; back to as received clears the rest', async ({ page }) => {
  await open(page);
  await page.locator('#id-change').click();
  await page.getByLabel('Verified by someone').check();
  await page.fill('#id-who', '');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#id-msg')).toHaveText('Say who verified it.');
  await page.fill('#id-who', 'S. Hammer');
  await page.fill('#id-on', '2026-10');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#id-state')).toHaveText('Verified by S. Hammer, 2026-10');
  await page.locator('#id-change').click();
  await page.getByLabel('As received').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#id-state')).toHaveText('As received');
});

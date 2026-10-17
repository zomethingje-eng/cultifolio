/**
 * Round seventy, W (triage-69 W1, S-E1): a tab open before another tab set sync up, moved to /sync by the top bar's own
 * link (a move inside the app: the layout does not mount again), was configured by the page's `init` and never ran. The
 * status said "Not checked yet / last synced just now; checking now" and nothing was asked for fifteen seconds and more.
 * FAILED on the base: no sync request, and "checking now", fifteen seconds after arriving.
 */
import { test, expect, type Page } from '@playwright/test';
import { fromAddress } from './helpers/address';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

test('a tab open before sync was set up in another tab, moved to /sync by its own link, runs and says Synced (round seventy; W1)', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  await fromAddress(ctx);
  // Tab A opens first, with no sync record: its layout's init finds nothing and schedules nothing.
  const a = await ctx.newPage();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(a);
  await a.getByRole('button', { name: /^Add/ }).click();
  await expect(a).toHaveURL(/\/plants\/\d{4}-\d{4}$/, { timeout: 20_000 });
  // Tab B sets a vault up and syncs, then closes.
  const b = await ctx.newPage();
  await b.goto('/sync');
  await ready(b);
  await b.click('#sync-start');
  const key = (await b.locator('#vault-key').textContent())!.trim();
  await b.fill('#key-typeback', key.slice(-5).toLowerCase());
  await b.click('#sync-create');
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('Synced', { timeout: 20_000 });
  await b.close();
  // Tab A follows the top bar's Sync link: no reload, no focus change, and well inside the five-minute tick.
  const asked: string[] = [];
  a.on('request', (r) => { if (r.url().includes('/api/sync/')) asked.push(`${r.method()} ${new URL(r.url()).pathname}`); });
  await a.locator('a.iconbtn.sync').click();
  await expect(a).toHaveURL(/\/sync$/);
  const status = a.locator('.card', { hasText: 'Status' });
  await expect(status).toContainText('Synced', { timeout: 15_000 }); // base: "Not checked yet … checking now"
  expect(asked).toContain('GET /api/sync/log');
  await expect(status).not.toContainText('checking now');
  await ctx.close();
});

/**
 * Round 105 (docs/PLAN-105.md; the first hand-off's round 3, less its search items, which round 104 built): the top bar
 * and browse's default order.
 *
 * - The static label beside the wordmark is gone: a list page has no crumb, its place being the one lit in the bar; a
 *   detail page keeps its trail and its Back link.
 * - Sync and Add say their names beside their signs from 901 px, each visible word the start of its accessible name; Sync
 *   shows only once sync is set up or the collection holds a record.
 * - From 1200 px Labels and Settings are in the bar too; one place is the current page (Labels, not My plants, on
 *   /labels there).
 * - Browse's default order (the habitat climate first) is proved by tests/unit/r105a-order.test.ts and r87u's order links:
 *   the fixture corpus counts nothing as grown, so its /browse is in A to Z order, as a build with nothing counted is.
 *
 * On a78a3d0: FAILED, every test. "My plants", "Today", "About" and "Settings" stood beside the wordmark; Sync was a bare
 * "⟳" on a first visit with nothing to sync, and Add a bare "+"; Labels and Settings were in "More" alone.
 */
import { test, expect, type Page, type Browser } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
async function at(browser: Browser, baseURL: string | undefined, width: number, height = 800) {
  const ctx = await browser.newContext({ baseURL, viewport: { width, height } });
  return { ctx, page: await ctx.newPage() };
}
/** A plant in the collection, added as a grower adds one. */
async function addPlant(page: Page) {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/, { timeout: 20_000 });
}

test('r105b 1: no label beside the wordmark on a list page; a detail page keeps its trail and Back', async ({ browser, baseURL }) => {
  const { ctx, page } = await at(browser, baseURL, 1280);
  for (const path of ['/plants', '/today', '/about', '/settings', '/?by=genus', '/browse']) {
    await page.goto(path); await ready(page);
    await expect(page.locator('#topbar nav.crumb'), path).toHaveCount(0);
    await expect(page.locator('#topbar a[aria-label="Back"]'), path).toHaveCount(0);
  }
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const trail = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(trail).toBeVisible();
  await expect(trail.getByRole('listitem')).toHaveText([/Species/, /Copiapoa cinerea/]);
  await expect(page.locator('#topbar a[aria-label="Back"]')).toHaveCount(1);
  await page.goto('/about/how'); await ready(page);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('listitem')).toHaveText([/About/, /How it is made/]);
  await ctx.close();
});

test('r105b 2: Sync shows once there is something to sync, and Sync and Add say their names on a desktop', async ({ browser, baseURL }) => {
  const { ctx, page } = await at(browser, baseURL, 1280);
  await page.goto('/?by=genus'); await ready(page);
  // A first visit: nothing to sync, so no sync control; /sync is still in "More".
  await expect(page.locator('#topbar a.iconbtn.sync')).toHaveCount(0);
  await page.getByRole('button', { name: 'More menu' }).first().click();
  await expect(page.locator('#menu').getByRole('link', { name: 'Sync', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const add = page.locator('#topbar a.addbtn');
  await expect(add).toHaveAccessibleName('Add a plant');
  await expect(add).toHaveText('+Add');
  await expect(add.locator('.iw')).toBeVisible();
  // A plant added: Sync is shown, its word the start of its name.
  await addPlant(page);
  const sync = page.locator('#topbar a.iconbtn.sync');
  await expect(sync).toHaveCount(1);
  await expect(sync).toHaveAccessibleName('Sync');
  await expect(sync.locator('.iw')).toHaveText('Sync');
  await expect(sync.locator('.iw')).toBeVisible();
  // Under 901 px the signs stand alone, their names the labels'.
  await page.setViewportSize({ width: 800, height: 800 });
  await expect(sync.locator('.iw')).toBeHidden();
  await expect(page.locator('#topbar a.addbtn .iw')).toBeHidden();
  await expect(sync).toHaveAccessibleName('Sync');
  await ctx.close();
});

test('r105b 3: Labels and Settings in the bar from 1200 px, one place current', async ({ browser, baseURL }) => {
  const { ctx, page } = await at(browser, baseURL, 1280);
  const main = page.getByRole('navigation', { name: 'Main' });
  await page.goto('/labels'); await ready(page);
  await expect(main.getByRole('link')).toHaveText(['Reference', 'My plants', 'Today', 'About', 'Labels', 'Settings']);
  await expect(main.locator('a[aria-current="page"]')).toHaveText(['Labels']);
  await page.goto('/settings'); await ready(page);
  await expect(main.locator('a[aria-current="page"]')).toHaveText(['Settings']);
  // At 1024 they are in "More" alone, and My plants is the place lit on /labels, as before.
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/labels'); await ready(page);
  await expect(main.getByRole('link')).toHaveText(['Reference', 'My plants', 'Today', 'About']);
  await expect(main.locator('a[aria-current="page"]')).toHaveText(['My plants']);
  await ctx.close();
});

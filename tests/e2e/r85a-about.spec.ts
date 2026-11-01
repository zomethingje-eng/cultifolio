/**
 * Round eighty-five (A): the about pages as a grower reads them (the reviews' S11, A22).
 *
 *  1. /about/how opens on summaries: every list of rules is folded under its section's summary, one tap away on a 44 px
 *     line, and a tap opens it and closes it again.
 *  2. An address naming a folded rule (/about/how#set-aside, #islands; /about/formats#clock) opens the lists around it
 *     and shows it; a link inside the page to a folded rule (#sample from the GBIF keys' rules) does the same.
 *  3. At 320 px neither page is wider than the screen with every list open.
 *
 * The worker is blocked so the routes answer here; every wait is for a state. On r85base: 1 FAILED (the rules were shown
 * whole), 2 FAILED (no folded lists, no #sample or #islands), 3 passed (a guard).
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await page.route('**/api/counts', (r) => r.abort()); });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

test('r85a about 1: the rules are folded under each summary, a tap away (44 px on a phone) @phone', async ({ page }) => {
  await page.goto('/about/how');
  await ready(page);
  const folds = page.locator('article.prose details.in-full');
  expect(await folds.count()).toBeGreaterThan(25);
  // None open, every one's rules hidden, and each comes after a summary the reader sees.
  for (const d of await folds.all()) {
    await expect(d).not.toHaveAttribute('open', '');
    await expect(d.locator('li').first()).toBeHidden();
  }
  await expect(page.locator('#shapes + p.sum')).toBeVisible();
  const shapes = page.locator('#shapes ~ details.in-full').first();
  const summary = shapes.locator('summary');
  // The site's tap height: 44 px under a finger (the phone), less under a mouse.
  const tap = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap')));
  if (test.info().project.name === 'phone') expect(tap).toBeGreaterThanOrEqual(44);
  expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(tap - 0.5);
  await summary.click();
  await expect(shapes.locator('li').first()).toBeVisible();
  await summary.click();
  await expect(shapes.locator('li').first()).toBeHidden();
});

test('r85a about 2: an address naming a folded rule opens it, and so does a link to one inside the page @phone', async ({ page }) => {
  await page.goto('/about/how#set-aside');
  await ready(page);
  // A heading is not folded: it is shown, with its summary. An id inside a list opens the list.
  await expect(page.locator('#set-aside')).toBeInViewport();
  await expect(page.locator('#set-aside + p.sum')).toBeVisible();
  await page.goto('/about/how#islands');
  await ready(page);
  await expect(page.locator('#islands')).toBeVisible();
  await expect(page.locator('#islands')).toBeInViewport();
  // Inside the page: the GBIF keys' rules link "below" to the records' sample.
  await page.goto('/about/how');
  await ready(page);
  const keys = page.locator('#keys ~ details.in-full').first();
  await keys.locator('summary').click();
  await expect(page.locator('#sample')).toBeHidden();
  await keys.locator('a[href="#sample"]').click();
  await expect(page.locator('#sample')).toBeVisible();
  await expect(page.locator('#sample')).toBeInViewport();
  // The formats page: a part of a folded section.
  await page.goto('/about/formats#clock');
  await ready(page);
  await expect(page.locator('#clock')).toBeVisible();
  await expect(page.locator('#clock')).toBeInViewport();
});

test('r85a about 3: at 320 px neither page is wider than the screen with every list open @phone-only', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/about/how', '/about/formats']) {
    await page.goto(path);
    await ready(page);
    await page.evaluate(() => { for (const d of document.querySelectorAll('article.prose details')) (d as HTMLDetailsElement).open = true; });
    await expect(page.locator('article.prose details:not([open])')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
});

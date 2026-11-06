/**
 * Round eighty-six, the maps agent: review P's P1 in the browser. The close-up's names are placed by a table of where
 * each region's land is (`$lib/map/region-labels`), which the page's script does not carry: the server draws the page's
 * own close-up with it, and a move inside the app loads it when it draws one. This checks the second way, where a table
 * not loaded would leave the map without its names. The placement itself is tested in tests/unit/r86m-labels.test.ts.
 *
 * On r86base (1b663ea): passes; it guards the loaded table, which the base did not need (its names were placed by the
 * region's box, wrongly for an L-shaped region).
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });

test('r86m labels: a close-up drawn after a move inside the app names its region, from the table it loads @phone', async ({ page }) => {
  await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => r.abort());
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/about/how'); await ready(page);
  const data: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/species/copiapoa-cinerea/__data.json')) data.push(r.url()); });
  // A tap on a link inside the app, as r81u's.
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/species/copiapoa-cinerea'; a.id = 'r86m-go'; a.textContent = 'go'; document.body.insertBefore(a, document.body.firstChild); a.click(); });
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  expect(data.length).toBeGreaterThan(0); // drawn in the browser, from the page's data
  const box = page.locator('.maprow .mapbox').nth(1);
  await box.scrollIntoViewIfNeeded();
  await expect(box.locator('.mwords .mlab', { hasText: 'Chile North' })).toBeVisible();
  expect(errors).toEqual([]);
});

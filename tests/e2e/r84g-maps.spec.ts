/**
 * Round eighty-four, G (review W1): the species page's two maps draw the native regions' shapes from the two static files,
 * referenced like the coastline, and the browser draws them: the world map's Namibia and Angola, and the close-up's Chile
 * North for Copiapoa cinerea, each a shape of the size of its region, not a rectangle over the sea. The files are kept a day,
 * as the coastline is. FAILS on r84base: every region is a <rect>, and /maps/regions110.svg is a 404.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

test('the maps draw the regions by their shapes, from files kept a day @phone', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.continue()));
  await page.goto('/species/welwitschia-mirabilis'); await ready(page);
  // Round eighty-six (outside review B's 4): the maps take their files when they near the viewport.
  await page.locator('.maprow').scrollIntoViewIfNeeded();
  const world = page.locator('.mapbox svg.map-world');
  await expect(world.locator('use.range')).toHaveCount(2);
  await expect(world.locator('rect.range')).toHaveCount(0);
  expect(await world.locator('use.range').evaluateAll((xs) => xs.map((x) => x.getAttribute('href')))).toEqual(['/maps/w/w-NAM.svg#r', '/maps/w/w-ANG.svg#r']);
  // Drawn: the shape has the size of Namibia (about 9° by 12°), not nothing (a file not found) and not its box's corners.
  await expect.poll(() => world.locator('use.range').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().height))).toBeGreaterThan(8);
  const region = page.locator('.mapbox svg.map-region');
  await expect(region.locator('use.range[href="/maps/r/r-NAM.svg#r"]')).toHaveCount(1);
  await expect(region.locator('rect.range')).toHaveCount(0);

  // Round eighty-five: one file a region and a scale.
  for (const f of ['w/w-NAM', 'w/w-ANG', 'r/r-NAM', 'r/r-CLN']) {
    const r = await request.get(`/maps/${f}.svg`);
    expect(r.status(), f).toBe(200);
    expect(r.headers()['content-type'], f).toContain('image/svg+xml');
    expect(r.headers()['cache-control'], f).toContain('max-age=86400');
    expect(await r.text(), f).toContain('<path id="r" ');
  }

  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('.maprow').scrollIntoViewIfNeeded();
  await expect(page.locator('.mapbox svg.map-region use.range[href="/maps/r/r-CLN.svg#r"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

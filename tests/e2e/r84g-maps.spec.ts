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
  const world = page.locator('.mapbox svg.map-world');
  await expect(world.locator('use.range')).toHaveCount(2);
  await expect(world.locator('rect.range')).toHaveCount(0);
  expect(await world.locator('use.range').evaluateAll((xs) => xs.map((x) => x.getAttribute('href')))).toEqual(['/maps/regions110.svg#NAM', '/maps/regions110.svg#ANG']);
  // Drawn: the shape has the size of Namibia (about 9° by 12°), not nothing (a file not found) and not its box's corners.
  await expect.poll(() => world.locator('use.range').first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().height))).toBeGreaterThan(8);
  const region = page.locator('.mapbox svg.map-region');
  await expect(region.locator('use.range[href="/maps/regions50.svg#NAM"]')).toHaveCount(1);
  await expect(region.locator('rect.range')).toHaveCount(0);

  for (const f of ['regions110', 'regions50']) {
    const r = await request.get(`/maps/${f}.svg`);
    expect(r.status(), f).toBe(200);
    expect(r.headers()['content-type'], f).toContain('image/svg+xml');
    expect(r.headers()['cache-control'], f).toContain('max-age=86400');
    const body = await r.text();
    for (const id of ['NAM', 'ANG', 'CLN']) expect(body, `${f} ${id}`).toContain(`<path id="${id}" `);
  }

  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('.mapbox svg.map-region use.range[href="/maps/regions50.svg#CLN"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

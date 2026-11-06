/**
 * Round eighty-five, G (outside review A's performance measures; review W3): a species page fetches only its own regions'
 * shapes, one small file each, and the world map's range is drawn at 3:1 or more against the land, in light and in dark.
 * FAILS on r85base: the page fetches /maps/regions50.svg (436 kB) and /maps/regions110.svg, and the range is 1.16:1.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** WCAG's contrast of two computed colours ("rgb(r, g, b)"). */
function contrast(a: string, b: string): number {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((x) => +x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("a species page fetches its own regions' map files, and no others @phone", async ({ page }) => {
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.continue()));
  const maps: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/maps/')) maps.push(u.pathname); });
  await page.goto('/species/welwitschia-mirabilis'); await ready(page);
  // Round eighty-six (outside review B's 4): the maps take their files when they near the viewport.
  await page.locator('.maprow').scrollIntoViewIfNeeded();
  const world = page.locator('.mapbox svg.map-world use.range');
  await expect(world).toHaveCount(2);
  // Drawn: Namibia's shape has its size, so its file came.
  await expect.poll(() => world.first().evaluate((e) => Math.round((e as SVGGraphicsElement).getBBox().height))).toBeGreaterThan(8);
  // Counted as distinct files: since round eighty-six a script sets each map's addresses, and WebKit then asks a close-up's
  // region file once for each of the two layers that draw it (its land and its range), where Chromium asks once (the
  // owner's WebKit run). The test is of which files, as r80u offline 2 counts the install.
  await expect.poll(() => [...new Set(maps.filter((m) => /^\/maps\/[wr]\//.test(m)))].sort()).toEqual(['/maps/r/r-ANG.svg', '/maps/r/r-NAM.svg', '/maps/w/w-ANG.svg', '/maps/w/w-NAM.svg']);
  expect(maps.filter((m) => /regions(50|110)/.test(m))).toEqual([]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`the world map's range is 3:1 or more against the land and the sea, ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/species/welwitschia-mirabilis'); await ready(page);
    const fills = await page.locator('.mapbox svg.map-world').evaluate((svg) => {
      const fill = (sel: string) => { const e = svg.querySelector(sel)!; const s = getComputedStyle(e); return { fill: s.fill, opacity: s.fillOpacity }; };
      return { range: fill('use.range'), land: fill('use.land'), sea: fill('rect.sea') };
    });
    expect(fills.range.opacity).toBe('1');
    expect(contrast(fills.range.fill, fills.land.fill)).toBeGreaterThanOrEqual(3);
    expect(contrast(fills.range.fill, fills.sea.fill)).toBeGreaterThanOrEqual(3);
  });
}

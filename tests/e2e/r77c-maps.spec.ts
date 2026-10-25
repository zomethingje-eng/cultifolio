/**
 * Round seventy-seven, agent C: the species page carries its maps' points, not the maps drawn. Until this round the load
 * sent both maps as markup in the page's data beside the range and the records they are drawn from, so each was in the
 * page twice; now the page draws them, on the server and again in the browser. The maps a reader sees must be the ones
 * the server drew: after hydration, after a client-side visit to another species, and back again; and the provenance
 * line still counts the records' datasets, which the page now carries as a count.
 * On r77base this passes too (the maps were drawn by the server alone); it guards the move, not a fault.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const maps = (p: Page) => p.locator('.mapbox svg').evaluateAll((xs) => xs.map((x) => x.outerHTML));

test('the maps drawn in the browser are the ones the server drew @phone', async ({ page, browser }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // The fixture's photographs are made-up addresses on the real hosts: on a machine that reaches them, iNaturalist answers
  // 404 and WebKit logs each as a console error (the owner's run, round seventy-seven). They are answered here with a
  // pixel, so the console holds the page's own faults only.
  const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.continue()));
  // As the server sent them, before any script ran.
  const raw = await browser.newPage({ javaScriptEnabled: false });
  const server = async (slug: string) => { await raw.goto(`/species/${slug}`); return maps(raw); };
  const cinerea = await server('copiapoa-cinerea');
  const humilis = await server('copiapoa-humilis');
  await raw.close();
  expect(cinerea).toHaveLength(2);
  expect(cinerea[0]).toContain('aria-label="Native range of Copiapoa cinerea"');
  expect(cinerea[1]).toContain('aria-label="Openly licensed records of Copiapoa cinerea"');
  // Every open record a point: a dot each, in the one group (round eighty-three; it was a circle each).
  expect((cinerea[1].match(/<path d="M[-.\d ]+h0"/g) ?? []).length).toBe(52);

  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  expect(await maps(page)).toEqual(cinerea);
  await expect(page.locator('details.prov')).toContainText('Records came from 2 datasets via GBIF.org');
  // A client-side visit: the page's data comes from the server as data, and the page draws the maps itself.
  await page.locator('#s-related ~ .relstrip a', { hasText: 'Copiapoa humilis' }).first().click();
  await expect(page).toHaveURL(/\/species\/copiapoa-humilis$/);
  await expect(page.locator('.mapbox svg.map-region')).toHaveAttribute('aria-label', 'Openly licensed records of Copiapoa humilis');
  expect(await maps(page)).toEqual(humilis);
  await expect(page.locator('details.prov')).toContainText('Records came from 2 datasets via GBIF.org');
  await page.goBack();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('.mapbox svg.map-region')).toHaveAttribute('aria-label', 'Openly licensed records of Copiapoa cinerea');
  expect(await maps(page)).toEqual(cinerea);
  expect(errors).toEqual([]);
});

/**
 * Round eighty (U): the layout faults the phone and desktop reviews found in the app's pages.
 *
 *  1. A notice (the toast) sat under the top bar on a desktop, over the page's own heading: the plant's number and name,
 *     the add form's backup line (the desktop review's 9). It now sits at the window's foot at every width.
 *  2. The month table's row names went with the numbers when the table was swiped sideways (the phone review's 6).
 *  3. The section tabs' fade showed the page through the pinned bar (the phone review's 7): no mask on the bar now.
 *  4. About 70 px of nothing under "GBIF 7284333" on the add form from a species page (the phone review's 9).
 *  5. The add form's fields were 41 to 43 px against the 44 px tap size (the phone review's 9).
 *  6. "Mexico· introduced": the space before the dot was lost (the phone review's 9; Svelte trims it inside an element).
 *  7. A "Native" cell with no marker beside it sat in one of five columns, a blank and a broken border after it (the
 *     desktop review's 13).
 *  8. The map's caption left a band of the card's colour between it and the map (the desktop review's 13).
 *  9. (The letter index that left "Z" alone at 1280 and 1440, the desktop review's 8, is agent S's, in the catalogue.)
 * 10. A "You grow" tile's number covered its placeholder's letter (the phone review's 9).
 * 11. A related tile whose photograph failed was a plain white square (the phone review's 9).
 * 12. The name check's line said "press Add" when the button read "Add as typed" (the desktop review's 11).
 * 13. The collection's pages warned that the two Latin fonts were preloaded and not used (the phone review's 9).
 *
 * On r80f each FAILED where it is run (1 on a desktop; 2, 3 and 5 on the phone; 4 at both; 6; 7 and 8 on a desktop;
 * 10 on the phone; 11; 12; 13).
 */
import { test, expect, type Page } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';
import * as devalue from 'devalue';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
test.beforeEach(async ({ page }) => { await page.addInitScript(() => { try { sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } }); });

const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test('r80u layout 1: the toast after Water does not cover the plant\'s number and name; it sits at the window\'s foot @phone', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Watering recorded');
  const toast = (await page.locator('.toast').boundingBox())!;
  const name = (await page.locator('.idcard h1').boundingBox())!;
  expect(overlap(toast, name), JSON.stringify({ toast, name })).toBe(0);
  expect(toast.y).toBeGreaterThan(page.viewportSize()!.height / 2);
});

test('r80u layout 2: the month table\'s row names stay put when the table is swiped sideways @phone-only', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('details.figures > summary').click();
  const scroller = page.locator('.scroll-x[aria-label="Habitat climate by month"]');
  await expect(scroller).toBeVisible();
  await scroller.evaluate((el) => { el.scrollLeft = 300; });
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  const left = (await scroller.boundingBox())!.x;
  const name = (await page.locator('table.wx tbody tr').first().locator('td').first().boundingBox())!;
  expect(name.x, JSON.stringify({ left, name })).toBeGreaterThanOrEqual(left - 1);
});

test('r80u layout 3: the section tabs fade their labels, not the bar: no mask, a fade drawn in the bar\'s colour @phone-only', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const s = await page.locator('nav.tabs').evaluate((el) => { const c = getComputedStyle(el); const a = getComputedStyle(el, '::after'); return { mask: c.maskImage || c.webkitMaskImage, after: a.position, bg: a.backgroundImage }; });
  expect(s.mask).toBe('none');
  expect(s.after).toBe('sticky');
  expect(s.bg).toContain('gradient');
});

test('r80u layout 4: from a species page the add form keeps one line under the name for its check, not three; typing brings the three back @phone', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF', { timeout: 15_000 });
  const linked = (await page.locator('.picker .status').boundingBox())!.height;
  expect(linked).toBeLessThan(40);
  await page.locator('#species-name').press('End');
  await page.locator('#species-name').pressSequentially('x');
  await expect.poll(async () => (await page.locator('.picker .status').boundingBox())!.height).toBeGreaterThan(55);
});

test('r80u layout 5: the add form\'s fields are the tap size on a phone @phone-only', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.locator('details.moredetails > summary').click();
  for (const f of ['#species-name', '#f-prov', '#f-form']) expect((await page.locator(f).boundingBox())!.height, f).toBeGreaterThanOrEqual(44);
});

test('r80u layout 6: the native range keeps its space before " · introduced"', async ({ page }) => {
  await page.goto('/species/hesperocyparis-lusitanica'); await ready(page);
  const native = page.locator('.factgrid > div', { has: page.locator('b', { hasText: /^Native$/ }) });
  await expect(native).toContainText('introduced:');
  expect(await native.innerText()).toMatch(/\S · introduced:/);
});

test('r80u layout 7: a "Native" cell with no marker beside it takes its line, no blank after it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/species/refusia-testii'); await ready(page);
  const grid = (await page.locator('.factgrid').boundingBox())!;
  const native = (await page.locator('.factgrid > div', { has: page.locator('b', { hasText: /^Native$/ }) }).boundingBox())!;
  expect(native.width / grid.width, JSON.stringify({ grid, native })).toBeGreaterThan(0.9);
});

test('r80u layout 8: each map\'s caption starts where its map ends, no band between @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const gaps = await page.locator('.maprow .mapbox').evaluateAll((boxes) => boxes.map((b) => { const cap = b.querySelector('.mapcap')!; const prev = cap.previousElementSibling!; return Math.round(cap.getBoundingClientRect().top - prev.getBoundingClientRect().bottom); }));
  expect(gaps.length).toBe(2);
  for (const g of gaps) expect(Math.abs(g), JSON.stringify(gaps)).toBeLessThanOrEqual(1);
});

test('r80u layout 10: a "You grow" tile\'s number does not cover its placeholder\'s letter @phone', async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem('cultifolio.prefs', JSON.stringify({ referencePhotos: false })); } catch { /* fine */ } });
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  await page.goto('/'); await ready(page);
  const tile = page.locator('a.tile', { has: page.locator('.ownchip') }).first();
  await expect(tile.locator('.ini')).toBeVisible();
  const chip = (await tile.locator('.ownchip').boundingBox())!;
  const ini = (await tile.locator('.ini').boundingBox())!;
  expect(overlap(chip, ini), JSON.stringify({ chip, ini })).toBe(0);
});

test('r80u layout 11: a related tile whose photograph failed says so in its square, not a blank white tile @phone', async ({ page }) => {
  await page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|api\.gbif\.org)\//, (r) => r.abort());
  // The fixture's related species have no photograph: the page's data gives them one, from a host that does not answer.
  await page.route(/\/species\/copiapoa-cinerea\/__data\.json/, async (route) => {
    const res = await route.fetch();
    const j = JSON.parse((await res.text()).split('\n')[0]) as { nodes: Array<{ type: string; data?: unknown[] }> };
    for (const n of j.nodes) {
      if (n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as Record<string, unknown>;
      if (!Array.isArray(d.near)) continue;
      d.near = (d.near as Array<Record<string, unknown>>).map((c, i) => ({ ...c, thumb: `https://inaturalist-open-data.s3.amazonaws.com/photos/${3000 + i}/medium.jpg` }));
      n.data = JSON.parse(devalue.stringify(d));
    }
    await route.fulfill({ response: res, body: JSON.stringify(j) });
  });
  await page.goto('/about/how'); await ready(page);
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/species/copiapoa-cinerea'; a.id = 'r80u-go'; document.body.insertBefore(a, document.body.firstChild); a.click(); });
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('.reltile .relim').first()).toBeAttached();
  await page.locator('.reltile').first().scrollIntoViewIfNeeded(); // the tiles' photographs load lazily
  const failed = page.locator('.reltile .relim.failed');
  await expect(failed.first()).toBeAttached();
  const said = await failed.first().evaluate((el) => getComputedStyle(el, '::after').content);
  expect(said).toContain('did not load');
  expect((await failed.first().boundingBox())!.height).toBeGreaterThan(40);
});

test('r80u layout 12: the name check\'s line names the button as it reads, "Add as typed" @phone', async ({ page }) => {
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Notaplantia fakeus');
  await page.locator('#species-name').blur();
  await expect(page.locator('.picker .pill.warn').or(page.getByRole('status').filter({ hasText: 'The name service did not answer' })).first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.getByRole('button', { name: 'Add as typed' })).toBeVisible();
  await expect(page.locator('.picker .hint')).toContainText('press “Add as typed” to keep exactly what you typed');
});

test('r80u layout 13: a page of the collection, drawn on the device, raises no warning about unused preloaded fonts; a server page still preloads them @phone', async ({ page, request }) => {
  const warned: string[] = [];
  page.on('console', (m) => { if (/preloaded using link preload/.test(m.text())) warned.push(m.text()); });
  await page.goto('/plants/new'); await ready(page);
  await page.waitForTimeout(5000); // a negative: the browser warns a few seconds after the load, or not at all
  expect(warned).toEqual([]);
  const html = await (await request.get('/species/copiapoa-cinerea')).text();
  expect(html.match(/<link rel="preload" as="font"/g)?.length).toBe(2);
});

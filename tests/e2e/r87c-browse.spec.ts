/**
 * Round eighty-seven (browse, C1, C2, C4) in the browser, over the fixture corpus (five species): /browse's rail, each
 * count what a click gives, ticks that replace the address, the empty state's fixes, the list view and the phone's
 * stacked rows, the CSV, the entrance pages (breadcrumbs, figures, noindex on a filtered view, a genus of one species
 * moved to its species), the rail without scripts, and the pages' first paint.
 *
 * Fails on the base (r85m head), where none of these pages exists.
 */
import { test, expect, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';
import { chromiumOnly } from './helpers/engines';

test.use({ serviceWorkers: 'block' });

const total = async (p: Page) => Number((await p.locator('.bv .head .count .num').innerText()).replace(/,/g, ''));
const num = (s: string) => Number(s.replace(/[+,]/g, '')) || 0;

test('r87c 1: every count beside a family is what ticking it gives (each count is held at unit level too), and a tick replaces the address @phone', async ({ page }) => {
  await page.goto('/browse');
  await ready(page);
  await expect(page.locator('h1')).toContainText('5 species');
  if (await page.locator('.phonebar .filters').isVisible()) await page.locator('.phonebar .filters').click();
  const rows = page.locator('#bv-rail section:has(#bv-family) li label');
  const n = await rows.count();
  expect(n).toBeGreaterThan(1);
  const length = await page.evaluate(() => history.length);
  for (let i = 0; i < n; i++) {
    const label = rows.nth(i);
    const name = (await label.locator('.lab').innerText()).trim();
    const shown = num(await label.locator('.n').innerText());
    await label.locator('input').check();
    await expect(page).toHaveURL(new RegExp(`f=${name.toLowerCase()}`));
    await expect.poll(() => total(page), name).toBe(shown);
    await page.goto('/browse'); await ready(page);
    if (await page.locator('.phonebar .filters').isVisible()) await page.locator('.phonebar .filters').click();
  }
  // A tick replaces the address: Back leaves the view, not the tick.
  await page.locator('#bv-rail input[name="climate"]').check();
  await expect(page).toHaveURL(/climate=1/);
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(length + n + 2);
});

test('r87c 2: a continent opened and ticked, its parts then ticked with it; a region\'s "+N" is what it adds', async ({ page }) => {
  await page.goto('/browse');
  await ready(page);
  const sa = page.locator('#bv-rail li', { has: page.locator('.lab', { hasText: /^Southern America$/ }) });
  const n = num(await sa.locator('.n').innerText());
  await sa.locator('input').check();
  await expect(page).toHaveURL(/r=8\b/);
  await expect.poll(() => total(page)).toBe(n);
  // The rail is now opened at it: its regions, each ticked with it.
  await expect(page.locator('#bv-rail .line')).toContainText('Southern America');
  const parts = page.locator('#bv-rail ul.choices').first().locator('input:checked');
  expect(await parts.count()).toBeGreaterThan(1);
  // In an any-of view, an unticked region's "+N" is how many it adds.
  await page.goto('/browse?r=CLN&in=85');
  await ready(page);
  const before = await total(page);
  const add = page.locator('#bv-rail li', { has: page.locator('.n', { hasText: /^\+/ }) }).first();
  const plus = num(await add.locator('.n').innerText());
  await add.locator('input').check();
  await expect.poll(() => total(page)).toBe(before + plus);
});

test('r87c 3: nothing answers: the page says so and offers each filter loosened, with what it gives', async ({ page }) => {
  await page.goto('/browse?r=CLN&f=welwitschiaceae');
  await ready(page);
  await expect(page.locator('.bv [role="status"]')).toContainText('No species are all of these.');
  const fix = page.locator('.bv .fixes li').first();
  const n = num(await fix.locator('.n').innerText());
  expect(n).toBeGreaterThan(0);
  await fix.locator('a').click();
  await expect.poll(() => total(page)).toBe(n);
});

test('r87c 4: the list view is a table, the phone\'s rows are stacked and nothing scrolls sideways at 320 px @phone', async ({ page }) => {
  await page.goto('/browse?view=list');
  await ready(page);
  const table = page.locator('table.list');
  await expect(table.locator('tbody tr')).toHaveCount(5);
  await expect(table.locator('tbody tr').first().locator('td[data-label="Habitat climate"]')).toHaveText(/^(known|none|pending|not asked|not checked)$/);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/browse?view=list', '/browse', '/region/southern-america', '/genus/copiapoa', '/region', '/genus', '/family']) {
    await page.goto(path);
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
});

test('r87c 5: the CSV holds every result, with a byte-order mark, and its columns\' sources are a second file', async ({ page, request }) => {
  await page.goto('/browse?g=copiapoa');
  await ready(page);
  const href = await page.locator('a', { hasText: 'Download CSV' }).getAttribute('href');
  expect(href).toBe('/browse/csv?g=copiapoa');
  const r = await request.get(href!);
  expect(r.headers()['content-type']).toBe('text/csv; charset=utf-8');
  expect(r.headers()['content-disposition']).toContain('attachment; filename="browse-copiapoa.csv"');
  const bytes = await r.body();
  expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  const lines = bytes.subarray(3).toString('utf8').split('\r\n').filter(Boolean);
  expect(lines[0]).toBe('species,page,kew_plant_name_id,gbif_key,family,english_name,native_to,native_to_names,habitat_climate,record_low_c,grown,page_changed'); // record_low_c: round eighty-seven, stage 2
  expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['Copiapoa cinerea', 'Copiapoa humilis']);
  const s = await request.get(await page.locator('a', { hasText: 'Its columns and sources' }).getAttribute('href') as string);
  expect((await s.text()).split('\r\n')[0]).toContain('column,meaning,source,as_of');
});

test('r87c 6: an entrance page: breadcrumbs, its own figures, indexable; a filtered view is not; a genus of one species is its species', async ({ page }) => {
  await page.goto('/region/southern-america');
  await ready(page);
  await expect(page.locator('h1')).toHaveText('Southern America');
  await expect(page.getByRole('navigation', { name: 'Where this page is' }).getByRole('link', { name: 'Regions' })).toHaveAttribute('href', '/region');
  await expect(page.locator('table.figs')).toContainText('Species native here');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://cultifolio.com/region/southern-america');
  // Any other choice is a link to /browse, which says it is not for search engines.
  await page.goto('/browse?r=8&climate=1');
  await ready(page);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, follow');
  await page.goto('/genus/copiapoa');
  await ready(page);
  await expect(page.locator('h1 i')).toHaveText('Copiapoa');
  await expect(page.locator('.bv .tiles li')).toHaveCount(2);
  await page.goto('/genus/welwitschia');
  await expect(page).toHaveURL(/\/species\/welwitschia-mirabilis$/);
  await page.goto('/region/cln');
  await expect(page).toHaveURL(/\/region\/chile-north$/);
});

test('r87c 7: without scripts the rail is a form: tick and Show', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/browse');
  await page.locator('#bv-rail input[name="f"][value="cactaceae"]').check();
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(page).toHaveURL(/\/browse\?f=cactaceae/);
  await expect(page.locator('h1')).toContainText('2 species');
  await ctx.close();
});

test('r87c 8: the browse pages paint their first screen from the server, with no request for the index', chromiumOnly('the largest paint is read through PerformanceObserver\'s largest-contentful-paint, which only Chromium reports'), async ({ page }) => {
  const asked: string[] = [];
  page.on('request', (r) => { if (/\/api\/(index|entries)\b|\/s\/v3\/index\.json/.test(r.url())) asked.push(r.url()); });
  for (const path of ['/browse', '/region/southern-america', '/genus/copiapoa', '/family/cactaceae']) {
    await page.goto(path);
    await ready(page);
    const lcp = await page.evaluate(() => new Promise<number>((done) => { new PerformanceObserver((l) => { const e = l.getEntries(); done(e[e.length - 1].startTime); }).observe({ type: 'largest-contentful-paint', buffered: true }); }));
    // The first screen is the server's HTML (the count is in it before any script runs) and its paint well inside the
    // site's 2.5 s mark for a good largest paint, here without throttling.
    expect(lcp, path).toBeLessThan(2500);
  }
  expect(asked).toEqual([]);
  const html = await (await page.request.get('/browse')).text();
  expect(html).toContain('5</span> species');
  expect(html.length).toBeLessThan(400_000);
});

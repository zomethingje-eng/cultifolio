/**
 * Round eighty-seven (pages), in the browser: /about in the owner's words, /about/data, /changes, the not-found page's
 * species of the day, and the kind of name the add form records (plan D5, D6, D7; the deeper fix of round 86's U3).
 *
 * On the base (r85m head): /about went to /about/how; /about/data and /changes were not found; the not-found page showed
 * no plant and no browse links; the add form recorded no kind. Every test here fails there.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
/** No outside host, and the photograph hosts answered with a pixel, so a photograph loads offline. */
const photosLoad = async (page: Page) => {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (r: Route) => r.abort());
  await page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|api\.gbif\.org)\//, (r: Route) => r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
};
const wide = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('r87p 1: /about is the owner\'s page, served whole without JavaScript @phone', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, javaScriptEnabled: false, locale: 'en-GB' });
  const p = await ctx.newPage();
  const r = await p.goto('/about');
  expect(r?.status()).toBe(200);
  await expect(p).toHaveURL(/\/about$/);
  await expect(p.locator('h1')).toHaveText('About Cultifolio');
  await expect(p.locator('#who + p.owner')).toContainText('Made by Jonathan, who grows cacti, succulents and rare bulbs and got tired of care advice that never said where it came from.');
  await expect(p.locator('article')).toContainText('No text about a species is generated.');
  await expect(p.locator('article')).toContainText('thousands of unit tests and browser tests');
  await expect(p.locator('nav.aboutnav a[aria-current="page"]')).toHaveText('About');
  await expect(p.locator('nav.aboutnav a')).toHaveText(['About', 'How it is made', 'Formats', 'The data', 'Changes']);
  await ctx.close();
});

test('r87p 2: /about/data reads the corpus served: its id for the citation, the index to download, no derived dataset @phone', async ({ page, request }) => {
  await photosLoad(page);
  await page.goto('/about/data');
  await ready(page);
  await expect(page.locator('h1')).toHaveText('The data');
  // The fixture corpus has no manifest: its id alone, and the day said as not recorded.
  await expect(page.locator('#citation')).toHaveText('Cultifolio species reference, corpus fixture. https://cultifolio.com');
  await expect(page.locator('article')).toContainText('The day this corpus was built is not recorded where the site reads it.');
  const index = page.locator('a[href="/api/index"]');
  await expect(index).toHaveAttribute('download', 'cultifolio-index.json');
  const r = await request.get('/api/index');
  expect(r.status()).toBe(200);
  expect(Array.isArray(await r.json())).toBe(true);
  // The fixture's page cites no download: said so, never a DOI made up.
  await expect(page.locator('#doi')).toContainText('names no GBIF download');
  await expect(page.locator('#derived')).toHaveCount(0);
  await expect(page.locator('article')).not.toContainText('derived dataset');
  await expect(page.locator('a[href="https://github.com/zomethingje-eng/cultifolio"]').first()).toBeVisible();
});

test('r87p 3: /changes lists the rounds, newest first, each with its date and its record @phone', async ({ page }) => {
  await page.goto('/changes');
  await ready(page);
  const heads = page.locator('article.changes section h2');
  await expect(heads.first()).toContainText('Round 87');
  await expect(heads.first()).toContainText('9 November 2026');
  for (const n of [80, 81, 82, 84, 85, 86, 87]) await expect(page.locator(`#round-${n} a[href$="docs/REVIEW-ROUND-${n}.md"]`)).toHaveCount(1);
  await expect(page.locator('#round-83')).toHaveCount(0);
  // The one row of links, on every about page, the page being read marked.
  for (const [path, label] of [['/about', 'About'], ['/about/how', 'How it is made'], ['/about/formats', 'Formats'], ['/about/data', 'The data'], ['/changes', 'Changes']]) {
    await page.goto(path);
    await ready(page);
    await expect(page.locator('nav.aboutnav a'), path).toHaveText(['About', 'How it is made', 'Formats', 'The data', 'Changes']);
    await expect(page.locator('nav.aboutnav a[aria-current="page"]'), path).toHaveText(label);
  }
});

test('r87p 4: the not-found page shows the day\'s species with its full credit, the search and the browse pages @phone', async ({ page }) => {
  await photosLoad(page);
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/about/data/today')) asked.push(r.url()); });
  const r = await page.goto('/no-such-page');
  expect(r?.status()).toBe(404);
  await ready(page);
  await expect(page.locator('.err')).toContainText('No page at /no-such-page.');
  await expect(page.locator('.err form[role="search"] input[name="q"]')).toBeVisible();
  for (const href of ['/region', '/genus', '/family', '/']) await expect(page.locator(`.err a[href="${href}"]`).first()).toBeAttached();
  const fig = page.locator('figure.today');
  await expect(fig).toBeVisible({ timeout: 15_000 });
  await expect(fig.locator('#today-name i')).toHaveText(/^[A-Z][a-z]+ [a-z-]+/);
  await expect(fig.locator('.credit')).toContainText(/Photograph: .+\. Credits as read from .+ on \d{4}-\d{2}-\d{2}\./);
  await expect.poll(() => fig.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  expect(asked).toHaveLength(1);
  expect(await wide(page)).toBeLessThanOrEqual(0);
});

test('r87p 5: a photograph that does not load takes its credit with it @phone', async ({ page }) => {
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (r: Route) => r.abort());
  let answered = false;
  await page.route(/\/about\/data\/today$/, async (r) => { const res = await r.fetch(); answered = true; await r.fulfill({ response: res }); });
  await page.goto('/no-such-page');
  await ready(page);
  await expect.poll(() => answered, { timeout: 15_000 }).toBe(true);
  await expect(page.locator('.err form[role="search"]')).toBeVisible();
  await expect(page.locator('figure.today')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.err')).not.toContainText('Credits as read');
});

test('r87p 6: under a page of your own collection, and on a species address, the not-found page asks for no plant @phone', async ({ page }) => {
  await photosLoad(page);
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/about/data/today')) asked.push(r.url()); });
  await page.goto('/places/a/b/c');
  await ready(page);
  await page.goto('/species/aloe-nosuchname');
  await ready(page);
  // The species address keeps its own words (round eighty-six), and gains the browse line.
  await expect(page.locator('.err h1')).toHaveText('Not found');
  await expect(page.locator('.err .browse')).toContainText('Browse the species by region, genus or family.');
  await expect(page.locator('figure.today')).toHaveCount(0);
  expect(asked).toEqual([]);
});

test('r87p 7: at 320 px no about page is wider than the screen, and the licences stack @phone-only', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/about', '/about/data', '/changes']) {
    await page.goto(path);
    await ready(page);
    expect(await wide(page), path).toBeLessThanOrEqual(0);
  }
  await page.goto('/about/data');
  await expect(page.locator('.data thead')).toHaveCSS('position', 'absolute');
});

// The kind of name the add form records with the plant (round eighty-seven; round 86's r86f U3 steps).
const json = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const entry = (o: Record<string, unknown>) => ({ family: 'Apocynaceae', origin: ['Cape Provinces'], photos: 0, open: 3, climate: 'ok', ...o });
const HOODIA = entry({ key: 'k506502', slug: 'hoodia-alstonii', name: 'Hoodia alstonii', gbif: 9269454, syn: ['Trichocaulon alstonii', 'Ceropegia alstonii'], gname: 'Ceropegia alstonii' });
const row = (key: number, name: string, status = 'ACCEPTED') => ({ key, canonicalName: name, family: 'Apocynaceae', rank: 'SPECIES', status });
const SHEET = { key: 'k506502', gbif: 9269454, slug: 'hoodia-alstonii', name: { scientific: 'Hoodia alstonii', family: 'Apocynaceae' }, centroid: null, habitatLat: null, climate: { status: 'none' } };
const GBIF_COPY = { ...SHEET, slug: 'ceropegia-alstonii', via: 'gbif', page: 'hoodia-alstonii' };
const isPhone = () => test.info().project.name.startsWith('phone');
const press = async (loc: ReturnType<Page['locator']>) => { if (isPhone()) await loc.tap(); else await loc.click(); };
async function stored(page: Page, field: string): Promise<unknown[]> {
  return page.evaluate(async (f) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown; t: string }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    d.close();
    return all.filter((c) => c.kind === 'accession' && c.field === f).sort((a, b) => a.t.localeCompare(b.t)).map((c) => c.value);
  }, field);
}
async function keep(page: Page, typed: string, sheets: () => number, plants = 1) {
  await page.goto('/plants/new');
  await ready(page);
  await page.locator('#species-name').fill(typed);
  await press(page.locator('h1').first());
  const add = page.locator('form button[type=submit].add');
  await expect(add).toHaveText('Add as typed');
  await expect.poll(sheets, { timeout: 15_000 }).toBeGreaterThan(0); // the kind's question answered while the line shows
  await press(add);
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  expect(await stored(page, 'olderOf')).toEqual(Array(plants).fill('Hoodia alstonii'));
}

test("r87p 8: GBIF's name kept as typed records gbif; an older name, older @phone", async ({ page }) => {
  let served = 0;
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/entries\?/, (r) => json(r, []));
  await page.route(/\/api\/sheets\?/, (r) => { served++; return json(r, [SHEET, GBIF_COPY]); });
  await page.route(/\/api\/names\?/, (r) => json(r, [row(9269454, 'Ceropegia alstonii')]));
  await keep(page, 'Ceropegia alstonii', () => served);
  expect(await stored(page, 'olderKind')).toEqual(['gbif']); // base: []
  await page.unroute(/\/api\/names\?/);
  await page.unroute(/\/api\/sheets\?/);
  served = 0;
  await page.route(/\/api\/sheets\?/, (r) => { served++; return json(r, [SHEET]); });
  await page.route(/\/api\/names\?/, (r) => json(r, [row(1, 'Trichocaulon alstonii', 'SYNONYM')]));
  await keep(page, 'Trichocaulon alstonii', () => served, 2);
  expect(await stored(page, 'olderKind')).toEqual(['gbif', 'older']);
  // Each kind filed with the name it was read for (round eighty-seven, the review of stage 1, M1: `olderKindOf`).
  expect(await stored(page, 'olderKindOf')).toEqual(['Hoodia alstonii', 'Hoodia alstonii']);
});

test('r87p 9: with the reference not reached for the kind, none is recorded, and the plant is filed all the same @phone', async ({ page }) => {
  let aborted = 0;
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/entries\?/, (r) => json(r, []));
  await page.route(/\/api\/sheets\?/, (r) => { aborted++; return r.abort(); });
  await page.route(/\/api\/names\?/, (r) => json(r, [row(9269454, 'Ceropegia alstonii')]));
  await keep(page, 'Ceropegia alstonii', () => aborted);
  expect(await stored(page, 'olderKind')).toEqual([]);
  expect(await stored(page, 'olderKindOf')).toEqual([]); // no kind, no name for one
});

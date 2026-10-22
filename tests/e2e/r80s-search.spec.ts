/**
 * Round eighty (S): the catalogue search on the front page at the full list's size, on a desktop and a phone.
 *
 * - The count is the server's (`X-Search-Total`), never the cap said as a count (review-w 2, review-p 3: "60 matches of
 *   48,361" for Echeveria's 220); "Show more" brings the next hits, asked from where they end (`&at=`), until all are
 *   shown, or says that only the first hundred of a word too common to list can be listed.
 * - A genus typed alone links to its row of the catalogue.
 * - A region of origin the query names is said with a link to its row in the Origin grouping (review-w 6).
 * - On a desktop the letter index is one line: 26 letters left "Z" alone on a second at 1440 and 1280 px (review-w 8).
 *
 * The fixture corpus holds three species, so the server's answers are given here as the key files give them at the full
 * size (tests/unit/r80s-search.test.ts proves the server's side). FAILS on r80f: the page says "30 matches of …" (60
 * there) for 75 and has no "Show more", no genus row link and no region line, and the letters wrap.
 */
import { test, expect, type Page, type Route } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
const entry = (genus: string, i: number) => ({ key: `k${900000 + i}`, slug: `${genus.toLowerCase()}-sp${i}`, name: `${genus} sp${String(i).padStart(3, '0')}`, family: 'Crassulaceae', origin: ['Mexico Central'], photos: 0, open: 0, climate: 'ok' });
/** The server's answers to a query: `total` species, the first `kept` listable, from `at`, `n` at a time. */
async function answers(p: Page, o: { genus: string; total: number; kept?: number; regions?: unknown[]; narrow?: boolean }, asked: string[] = []) {
  await p.route(/\/api\/search\?/, (r: Route) => {
    const u = new URL(r.request().url());
    asked.push(u.search);
    const at = Number(u.searchParams.get('at') ?? 0), n = Number(u.searchParams.get('n') ?? 60);
    const listable = Math.min(o.total, o.kept ?? o.total);
    const hits = o.narrow ? [] : Array.from({ length: Math.max(0, Math.min(n, listable - at)) }, (_, i) => entry(o.genus, at + i));
    const headers: Record<string, string> = { ...(o.narrow ? { 'x-search-narrow': '1' } : { 'x-search-total': String(o.total) }), ...(o.kept !== undefined ? { 'x-search-kept': String(o.kept) } : {}), ...(o.regions ? { 'x-search-regions': encodeURIComponent(JSON.stringify(o.regions)) } : {}) };
    return r.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(hits) });
  });
}
const box = (p: Page) => p.getByLabel('Search the whole species catalogue');

test('the count is how many match, and "Show more" brings the rest @phone', async ({ page }) => {
  const asked: string[] = [];
  await answers(page, { genus: 'Testgenus', total: 75 }, asked);
  await page.goto('/');
  await ready(page);
  await box(page).fill('test');
  await expect(page.getByRole('status').filter({ hasText: '30 of 75 matches' })).toBeVisible();
  await expect(page.locator('.hits .hitrow')).toHaveCount(30);
  const more = page.getByRole('button', { name: 'Show 45 more' });
  await more.click();
  await expect(page.locator('.hits .hitrow')).toHaveCount(75);
  await expect(page.getByRole('status').filter({ hasText: /^75 matches of / })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Show \d+ more$/ })).toHaveCount(0);
  expect(asked.some((s) => /[?&]n=30\b/.test(s) && !/[?&]at=/.test(s))).toBe(true);
  expect(asked.some((s) => /[?&]n=60\b/.test(s) && /[?&]at=30\b/.test(s))).toBe(true);
});

test('a word too common to list all of says that only the first hundred are listed @phone', async ({ page }) => {
  await answers(page, { genus: 'Commonia', total: 3402, kept: 100 });
  await page.goto('/');
  await ready(page);
  await box(page).fill('cape');
  await expect(page.getByRole('status').filter({ hasText: '30 of 3,402 matches' })).toBeVisible();
  await page.getByRole('button', { name: 'Show 60 more' }).click();
  await expect(page.locator('.hits .hitrow')).toHaveCount(90);
  await page.getByRole('button', { name: 'Show 10 more' }).click();
  await expect(page.locator('.hits .hitrow')).toHaveCount(100);
  await expect(page.getByText('The first 100 of 3,402 are listed: type more of the name, or another word, to narrow it.')).toBeVisible();
});

test('a genus typed alone links to its row of the catalogue @phone', async ({ page }) => {
  await answers(page, { genus: 'Echeveria', total: 220 });
  await page.goto('/');
  await ready(page);
  await box(page).fill('echeveria');
  const link = page.getByRole('link', { name: 'its row of the catalogue' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', '/?by=genus&open=echeveria#g-echeveria');
});

test('a region of origin is said with its row in the Origin grouping, beside "too many" @phone', async ({ page }) => {
  await answers(page, { genus: 'X', total: 0, narrow: true, regions: [{ name: 'Cape Provinces', row: { id: 'southern-africa', label: 'Southern Africa' } }, { name: 'Northern Provinces', row: { id: 'southern-africa', label: 'Southern Africa' } }] });
  await page.goto('/');
  await ready(page);
  await box(page).fill('provinses');
  await expect(page.getByText('Too many species match “provinses” to list them all.', { exact: false })).toBeVisible();
  await expect(page.getByText('“Cape Provinces” is a region of origin; in the Origin grouping it is part of')).toBeVisible();
  const rows = page.locator('.regionline a');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('href', '/?by=origin&open=southern-africa#g-southern-africa');
  await expect(rows.first()).toHaveText('Southern Africa');
});

for (const width of [1440, 1280]) {
  test(`the letter index is one line at ${width} px, every letter in it`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await ready(page);
    const nav = page.locator('nav.letters');
    if (!(await nav.count())) test.skip(true, 'the fixture has one letter: no index drawn');
    // The live list's 26 letters, as the server draws them.
    await nav.evaluate((el) => { const a = el.querySelector('a')!; el.replaceChildren(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => { const x = a.cloneNode() as HTMLAnchorElement; x.textContent = l; return x; })); });
    const tops = await nav.locator('a').evaluateAll((as) => as.map((a) => Math.round(a.getBoundingClientRect().top)));
    expect(tops).toHaveLength(26);
    expect(new Set(tops).size).toBe(1);
    const widths = await nav.locator('a').evaluateAll((as) => as.map((a) => a.getBoundingClientRect().width));
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(24); // a target no narrower than WCAG's 24 px
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

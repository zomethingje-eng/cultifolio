/**
 * Round eighty-one (S): the front page's catalogue search opened by its address, and Back to it.
 *
 * 1. A shared or bookmarked search, `/?q=…` opened fresh (review-w 1, review-p 4): the page threw ("reading '$set'": the
 *    address was written before SvelteKit's router was up), said "Nothing in the reference matches", dropped `?q=`, and
 *    sent no search for anything typed after. Now it lists the matches, keeps its address, and searches what is typed next.
 * 2. A search reloaded (Safari's tabs, pull to refresh): the same.
 * 3. Back from a species page (review-p 1): the list as long as it was ("Show more" pressed), the hit left where it was on
 *    the screen. On the base the list was back to its first thirty at the top.
 * 4. A grower's "Search the whole catalogue", a hit opened, Back (review-p 1): the address keeps `?q=`, and the catalogue's
 *    answer is the page, not the own-plants view of `/`.
 * 5. A hit found by an older name says so, and its link carries `?was=` (review-w 5).
 *
 * The fixture corpus holds three species, so the server's answers are the test's (tests/unit/r81s-search.test.ts proves
 * the server's side). Written for WebKit and Firefox as well as Chromium: the service worker blocked (the routes must see
 * every request), scrolling by `window.scrollTo`, distinct requests counted, every wait on what the page shows.
 *
 * FAILS on r81base: 1 and 2 (a page error, "Nothing in the reference matches", `?q=` dropped, nothing searched after), 3
 * (30 hits at the top), 4 (Back to `/` and the own-plants view), 5 (no "older name", no `?was=`).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready, addPlant } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

/** Hit 40 is the fixture's Copiapoa cinerea, so a page opened from the list is a real species page. */
const entry = (genus: string, i: number) => (i === 40 ? { key: 'k2735933', gbif: 5384013, slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea', family: 'Cactaceae', origin: ['Chile North'], photos: 0, open: 20, climate: 'ok' } : { key: `k${900000 + i}`, slug: `${genus.toLowerCase()}-sp${i}`, name: `${genus} sp${String(i).padStart(3, '0')}`, family: 'Crassulaceae', origin: ['Mexico Central'], photos: 0, open: 0, climate: 'ok', ...(i === 2 ? { syn: ['Oldgenus quuxensis'] } : {}) });
/** The server's answers: `total` hits of `genus` for any query, from `at`, `n` at a time; the queries asked, distinct. */
async function answers(p: Page, genus: string, total: number, asked: Set<string>) {
  await p.route(/\/api\/search\?/, (r: Route) => {
    const u = new URL(r.request().url());
    asked.add(`${u.searchParams.get('q')}|${u.searchParams.get('at') ?? 0}|${u.searchParams.get('n')}`);
    const at = Number(u.searchParams.get('at') ?? 0), n = Number(u.searchParams.get('n') ?? 60);
    const hits = Array.from({ length: Math.max(0, Math.min(n, total - at)) }, (_, i) => entry(genus, at + i));
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'x-search-total': String(total) }, body: JSON.stringify(hits) });
  });
}
const qOf = (asked: Set<string>) => new Set([...asked].map((a) => a.split('|')[0]));
const errorsOf = (p: Page) => { const out: string[] = []; p.on('pageerror', (e) => out.push(String(e))); return out; };

test('r81s 1: a shared search link lists its matches, keeps its address, and searches what is typed next @phone', async ({ page }) => {
  const errors = errorsOf(page);
  const asked = new Set<string>();
  await answers(page, 'Echeveria', 75, asked);
  await page.goto('/?q=echeveria');
  await ready(page);
  await expect(page.getByRole('status').filter({ hasText: '30 of 75 matches' })).toBeVisible(); // base: "Nothing in the reference matches"
  await expect(page.locator('.emptybox')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('q')).toBe('echeveria'); // base: dropped
  const box = page.getByLabel('Search the whole species catalogue');
  await box.fill('aloe');
  await expect.poll(() => qOf(asked).has('aloe')).toBe(true); // base: nothing sent
  await expect(page).toHaveURL(/[?&]q=aloe\b/);
  expect(errors).toEqual([]); // base: "Cannot read properties of undefined (reading '$set')"
});

test('r81s 2: a search reloaded is answered again, not "nothing matches" @phone', async ({ page }) => {
  const errors = errorsOf(page);
  const asked = new Set<string>();
  await answers(page, 'Lithops', 43, asked);
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search the whole species catalogue').fill('lithops');
  await expect(page.getByRole('status').filter({ hasText: '30 of 43 matches' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=lithops\b/);
  await page.reload();
  await ready(page);
  await expect(page.getByRole('status').filter({ hasText: /^30 of 43 matches/ })).toBeVisible();
  await expect(page.getByLabel('Search the whole species catalogue')).toHaveValue('lithops');
  await expect(page.locator('.emptybox')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('r81s 3: Back from a species page brings the list back as long as it was, the hit where it was @phone', async ({ page }) => {
  const asked = new Set<string>();
  await answers(page, 'Echeveria', 259, asked);
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search the whole species catalogue').fill('echeveria');
  await expect(page.getByRole('status').filter({ hasText: '30 of 259 matches' })).toBeVisible();
  await page.getByRole('button', { name: 'Show 60 more' }).click();
  await expect(page.locator('.hits .hitrow')).toHaveCount(90);
  const hit = page.locator('.hits a.hitrow[href^="/species/copiapoa-cinerea"]');
  // The hit a third of the way down the screen, by the page's own scroll.
  await page.evaluate(() => { const el = document.querySelector('.hits a.hitrow[href^="/species/copiapoa-cinerea"]')!; window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - Math.round(window.innerHeight / 3)); });
  await expect.poll(async () => Math.round((await hit.boundingBox())!.y)).toBeGreaterThan(50);
  const before = Math.round((await hit.boundingBox())!.y);
  await hit.click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea/);
  await ready(page);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]q=echeveria\b/);
  await expect(page.locator('.hits .hitrow')).toHaveCount(90); // base: 30
  await expect.poll(async () => Math.abs(Math.round((await hit.boundingBox())?.y ?? -9999) - before), { timeout: 10_000 }).toBeLessThanOrEqual(4); // base: far below or above
});

test('r81s 4: a grower\'s whole-catalogue search, a hit opened, Back: the catalogue\'s answer, under its address @phone', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await addPlant(page);
  const asked = new Set<string>();
  await answers(page, 'Agave', 289, asked);
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search your plants by number, name or field number, and species (on this device)').fill('agave');
  await page.locator('#search-catalogue').click();
  await expect(page.getByRole('status').filter({ hasText: '30 of 289 matches' })).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=agave\b/);
  await page.locator('.hits a.hitrow').nth(3).click();
  await expect(page).toHaveURL(/\/species\//);
  await page.goBack();
  await expect(page).toHaveURL(/[?&]q=agave\b/); // base: "/"
  await expect(page.getByRole('status').filter({ hasText: '30 of 289 matches' })).toBeVisible(); // base: "None of your plants or species matches"
  await expect(page.locator('#search-catalogue')).toHaveCount(0);
});

test('r81s 5: a hit found by an older name says so, and opens its page with the name @phone', async ({ page }) => {
  const asked = new Set<string>();
  await answers(page, 'Newgenus', 5, asked);
  await page.goto('/');
  await ready(page);
  await page.getByLabel('Search the whole species catalogue').fill('Oldgenus quux');
  const row = page.locator('.hits a.hitrow').nth(2);
  await expect(row).toContainText('older name: Oldgenus quuxensis'); // base: nothing
  await expect(row).toHaveAttribute('href', '/species/newgenus-sp2?was=Oldgenus%20quuxensis');
  await expect(page.locator('.hits a.hitrow').nth(1)).not.toContainText('older name');
});

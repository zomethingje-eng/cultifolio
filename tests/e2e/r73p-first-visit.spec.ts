/**
 * Round seventy-three, agent P (REVIEW-ROUND-72 §7; self-F 10, the owner's decision): the service worker is registered
 * only from a visitor's second page, or at once on a page of the collection or once the device holds one. Its install
 * fetched the whole build, the shells and `/` on the first page of a reader who may only ever read one species page:
 * about half of a first visit's bytes and requests.
 *
 * What reaches the server is counted at a proxy in front of it (tests/e2e/helpers/cut.ts), which sees the worker's own
 * fetches as well as the page's in every engine, on an origin of its own (its own worker and caches).
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { cuttableNetwork, type Cut } from './helpers/cut';

let net: Cut;
test.beforeEach(async ({ baseURL }) => { net = await cuttableNetwork(baseURL!); });
test.afterEach(async () => { await net.close(); });

async function fresh(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: net.origin, locale: 'en-GB' });
  return { ctx, page: await ctx.newPage() };
}
/** The page has decided about the worker: `on`, or `deferred` once the collection and sync have been read with none registered. */
const decided = (p: Page, how: 'on' | 'deferred') => p.locator(`html[data-worker="${how}"]`).waitFor({ state: 'attached', timeout: 30_000 });
/** Precache paths the install asks for and a reader's page never does: the collection's shells and the offline page. */
const precache = (seen: string[]) => seen.filter((u) => /^\/(offline|plants|places|propagation|labels|backup|sync|today|settings)(\?|$)/.test(u) || u.startsWith('/service-worker.js'));
const registered = (p: Page) => p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));

test('r73p 1: a reader of one species page is sent no service worker and no precache; a grower\'s first collection page is @phone', async ({ browser }) => {
  test.setTimeout(90_000);
  const reader = await fresh(browser);
  await reader.page.goto('/species/copiapoa-cinerea');
  await reader.page.locator('html[data-collection="open"]').waitFor({ state: 'attached' });
  await reader.page.waitForLoadState('networkidle');
  await reader.page.waitForTimeout(1500); // a negative: nothing may follow the page's own requests, and only a pause can show that none did
  // r73base: the worker is registered on this first page and its install asks for the shells, the offline page and `/`.
  expect(precache(net.seen), 'what the install would have fetched').toEqual([]);
  expect(await registered(reader.page)).toBe(false);
  expect(await reader.page.evaluate(async () => (await caches.keys()).length)).toBe(0);
  await decided(reader.page, 'deferred');
  await reader.ctx.close();

  const before = net.seen.length;
  const grower = await fresh(browser);
  await grower.page.goto('/plants');
  await decided(grower.page, 'on');
  await grower.page.evaluate(() => navigator.serviceWorker.ready);
  // The install's precache came through: the shells and the offline page, which no page of this visit asked for.
  await expect.poll(() => precache(net.seen.slice(before)).filter((u) => /^\/(offline|places|today)$/.test(u)).sort(), { timeout: 30_000 }).toEqual(['/offline', '/places', '/today']);
  await expect.poll(() => grower.page.evaluate(async () => { for (const k of await caches.keys()) if (await (await caches.open(k)).match('/offline')) return true; return false; }), { timeout: 30_000 }).toBe(true);
  await grower.ctx.close();
});

test('r73p 2: the second page registers it, a move inside the app or a load; a device that has one keeps it whatever its count', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await fresh(browser);
  await page.goto('/species/copiapoa-cinerea');
  await page.locator('html[data-collection="open"]').waitFor({ state: 'attached' });
  expect(await registered(page)).toBe(false); // r73base: registered on the first page
  await decided(page, 'deferred');
  // A move inside the app to another address is the second page.
  await page.locator('footer a[href="/about/how"]').click();
  await expect(page).toHaveURL(/\/about\/how$/);
  await decided(page, 'on');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Registered, the device keeps its worker: with the count gone, a reader's page still registers it, and checks for an update.
  await page.evaluate(() => localStorage.removeItem('cultifolio.views'));
  const before = net.seen.length;
  await page.goto('/species/copiapoa-cinerea');
  await decided(page, 'on');
  await expect.poll(() => net.seen.slice(before).some((u) => u.startsWith('/service-worker.js')), { timeout: 15_000 }).toBe(true);
  await ctx.close();

  // A second load of the same page counts as a second page too.
  const again = await fresh(browser);
  await again.page.goto('/species/copiapoa-cinerea');
  await decided(again.page, 'deferred');
  await again.page.reload();
  await decided(again.page, 'on');
  await again.ctx.close();
});

test('r73p 3: following a species from its page holds a collection, and registers the worker there and then', async ({ browser }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await fresh(browser);
  await page.goto('/species/copiapoa-cinerea');
  await decided(page, 'deferred');
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Following/ })).toBeVisible();
  await decided(page, 'on');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await ctx.close();
});

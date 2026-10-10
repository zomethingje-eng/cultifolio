/**
 * Round sixty-seven, the harness (triage-66 H2; S-E10): offline as the service worker meets it, in every engine.
 *
 * Smoke's offline tests take the context offline (`setOffline`), which in Safari's engine stands in front of the worker,
 * so they are skipped there; and smoke 924's check of the worker's redirect map routes the page's requests, which in
 * Safari's engine answers before the worker is asked, so it returns early there. These take the network away behind the
 * worker instead (tests/e2e/helpers/cut.ts: a proxy in front of the test server that drops every connection once cut),
 * and count what reaches the server by what passes through the proxy, so they mean the same in Chromium, Firefox and
 * WebKit. WebKit is not installed where the suite is written; they were run here in Chromium and on the Chromium phone.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { cuttableNetwork, type Cut } from './helpers/cut';

let net: Cut;
test.beforeEach(async ({ baseURL }) => { net = await cuttableNetwork(baseURL!); });
test.afterEach(async () => { await net.close(); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** A context on the proxy's origin (its own worker and caches), with the worker installed and in control of the page. */
async function controlled(browser: Browser) {
  const ctx = await browser.newContext({ baseURL: net.origin, locale: 'en-GB' });
  const page = await ctx.newPage();
  return { ctx, page };
}
async function workerInControl(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => { const ks = await caches.keys(); for (const k of ks) { const c = await caches.open(k); if (await c.match('/plants')) return true; } return false; }), { timeout: 30_000 }).toBe(true);
}

test('r67h offline 1: with the network gone behind the worker, a plant page never opened opens from the section shell @phone', async ({ browser }) => {
  const { ctx, page } = await controlled(browser);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/places');
  await workerInControl(page);
  net.cut();
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea', { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeVisible();
  await ctx.close();
});

test("r67h offline 2: with the network gone behind the worker, the collection's pages open whatever the units (smoke's offline settings)", async ({ browser }) => {
  const { ctx, page } = await controlled(browser);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/plants');
  await workerInControl(page);
  await ctx.addCookies([{ name: 'cultifolio.units', value: 'us', url: net.origin }]);
  net.cut();
  await page.goto(`/plants/${acc}`);
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeVisible({ timeout: 15_000 });
  // the settings shell was cached in metric; the units came from the cookie, not from the cached HTML or a server
  await page.goto('/settings'); await ready(page);
  await expect(page.getByRole('button', { name: '°F and inches' })).toHaveAttribute('aria-pressed', 'true');
  await ctx.close();
});

test("r67h offline 3: an old bookmark is answered by the worker's own redirect map, online without reaching the server, and with the network gone (smoke 924's check, in every engine)", async ({ browser }) => {
  const { ctx, page } = await controlled(browser);
  await page.goto('/plants'); await ready(page); // My plants keeps its own empty page: an empty Places opens the example, a full load that raced the next step under load (round sixty-seven, at the merge)
  await workerInControl(page);
  // Online: the worker answers each old address itself, so the server never sees one (smoke 924 routed these, which in
  // Safari's engine stands in front of the worker; here the proxy is the server's door).
  const old = (u: string) => /\/(benches|sowings)(\/|\?|$)|\/(places|plants)\/[^/?]+\/(\?|$)/.test(u);
  expect(net.seen.length, 'the pages so far came through the proxy').toBeGreaterThan(0);
  const before = net.seen.length;
  await page.goto('/benches/k1?edit=1');
  await expect(page).toHaveURL(/\/places\/k1\?edit=1$/);
  await expect(page.locator('h1')).toContainText('Not here'); // the places shell rendered from the vault: no place k1 here
  await page.goto('/sowings/new?loc=k1');
  await expect(page).toHaveURL(/\/propagation\/new\?loc=k1$/);
  await page.goto('/benches/k1/');
  await expect(page).toHaveURL(/\/places\/k1$/);
  await page.goto('/plants/r1/');
  await expect(page).toHaveURL(/\/plants\/r1$/);
  expect(net.seen.slice(before).filter(old)).toEqual([]);
  // And with the network gone: the same answers, from the worker alone.
  net.cut();
  await page.goto('/benches//x');
  await expect(page).toHaveURL(/\/places\/x$/);
  await expect(page.locator('h1')).toContainText('Not here');
  await page.goto('/sowings/new?loc=k2');
  await expect(page).toHaveURL(/\/propagation\/new\?loc=k2$/);
  await ctx.close();
});

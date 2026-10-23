/**
 * Round eighty (U): offline (the phone review's 5 and 10, the desktop review's 16).
 *
 * 1. Offline, Compare (in the menu and on every species page) opened the browser's own error page: a navigation that was
 *    not a shell, a species, an about or the front page went to the network with nothing behind it. Now the app's "No
 *    connection" page answers it, as it does an unread species page.
 * 2. The worker's install fetched every file of the build, about 170 requests a device, the share image (70 kB, for other
 *    sites' link previews), the large icons, the maps and the fonts' WOFF fallbacks among them. Now it fetches what the
 *    pages that work offline need (scripts/offline-files.mjs); the rest is kept when a page first asks for it.
 * 3. And what offline use needs is all there: with the network gone after the install, every page of the collection opens,
 *    by address and by the tab bar, as does a species page read once online.
 *
 * The network is taken away behind the worker by the proxy of tests/e2e/helpers/cut.ts, which also counts what reaches the
 * server, the worker's own fetches included.
 *
 * On r80f: 1 FAILED (net::ERR_FAILED, the browser's page); 2 FAILED (og.png, icon-512.png, the maps and the WOFF fonts
 * fetched by the install, 170 files); 3 passed (it guards that the smaller install leaves nothing out).
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { cuttableNetwork, type Cut } from './helpers/cut';
import { controlledBy } from './helpers/controlled';

let net: Cut;
test.beforeEach(async ({ baseURL }) => { net = await cuttableNetwork(baseURL!); });
test.afterEach(async () => { await net.close(); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** A context on the proxy's origin (its own worker and caches), shaped as the project's page is. */
async function fresh(browser: Browser) {
  const use = test.info().project.use;
  const ctx = await browser.newContext({ baseURL: net.origin, locale: 'en-GB', viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor });
  return { ctx, page: await ctx.newPage() };
}
/** The worker in control and its install done: the offline page is in its cache. */
async function installed(page: Page) {
  await controlledBy(page);
  await expect.poll(() => page.evaluate(async () => { for (const k of await caches.keys()) if (await (await caches.open(k)).match('/offline')) return true; return false; }), { timeout: 30_000 }).toBe(true);
}

test('r80u offline 1: with the network gone, Compare and the other pages that are not kept open the app\'s "No connection" page, not the browser\'s error @phone', async ({ browser }) => {
  const { ctx, page } = await fresh(browser);
  await page.goto('/plants'); await ready(page);
  await installed(page);
  net.cut();
  for (const to of ['/compare', '/compare?a=copiapoa-cinerea&b=copiapoa-humilis', '/privacy', '/frost', '/species/never-opened-here']) {
    const res = await page.goto(to).catch((e: Error) => e);
    expect(res instanceof Error ? res.message : 'answered', to).toBe('answered');
    await expect(page.locator('h1'), to).toContainText('No connection');
  }
  await ctx.close();
});

test('r80u offline 2: the install fetches what offline use needs, not the share image, the large icons, the maps or the WOFF fallbacks @phone', async ({ browser }) => {
  const { ctx, page } = await fresh(browser);
  await page.goto('/plants'); await ready(page);
  const before = net.seen.length;
  await installed(page);
  // Settled: what the install asked for has arrived (the poll above waits for its last file, the offline page, to be kept).
  await page.waitForTimeout(500); // a negative: nothing more may follow
  const asked = net.seen.slice(before).map((u) => u.split('?')[0]);
  // Counted as distinct files: WebKit on the owner's PC asked 33 of its 147 twice (180 requests), where Chromium asks each once.
  const all = asked.filter((u) => u !== '/service-worker.js');
  const files = [...new Set(all)];
  const report = `${files.length} files (${all.length} requests): ${files.join(' ')}`;
  for (const not of ['/og.png', '/icon-512.png', '/icon-maskable-512.png']) expect(files, report).not.toContain(not);
  expect(files.filter((u) => u.startsWith('/maps/')), report).toEqual([]);
  expect(files.filter((u) => /\.woff$/.test(u)), report).toEqual([]);
  // The base's install was 170 files; this one leaves out the species, about and compare pages' own scripts besides.
  expect(files.length, report).toBeLessThan(155);
  await ctx.close();
});

test('r80u offline 3: after the smaller install, with the network gone, every page of the collection opens, by address and by the tab bar, and a species page read online @phone', async ({ browser, browserName }) => {
  test.setTimeout(90_000);
  const { ctx, page } = await fresh(browser);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await installed(page);
  // A species page read online, once the worker is in control: its scripts are kept as it asks for them.
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.goto('/plants'); await ready(page);
  net.cut();
  const pages: Array<[string, RegExp]> = [['/plants', /plants/i], [`/plants/${acc}`, /Copiapoa cinerea/], ['/plants/new', /Add a plant/], ['/places', /space/i], ['/propagation', /Propagation/], ['/propagation/new', /./], ['/today', /Today/], ['/labels', /Labels/], ['/backup', /Backup/i], ['/settings', /Settings/], ['/', /Species/], ['/species/copiapoa-cinerea', /Copiapoa cinerea/]];
  for (const [to, h] of pages) {
    await page.goto(to);
    await ready(page);
    await expect(page.locator('h1').first(), to).toContainText(h);
    await expect(page.locator('h1').first(), to).not.toContainText('No connection');
  }
  // By the app's own links: a move inside the app loads the next page's scripts from the worker's cache.
  // What the page throws and leaves unhandled. WebKit also reports, as a page error, every request its service worker
  // answers with an error (here the reference's buckets, asked offline and not kept), though the app catches each one: the
  // owner's PC traced it in round 81, with no unhandled rejection in the page. That one message is WebKit's alone and is
  // let pass there; an unhandled rejection is still caught in every engine by the listener below.
  const errors: string[] = [];
  page.on('pageerror', (e) => { if (browserName === 'webkit' && e.message === 'Response served by service worker is an error') return; errors.push(e.message); });
  await page.addInitScript(() => { const w = window as unknown as { __unhandled: string[] }; w.__unhandled = []; addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => w.__unhandled.push(String(ev.reason?.message ?? ev.reason))); });
  await page.goto('/plants'); await ready(page);
  for (const [to, h] of [['/today', /Today/], ['/propagation', /Propagation/], ['/places', /space/i], ['/plants', /plants/i]] as Array<[string, RegExp]>) {
    await page.locator(`a[href="${to}"]:visible`).first().click();
    await expect(page).toHaveURL(new RegExp(`${to}$`));
    await expect(page.locator('h1').first(), to).toContainText(h);
  }
  await page.locator(`a[href="/plants/${acc}"]`).first().click();
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __unhandled?: string[] }).__unhandled ?? [])).toEqual([]);
  await ctx.close();
});

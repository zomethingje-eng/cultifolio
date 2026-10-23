/**
 * Round eighty-one (U): a species page read by a link inside the app, offline (the phone review's 3), and the share card
 * of a page left open across a deploy (review C1).
 *
 * 1. A species page opened by a link inside the app is kept as its data (`__data.json`) and its scripts, not as a page.
 *    With the network gone, the same address opened as a page (a reload, Back after the installed app was closed, Safari
 *    reopening its tabs) answered the app's "No connection" page, which says the pages opened are kept. Now that page
 *    opens the species page from the data the device holds.
 * 2. "Share card" fetches its drawing code on the first press. When that fails (a page open across a deploy asks for its
 *    own build's file, which is gone), the page printed the browser's message with the file's address ("Failed to fetch
 *    dynamically imported module: http://…/_app/immutable/chunks/….js"). Now it says what happened, from the site's own
 *    version, and offers a reload.
 *
 * The network is taken away behind the worker by the proxy of tests/e2e/helpers/cut.ts (WebKit's own offline mode stands in
 * front of the worker). Test 2 blocks the worker, so the test's routes see the page's requests in every engine.
 *
 * On r81base: 1 FAILED ("No connection"); 2 FAILED (the browser's message, with the file's address in Chromium).
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { cuttableNetwork, type Cut } from './helpers/cut';
import { controlledBy } from './helpers/controlled';
import { ready } from './helpers/smoke';

test.describe('offline', () => {
  let net: Cut;
  test.beforeEach(async ({ baseURL }) => { net = await cuttableNetwork(baseURL!); });
  test.afterEach(async () => { await net.close(); });

  async function fresh(browser: Browser) {
    const use = test.info().project.use;
    const ctx = await browser.newContext({ baseURL: net.origin, locale: 'en-GB', viewport: use.viewport, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent, deviceScaleFactor: use.deviceScaleFactor });
    return { ctx, page: await ctx.newPage() };
  }
  async function installed(page: Page) {
    await controlledBy(page);
    await expect.poll(() => page.evaluate(async () => { for (const k of await caches.keys()) if (await (await caches.open(k)).match('/offline')) return true; return false; }), { timeout: 30_000 }).toBe(true);
  }
  /** A move inside the app, as a tap on a link is: a link put in the page and pressed. */
  async function visit(page: Page, href: string) {
    await page.evaluate((h) => { const a = document.createElement('a'); a.href = h; a.id = 'r81u-go'; a.textContent = 'go'; document.body.insertBefore(a, document.body.firstChild); }, href);
    await page.evaluate(() => document.getElementById('r81u-go')!.click());
  }

  test('r81u offline 1: with the network gone, a species page read by a link inside the app opens by its address @phone', async ({ browser }) => {
    test.setTimeout(90_000);
    const { ctx, page } = await fresh(browser);
    await page.goto('/plants'); await ready(page);
    await installed(page);
    await page.goto('/about/how'); await ready(page);
    const before = net.seen.length;
    await visit(page, '/species/copiapoa-cinerea');
    await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
    // It was a move inside the app: the page's data was asked for, not the page.
    const asked = net.seen.slice(before).map((u) => u.split('?')[0]);
    expect(asked, asked.join(' ')).toContain('/species/copiapoa-cinerea/__data.json');
    expect(asked, asked.join(' ')).not.toContain('/species/copiapoa-cinerea');
    // The worker's write of the data is done before the network goes.
    await expect.poll(() => page.evaluate(async () => { for (const k of await caches.keys()) if ((await (await caches.open(k)).keys()).some((r) => r.url.includes('/species/copiapoa-cinerea/__data.json'))) return true; return false; }), { timeout: 10_000 }).toBe(true);
    net.cut();
    await page.goto('/species/copiapoa-cinerea');
    await expect(page.locator('h1').first()).toContainText('Copiapoa cinerea', { timeout: 15_000 });
    await expect(page.locator('h1').first()).not.toContainText('No connection');
    await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
    // A species page never opened still says so, in the app's own page.
    await page.goto('/species/welwitschia-mirabilis');
    await expect(page.locator('h1').first()).toContainText('No connection');
    await expect(page.locator('#offline-kept')).toContainText('one you have not opened needs the network once');
    await ctx.close();
  });
});

test.describe('share card', () => {
  test.use({ serviceWorkers: 'block' });
  test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

  test("r81u share 1: a share card whose drawing code cannot be fetched says why in words, with a reload, never the file's address @phone", async ({ page }) => {
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    const button = page.getByRole('button', { name: 'Share card' });
    await expect(button).toBeVisible();
    // Every script asked for from now on is gone from the server, as an old build's are after a deploy.
    await page.route(/\/_app\/immutable\/.*\.js(\?|$)/, (r) => r.fulfill({ status: 404, body: 'not found' }));
    await button.click();
    const said = page.locator('.acts2 [role=status]').filter({ hasText: /drawing code/ });
    await expect(said).toContainText("The card's drawing code could not be fetched just now. Reload the page to try again.");
    await expect(page.getByRole('button', { name: 'Reload the page' })).toBeVisible();
    expect(await said.textContent()).not.toMatch(/_app|https?:|module/i);
    // With a newer version out, it says that.
    await page.route(/\/_app\/version\.json/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: 'r81u-newer' }) }));
    await button.click();
    await expect(said).toContainText('A newer version of Cultifolio is out since this page was opened');
    expect(await said.textContent()).not.toMatch(/_app|https?:|module/i);
  });
});

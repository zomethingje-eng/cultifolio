import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ownPages } from './helpers/r63v-own';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

/**
 * Round sixty-four (agent F): the faults of the site that the first Firefox run met, each emulated here in Chromium,
 * where the suite is written (only Chromium is installed on this machine). Each test opens its own context.
 *
 * 1. Firefox does not answer `navigator.storage.persist()` by itself: it asks the person, and the promise waits for
 *    their answer (for good, if the question is dismissed). The collection's load waited for that answer, and every page
 *    that waited for the load waited with it: the add form never took the species from a species page's link, a place's
 *    `?edit=1` never opened its form, the example never opened for a visitor, sync and the frost watch never started.
 *    76 of the Firefox run's 89 failures were that. Emulated by a `persist()` that never answers. And the question was
 *    put to every visitor on their first page, with nothing of theirs to keep (r64f 5).
 * 2. On a first visit in Firefox, the second page reloaded itself within its first seconds (the snapshots show a third
 *    document where the test opened two, and a page without `data-ready` in the middle of a test): a second worker of
 *    the build the page already ran took over, and the takeover reloads the page. Emulated by a service worker script
 *    that changes by a comment at every fetch, as a second copy of one build.
 * 3. A plant's Edit opened and left untouched asked before the page was left ("Leave site?" in Firefox, whose goto asks
 *    a page's beforeunload; "What you typed here will be lost" in the app with nothing typed): r64f 6.
 */

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** Firefox's question about persistent storage, put to nobody: `persist()` never answers. `persisted()` still does. */
const unanswered = () => {
  StorageManager.prototype.persist = () => new Promise<boolean>(() => {});
};

test.describe("Firefox's unanswered question about keeping the data", () => {
  test.use({ serviceWorkers: 'block' }); // the pages, not the shell
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(unanswered);
  });

  test('r64f 1: the add form takes the species from the link, and Add files the plant, while the browser waits on the grower', async ({ page, context }) => {
    await context.addInitScript(ownPages);
    await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
    await ready(page);
    await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
    await expect(page.locator('.pill', { hasText: 'GBIF 5384013' })).toBeVisible(); // the link's key, checked after the load
    await page.getByRole('button', { name: /^Add/ }).click();
    await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  });

  test("r64f 2: a place's ?edit=1 opens its form, and My plants says the plants are kept in this browser only", async ({ page, context }) => {
    await context.addInitScript(ownPages);
    await page.goto('/plants');
    await ready(page);
    const rows: Row[] = [['location', 'g', 'name', 'Bench'], ['location', 'g', 'type', 'bench'], ['accession', 'p1', 'acc', '2026-0001'], ['accession', 'p1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'p1', 'status', 'growing'], ['accession', 'p1', 'locationId', 'g']];
    await inject(page, rows, Date.now() - 86_400_000, 'r64faaaaaaaaaaaa');
    await page.goto('/places/g?edit=1');
    await ready(page);
    await expect(page.locator('#e-waterdays')).toBeVisible();
    // What the browser has promised so far is read without asking: nothing yet, so the line is said with the list.
    await page.goto('/plants');
    await ready(page);
    await expect(page.locator('.rows > *')).toHaveCount(1);
    await expect(page.locator('p.keepline')).toBeVisible();
  });

  test('r64f 3: on an empty device Today opens the example collection while the browser waits on the grower', async ({ page }) => {
    allowWrites(1 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
    await page.goto('/today');
    await ready(page);
    await expect(page.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
    await expect(page.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() });
  });
});

// Chromium only: the second copy is made by routing the worker's own script fetch, which only Chromium's worker network
// events let a route see (playwright.config.ts). r64f 7 is the same page flow in every engine, without the copy.
test('r64f 4: a second worker of the build the page runs takes over without reloading the page, then or at the next tap', { tag: '@chromium' }, async ({ page, context }) => {
  test.setTimeout(90_000);
  await context.addInitScript(ownPages);
  // Every fetch of the worker's script answers different bytes of the same build: the browser installs each as a new
  // worker, as Firefox installed a second copy of one build on a first visit.
  let copy = 0;
  await context.route(/\/service-worker\.js(\?|$)/, async (route) => {
    const r = await route.fetch();
    await route.fulfill({ response: r, body: `${await r.text()}\n// copy ${++copy}\n` });
  });
  // Every takeover this tab sees, kept across a reload.
  await context.addInitScript(() => {
    navigator.serviceWorker?.addEventListener('controllerchange', () => {
      try { sessionStorage.setItem('__r64f_cc', String(Number(sessionStorage.getItem('__r64f_cc') ?? 0) + 1)); } catch { /* counted nowhere */ }
    });
  });
  await page.goto('/plants');
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 30_000 }).toBe(true);
  const taken = await page.evaluate(() => Number(sessionStorage.getItem('__r64f_cc') ?? 0));
  // The second page: its load asks for the script, a new copy installs, and the page hands over to it.
  await page.goto('/plants/new');
  await ready(page);
  await page.evaluate(() => { (window as unknown as { __r64f: number }).__r64f = 1; });
  await expect.poll(() => page.evaluate(() => Number(sessionStorage.getItem('__r64f_cc') ?? 0)), { timeout: 45_000 }).toBeGreaterThan(taken);
  // The takeover's answer is a message away; then the page is the same document, and a tap in the app stays in it.
  await page.waitForTimeout(1500); // a negative: only a pause can show that no reload followed
  expect(await page.evaluate(() => (window as unknown as { __r64f?: number }).__r64f)).toBe(1);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My plants' }).click(); // a move inside the app (Back would be the history's)
  await expect(page).toHaveURL(/\/plants$/);
  await ready(page);
  expect(await page.evaluate(() => (window as unknown as { __r64f?: number }).__r64f)).toBe(1);
});

test('r64f 5: nothing kept, nothing asked: a visitor on My plants and in the example is not asked to keep data; the first plant is, and every load after it', async ({ page, context }) => {
  allowWrites(1 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  // Every call to persist() on this page; persisted() (which asks nothing) is free. In Firefox each call is a question
  // put to the person, so a visitor with nothing of their own met it on their first page (round sixty-four).
  await context.addInitScript(() => {
    const w = window as unknown as { __asked: number };
    w.__asked = 0;
    StorageManager.prototype.persist = function () { w.__asked++; return Promise.resolve(false); };
  });
  const asked = () => page.evaluate(() => (window as unknown as { __asked: number }).__asked);
  await context.addInitScript(ownPages);
  await page.goto('/plants');
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible(); // the collection has opened, empty
  expect(await asked()).toBe(0);
  // The example, for a visitor: its plants are not theirs to keep.
  await page.goto('/plants');
  await page.evaluate(() => { try { sessionStorage.removeItem('cultifolio.sampleOut'); } catch { /* fine */ } });
  await page.locator('#try-sample').click();
  await expect(page.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('#demobar')).toBeVisible();
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
  expect(await asked()).toBe(0);
  await page.locator('#demo-leave').click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/(\?left=sample)?$/);
  // The visitor's own first plant: asked once, by the layer that asks after it (the answer is said as a toast).
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  expect(await asked()).toBe(0);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect.poll(asked).toBe(1);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cultifolio.persistAfterFirst'))).toBe('1'); // its answer said, so not asked again
  // A page loaded with a plant kept asks, as it always has: Safari and Chromium answer it by themselves.
  await page.goto('/plants');
  await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(1);
  await expect.poll(asked).toBe(1);
});

test('r64f 6: a plant\'s Edit opened and left untouched asks nothing on leaving; one field changed, it asks', async ({ page, context }) => {
  // Firefox's goto asks a page's beforeunload, as a person's reload or typed address does, and the untouched form said
  // "Leave site?" (the run's NS_BINDING_ABORTED). The question is read here as the page answers it, in any engine: a
  // beforeunload whose default the page prevents is one the browser asks about (round sixty-four).
  await context.addInitScript(ownPages);
  await page.goto('/plants');
  await ready(page);
  await inject(page, [['accession', 'p1', 'acc', '2026-0001'], ['accession', 'p1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'p1', 'status', 'growing']], Date.now() - 86_400_000, 'r64fbbbbbbbbbbbb');
  await page.goto('/plants/2026-0001');
  await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  await expect(page.locator('#ed-price')).toBeVisible();
  const asks = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
  expect(await asks()).toBe(false);
  let asked = false;
  page.on('dialog', (d) => { asked = true; void d.accept(); });
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My plants' }).click(); // an untouched form: no question
  await expect(page).toHaveURL(/\/plants$/);
  expect(asked).toBe(false);
  await page.goBack();
  await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  await page.fill('#ed-price', '7.50');
  expect(await asks()).toBe(true);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My plants' }).click();
  await expect(page).toHaveURL(/\/plants$/);
  expect(asked).toBe(true);
});

test('r64f 7: on a first visit the second page is loaded once and keeps what was typed while the first worker takes over', async ({ page, context }) => {
  // The page flow of the Firefox run's reloads, in every engine and with nothing emulated: the owner's run in Firefox is
  // what this is for (in Chromium no second worker comes, and it passed before the fix too).
  test.setTimeout(60_000);
  await context.addInitScript(ownPages);
  await context.addInitScript(() => {
    try { sessionStorage.setItem('__r64f_loads', String(Number(sessionStorage.getItem('__r64f_loads') ?? 0) + 1)); } catch { /* counted nowhere */ }
  });
  await page.goto('/plants');
  await ready(page);
  await page.goto('/plants/new');
  await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 30_000 }).toBe(true);
  await page.waitForTimeout(5000); // a negative: a takeover's reload comes within a page's first four seconds
  expect(await page.evaluate(() => sessionStorage.getItem('__r64f_loads'))).toBe('2');
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
});

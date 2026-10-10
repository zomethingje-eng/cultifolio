/**
 * Round sixty-three, agent V (V1, V2, V5): the visitor's first experience. The owner opened cultifolio.com in Safari on
 * his iPhone, a browser with no collection, and saw Species, Compare, My plants and About: a visitor "isn't given the
 * knowledge of the app's capabilities" until a first plant is added. Now the tab bar is the grower's five for everyone,
 * and an empty Today, Places or Propagation opens the example collection on that page; Leave goes home and never back
 * into it; a tab that left it, or a device with plants of its own, is offered it instead.
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r63v-visitor.spec.ts
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

const FIVE = ['Species', 'My plants', 'Places', 'Propagation', 'Today'];
const quiet = () => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ context }) => { await context.addInitScript(quiet); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
/** In the example on `path`, its plants set out. */
async function inExample(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`), { timeout: 20_000 });
  await expect(page.locator('html[data-demo]')).toBeAttached();
  await expect(page.locator('#demobar')).toBeVisible();
  await expect(page.locator('#demobar')).toContainText('An example collection, so you can see what this page does.');
}
const plants = (n: number): Row[] => {
  const rows: Row[] = [['location', 'gh', 'name', 'Greenhouse']];
  for (let i = 1; i <= n; i++) rows.push(['accession', `v${i}`, 'acc', `2026-000${i}`], ['accession', `v${i}`, 'taxonName', 'Copiapoa cinerea'], ['accession', `v${i}`, 'status', 'growing'], ['accession', `v${i}`, 'nameKind', 'species'], ['accession', `v${i}`, 'locationId', 'gh']);
  return rows;
};
async function grower(page: Page, n = 2) {
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(n), Date.now() - 86_400_000, 'r63vaaaaaaaaaaaa');
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(n);
}
const tabs = (page: Page) => page.locator('#tabbar a:visible');

test('r63v V1: a visitor and a grower see the same five tabs, and Compare and About are in the menu and the footer', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await expect(tabs(page)).toHaveText(FIVE);
  await expect(page.locator('footer.credits a[href="/compare"]')).toHaveCount(1);
  await expect(page.locator('footer.credits a[href="/about/how"]').first()).toBeVisible();
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.locator('#menu a[href="/compare"]')).toBeVisible();
  await expect(page.locator('#menu a[href="/about/how"]')).toBeVisible();
  await expect(page.locator('#menu #menu-example')).toHaveText('See the example collection');
  await page.keyboard.press('Escape');
  await grower(page);
  await expect(tabs(page)).toHaveText(FIVE);
  await page.goto('/'); await ready(page);
  await expect(tabs(page)).toHaveText(FIVE);
});

test('r63v V1: on a desktop the top bar is the same five for a visitor', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 1280, height: 800 }, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto('/'); await ready(page);
  await expect(page.locator('#topbar .topseg a')).toHaveText(FIVE);
  await ctx.close();
});

test('r63v V2: Today by tab on an empty device opens the example on Today, and Leave goes home without looping back', async ({ page }) => {
  allowWrites(2 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  await page.goto('/'); await ready(page);
  await page.locator('#tabbar a[href="/today"]').click();
  await inExample(page, '/today');
  await expect(page.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() });
  await page.locator('#demo-leave').click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/(\?left=sample)?$/);
  await ready(page);
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/); // the mark taken off the address
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  // Today again: this tab has left the example, so Today shows its own empty state with the offer, and stays out of it.
  await page.locator('#tabbar a[href="/today"]').click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('#example-offer')).toBeVisible();
  await expect(page.locator('#example-offer')).toContainText('Today says what needs water, place by place');
  await expect(page.locator('#example-offer #see-example')).toHaveText('See the example collection');
  await expect(page.locator('#example-offer #offer-add')).toHaveText('Add your first plant');
  await page.waitForTimeout(1000);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  // Places and Propagation the same.
  for (const [path, words] of [['/places', 'Places are the greenhouses, rooms, benches and windowsills'], ['/propagation', 'Propagation keeps each sowing, cutting, offset or division']] as const) {
    await page.locator(`#tabbar a[href="${path}"]`).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('#example-offer')).toContainText(words);
    await expect(page.locator('html[data-demo]')).not.toBeAttached();
  }
  // The offer enters it on this page.
  await page.locator('#see-example').click();
  await inExample(page, '/propagation');
  await expect(page.locator('.bcards li').first()).toBeVisible({ timeout: seedWait() });
});

test('r63v V2: Today opened by a link, and by its address, on an empty device opens the example on Today', async ({ page }) => {
  allowWrites(2 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  await page.goto('/about/how'); await ready(page);
  // A link in a page, not one of the layout's own: the router's client-side visit, decided on the page.
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/today'; a.id = 'r63v-link'; a.textContent = 'Today'; const m = document.getElementById('main')!; m.insertBefore(a, m.firstChild); });
  await page.locator('#r63v-link').click();
  await inExample(page, '/today');
  await expect(page.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() });

  // By its address, in a fresh tab (a tab of its own: the left flag is the tab's).
  const fresh = await page.context().newPage();
  await fresh.goto('/today');
  await inExample(fresh, '/today');
  await expect(fresh.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() });
  await fresh.close();
});

test('r63v V2: the way in moves nothing once Today is drawn (layout shift on the example page)', { tag: '@chromium' }, async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/today');
  await inExample(page, '/today');
  await expect(page.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() });
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  console.log(`r63v: layout shift on the example's Today after the way in: ${cls.toFixed(3)}`);
  expect(cls).toBeLessThan(0.1);
});

test('r63v V2: "Add your first plant" leaves the example for the add form, and the plant is the visitor\'s own', async ({ page }) => {
  allowWrites(1 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  await page.goto('/today');
  await inExample(page, '/today');
  await expect(page.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() });
  await page.locator('#demo-add').click();
  await expect(page).toHaveURL(/\/plants\/new(\?left=sample)?$/);
  await ready(page);
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.getByRole('button', { name: /^Add/ }).click();
  const asked = page.locator('.picker .hint', { hasText: 'press Add to keep exactly what you typed' });
  await Promise.race([page.waitForURL(/\/plants\/\d{4}-\d{4}$/), asked.waitFor()]);
  if (await asked.isVisible()) await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-0001$/); // the own collection's first number, not the example's thirteenth
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(1);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect.poll(() => page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name))), { timeout: 10_000 }).not.toContain('cultifolio-demo');
  // With a plant of its own, Today is the grower's own page now, not the example.
  await page.locator('#tabbar a[href="/today"]').click();
  await expect(page).toHaveURL(/\/today$/);
  await page.waitForTimeout(800);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
});

test('r63v V2: a grower with plants is never taken into the example, and can look at it from the menu and leave back to their own', async ({ page }) => {
  allowWrites(2 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  await grower(page, 2);
  for (const path of ['/today', '/places', '/propagation']) {
    await page.goto(path); await ready(page);
    await page.waitForTimeout(800);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.locator('html[data-demo]')).not.toBeAttached();
    await expect(page.locator('#example-offer')).toHaveCount(0);
  }
  await expect(page.locator('.emptybox')).toContainText('Nothing in progress.'); // Propagation's own empty state, as before
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('#menu-example').click();
  await inExample(page, '/today');
  await expect(page.locator('#demobar')).toContainText('Your own plants are kept apart, as you left them.');
  await expect(page.locator('#demo-add')).toHaveCount(0);
  await expect(page.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() }); // set out before the next full load
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
  await page.locator('#demo-leave').click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/(\?left=sample)?$/);
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect(page.locator('.rows > *')).toHaveCount(2);
  await expect(page.locator('.rows')).toContainText('2026-0001');
});

test('r63v V2: with the tab\'s storage refused, an empty Today shows its own empty state and says why the example cannot open', async ({ browser, baseURL }) => {
  const ctx: BrowserContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) { if (this === window.sessionStorage) throw new DOMException('refused', 'SecurityError'); return set.call(this, k, v); };
  });
  const page = await ctx.newPage();
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#example-offer')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await page.locator('#see-example').click();
  await expect(page.locator('#example-offer [role=status]')).toContainText('needs this tab\'s own storage');
  await ctx.close();
});

test('r63v V2: My plants keeps its own empty page and offers the example first', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect(page.locator('#try-sample')).toHaveText('See the example collection');
  await expect(page.locator('.firststeps a[href="/places#add"]')).toHaveCount(1);
  // The first step adds a place: the add form, not the example.
  await page.locator('.firststeps a[href="/places#add"]').click();
  await expect(page.locator('#loc-name')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
});

test('r63v V3: the front page\'s welcome says what a grower gets and opens the example on Today', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const w = page.locator('#welcome');
  await expect(w).toContainText('Keep their record on this device: watering read against each species\' habitat season, places, seed batches, frost warnings, labels.');
  await expect(page.locator('#try-sample-home')).toHaveText('See the example collection');
  await page.locator('#try-sample-home').click();
  await inExample(page, '/today');
});

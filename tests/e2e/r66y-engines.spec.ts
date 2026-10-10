/**
 * Round sixty-six, agent Y: what the owner's third all-engines run found that a person meets in any browser. Safari's
 * engine on the owner's PC opens the collection slowly (about 16 ms an IndexedDB request; tests/e2e/helpers/pace.ts), and
 * Firefox there let the reference's search answer after the name check; both showed the page saying something untrue
 * while it waited. Each is shown here in Chromium by making the same thing slow: the collection's database opening late
 * (as smoke's "a returning grower never sees the catalogue" does), or the reference's search answering late.
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r66y-engines.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ownPages } from './helpers/r63v-own';

test.beforeEach(async ({ context }) => { await context.addInitScript(ownPages); });
// No service worker: in Safari's engine a page the worker controls sends its requests past `page.route` (round sixty-five,
// smoke 1528), and r66y 3 and 4 hold the reference's search back with a route. Nothing here is about the worker.
test.use({ serviceWorkers: 'block' });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
/** Two growing plants, written straight into the vault. */
async function twoPlants(page: Page) {
  await page.goto('/plants'); await ready(page);
  const rows: Row[] = [];
  for (const [id, no, name] of [['r66a', '2026-0001', 'Copiapoa cinerea'], ['r66b', '2026-0002', 'Welwitschia mirabilis']]) rows.push(['accession', id, 'acc', no], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species']);
  await inject(page, rows, Date.now() - 86_400_000);
}
/** From the next load on, the collection's database opens `ms` late: the open request's success listener is held back. */
async function slowOpen(page: Page, ms: number) {
  await page.addInitScript((delay: number) => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<typeof open>) {
      const req = open.apply(this, a);
      const add = req.addEventListener.bind(req);
      req.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'success' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn(ev) : fn.handleEvent(ev)), delay) : fn, ...(rest as []))) as typeof req.addEventListener;
      return req;
    } as typeof open;
  }, ms);
}

test('r66y 1: Labels says the collection is opening while it opens, not "No plant is growing", and its plants arrive to be picked (r62g 9)', async ({ page }) => {
  await twoPlants(page);
  await slowOpen(page, 3000);
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('#lb-opening')).toHaveText('Opening your collection…'); // base: no such line
  await expect(page.getByText('No plant is growing')).toHaveCount(0); // base: said of a collection not yet read
  await expect(page.getByText(/\d+ of \d+ picked/)).toHaveCount(0); // base: "0 of 0 picked"
  await expect(page.locator('.pick')).toHaveCount(2, { timeout: 10_000 });
  await expect(page.locator('#lb-opening')).toHaveCount(0);
  await page.locator('#lb-pick-plants').click();
  await expect(page.locator('#lb-print')).toHaveText('Print 2 labels');
});

test('r66y 2: My plants says no count, and its menu no "no plants yet", while the collection opens (smoke 2527, r61a a11y 2)', async ({ page }) => {
  await twoPlants(page);
  await slowOpen(page, 3000);
  await page.goto('/plants'); await ready(page);
  await expect(page.getByText('Opening your collection…')).toBeVisible();
  await expect(page.locator('.phead .seccount')).toHaveCount(0); // base: "0 growing"
  await page.locator('#plants-menu-btn').click();
  await expect(page.locator('#plants-sheet')).toContainText('your collection is still opening'); // base: "no plants yet"
  await expect(page.locator('#plants-sheet')).not.toContainText('no plants yet');
  await expect(page.locator('.phead .fullcount')).toHaveText('2 growing', { timeout: 10_000 });
  await expect(page.locator('#plants-sheet')).toHaveText('Download as a spreadsheet');
  const dl = page.waitForEvent('download');
  await page.locator('#plants-sheet').click();
  expect((await dl).suggestedFilename()).toMatch(/plants.*\.csv$/);
});

test('r66y 3: a reference name typed in full is not called "Not a reference name" when the reference answers after the check (r60 12, Firefox)', async ({ page }) => {
  // The reference's own search answers 1.5 s late; the name service is not reachable here, so the check on leaving the
  // field concludes "not reached" before the reference has said it holds the name.
  await page.route(/\/api\/search\?/, async (r) => { await new Promise((res) => setTimeout(res, 1500)); await r.continue(); });
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  // The field's search under way (its name service's silence said), then the field left: the check on leaving concludes.
  await expect(page.getByRole('status').filter({ hasText: 'The name service did not answer' })).toBeVisible();
  await page.locator('#species-name').blur();
  await expect(page.locator('.picker .pill.warn')).toContainText('name service not reached'); // the check concluded first
  await expect(page.locator('.picker .pill.ok')).toHaveText('GBIF 5384013', { timeout: 5_000 }); // base: never, until Add
  await expect(page.getByText('Not a reference name')).toHaveCount(0); // base: "Not a reference name. Did you mean Copiapoa cinerea?"
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
});

test('r66y 4: a reference name typed and left at once, before the field\'s search, still gets its key once the reference answers', async ({ page }) => {
  // Left within the search's 180 ms: the check made on leaving is made stale by the search that follows, and the field had
  // no answer until Add (round sixty-six; the r60 helper, which waits for the key's pill, met this in Chromium).
  await page.route(/\/api\/search\?/, async (r) => { await new Promise((res) => setTimeout(res, 1000)); await r.continue(); });
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa humilis');
  await page.locator('#species-name').blur();
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF', { timeout: 5_000 }); // base: no pill, until Add
  await expect(page.getByText('Not a reference name')).toHaveCount(0);
});

test('r66y 5: the plants picked on Labels come back after a reload that no pagehide came before, as Safari on an iPhone reloads a tab it discarded in the background (r62g 9)', async ({ page }) => {
  await twoPlants(page);
  // A tab discarded in the background: the page is hidden, and then gone without a pagehide (WebKit's page lifecycle on iOS).
  await page.addInitScript(() => {
    const add = window.addEventListener.bind(window);
    window.addEventListener = ((type: string, ...rest: unknown[]) => (type === 'pagehide' ? undefined : add(type, ...(rest as [EventListenerOrEventListenerObject])))) as typeof window.addEventListener;
  });
  const hide = () => page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('.pick')).toHaveCount(2);
  await expect(page.locator('#lb-print')).toHaveText('Print 2 labels'); // two plants: both picked by default
  await page.locator('.pick input').first().uncheck();
  await expect(page.locator('#lb-print')).toHaveText('Print 1 label');
  await hide();
  await page.reload(); await ready(page);
  await expect(page.locator('.pick')).toHaveCount(2);
  await expect(page.locator('#lb-print')).toHaveText('Print 1 label'); // base: "Print 2 labels", the pick lost
  // Hidden again, then left inside the app: the copy is forgotten, so coming back is afresh, as from the menu.
  await page.locator('.pick input').first().check();
  await page.locator('.pick input').nth(1).uncheck();
  await hide();
  await page.locator('nav[aria-label="Main"] a', { hasText: 'My plants' }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/labels$/);
  await expect(page.locator('.pick')).toHaveCount(2);
  await expect(page.locator('#lb-print')).toHaveText('Print 2 labels');
});

test('r66y 6: Move with a new place named and "Add place" not pressed makes the place and moves the plant there; the panel no longer closes on nothing (smoke 306, Chromium)', async ({ page }) => {
  await twoPlants(page);
  await page.goto('/plants/r66a'); await ready(page);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('button', { name: 'New…' }).click();
  await page.fill('#mv-loc-new-name', 'Cold frame');
  await page.selectOption('#mv-loc-new-kind', 'coldframe');
  await page.getByRole('button', { name: 'Move', exact: true }).last().click(); // base: the panel closed, the plant stayed where it was
  await expect(page.locator('.idcard .place', { hasText: 'Cold frame' })).toBeVisible();
  await expect(page.locator('.tlrow', { hasText: 'Cold frame' })).toBeVisible();
  await page.goto('/places'); await ready(page);
  await expect(page.getByRole('link', { name: /^Cold frame\b.*1 plant/ })).toHaveCount(1); // one place, holding the plant
});

test('r66y 7: a plant added with a new place named and not added goes into that place', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await page.locator('.picker').getByRole('button', { name: 'New…' }).click();
  await page.fill('#f-loc-new-name', 'Shelf 9');
  await page.getByRole('button', { name: /^Add/ }).filter({ hasNotText: 'place' }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.idcard .place', { hasText: 'Shelf 9' })).toBeVisible(); // base: no place
});

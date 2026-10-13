/**
 * Round seventy, agent X: the example collection (docs/REVIEW-TRIAGE-69.md, X1, X2 and X4), in a browser.
 * - X1 (S-D1): an example tab that is only reloading holds the example open from its page's first script, so another
 *   tab's page neither offers it back as left nor deletes it, the visitor's records with it.
 * - X2 (S-D7a, IND-7): Keep carries a new place's containing place: "New…" opens inside the grower's own place of that
 *   name, or says where it was; Places carries its parent, and the batch form its place (S-D's MX20, MX21).
 * - X2 (IND-6): Keep does not leave the example when the tab's storage refuses the draft, and says so.
 * - X4 (S-D7b): a scanned label's "add one to my plants" leads out of the example.
 * - X5 (R47-17): Keep while the next page takes 12 s carries the form all the same.
 * - P's need 2: the batch form's "Start batch" does not move when the name check's words appear.
 *
 * Run against a server already up: PW_REUSE=1 PW_PORT=4306 npx playwright test tests/e2e/r70x-example.spec.ts --project chromium
 */
import { test, expect, type Page } from '@playwright/test';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

const quiet = () => { try { sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ context }) => { await context.addInitScript(quiet); allowWrites(2 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
async function intoExample(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
}
const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
function accept(page: Page) { page.on('dialog', (d) => void d.accept()); }
/** The grower's own "Greenhouse", made on Places before the example is opened from the menu. */
async function ownGreenhouseThenExample(page: Page) {
  await page.goto('/places#add'); await ready(page);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await page.fill('#loc-name', 'Greenhouse');
  await page.locator('#loc-kind').selectOption('greenhouse');
  await page.locator('#loc-add').click();
  await expect(page.locator('.tree')).toContainText('Greenhouse');
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('#menu-example').click();
  await expect(page.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
}
/** The scripts of every page this tab loads from now arrive `ms` late, as on a slow phone. */
async function slowScripts(page: Page, ms: number) {
  const s = { on: true };
  await page.route('**/_app/immutable/**', async (r) => { if (s.on) await new Promise((x) => setTimeout(x, ms)); await r.continue(); });
  return s;
}

test('r70x X1: another tab neither offers back nor deletes an example whose tab is only reloading @chromium', async ({ page, context }) => {
  test.setTimeout(150_000);
  accept(page);
  await intoExample(page);
  await page.goto('/places#add'); await ready(page);
  await page.fill('#loc-name', 'Visitor shelf');
  await page.locator('#loc-kind').selectOption({ index: 2 });
  await page.locator('#loc-add').click();
  await expect(page.locator('.tree')).toContainText('Visitor shelf');
  const other = await context.newPage();
  accept(other);
  await other.goto('/'); await ready(other);
  await expect(other.locator('#example-left')).toHaveCount(0);
  const slow = await slowScripts(page, 8000);
  void page.reload().catch(() => {});
  await page.waitForTimeout(800);
  await other.reload(); await ready(other);
  await other.waitForTimeout(2000);
  await expect(other.locator('#example-left')).toHaveCount(0); // base: "You left an example collection with 1 record…", and its Delete it deleted it
  expect(await databases(other)).toContain('cultifolio-demo');
  slow.on = false;
  await ready(page);
  await expect(page.locator('html[data-demo]')).toBeAttached();
  await expect(page.locator('#demobar')).not.toContainText('closed in another tab');
  await page.goto('/places'); await ready(page);
  await expect(page.locator('.tree')).toContainText('Visitor shelf');
});

test('r70x X1: with nothing of the visitor\'s in it, another tab\'s page does not delete it under the reloading tab @chromium', async ({ page, context }) => {
  test.setTimeout(150_000);
  accept(page);
  await intoExample(page);
  const other = await context.newPage();
  const slow = await slowScripts(page, 8000);
  void page.reload().catch(() => {});
  await page.waitForTimeout(800);
  await other.goto('/'); await ready(other);
  await other.waitForTimeout(2000);
  expect(await databases(other)).toContain('cultifolio-demo'); // base: deleted, and the reloading tab set out a second seed
  slow.on = false;
  await ready(page);
  await expect(page.locator('html[data-demo]')).toBeAttached();
});

test('r70x X2: Keep carries a new place\'s containing place: "New…" opens inside the grower\'s own place of that name', async ({ page }) => {
  test.setTimeout(150_000);
  accept(page);
  await ownGreenhouseThenExample(page);
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.locator('.picker button', { hasText: 'New…' }).first().click();
  await page.fill('#f-loc-new-name', 'Bench 9');
  await page.locator('#f-loc-new-kind').selectOption('bench');
  await page.locator('#f-loc-new-parent').selectOption({ label: 'Greenhouse' }); // the example's own Greenhouse
  await page.locator('#example-keep').click();
  await expect(page.locator('html[data-demo]')).not.toBeAttached({ timeout: 20_000 });
  await ready(page);
  await expect(page.locator('#f-loc-new-name')).toHaveValue('Bench 9');
  await expect(page.locator('#f-loc-new-parent option:checked')).toHaveText('Greenhouse'); // base: "Top level"
  await expect(page.locator('#f-loc-was-inside')).toHaveCount(0);
});

test('r70x X2: Places carries the place it goes inside (MX21, a guard)', async ({ page }) => {
  test.setTimeout(150_000);
  accept(page);
  await ownGreenhouseThenExample(page);
  await page.goto('/places#add'); await ready(page);
  await page.fill('#loc-name', 'Cold corner');
  await page.locator('#loc-kind').selectOption('shelf');
  await page.locator('#loc-parent').selectOption({ label: 'Greenhouse' });
  await page.locator('#example-keep').click();
  await expect(page.locator('html[data-demo]')).not.toBeAttached({ timeout: 20_000 });
  await ready(page);
  await expect(page.locator('#loc-name')).toHaveValue('Cold corner');
  await expect(page.locator('#loc-parent option:checked')).toHaveText('Greenhouse'); // the grower's own
});

test('r70x X2: the batch form carries its place, and says where it was when the grower has no place of that name (MX20)', async ({ page }) => {
  test.setTimeout(150_000);
  accept(page);
  await intoExample(page);
  await page.goto('/propagation/new'); await ready(page);
  const bench = (await page.locator('#s-loc option', { hasText: 'Bench 1' }).first().textContent())!.trim();
  await page.locator('#s-loc').selectOption({ label: bench });
  await page.locator('#example-keep').click();
  await expect(page.locator('html[data-demo]')).not.toBeAttached({ timeout: 20_000 });
  await ready(page);
  await expect(page.locator('#s-loc-new-name')).toHaveValue('Bench 1');
  await expect(page.locator('#s-loc-new-parent option:checked')).toHaveText('Top level');
  await expect(page.locator('#s-loc-was-inside')).toContainText('In the example it was inside Greenhouse'); // base: nothing said
});

test('r70x X2: Keep does not leave the example when the tab\'s storage refuses the draft, and says so (IND-6)', async ({ page }) => {
  test.setTimeout(120_000);
  accept(page);
  await intoExample(page);
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-notes', 'Visitor note to retain');
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) { if (k === 'cultifolio.keepDraft') throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
  });
  await page.locator('#example-keep').click();
  await expect(page.locator('#example-keep-refused')).toContainText('could not be kept'); // base: none; the tab left without the draft
  await page.waitForTimeout(1500);
  await expect(page.locator('html[data-demo]')).toBeAttached();
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('#f-notes')).toHaveValue('Visitor note to retain');
});

test('r70x X4: a scanned label\'s "add one to my plants" leads out of the example', async ({ page }) => {
  test.setTimeout(120_000);
  accept(page);
  await intoExample(page);
  await page.goto('/plants/rNOPE123#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await page.locator('#foreign-label').getByRole('link', { name: 'add one to my plants' }).click();
  await expect(page.locator('html[data-demo]')).not.toBeAttached({ timeout: 20_000 }); // base: the example's own add form
  await ready(page);
  await expect(page).toHaveURL(/\/plants\/new\?species=Copiapoa(%20|\+)cinerea$/);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
});

test('r70x X5: Keep while the next page takes 12 s carries the form all the same (R47-17)', async ({ page }) => {
  test.setTimeout(150_000);
  accept(page);
  await intoExample(page);
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-notes', 'Visitor note to retain');
  // The next page's document arrives 12 s late: past Leave's 10 s fallback, which decides the tab stayed.
  await page.route(/\/plants\/new\?kept=1/, async (r) => { if (r.request().resourceType() === 'document') await new Promise((x) => setTimeout(x, 12_000)); await r.continue(); });
  await page.locator('#example-keep').click();
  await expect(page.locator('html[data-demo]')).not.toBeAttached({ timeout: 40_000 });
  await ready(page);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea'); // base: empty, and the example deleted
  await expect(page.locator('#f-notes')).toHaveValue('Visitor note to retain');
});

test('r70x P need 2: the batch form\'s "Start batch" does not move when the name check\'s words appear', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 900 }); // not pinned: the bar is in the page's flow
  await page.goto('/propagation/new'); await ready(page);
  await page.fill('#species-name', 'Zzyzxia improbabilis');
  const start = page.getByRole('button', { name: 'Start batch' });
  const before = (await start.boundingBox())!.y;
  await page.locator('#species-name').blur();
  await expect(page.locator('#species-name').locator('xpath=ancestor::div[contains(@class,"picker")][1]').locator('.status')).not.toBeEmpty({ timeout: 15_000 });
  await page.waitForTimeout(500);
  expect(Math.abs((await start.boundingBox())!.y - before)).toBeLessThan(1); // base: moved down by the words
});

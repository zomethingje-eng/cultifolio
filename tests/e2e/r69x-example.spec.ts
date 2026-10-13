/**
 * Round sixty-nine, agent X: the example collection (docs/REVIEW-TRIAGE-68.md, X1 to X9), in a browser.
 * - X3 (S-C2, IND-4, R46-5): "Keep it as my own" carries every field and the place, with no "Leave site?", and nothing
 *   typed in the address; Places too.
 * - X2 (R46-19): a tab away when another tab left (another site in it, then Back) opens the grower's own collection and
 *   says why, and sets out no new example; a Places form with a name typed keeps it when another tab leaves.
 * - X1 (S-C1): the closed bar's "Go to my own collection" deletes no example opened since in another tab.
 * - X8 (R46-26): the "Example" chip in the top bar.
 *
 * Run against a server already up: PW_REUSE=1 PW_PORT=4211 npx playwright test tests/e2e/r69x-example.spec.ts --project chromium
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
/** Every dialog the page raises, by type; each is accepted. */
function dialogs(page: Page): string[] {
  const seen: string[] = [];
  page.on('dialog', (d) => { seen.push(d.type()); void d.accept(); });
  return seen;
}

test('r69x X3: "Keep it as my own" carries every field and the place, with no "Leave site?", and nothing typed in the address', async ({ page }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  const bench = (await page.locator('#f-loc option', { hasText: 'Bench 1' }).first().textContent())!.trim();
  await page.locator('#f-loc').selectOption({ label: bench }); // one of the example's places
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-from', 'Mesa Garden');
  await page.fill('#f-price', '42.50');
  await page.fill('#f-watered', '2026-01-02');
  await page.fill('#f-notes', 'Visitor note to retain');
  const seen = dialogs(page);
  const addresses: string[] = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) addresses.push(f.url()); });
  await page.locator('#example-keep').click();
  await expect(page.locator('html[data-demo]')).not.toBeAttached({ timeout: 20_000 });
  await ready(page);
  await expect(page).toHaveURL(/\/plants\/new$/);
  expect(seen).not.toContain('beforeunload'); // base: "Leave site?" after a button that promised to keep it
  // The query and fragment as typed things could reach them, Leave's token taken off (round seventy; triage-69 X4;
  // S-D7c): the whole address held the port (4204) and, one run in two hundred, a token holding "42".
  const typedIn = (a: string) => { const u = new URL(a); u.searchParams.delete('left'); return decodeURIComponent(`${u.pathname}${u.search}${u.hash}`); };
  for (const a of addresses) for (const v of ['Mesa', '42.50', 'Visitor', 'Copiapoa']) expect(typedIn(a)).not.toContain(v);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('#f-from')).toHaveValue('Mesa Garden'); // base: empty
  await expect(page.locator('#f-price')).toHaveValue('42.50');
  await expect(page.locator('#f-watered')).toHaveValue('2026-01-02');
  await expect(page.locator('#f-notes')).toHaveValue('Visitor note to retain');
  await expect(page.locator('#f-loc-new-name')).toHaveValue('Bench 1'); // not one of the grower's places: "New…" holds it
  expect(await page.evaluate(() => sessionStorage.getItem('cultifolio.keepDraft'))).toBeNull(); // read once
});

test('r69x X3: Places carries the name and the kind', async ({ page }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await page.goto('/places#add'); await ready(page);
  await page.fill('#loc-name', 'My real cold frame');
  await page.locator('#loc-kind').selectOption({ index: 2 });
  const kind = await page.locator('#loc-kind').inputValue();
  const seen = dialogs(page);
  await page.locator('#example-keep').click();
  await expect(page.locator('html[data-demo]')).not.toBeAttached({ timeout: 20_000 });
  await ready(page);
  await expect(page.locator('#loc-name')).toHaveValue('My real cold frame'); // base: by the address, the kind dropped
  await expect(page.locator('#loc-kind')).toHaveValue(kind);
  expect(seen).not.toContain('beforeunload');
});

test('r69x X2: a tab away when another tab left opens the grower\'s own collection, and no new example is set out @chromium', async ({ page, context }) => {
  test.setTimeout(150_000);
  await intoExample(page);
  const [second] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open('/plants'); })]);
  await ready(second);
  await expect(second.locator('html[data-demo]')).toBeAttached();
  await second.goto('about:blank'); // away: another site
  dialogs(page);
  await page.locator('#demo-leave').click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/, { timeout: 20_000 });
  await expect.poll(() => databases(page), { timeout: 15_000 }).not.toContain('cultifolio-demo');
  await second.goBack(); await ready(second);
  await expect(second.locator('html[data-demo]')).not.toBeAttached(); // base: a new example, set out again
  await expect(second.locator('.toast')).toContainText('The example collection was closed in another tab. This is your own collection.');
  await second.waitForTimeout(2000);
  expect(await databases(second)).not.toContain('cultifolio-demo');
});

test('r69x X2, X9: a Places form with a name typed keeps it when another tab leaves @chromium', async ({ page, context }) => {
  test.setTimeout(150_000);
  await intoExample(page);
  const [second] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open('/places#add'); })]);
  await ready(second);
  await expect(second.locator('html[data-demo]')).toBeAttached();
  await second.fill('#loc-name', 'My real cold frame');
  dialogs(page);
  await page.locator('#demo-leave').click();
  await expect(second.locator('#demobar')).toContainText('The example collection was closed in another tab.', { timeout: 20_000 });
  await second.waitForTimeout(1000);
  await expect(second).toHaveURL(/\/places/);
  await expect(second.locator('#loc-name')).toHaveValue('My real cold frame'); // base: gone at once, with no question
});

test('r69x X1: the closed bar\'s way home deletes no example opened since in another tab @chromium', async ({ page, context }) => {
  test.setTimeout(150_000);
  await intoExample(page);
  const [second] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open('/places#add'); })]);
  await ready(second);
  await second.fill('#loc-name', 'Typed, so the tab stays');
  dialogs(page);
  dialogs(second);
  await page.locator('#demo-leave').click();
  await expect(second.locator('#demobar')).toContainText('The example collection was closed in another tab.', { timeout: 20_000 });
  await expect.poll(() => databases(page), { timeout: 15_000 }).not.toContain('cultifolio-demo');
  await intoExample(page); // the example again, in the first tab, with a place of the visitor's in it
  await page.goto('/places#add'); await ready(page);
  await page.fill('#loc-name', 'Visitor shelf');
  await page.locator('#loc-kind').selectOption({ index: 2 });
  await page.locator('#loc-add').click();
  await expect(page.locator('.tree')).toContainText('Visitor shelf');
  await second.locator('#demo-home').click();
  await ready(second);
  await expect(second.locator('html[data-demo]')).not.toBeAttached();
  await second.waitForTimeout(2000);
  await page.reload(); await ready(page); // the first tab lets go of its lock for a moment
  await expect(page.locator('html[data-demo]')).toBeAttached();
  await expect(page.locator('.tree')).toContainText('Visitor shelf', { timeout: seedWait() }); // base: deleted by the second tab's address, and a fresh example set out
});

test('r69x X8: "Example" sits in the top bar while the page is in the example, and only then', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('#topbar #example-chip')).toBeHidden();
  await intoExample(page);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('#topbar #example-chip')).toBeVisible(); // base: none; the bar had scrolled away
  await expect(page.locator('#topbar #example-chip')).toHaveText('Example');
});

/**
 * Round sixty-seven, agent V: the visitor and the example collection (docs/REVIEW-TRIAGE-66.md, V1 to V10).
 * - V3 (IND-1, S-A3, S-A4, R45-17): a page's collection is decided once, as it loads; a second example tab whose
 *   "Leave site?" is answered Cancel after another tab's Leave is closed, keeps its draft, refuses to save it with a
 *   sentence and never re-creates the database; a Leave answered Cancel where the browser does not say so writes
 *   nothing as the grower's own.
 * - V2 (R45-2): an example left by closing its tab, with a plant the visitor added, is kept and offered back once.
 * - V4 (S-A2, S-A11): a frost site, a species' notes, a removed plant or a numbering scheme is a grower's device.
 * - V5 (S-A7, IND-6, S-E1): the seed's mark and boundary are there with it, are repaired when cut off, and the fold's
 *   snapshot follows it.
 * - V1, V6, V7, V8, V9, V10 as their tests say.
 *
 * Run against a server already up: PW_REUSE=1 PW_PORT=4211 npx playwright test tests/e2e/r67v-example.spec.ts --project chromium
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

const quiet = () => { try { sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
/** Every "keep data" ask, recorded with the page and the collection it was asked from. */
const probePersist = () => {
  const st = navigator.storage;
  if (st?.persist) { const orig = st.persist.bind(st); st.persist = () => { localStorage.setItem('probe.persist', location.pathname); return orig(); }; }
};
test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true });
test.beforeEach(async ({ context }) => { await context.addInitScript(quiet); await context.addInitScript(probePersist); allowWrites(2 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
/** Into the example from the empty My plants page, its twelve plants set out. */
async function intoExample(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
}
const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).sort());
/** The example's meta, read straight from its database (never creating it). */
const exampleMeta = (page: Page, keys: string[]) => page.evaluate(async (keys) => {
  const db = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio-demo'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
  if (!db) return null;
  const tx = db.transaction('meta');
  const out = await Promise.all(keys.map((k) => new Promise((res) => { const q = tx.objectStore('meta').get(k); q.onsuccess = () => res(q.result ?? null); })));
  db.close();
  return Object.fromEntries(keys.map((k, i) => [k, out[i]]));
}, keys);
async function typePlant(page: Page, name: string) {
  await page.fill('#species-name', name);
  await page.locator('#species-name').blur();
  await expect(page.locator('button.add')).toBeEnabled({ timeout: 20_000 });
}

test('r67v V3: a second example tab told of another tab\'s Leave, its "Leave site?" answered Cancel, is closed: the draft stays, Add is refused in words, nothing reaches the grower', async ({ page, context }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await page.evaluate(() => localStorage.setItem('cultifolio.lastLocation', 'private-real-location'));
  const [second] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open('/plants/new'); })]);
  let stay = true;
  second.on('dialog', (d) => (d.type() === 'beforeunload' && stay ? d.dismiss() : d.accept()));
  await ready(second);
  await expect(second.locator('html[data-demo]')).toBeAttached();
  await expect(second.locator('#example-add-line')).toContainText('A plant added here joins the example collection and is deleted with it.'); // V1
  await typePlant(second, 'Copiapoa humilis');
  await second.locator('#f-loc').selectOption({ index: 1 }); // one of the example's places
  await page.locator('#demo-leave').click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/(\?left=sample)?$/);
  // The second tab was asked to go home, and stayed.
  await expect(second.locator('#demobar')).toContainText('The example collection was closed in another tab.', { timeout: 20_000 });
  await expect(second).toHaveURL(/\/plants\/new$/);
  await expect(second.locator('#species-name')).toHaveValue('Copiapoa humilis'); // the draft, to copy
  expect(await second.evaluate(() => sessionStorage.getItem('cultifolio.demo'))).toBe('1'); // cleared only when the page really goes (base: gone at once)
  await expect.poll(() => databases(page), { timeout: 15_000 }).not.toContain('cultifolio-demo'); // the leaving tab's delete was not held up
  await second.locator('button.add').click();
  await expect(second.locator('#write-error')).toContainText('The example collection was closed in another tab, so nothing more is saved on this page; what you typed is still here to copy.');
  await expect(second.locator('#write-error')).not.toContainText('Free space'); // not a full phone
  await second.waitForTimeout(1000);
  await expect(second).toHaveURL(/\/plants\/new$/);
  expect(await databases(page)).not.toContain('cultifolio-demo'); // base: re-created, empty, and the plant saved into it
  expect(await page.evaluate(() => [localStorage.getItem('cultifolio.lastLocation'), localStorage.getItem('probe.persist'), localStorage.getItem('cultifolio.persistAfterFirst')])).toEqual(['private-real-location', null, null]); // base: the example's place id, and a persist ask from the example
  // Its next page is the grower's own, and says why.
  stay = false;
  await second.reload(); await ready(second);
  await expect(second.locator('html[data-demo]')).not.toBeAttached();
  await expect(second.locator('.toast')).toContainText('The example collection was closed in another tab. This is your own collection.');
  expect(await databases(page)).not.toContain('cultifolio-demo');
});

test('r67v V3: a Leave answered Cancel where the browser does not say so writes nothing as the grower\'s own (S-A4, R45-17)', async ({ page, context }) => {
  test.setTimeout(120_000);
  await context.addInitScript(() => { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); }); // Safari's engine before the Navigation API, an older Firefox
  await intoExample(page);
  await page.evaluate(() => localStorage.setItem('cultifolio.lastLocation', 'private-real-location'));
  await page.goto('/plants/new'); await ready(page);
  await typePlant(page, 'Copiapoa humilis');
  await page.locator('#f-loc').selectOption({ index: 1 });
  page.on('dialog', (d) => (d.type() === 'beforeunload' ? d.dismiss() : d.accept()));
  await page.locator('#demo-leave').click(); // "Leave site?" … Cancel, said by nothing for 3 s
  await page.locator('button.add').click();
  await expect(page).toHaveURL(/\/plants\/(?!new)[^/]+$/, { timeout: 20_000 });
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => [localStorage.getItem('cultifolio.lastLocation'), localStorage.getItem('probe.persist'), localStorage.getItem('cultifolio.persistAfterFirst'), !!sessionStorage.getItem('cultifolio.demo.lastLocation')])).toEqual(['private-real-location', null, null, true]); // base: the example's place as the grower's, and the persist question asked from the example
  await expect(page.locator('html[data-demo]')).toBeAttached();
});

test('r67v V2: an example left by closing its tab, with a plant the visitor added, is kept and offered back once (R45-2)', async ({ page, context }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await page.goto('/plants/new'); await ready(page);
  await typePlant(page, 'Copiapoa humilis');
  await page.locator('button.add').click();
  await expect(page).toHaveURL(/\/plants\/(?!new)[^/]+$/, { timeout: 20_000 });
  await page.close(); // no Leave
  const next = await context.newPage();
  await next.goto('/'); await ready(next);
  await expect(next.locator('#example-left')).toContainText(/You left an example collection with \d+ records? you added or changed there\./);
  expect(await databases(next)).toContain('cultifolio-demo'); // base: deleted, the plant with it, no question
  const again = await context.newPage();
  await again.goto('/'); await ready(again);
  await again.waitForTimeout(1500);
  await expect(again.locator('#example-left')).toHaveCount(0); // once
  expect(await databases(again)).toContain('cultifolio-demo'); // and still kept
  await again.close();
  await next.locator('#example-left-open').click();
  await expect(next.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
  await next.goto('/plants'); await ready(next);
  await expect(next.locator('.rows > *')).toHaveCount(13, { timeout: seedWait() });
  await expect(next.locator('.rows')).toContainText('Copiapoa humilis');
});

test('r67v V2: "Delete it" deletes a leftover with the visitor\'s records', async ({ page, context }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await page.goto('/places'); await ready(page);
  await page.evaluate(() => { location.hash = 'add'; });
  await page.fill('#loc-name', 'My own shelf');
  await page.locator('#loc-kind').selectOption({ index: 1 });
  await page.locator('#loc-add').click();
  await expect(page.locator('.tree')).toContainText('My own shelf');
  await page.close();
  const next = await context.newPage();
  await next.goto('/'); await ready(next);
  await next.locator('#example-left-delete').click();
  await expect(next.locator('.toast')).toContainText('The example collection you left is deleted.');
  await expect.poll(() => databases(next)).not.toContain('cultifolio-demo');
});

const own = async (page: Page, rows: Row[]) => { await page.goto('/plants'); await ready(page); if (rows.length) await inject(page, rows, Date.now() - 86_400_000, 'r67vaaaaaaaaaaaa'); };
for (const [name, setUp] of [
  ['a frost site', async (p: Page) => { await own(p, []); await p.evaluate(() => localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05, name: 'Home' }))); }],
  ['a species\' own notes', (p: Page) => own(p, [['taxon', 'copiapoa-cinerea', 'name', 'Copiapoa cinerea'], ['taxon', 'copiapoa-cinerea', 'myNotes', 'Mine: keep dry November to March']])],
  ['a removed plant', (p: Page) => own(p, [['accession', 'p1', 'acc', '2026-0001'], ['accession', 'p1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'p1', 'status', 'growing'], ['accession', 'p1', 'nameKind', 'species'], ['accession', 'p1', '_deleted', true]])],
  ['a numbering scheme', (p: Page) => own(p, [['setting', 'numbering', 'scheme', { mode: 'prefix', prefix: 'JF', width: 4 }]])]
] as const) {
  test(`r67v V4: Today on a device with only ${name} stays the grower's own (S-A2)`, async ({ page }) => {
    await setUp(page);
    await page.goto('/today'); await ready(page);
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/today$/);
    await expect(page.locator('html[data-demo]')).not.toBeAttached(); // base: the example opened over it
  });
}

test('r67v V4: a grower with only places, looking at the example from the menu, is told their own is kept apart (S-A11)', async ({ page }) => {
  test.setTimeout(90_000);
  await own(page, [['location', 'gh', 'name', 'Greenhouse'], ['location', 'gh', 'type', 'greenhouse']]);
  await page.goto('/today'); await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('#menu-example').click();
  await expect(page.locator('html[data-demo]')).toBeAttached({ timeout: 20_000 });
  await expect(page.locator('#demobar')).toContainText('Your own collection is kept apart, as you left it.');
  await expect(page.locator('#demo-add')).toHaveCount(0); // base: "Your own starts when you add a plant", and "Add your first plant"
});

test('r67v V5: the seed comes with its mark and boundary, a cut-off mark is repaired, and Leave counts the visitor\'s edits', async ({ page }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await expect.poll(async () => (await exampleMeta(page, ['demoSeedSeq']))?.demoSeedSeq, { timeout: 10_000 }).toEqual(expect.any(Number));
  const m = (await exampleMeta(page, ['demoSeeded', 'demoSeedSeq', 'fold']))!;
  expect(m.demoSeeded).toBe(true);
  // The snapshot is of the seed (S-E1): taken after it, so every later page reads it rather than the seed's changes one by one.
  await expect.poll(async () => ((await exampleMeta(page, ['fold']))?.fold as { seq?: number } | null)?.seq ?? 0, { timeout: 10_000 }).toBeGreaterThanOrEqual(m.demoSeedSeq as number);
  // The marks cut off, as a reload between an older build's commit and its marks left them (S-A7).
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio-demo'); r.onsuccess = () => res(r.result); });
    await new Promise<void>((res) => { const tx = db.transaction('meta', 'readwrite'); tx.objectStore('meta').delete('demoSeedSeq'); tx.objectStore('meta').delete('demoSeeded'); tx.objectStore('meta').delete('demoSeedTop'); tx.oncomplete = () => res(); }); // raw-ok: the seed's marks only, as an older build's cut-off left them; no change or arrival row is touched
    db.close();
  });
  await page.goto('/today'); await ready(page);
  await expect.poll(async () => (await exampleMeta(page, ['demoSeedSeq']))?.demoSeedSeq, { timeout: 10_000 }).toBe(m.demoSeedSeq); // repaired, to the same number
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(12); // not set out twice
  // One watering, then Leave: the visitor's line is counted and asked about.
  await page.goto('/today'); await ready(page);
  await page.locator('#water .stop .waterbtn, #water .stop button').first().click();
  await page.waitForTimeout(500);
  const asked: string[] = [];
  page.on('dialog', (d) => { asked.push(d.message()); void d.accept(); });
  await page.locator('#demo-leave').click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/(\?left=sample)?$/);
  expect(asked.join(' ')).toMatch(/Leave the example collection\? The (record you added or changed here is|\d+ records you added or changed here are) deleted with it\./);
});

test('r67v V1: inside the example the top bar\'s "+", "Add one to my plants" and "New place" lead out of it first', async ({ page }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await page.goto('/today'); await ready(page);
  await page.locator('#topbar a[aria-label="Add a plant"]').click();
  await expect(page).toHaveURL(/\/plants\/new(\?left=sample)?$/);
  await ready(page);
  await expect(page.locator('html[data-demo]')).not.toBeAttached(); // base: the add form inside the example
  await expect(page.locator('#example-add-line')).toHaveCount(0);
  await intoExample(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('html[data-demo]')).toBeAttached();
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await expect(page).toHaveURL(/\/plants\/new\?species=Copiapoa(\+|%20)cinerea/);
  await ready(page);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await intoExample(page);
  await page.goto('/places'); await ready(page);
  await page.getByRole('button', { name: 'New place' }).click();
  await expect(page).toHaveURL(/\/places(\?left=sample)?(#add)?$/);
  await ready(page);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect(page.locator('#loc-name')).toBeVisible();
});

test('r67v V1: an add form reached inside the example says so, and "Keep it as my own" leaves with the species typed', async ({ page }) => {
  test.setTimeout(120_000);
  await intoExample(page);
  await page.goto('/propagation/new'); await ready(page);
  await expect(page.locator('#example-add-line')).toContainText('A batch added here joins the example collection and is deleted with it.');
  await page.fill('#species-name', 'Astrophytum asterias');
  await page.locator('#species-name').blur();
  page.on('dialog', (d) => d.accept());
  await page.locator('#example-keep').click();
  await expect(page).toHaveURL(/\/propagation\/new\?species=Astrophytum(\+|%20)asterias/);
  await ready(page);
  await expect(page.locator('html[data-demo]')).not.toBeAttached();
  await expect(page.locator('#species-name')).toHaveValue('Astrophytum asterias');
});

test('r67v V6: a copied "?left=sample" link opened beside an example tab deletes nothing (S-A5)', async ({ page, context }) => {
  test.setTimeout(90_000);
  await intoExample(page);
  const other = await context.newPage();
  await other.goto('/?left=sample'); await ready(other);
  await other.waitForTimeout(2000);
  expect(await databases(other)).toContain('cultifolio-demo'); // base: deleted from under the open tab
  await expect(page.locator('#demobar')).not.toContainText('closed in another tab');
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('html[data-demo]')).toBeAttached();
  await expect(page.locator('.rows > *')).toHaveCount(12);
});

test('r67v V7, V8: the example offers no calendar file or spreadsheet, says it is kept nowhere, and that it has no frost site of its own', async ({ page }) => {
  test.setTimeout(90_000);
  await intoExample(page);
  await page.locator('#plants-menu-btn').click();
  await expect(page.locator('#plants-menu')).toBeVisible();
  await expect(page.locator('#plants-sheet')).toHaveCount(0); // base: "Download as a spreadsheet"
  await page.keyboard.press('Escape');
  await expect(page.locator('#storage-notice')).toContainText('The example collection is kept nowhere: it is deleted when you leave it.');
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#water .stop').first()).toBeVisible({ timeout: seedWait() });
  await expect(page.locator('#frost-example')).toContainText('The example collection has no site of its own'); // base: "No site set. Use my location"
  await expect(page.locator('#frost').getByRole('button', { name: 'Use my location' })).toHaveCount(0);
  await expect(page.locator('#calendar')).toHaveCount(0); // base: fourteen real-looking reminders to 2028
  await expect(page.locator('.today')).toContainText('The example collection is kept nowhere: it is deleted when you leave it.'); // base: "Kept on this device: no backup yet, not synced"
});

test('r67v V9: on a phone the welcome\'s lead says what the site is, and a whole row is still above the tab bar (R45-4)', async ({ browser, baseURL }) => {
  for (const viewport of [{ width: 375, height: 548 }, { width: 390, height: 664 }, { width: 360, height: 640 }]) {
    const ctx = await browser.newContext({ baseURL, viewport, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto('/'); await ready(page);
    await expect(page.locator('#welcome')).toContainText('Grow cacti, succulents or bulbs?');
    const [row, bar] = await Promise.all([page.locator('.rows .azrow, .rows > a, .rows > div').first().boundingBox(), page.locator('#tabbar').boundingBox()]);
    expect(row && bar && row.y + row.height <= bar.y + 1, `${JSON.stringify(viewport)}: first row ${JSON.stringify(row)} against the tab bar ${JSON.stringify(bar)}`).toBe(true);
    await ctx.close();
  }
});

test('r67v V10: a returning visitor\'s own line is drawn from the server, so the rows do not move (R45-8) @chromium', async ({ browser, baseURL }) => {
  const ctx: BrowserContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
  await ctx.addInitScript(() => {
    localStorage.setItem('cultifolio.welcomed', '1');
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  const page = await ctx.newPage();
  const html = await (await page.request.get('/')).text();
  expect(html).toContain('id="welcome-after"'); // base: drawn only once the collection had opened
  await page.goto('/'); await ready(page);
  await expect(page.locator('#welcome-after')).toBeVisible();
  await expect(page.locator('#welcome')).toHaveCount(0);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.01); // base: 0.039 at 390
  await ctx.close();
});

/**
 * Round sixty-seven, the harness (triage-66 H1; S-E9, R45-D): request budgets. Each test counts the IndexedDB requests a
 * step costs (tests/e2e/helpers/idb-count.ts) and holds it to a budget, so a change that multiplies them fails here in
 * any engine, rather than passing in Chromium and being waited for in WebKit (helpers/pace.ts gives Safari's engine the
 * time a request costs there, so it could not tell).
 *
 * Measured on the base of round sixty-six (reviewer E's table, CONFIRMED in Chromium; and again here):
 *   - the example's seed, its page life: 1,319 requests;
 *   - the example's next full page load: 449 (its 431 seed changes read one `get` each after an empty snapshot);
 *   - one Water on a fresh page: 9;
 *   - an import of 100 plants: 6,643 (66 a plant);
 *   - one Water after an import of 100 in the same page life: 2,217 (every change since the load read again, one `get`
 *     each, after the import's claimed writes);
 *   - a load with a short tail since its snapshot: 18 plus one `get` per change of the tail.
 * Round sixty-seven's R reads the load's tail in one range, moves the frontier after a claimed write, saves a snapshot
 * after the seed and an import, and writes no outbox in the example. The budgets are the triage's, set for after that.
 *
 * Counted in Chromium alone (`@chromium`): a count is the same in every engine, so the other engines would only repeat
 * it, at their own pace.
 */
import { test, expect, type Page } from '@playwright/test';
import { countRequests, countSince, idbQuiet, markCount } from './helpers/idb-count';
import { inject, injectTail, snapshotSaved, type Row } from './helpers/inject';
import { openDisclosure } from './helpers/disclosure';
import { ownPages } from './helpers/r63v-own';

test.use({ serviceWorkers: 'block' });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** `n` growing plants of the grower's own, written as another device's sync would leave them. */
function plants(n: number): Row[] {
  const names = ['Copiapoa cinerea', 'Copiapoa humilis', 'Lithops lesliei', 'Welwitschia mirabilis', 'Aloe vera'];
  const rows: Row[] = [['location', 'locB', 'name', 'South bench'], ['location', 'locB', 'type', 'bench']];
  for (let i = 1; i <= n; i++) {
    const id = `rB${String(i).padStart(4, '0')}`;
    rows.push(['accession', id, 'acc', `2025-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', names[i % names.length]], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'], ['accession', id, 'acquired', '2025-03-01'], ['accession', id, 'locationId', 'locB']);
  }
  return rows;
}

/** The example set out from /plants on a fresh device, in a counted context; the page is left on the example's plants. */
async function setOut(page: Page) {
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 30_000 });
}

test('r67h budget 1: the example set out costs at most 1,400 requests, its whole page life', { tag: '@chromium' }, async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await countRequests(ctx);
  const page = await ctx.newPage();
  await setOut(page);
  // From the page's start: the load, the seed's commit and what follows it (base: 1,319).
  const seed = await countSince(page, 'the example set out');
  expect(seed.requests, JSON.stringify(seed)).toBeLessThanOrEqual(1_400);
  await ctx.close();
});

test("r67h budget 2: the example's next page load costs at most 60 requests", { tag: '@chromium' }, async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await countRequests(ctx);
  const page = await ctx.newPage();
  await setOut(page);
  await idbQuiet(page);
  // The next full page load in the example: a visitor's Today, My plants or a reload (base: 449, the 431 seed changes
  // read one `get` each after the empty snapshot of the page that opened the example; R's snapshot after the seed, or
  // the tail read in one range, brings it under 60).
  await page.reload(); await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(12);
  const again = await countSince(page, "the example's second page load");
  expect(again.requests, JSON.stringify(again)).toBeLessThanOrEqual(60);
  await ctx.close();
});

test('r67h budget 3: one Water on a fresh page costs at most 20 requests', { tag: '@chromium' }, async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(ownPages);
  await countRequests(ctx);
  const page = await ctx.newPage();
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(5), Date.now() - 3 * 86_400_000);
  await page.goto('/plants/2025-0001'); await ready(page);
  await expect(page.locator('#water-now')).toBeVisible();
  await idbQuiet(page);
  await markCount(page);
  await page.click('#water-now');
  const water = await countSince(page, 'one Water on a fresh page');
  expect(water.readwrite, 'one write').toBeGreaterThanOrEqual(1);
  expect(water.requests, JSON.stringify(water)).toBeLessThanOrEqual(20);
  await ctx.close();
});

test('r67h budget 4: an import of 100 costs at most 70 requests a plant, and one Water right after it, in the same page life, at most 60', { tag: '@chromium' }, async ({ browser }) => {
  test.setTimeout(240_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(ownPages);
  await countRequests(ctx);
  const page = await ctx.newPage();
  const N = 100;
  const names = ['Copiapoa cinerea', 'Copiapoa humilis', 'Lithops lesliei', 'Welwitschia mirabilis', 'Mammillaria cf. bombycina'];
  const lines = ['Acc No.,Genus,Species,Locality,Date Acq.,Notes'];
  for (let i = 1; i <= N; i++) { const [g, s] = names[i % names.length].split(/ (.*)/); lines.push(`${String(i).padStart(4, '0')},${g},${s},"Locality ${i}, Chile",2024-05-01,note ${i}`); }
  await page.goto('/plants/import'); await ready(page);
  await page.click('#imp-mode-csv');
  await openDisclosure(page, '#imp-csv-paste-box');
  await page.fill('#imp-csv-text', lines.join('\n'));
  await page.click('#imp-csv-read');
  await page.click('#imp-check');
  await expect(page.locator('#imp-summary')).toContainText(`${N} lines`, { timeout: 90_000 });
  await markCount(page);
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText(`${N} plants added`, { timeout: 120_000 });
  const imported = await countSince(page, `an import of ${N}`);
  // The import itself, per plant (R45-D's "an imported plant"): base 6,643 for 100, three requests a change (the change,
  // its arrival row and its outbox row) over about 22 changes a plant. A budget of 70 a plant holds that, so a fourth
  // request a change, or a re-read of the import, fails.
  test.info().annotations.push({ type: 'requests', description: `an import of ${N}: ${imported.requests} requests, ${(imported.requests / N).toFixed(1)} a plant` });
  expect(imported.requests, JSON.stringify(imported)).toBeLessThanOrEqual(70 * N);
  // Into a plant's page without a page load, as a person goes from the import's "See them on My plants".
  await page.click('a:has-text("See them on My plants")');
  await page.locator('.rows a').first().waitFor();
  await page.locator('.rows a').first().click();
  await expect(page.locator('#water-now')).toBeVisible();
  await idbQuiet(page);
  await markCount(page);
  await page.click('#water-now');
  const water = await countSince(page, `one Water after an import of ${N}, same page life`);
  expect(water.readwrite, 'one write').toBeGreaterThanOrEqual(1);
  // Base: 2,217, of them 2,204 single `get`s of changes this page had already folded (R moves the frontier after a
  // claimed write).
  expect(water.requests, JSON.stringify(water)).toBeLessThanOrEqual(60);
  await ctx.close();
});

test('r67h budget 5: a page load with fewer than 50 changes since the snapshot costs at most 40 requests', { tag: '@chromium' }, async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(ownPages);
  await countRequests(ctx);
  const page = await ctx.newPage();
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(40), Date.now() - 3 * 86_400_000);
  // A load folds the log and saves its snapshot (there is none after `inject`).
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('.seccount').first()).toContainText('40');
  await snapshotSaved(page);
  await idbQuiet(page);
  // 45 changes after the snapshot, as a sync pull stores them (the snapshot is kept): a note on each of 45 plants' logs.
  const tail: Row[] = [];
  for (let i = 1; i <= 15; i++) tail.push(['event', `eT${i}`, 'acc', `rB${String(i).padStart(4, '0')}`], ['event', `eT${i}`, 'd', '2026-09-01'], ['event', `eT${i}`, 't', 'water']);
  expect(tail.length).toBeLessThan(50);
  await injectTail(page, tail, Date.now() - 86_400_000);
  // The next full page load, counted from its start.
  await page.reload(); await ready(page);
  await expect(page.locator('.seccount').first()).toContainText('40');
  const load = await countSince(page, `a page load with ${tail.length} changes since the snapshot`);
  // Base: 18 plus one `get` per change of the tail (R reads the tail in one range).
  expect(load.requests, JSON.stringify(load)).toBeLessThanOrEqual(40);
  await ctx.close();
});

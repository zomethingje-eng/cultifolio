/**
 * QA probes for the user-facing side: what a test cannot pin down but a
 * person should look at. The findings of the first pass that could be fixed
 * became tests in tests/e2e/smoke.spec.ts; what is left here is the visual
 * sweep (screenshots at 360 and 1280 px, horizontal overflow), the console and
 * network sweep, and list performance with 600 plants. Assertions are
 * `expect.soft` so one run reports everything. Screenshots land in $QA_SHOTS.
 *
 *   QA_SHOTS=/some/dir PW_CHROMIUM=... npx playwright test --config tests/qa/playwright.config.ts
 *
 * Known and not fixable from the page: the front-page tile says "no open
 * photograph on file" from the index's photo count alone; the index carries
 * no upstream status, so a refused photo source is not told apart there (the
 * species page itself is).
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = process.env.QA_SHOTS ?? 'test-results/qa-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

const SPECIES = ['copiapoa-cinerea', 'welwitschia-mirabilis', 'refusia-testii'];
const NAMES: Record<string, string> = { 'copiapoa-cinerea': 'Copiapoa cinerea', 'welwitschia-mirabilis': 'Welwitschia mirabilis', 'refusia-testii': 'Refusia testii' };
const STATIC_ROUTES = ['/', '/plants', '/plants/new', '/benches', '/sowings', '/sowings/new', '/labels', '/backup', '/sync', '/frost', '/offline', '/about/how', '/about/formats', ...SPECIES.map((s) => `/species/${s}`)];

/** Everything the browser says or fails to fetch, per page, plus any request that leaves this origin. */
function watch(page: Page) {
  const out = { console: [] as string[], failed: [] as string[], thirdParty: [] as string[] };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') out.console.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => out.console.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => out.failed.push(`${r.method()} ${r.url()} → ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) out.failed.push(`${r.request().method()} ${r.url()} → ${r.status()}`); });
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== '127.0.0.1:4173' && u.protocol.startsWith('http')) out.thirdParty.push(`${r.method()} ${r.url()}`); });
  return out;
}

async function addPlant(page: Page, name: string, opts: { count?: number; field?: string } = {}) {
  await page.goto('/plants/new');
  await page.fill('#species-name', name);
  await page.locator('#species-name').blur();
  if (opts.field) await page.fill('#f-field', opts.field);
  if (opts.count) await page.fill('#f-count', String(opts.count));
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(opts.count && opts.count > 1 ? /\/plants$/ : /\/plants\/\d{4}-\d{4}$/);
  return page.url().split('/').pop()!;
}

const overflow = (page: Page) => page.evaluate(() => {
  const w = window.innerWidth;
  const wide = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > w + 1 && getComputedStyle(el).visibility !== 'hidden' && r.width > 0; }).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''} right=${Math.round(el.getBoundingClientRect().right)}`);
  return { scrollW: document.documentElement.scrollWidth, innerW: w, wide };
});

/* ------------------------------------------------------------------ 1. console, failed requests, third-party hosts */

test('every page: console errors, failed requests, and any request that leaves the origin', async ({ page }) => {
  test.setTimeout(120_000);
  const report: Record<string, ReturnType<typeof watch>> = {};
  await addPlant(page, 'Copiapoa cinerea');
  for (const r of STATIC_ROUTES) {
    const w = watch(page);
    await page.goto(r);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    report[r] = w;
    page.removeAllListeners();
  }
  // The plant page and the species picker as used: type a name and see where it goes.
  const w = watch(page);
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapoa cin');
  await page.waitForTimeout(800);
  await page.locator('#species-name').blur();
  await page.waitForTimeout(800);
  report['/plants/new (typing a name)'] = w;
  const lines: string[] = [];
  for (const [r, x] of Object.entries(report)) {
    if (x.console.length || x.failed.length || x.thirdParty.length) lines.push(`${r}\n  console: ${x.console.join(' | ') || '-'}\n  failed: ${x.failed.join(' | ') || '-'}\n  third-party: ${x.thirdParty.join(' | ') || '-'}`);
  }
  console.log('=== CONSOLE / NETWORK ===\n' + (lines.join('\n') || 'nothing on any page'));
  test.info().annotations.push({ type: 'network', description: lines.join('\n') });
  // Rule: no third-party hosts from the browser. Photographs load from iNaturalist's and Commons' image hosts, named on /about/how; anything else is a finding.
  const third = Object.entries(report).flatMap(([r, x]) => x.thirdParty.map((t) => `${r}: ${t}`));
  expect.soft(third.filter((t) => !/inaturalist|wikimedia/.test(t)), 'requests to third-party hosts from the browser, other than the image hosts').toEqual([]);
  // No page errors anywhere.
  // Failed image loads from the (sandboxed) image hosts are expected here; anything else is a finding.
  const errs = Object.entries(report).flatMap(([r, x]) => x.console.filter((c) => c.startsWith('[pageerror]') || (c.startsWith('[error]') && !/ERR_TUNNEL_CONNECTION_FAILED|ERR_ABORTED/.test(c))).map((c) => `${r}: ${c}`));
  expect.soft(errs, 'console errors').toEqual([]);
});

/* ------------------------------------------------------------------ 2. screenshots at 360 and 1280, overflow */

for (const width of [360, 1280]) {
  test(`render every page at ${width}px: screenshots and horizontal overflow`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 } });
    const page = await ctx.newPage();
    // One plant of each fixture species, one with a field number and a note.
    const accs: Record<string, string> = {};
    for (const s of SPECIES) accs[s] = await addPlant(page, NAMES[s], { field: s === 'copiapoa-cinerea' ? 'KK 1462' : undefined });
    // A place, so the plant page has a bench to compare with and the labels page has a location.
    await page.goto('/benches');
    await page.getByRole('button', { name: 'New location' }).click();
    await page.fill('#loc-name', 'East sill');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const routes = [...STATIC_ROUTES, ...SPECIES.map((s) => `/plants/${accs[s]}`)];
    const bad: string[] = [];
    for (const r of routes) {
      await page.goto(r);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
      const o = await overflow(page);
      const name = `${width}${r.replace(/\//g, '_') || '_root'}`;
      await shot(page, name);
      if (o.scrollW > o.innerW + 1) bad.push(`${r}: scrollWidth ${o.scrollW} > ${o.innerW}; ${o.wide.join(', ')}`);
    }
    // A bench page with the frost section and edit form open.
    await page.goto('/benches');
    await page.locator('a.row').first().click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await shot(page, `${width}_benches_id_edit`);
    // Plant page with the log form open and the edit form open.
    await page.goto(`/plants/${accs['copiapoa-cinerea']}`);
    await page.getByRole('button', { name: 'Measure' }).click();
    await shot(page, `${width}_plants_acc_measure`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await shot(page, `${width}_plants_acc_edit`);
    const o = await overflow(page);
    if (o.scrollW > o.innerW + 1) bad.push(`/plants/[acc] edit+measure: scrollWidth ${o.scrollW} > ${o.innerW}; ${o.wide.join(', ')}`);
    // Dark scheme, two pages.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/species/copiapoa-cinerea');
    await shot(page, `${width}_dark_species`);
    await page.goto(`/plants/${accs['copiapoa-cinerea']}`);
    await shot(page, `${width}_dark_plant`);
    console.log(`=== OVERFLOW @${width} ===\n` + (bad.join('\n') || 'none'));
    expect.soft(bad, `horizontal overflow at ${width}px`).toEqual([]);
    await ctx.close();
  });
}

/* ------------------------------------------------------------------ 6. state handling */

test('states: a collection of 600 plants, list performance and search', async ({ page }) => {
  test.setTimeout(240_000);
  for (const n of ['Copiapoa cinerea', 'Welwitschia mirabilis', 'Refusia testii']) await addPlant(page, n, { count: 200 });
  await page.goto('/plants');
  const t0 = Date.now();
  await expect(page.locator('a.accrow')).toHaveCount(600, { timeout: 60_000 });
  const listMs = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
  const t1 = Date.now();
  await page.fill('#plants-q', '2026-0333');
  await expect(page.locator('a.accrow')).toHaveCount(1);
  const searchMs = Date.now() - t1;
  const t2 = Date.now();
  await page.fill('#plants-q', 'refusia');
  await expect(page.locator('a.accrow')).toHaveCount(200);
  const search2Ms = Date.now() - t2;
  // Typing latency: how long a single keystroke blocks.
  await page.fill('#plants-q', '');
  const typeMs = await page.evaluate(async () => { const el = document.querySelector<HTMLInputElement>('#plants-q')!; const t = performance.now(); el.value = 'c'; el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t); });
  // Other pages that walk the whole collection.
  const t3 = Date.now();
  await page.goto('/labels');
  await expect(page.locator('.pick')).toHaveCount(600, { timeout: 60_000 });
  const labelsMs = Date.now() - t3;
  const t4 = Date.now();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.pill', { hasText: 'you grow 200' })).toBeVisible({ timeout: 60_000 });
  const speciesMs = Date.now() - t4;
  const t5 = Date.now();
  await page.goto('/');
  await page.getByRole('button', { name: /You grow/ }).click();
  await expect(page.locator('.tile')).toHaveCount(3, { timeout: 60_000 });
  const frontMs = Date.now() - t5;
  console.log(`=== 600 PLANTS === list ${listMs} ms (dcl ${nav.dcl}, load ${nav.load}); search by number ${searchMs} ms; search by name ${search2Ms} ms; one keystroke ${typeMs} ms; labels page ${labelsMs} ms; species page ${speciesMs} ms; front "you grow" ${frontMs} ms`);
  expect.soft(listMs, 'plants list with 600 plants').toBeLessThan(3000);
  expect.soft(typeMs, 'one keystroke in search').toBeLessThan(200);
  expect.soft(labelsMs, 'labels page with 600 plants').toBeLessThan(5000);
});


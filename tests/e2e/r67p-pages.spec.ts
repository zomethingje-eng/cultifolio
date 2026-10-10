/**
 * Round sixty-seven, agent P (triage-66 P1, P3, P6, P7, P8, P10). Each test failed on the base.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ownPages } from './helpers/r63v-own';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
const plant = (id: string, no: string, name: string, place?: string): Row[] => [
  ['accession', id, 'acc', no], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'], ...(place ? [['accession', id, 'locationId', place] as Row] : [])
];

/** Firefox's persist(): it asks the person, and a dismissed question never answers. Each ask is logged. */
function firefoxPersist(): void {
  const st = navigator.storage as StorageManager & { persist: () => Promise<boolean>; persisted: () => Promise<boolean> };
  st.persist = () => { try { localStorage.setItem('__asks', `${localStorage.getItem('__asks') ?? ''}${location.pathname};`); } catch { /* none */ } return new Promise<boolean>(() => {}); };
  st.persisted = () => Promise.resolve(false);
}

test('r67p P1: a "keep data" question never answered is put once over six page loads, not on every load (S-E4, R45-6, IND-2)', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  await ctx.addInitScript(ownPages);
  await ctx.addInitScript(firefoxPersist);
  const page = await ctx.newPage();
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('rQ1', '2026-0001', 'Copiapoa cinerea'), Date.now() - 86_400_000);
  await page.evaluate(() => localStorage.removeItem('__asks'));
  for (const path of ['/plants', '/today', '/', '/plants', '/places', '/plants/rQ1']) {
    await page.goto(path); await ready(page);
    await page.waitForTimeout(1200);
  }
  const asks = (await page.evaluate(() => localStorage.getItem('__asks') ?? '')).split(';').filter(Boolean);
  expect(asks.length, asks.join(' ')).toBe(1); // the base asked on every load: 7
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.persistAskedAt'))).not.toBeNull();
  await ctx.close();
});

test('r67p P3: hovering the compare tray on a private page sends nothing (S-F6, R45-7)', async ({ page }) => {
  await page.addInitScript(ownPages);
  await page.addInitScript(() => { try { localStorage.setItem('cultifolio.compare', JSON.stringify([{ slug: 'copiapoa-cinerea', name: 'Copiapoa cinerea' }, { slug: 'welwitschia-mirabilis', name: 'Welwitschia mirabilis' }])); } catch { /* none */ } });
  const asked: string[] = [];
  page.on('request', (r) => { if (/\/compare\/__data\.json|\/species\/.*__data\.json/.test(r.url())) asked.push(r.url()); });
  for (const w of [1280, 390]) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.goto('/plants'); await ready(page);
    const link = page.locator(w > 700 ? '.tray a[href^="/compare?"]' : '.cmppill a.go').first();
    await expect(link).toBeVisible();
    await link.hover();
    await page.waitForTimeout(1200);
  }
  expect(asked).toEqual([]);
  // A public page still preloads on hover: the rule is the private pages'.
  expect(await page.evaluate(() => document.body.getAttribute('data-sveltekit-preload-data'))).toBe('off');
  await page.goto('/'); await ready(page);
  expect(await page.evaluate(() => document.body.getAttribute('data-sveltekit-preload-data'))).toBe('hover');
});

test('r67p P6: the menu says the current page and its items take a thumb; Today\'s place headings read with a separator', async ({ page }) => {
  await page.addInitScript(ownPages);
  await page.goto('/plants'); await ready(page);
  await inject(page, [['location', 'gh', 'name', 'Greenhouse'], ...plant('r1', '2026-0001', 'Copiapoa cinerea', 'gh'), ...plant('r2', '2026-0002', 'Lithops lesliei', 'gh')], Date.now() - 90 * 86_400_000);
  await page.goto('/plants'); await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.locator('#menu a[aria-current="page"]')).toHaveText('My plants');
  for (const h of await page.locator('#menu a, #menu .menuexample').evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
  await page.keyboard.press('Escape');
  await page.goto('/today'); await ready(page);
  await expect(page.getByRole('heading', { name: /^Greenhouse ?, 2 growing$/ })).toBeVisible({ timeout: 30_000 });
});

test('r67p P7: a species page whose photographs fail keeps the strip\'s squares, moves nothing, and lays no credit over the failed photograph (R45-8)', async ({ page }) => {
  // Every photograph host fails, a second late, as a blocked or flaky network does.
  await page.route(/inaturalist|wikimedia\.org|api\.gbif\.org\/v1\/image/, async (r) => { await new Promise((f) => setTimeout(f, 1000)); await r.abort(); });
  await page.setViewportSize({ width: 390, height: 664 });
  // How many photographs the server put in the strip: a failure can land before the page is ready.
  const html = await (await page.request.get('/species/copiapoa-cinerea')).text();
  const n = (/class="thumbstrip[^]*?<\/a>/.exec(html)?.[0].match(/<img /g) ?? []).length;
  expect(n, 'the fixture species shows a strip').toBeGreaterThan(0);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const strip = page.locator('.thumbstrip img');
  const tops = await page.evaluate(async () => {
    const seen = new Set<number>();
    const t0 = performance.now();
    while (performance.now() - t0 < 2500) {
      const el = document.querySelector('nav.tabs');
      if (el) seen.add(Math.round(el.getBoundingClientRect().top + scrollY));
      await new Promise((f) => requestAnimationFrame(() => f(null)));
    }
    return [...seen];
  });
  expect(tops.length, `section menu at ${tops.join(', ')}`).toBe(1);
  await expect(strip).toHaveCount(n); // the base removed each failed photograph, and the page below moved up
  for (const b of await page.locator('.thumbstrip .tb').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width))) expect(b).toBe(72);
  await expect(page.locator('.thumbstrip .tb')).toHaveCount(n);
  const failed = page.locator('.hero.failed');
  if (await failed.count()) {
    await expect(failed.locator('.cred')).toHaveText("The photograph's own page");
  }
});

test('r67p P8: after "Save and add another", a name check still in flight for the previous name does not settle onto the emptied field (R45-25)', async ({ page }) => {
  await page.addInitScript(ownPages);
  // The name service answers late, for the first name only; the reference's own search has nothing.
  await page.route('**/api/names**', async (r) => { await new Promise((f) => setTimeout(f, 2500)); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ key: 4242, canonicalName: 'Notacactus ignotus', rank: 'SPECIES', status: 'ACCEPTED', family: 'Cactaceae' }]) }); });
  await page.route('**/api/search**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto('/plants/new'); await ready(page);
  await page.locator('#species-name').fill('Notacactus ignotus');
  await page.waitForTimeout(400);
  await page.locator('#species-name').press('Enter'); // arms: the next Add keeps the name as typed, without waiting for the check
  await page.getByRole('button', { name: 'Save and add another' }).click();
  await expect(page.locator('#species-name')).toHaveValue('', { timeout: 10_000 });
  await page.waitForTimeout(3500); // the late answer arrives
  await expect(page.locator('.picker .pill.ok')).toHaveCount(0);
  await expect(page.locator('.picker .menu')).toBeHidden();
});

/** Each distinct top, page coordinates, of each selector, sampled every frame for `ms`. */
async function framesOf(page: Page, sels: string[], ms: number): Promise<Record<string, number[]>> {
  return page.evaluate(async ({ sels, ms }) => {
    const seen: Record<string, Set<number>> = Object.fromEntries(sels.map((s) => [s, new Set<number>()]));
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      for (const s of sels) { const el = document.querySelector(s); if (el) seen[s].add(Math.round(el.getBoundingClientRect().top + scrollY)); }
      await new Promise((f) => requestAnimationFrame(() => f(null)));
    }
    return Object.fromEntries(sels.map((s) => [s, [...seen[s]]]));
  }, { sels, ms });
}

for (const name of ['Copiapoa cinerea', 'Copiapoa zzzzia']) {
  test(`r67p P10: the add form's "Use my own number" and Add do not move, frame by frame, as the name check answers late (${name}; S-E2, decision D5)`, async ({ page }) => {
    await page.addInitScript(ownPages);
    await page.route('**/api/names**', async (r) => { await new Promise((f) => setTimeout(f, 1500)); await r.continue(); });
    await page.route('**/api/search**', async (r) => { await new Promise((f) => setTimeout(f, 1200)); await r.continue(); });
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/plants/new'); await ready(page);
    await page.locator('#species-name').fill(name);
    await page.locator('#species-name').blur();
    const tops = await framesOf(page, ['details.own > summary', '.actions button.add', 'details.moredetails > summary'], 4000);
    for (const [sel, ys] of Object.entries(tops)) expect(ys.length, `${sel} at ${ys.join(', ')}`).toBe(1);
    // The check did answer within the window: a pill or a line is shown.
    await expect(page.locator('.picker .status > *').first()).toBeVisible();
  });
}

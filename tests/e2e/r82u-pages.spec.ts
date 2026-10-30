/**
 * Round eighty-two (U): the pages' fixes from the two independent reviews of 2026-10-23.
 *
 *  1. (review 1's 10) Why GBIF's records were not asked is said once a page, under the name card; the sections refer to it.
 *  2. (23) No Papers section and no Papers tab while papers are not asked; the record of sources says it.
 *  3. (11) The "Without climate" chip and its count say "not checked" apart from "none".
 *  4. (12) The close-up map names the page's regions, has a scale bar and a light graticule.
 *  5. (13) The lead photograph is the cultivated set's first where there is one.
 *  6. (19) The section row marks the section a tab or an address scrolled to, not the one before it.
 *  7. (20, review 2's 5) Compare gives the regions' "+N" and labels its two rain totals.
 *  8. (21, 22) The world map's caption is worded by what the page holds; the regions are said to be Kew's units.
 *  9. (24) Running text on a desktop is 15 px.
 * 10. (review 2's 6 and 7) The phone's first screen says in one sentence what the app is; the example's button is 44 px.
 * 11. (review 2's 3) "Popular genera".
 * 12. (40, the owner's decision) A climate from few records is marked on its figures and in its climate section.
 * 13. (review 2's 1, review 1's 26) A photograph whose source names no author says "author not stated".
 * 14. (review 2's lead) Compare's photographs failing after the columns are drawn again throw no TypeError.
 * 15. Every page changed, at 320, 375 and 430 px, is no wider than the screen.
 *
 * Fields the fixture's dossiers lack are put into a page's data on a client-side visit (`__data.json`), as r73p does.
 * The worker is blocked, photographs are answered or refused here, and no step leans on Chromium's timing, so each holds
 * in WebKit and Firefox.
 *
 * On r82base: 1 FAILED (the sentence five times, no #records-unchecked); 2 FAILED (the section and its tab); 3 FAILED
 * ("Without climate, 3"); 4 FAILED (no names, scale or lines); 5 FAILED (grower80, wild, led); 6 FAILED ("Cultivation"
 * marked at #s-climate); 7 FAILED (no "+9", no rain note); 8 FAILED ("Native range as published by WCVP" over no range;
 * no note); 9 FAILED (13.5 px); 10 FAILED (the button 20 px, no such sentence); 11 FAILED ("Most grown"); 12 FAILED (no
 * mark); 13 FAILED ("no rights reserved"); 14 FAILED ("TypeError: n is not a function" in Chromium's run).
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as devalue from 'devalue';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

const WHY = "GBIF's backbone holds no one accepted species of this name";
/** A 4 × 3 PNG, so a photograph routed here loads, landscape. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGNoWJAARww4OQBgthIBDttNdgAAAABJRU5ErkJggg==', 'base64');
const photosLoad = (page: Page) => page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|api\.gbif\.org)\//, (r: Route) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
const noThirdParty = (page: Page) => page.route(/^https:\/\/(?!127\.0\.0\.1)/, (r: Route) => r.abort());

/** A page's data changed on its way in, for a client-side visit (the r73p pattern; every streamed line kept). */
async function rewrite(page: Page, path: RegExp, change: (d: Record<string, unknown>) => void) {
  await page.route(path, async (route: Route) => {
    const res = await route.fetch();
    const [first, ...rest] = (await res.text()).split('\n');
    const j = JSON.parse(first) as { nodes?: Array<{ type: string; data?: unknown[] } | null> };
    for (const n of j.nodes ?? []) {
      if (!n || n.type !== 'data' || !n.data) continue;
      const d = devalue.unflatten(n.data as never) as Record<string, unknown>;
      change(d);
      n.data = JSON.parse(devalue.stringify(d));
    }
    const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !/^(content-length|transfer-encoding|content-encoding)$/i.test(k)));
    await route.fulfill({ status: res.status(), headers, body: [JSON.stringify(j), ...rest].join('\n') });
  });
}
type Dossier = { climate: Record<string, unknown>; distribution: Record<string, unknown>; upstream: Record<string, unknown>; photos: unknown[] };
/** Copiapoa humilis by a client-side visit from Copiapoa cinerea's related tile, its data changed by `change`. */
async function humilis(page: Page, change: (d: Dossier) => void) {
  await rewrite(page, /\/species\/copiapoa-humilis\/__data\.json/, (x) => { if (x.d) change(x.d as Dossier); });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('a.reltile[href="/species/copiapoa-humilis"]').first().click();
  await expect(page).toHaveURL(/\/species\/copiapoa-humilis$/);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa humilis');
}

test('r82u 1: why GBIF\'s records were not asked is said once, under the name, and the sections refer to it @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/hesperocyparis-lusitanica'); await ready(page);
  const note = page.locator('#records-unchecked');
  await expect(note).toContainText(`GBIF's records not checked.`);
  await expect(note.locator('details.why')).toContainText(WHY); // round eighty-four (P7): behind "Why"
  // Under the name card, before the section row.
  expect(await note.evaluate((n) => !!(document.querySelector('.top')!.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(n.compareDocumentPosition(document.querySelector('nav.tabs')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  // Once in the page a reader reads (the record of sources, which lists each source's row, aside).
  const times = await page.evaluate((why) => { const a = document.querySelector('article.species')!.cloneNode(true) as HTMLElement; a.querySelectorAll('details.prov, .prov').forEach((x) => x.remove()); return a.textContent!.split(why).length - 1; }, WHY);
  expect(times).toBe(1);
  // Each place made from the records points to it, and does not say "not checked" again (round eighty-four; A10).
  await expect(page.locator('#no-gbif-climate')).toContainText('No habitat climate');
  await expect(page.locator('.note-slot .none')).toContainText('No sheet');
  await expect(page.locator('#near-not-checked')).toContainText('None to compare');
  await expect(page.locator('.mapcap').nth(1)).toContainText('No records drawn');
  expect(await page.locator('article a[href="#records-unchecked"]').count()).toBeGreaterThanOrEqual(3);
});

test('r82u 2: no Papers section or tab while papers are not asked, and the record of sources says why @phone', async ({ page }) => {
  await page.goto('/species/copiapoa-humilis'); await ready(page);
  await expect(page.locator('#s-research')).toHaveCount(0);
  await expect(page.locator('a[href="#s-research"]')).toHaveCount(0);
  await page.locator('details.prov summary').click();
  const row = page.locator('details.prov .row', { hasText: 'OpenAlex papers' });
  await expect(row).toContainText('not asked');
  await expect(row).toContainText('not yet asked for this reference');
  // A page that lists papers keeps the section and its tab (guard).
  await page.goto('/species/welwitschia-mirabilis'); await ready(page);
  await expect(page.locator('#s-research')).toHaveText('Papers naming this species');
  await expect(page.locator('a[href="#s-research"]')).toHaveCount(1);
});

test('r82u 3: the climate chip says none apart from not checked, under every chip @phone', async ({ page }) => {
  await noThirdParty(page);
  for (const q of ['/', '/?chip=climate', '/?chip=noclimate']) {
    await page.goto(q); await ready(page);
    const chip = page.locator('.chiprow a[href*="chip=noclimate"]');
    await expect(chip).toHaveText(/^No climate,?\s*0,\s*2 not checked$/); // base: "Without climate, 3"
    await expect(chip).toHaveAttribute('title', /0 with no habitat climate derived, 2 not checked/);
  }
  await expect(page.locator('.seccount:visible').last()).toContainText('3 species without habitat climate: 0 with none derived, 2 not checked, 1 pending');
});

test('r82u 4: the close-up map names the page\'s region, with a scale bar and a graticule @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const box = page.locator('.maprow .mapbox').nth(1);
  const label = box.locator('.mwords .mlab', { hasText: 'Chile North' });
  await expect(label).toBeVisible();
  await expect(box.locator('.mwords .mscale')).toHaveText(/^[\d,]+ km$/);
  expect(await box.locator('svg.map-region line.grat').count()).toBeGreaterThan(1);
  await expect(box.locator('svg.map-region line.scale')).toHaveCount(1);
  // Inside the map, and the page's own size of type.
  const m = await box.locator('svg.map-region').boundingBox(), l = await label.boundingBox();
  expect(l!.x).toBeGreaterThanOrEqual(m!.x - 1); expect(l!.x + l!.width).toBeLessThanOrEqual(m!.x + m!.width + 1);
  expect(l!.y).toBeGreaterThanOrEqual(m!.y - 1); expect(l!.y + l!.height).toBeLessThanOrEqual(m!.y + m!.height + 1);
  expect(parseFloat(await label.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(11);
});

test('r82u 5: the lead photograph is the cultivated set\'s first @phone', async ({ page }) => {
  await photosLoad(page);
  await page.goto('/species/hesperocyparis-lusitanica'); await ready(page);
  const by = page.locator('.hero.photo .cred .by');
  await expect(by).toContainText('grower82'); // base: grower80, the first, wild
  await expect(by).toContainText('in cultivation');
});

test('r82u 6: the section row marks the section an address or a tab scrolled to @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea#s-climate'); await ready(page);
  await expect(page.locator('nav.tabs a.on')).toHaveText('Climate'); // base: Cultivation
  await page.locator('nav.tabs a', { hasText: 'Habitat' }).click();
  await page.waitForTimeout(1500); // past the 1.2 s the tapped tab is held marked
  await page.evaluate(() => window.scrollBy(0, 1));
  await expect(page.locator('nav.tabs a.on')).toHaveText('Habitat'); // base: Climate
});

test('r82u 7: compare gives the regions\' "+N" and says what each rain total is @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/compare?s=copiapoa-cinerea,hesperocyparis-lusitanica'); await ready(page);
  await expect(page.locator('.head .fam').nth(1)).toHaveText('Cupressaceae · Mexico Central, Mexico Northeast +9');
  // Two columns whose dossiers carry the cells' median: the fixture's do not, so it is put in their data on the way in.
  await rewrite(page, /\/compare\/__data\.json/, (x) => {
    for (const d of (x.items as Dossier[]) ?? []) {
      const months = d.climate.months as Array<{ precipMm: number }>;
      const sum = months.reduce((a, m) => a + m.precipMm, 0);
      d.climate.annualRain = { p10: sum - 30, p50: sum - 20, p90: sum + 40 };
    }
  });
  await page.goto('/compare?s=copiapoa-cinerea'); await ready(page);
  await page.locator('#cmp-q').fill('humilis');
  await page.locator('.found a', { hasText: 'Copiapoa humilis' }).click();
  await expect(page).toHaveURL(/s=copiapoa-cinerea,copiapoa-humilis/);
  await expect(page.locator('.rainnote')).toHaveCount(2);
  await expect(page.locator('.rainnote').first()).toContainText('is the twelve monthly medians added, the year the rain rule reads');
  await expect(page.locator('.rainnote').first()).toContainText('"Rain a year" is the median of the range\'s cells\' own yearly totals');
  await expect(page.locator('.row', { hasText: 'Rain a year' }).locator('.cell.fig').first()).toContainText("the median of the range's cells' own yearly totals");
});

test('r82u 8: the world map\'s caption says a page has no range, and the regions are said to be Kew\'s units @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('#range-caption')).toContainText('Native range as published by WCVP'); // guard
  await expect(page.locator('#units-note')).toContainText('regions are the level-3 units of the World Geographical Scheme for Recording Plant Distributions');
  await expect(page.locator('#units-note a')).toHaveAttribute('href', '/about/how#regions');
  await humilis(page, (d) => { Object.assign(d.distribution, { native: [], introduced: [], boxes: [], source: 'not available', verified: false }); d.upstream['wcvp.distribution'] = { status: 'none', at: '2026-10-21T00:00:00Z' }; });
  await expect(page.locator('#range-caption')).toHaveText(/^No native range: WCVP publishes no distribution for this name/); // base: "Native range as published by WCVP"
  await expect(page.locator('#units-note')).toHaveCount(0);
});

test('r82u 9: running text on a desktop is 15 px; a phone keeps its own', async ({ page }) => {
  await noThirdParty(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const px = (sel: string) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  for (const sel of ['.factgrid > div', 'p.small', '.glance .card .sub', '.idcard .meta']) expect(await px(sel), sel).toBeGreaterThanOrEqual(15);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await px('.factgrid > div')).toBeCloseTo(13.5, 1);
});

test('r82u 10: the first screen says what the app is in one sentence, and the example\'s button is 44 px tall @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/'); await ready(page);
  const vh = page.viewportSize()!.height;
  // On a phone the welcome's first sentence says both halves; on a desktop the pitch above it says the reference, as before.
  const lead = page.viewportSize()!.width <= 640 ? page.locator('#welcome .wlead b') : page.locator('.pitch li').first();
  await expect(lead).toBeVisible();
  await expect(lead).toHaveText(page.viewportSize()!.width <= 640 ? /^A reference to \d+ species, every figure sourced, and a record of your own plants, kept on this device\.$/ : /^A reference for the plants people grow/);
  expect((await lead.boundingBox())!.y + (await lead.boundingBox())!.height).toBeLessThanOrEqual(vh);
  const b = await page.locator('#try-sample-home').boundingBox();
  // 44 px under a finger or in a narrow window; a desktop mouse's target (the theme's 36 px) elsewhere. Base: 19.6 everywhere.
  const finger = page.viewportSize()!.width <= 700 || (await page.evaluate(() => matchMedia('(pointer: coarse)').matches));
  expect(b!.height).toBeGreaterThanOrEqual(finger ? 43.5 : 35.5);
  expect(b!.y + b!.height).toBeLessThanOrEqual(vh);
});

test('r82u 11: the chip is "Popular genera" @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/'); await ready(page);
  await expect(page.locator('.chiprow a[href*="chip=grown"]')).toHaveText('Popular genera, 1');
  await expect(page.locator('main')).not.toContainText('Most grown');
});

test('r82u 12: a climate from few records is marked on its figures and in its climate section, its figures kept @phone', async ({ page }) => {
  await noThirdParty(page);
  await humilis(page, (d) => { d.climate.records = 4; d.climate.cells = 4; });
  // Round eighty-four (P9): the counts in the mark's own words, and the mark a link to the notice, not a hover title.
  await expect(page.locator('#few-records-mark')).toHaveText('from few records: 4 in 4 cells');
  await expect(page.locator('#few-records-mark')).toHaveAttribute('href', '#few-records');
  await expect(page.locator('#few-records-glance')).toContainText('From few records: 4 records in 4 grid cells.');
  await expect(page.locator('#few-records')).toHaveText('From few records: this habitat climate is read from 4 records in 4 grid cells; a page says so under 12 records or 5 cells, and shows the figures as read.');
  await expect(page.locator('.glance .card')).toHaveCount(5); // the figures are all there
  // A page of many records carries no mark (guard).
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('#few-records-mark, #few-records, #few-records-glance')).toHaveCount(0);
});

test('r82u 13: a photograph whose source names no author says "author not stated" @phone', async ({ page }) => {
  await photosLoad(page);
  await humilis(page, (d) => {
    d.photos = [{ src: 'inat', id: '7701', url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/7701/large.jpg', thumb: 'https://inaturalist-open-data.s3.amazonaws.com/photos/7701/medium.jpg', width: 2048, height: 1536, licence: 'cc0', attribution: 'no rights reserved', page: 'https://www.inaturalist.org/photos/7701', captive: false }];
  });
  const cred = page.locator('.hero.photo .cred');
  await expect(cred.locator('.lic')).toHaveText('CC0');
  await expect(cred.locator('.by')).toHaveText(/^author not stated, no rights reserved/); // base: "no rights reserved"
});

test('r82u 14: compare\'s photographs failing after its columns are drawn again throw nothing @phone', async ({ page, context, baseURL }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // A southern hemisphere cookie: the columns are drawn again once the site is read, as the reviewer's were.
  await context.addCookies([{ name: 'cultifolio.hemi', value: 's', url: `${baseURL}/compare` }]);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(/^https:\/\/(?!127\.0\.0\.1)/, async (r: Route) => { await held; await r.abort(); });
  await page.goto('/compare?s=copiapoa-cinerea,hesperocyparis-lusitanica'); await ready(page);
  await page.locator('html[data-collection="open"]').waitFor({ state: 'attached' }).catch(() => {});
  await page.waitForTimeout(500);
  release();
  // Each photograph failed is said by its column: no credit under a photograph that is not there (on the base the
  // handler threw before it could say so, and the credits stayed).
  await expect.poll(() => page.locator('.head img').evaluateAll((xs) => xs.every((i) => (i as HTMLImageElement).complete))).toBe(true);
  await page.waitForTimeout(500);
  expect(errors).toEqual([]); // base: ["n is not a function"] in Chromium's build
  await expect(page.locator('.head .cred')).toHaveCount(0);
});

test('r82u 15: the pages changed are no wider than a phone at 320, 375 and 430 px', async ({ page }) => {
  test.setTimeout(180_000); // fifteen loads
  await noThirdParty(page);
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/?chip=noclimate', '/species/hesperocyparis-lusitanica', '/species/copiapoa-cinerea', '/compare?s=copiapoa-cinerea,hesperocyparis-lusitanica']) {
      await page.goto(path); await ready(page);
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(w, `${path} at ${width}`).toBeLessThanOrEqual(width);
    }
  }
});

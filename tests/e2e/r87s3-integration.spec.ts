/**
 * Round eighty-seven, stage 3 (integration of t1, t2 and t3).
 *
 * 1. The photo walk records the kind of name it filed a plant under (`olderKind`) and the name that kind was read for
 *    (`olderKindOf`), as the add form does (r87p 8 and 9). Fails on t2's walk, which recorded `olderOf` alone.
 * 2. The tracker pages in round eighty-seven's look (DESIGN-87): no bordered pills or chips, no shadows, radius 4px at
 *    most; at 320 px no sideways scroll; 44 px targets on a phone.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import { ready } from './helpers/smoke';
import { inject } from './helpers/inject';
import { allowWrites, seedWait } from './helpers/pace';

test.use({ serviceWorkers: 'block' });

const json = (r: Route, body: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
const entry = (o: Record<string, unknown>) => ({ family: 'Apocynaceae', origin: ['Cape Provinces'], photos: 0, open: 3, climate: 'ok', ...o });
const HOODIA = entry({ key: 'k506502', slug: 'hoodia-alstonii', name: 'Hoodia alstonii', gbif: 9269454, syn: ['Trichocaulon alstonii', 'Ceropegia alstonii'], gname: 'Ceropegia alstonii' });
const row = (key: number, name: string, status = 'ACCEPTED') => ({ key, canonicalName: name, family: 'Apocynaceae', rank: 'SPECIES', status });
const SHEET = { key: 'k506502', gbif: 9269454, slug: 'hoodia-alstonii', name: { scientific: 'Hoodia alstonii', family: 'Apocynaceae' }, centroid: null, habitatLat: null, climate: { status: 'none' } };
const GBIF_COPY = { ...SHEET, slug: 'ceropegia-alstonii', via: 'gbif', page: 'hoodia-alstonii' };
async function stored(page: Page, field: string): Promise<unknown[]> {
  return page.evaluate(async (f) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ kind: string; field: string; value: unknown; t: string }>>((res) => { const q = d.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    d.close();
    return all.filter((c) => c.kind === 'accession' && c.field === f).sort((a, b) => a.t.localeCompare(b.t)).map((c) => c.value);
  }, field);
}
/** One plant through the walk under a name kept as typed after the field's line named a page for it. */
async function walkOne(page: Page, typed: string, sheets: () => number) {
  const img = Buffer.from(await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d')!; g.fillStyle = '#2a6'; g.fillRect(0, 0, 320, 240); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }), 'base64');
  await page.locator('#walk-file').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: img });
  await expect(page.locator('img.pv')).toBeVisible();
  await page.locator('#walk-name').fill(typed);
  await page.locator('#walk-name').blur();
  const add = page.locator('#walk-add');
  await expect(add).toHaveText('Add as typed, and next'); // the field's line named the page, as the add form's does
  await expect.poll(sheets, { timeout: 15_000 }).toBeGreaterThan(0); // the kind's question answered while the line shows
  await add.click();
  await expect(page.locator('#walk-added li', { hasText: typed })).toBeVisible();
}

test("r87s3 1: the photo walk records GBIF's name as gbif, an older name as older, each with the name it was read for", async ({ page }) => {
  allowWrites(60_000);
  let served = 0;
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/entries\?/, (r) => json(r, []));
  await page.route(/\/api\/sheets\?/, (r) => { served++; return json(r, [SHEET, GBIF_COPY]); });
  await page.route(/\/api\/names\?/, (r) => json(r, [row(9269454, 'Ceropegia alstonii')]));
  await page.goto('/plants/walk'); await ready(page);
  await walkOne(page, 'Ceropegia alstonii', () => served);
  expect(await stored(page, 'olderOf')).toEqual(['Hoodia alstonii']);
  expect(await stored(page, 'olderKind')).toEqual(['gbif']); // t2's walk: []
  await page.unroute(/\/api\/names\?/);
  await page.unroute(/\/api\/sheets\?/);
  served = 0;
  await page.route(/\/api\/sheets\?/, (r) => { served++; return json(r, [SHEET]); });
  await page.route(/\/api\/names\?/, (r) => json(r, [row(1, 'Trichocaulon alstonii', 'SYNONYM')]));
  await walkOne(page, 'Trichocaulon alstonii', () => served);
  expect(await stored(page, 'olderKind')).toEqual(['gbif', 'older']);
  expect(await stored(page, 'olderKindOf')).toEqual(['Hoodia alstonii', 'Hoodia alstonii']);
});

test('r87s3 2: with the reference not reached for the kind, the walk records none, and files the plant all the same', async ({ page }) => {
  allowWrites(60_000);
  let aborted = 0;
  await page.route(/\/api\/search\?/, (r) => json(r, [HOODIA]));
  await page.route(/\/api\/entries\?/, (r) => json(r, []));
  await page.route(/\/api\/sheets\?/, (r) => { aborted++; return r.abort(); });
  await page.route(/\/api\/names\?/, (r) => json(r, [row(9269454, 'Ceropegia alstonii')]));
  await page.goto('/plants/walk'); await ready(page);
  await walkOne(page, 'Ceropegia alstonii', () => aborted);
  expect(await stored(page, 'olderOf')).toEqual(['Hoodia alstonii']);
  expect(await stored(page, 'olderKind')).toEqual([]);
  expect(await stored(page, 'olderKindOf')).toEqual([]);
});

/**
 * Everything drawn in `main` on a page: a box shadow (other than none), a corner over 4 px, or a plant's number or state
 * drawn as a filled or bordered box. Inputs are the browser's own (a checkbox's corners are its own drawing).
 */
async function lookProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const name = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${[...el.classList].join('.')}`;
    for (const el of document.querySelectorAll('main *')) {
      if (el.closest('.demobar, #demobar') || el.matches('input, select, option, textarea')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      if (cs.boxShadow && cs.boxShadow !== 'none') out.push(`shadow ${name(el)} ${cs.boxShadow}`);
      const r = Math.max(...[cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius].map((v) => parseFloat(v) || 0));
      if (r > 4) out.push(`radius ${name(el)} ${r}`);
      if (el.matches('.accno, .pill, .chip, .fnchip')) {
        const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
        const edged = ['Top', 'Right', 'Bottom', 'Left'].some((s) => parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0);
        if (filled || edged) out.push(`box ${name(el)}`);
      }
    }
    return [...new Set(out)];
  });
}

test('r87s3 3: the tracker pages in the look: no shadows, corners of 4 px at most, no number or state in a box; none wider than a 320 px screen @phone', async ({ page }) => {
  test.setTimeout(120_000);
  allowWrites(seedWait());
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
  for (const path of ['/plants/2025-0003', '/today', '/plants', '/plants/gone', '/plants/walk', '/plants/flowering', '/plants/report', '/propagation', '/labels']) {
    await page.goto(path); await ready(page);
    expect(await lookProblems(page), path).toEqual([]);
  }
  // The plant past its rhythm says so in words, not in a pill's box; Today's plants are words beside their tick boxes.
  await page.goto('/plants/2025-0003'); await ready(page);
  await expect(page.locator('.idcard .pills .pill')).toContainText('not watered for');
  await page.goto('/today'); await ready(page);
  const box = page.locator('.chip.tick .tickbox').first();
  const bb = (await box.boundingBox())!;
  const tap = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tap')));
  expect(Math.min(bb.width, bb.height)).toBeGreaterThanOrEqual(tap); // the tap token still: 44 px under a finger
  if (test.info().project.name.startsWith('phone')) expect(tap).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 320, height: 640 });
  for (const path of ['/plants/2025-0003', '/today', '/plants/gone', '/plants/walk', '/plants/flowering', '/plants/report']) {
    await page.goto(path); await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0);
  }
});

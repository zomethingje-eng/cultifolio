/**
 * Round sixty-one, agent W: what a stranger sees on the public pages (decisions 8 and 9). The first two are adopted from
 * docs/review-60/tests/visitor-words--pages.spec.ts (both failed on the base of round sixty-one); the rest are this
 * round's: the front page's order and its 2×2 cards, the refusal pills at 320 px and 200% text, the plant number two
 * plants share, and the plain 404.
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r61w-pages.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import zlib from 'node:zlib';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

/** A small solid PNG, so a photograph "loads" with no outside host (the hosts are unreachable from a test). */
function png(w: number, h: number): Buffer {
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h, 90);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Writes straight into the page's IndexedDB (a copy of smoke.spec.ts's helper), then the next load folds them. */
async function inject(page: Page, rows: Array<[string, string, string, string | number | boolean]>, wall: number, writer = 'abcdefabcdef0000') {
  await page.evaluate(async ({ rows, wall, writer }) => {
    let db: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !db; i++) {
      const d = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (d && d.objectStoreNames.contains('changes') && d.objectStoreNames.contains('meta')) db = d;
      else { d?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!db) throw new Error("the collection's stores were never made");
    const tx = db.transaction(['changes', 'meta'], 'readwrite');
    rows.forEach(([kind, id, field, value], i) => tx.objectStore('changes').put({ t: `${wall + i}-0000-${writer}`, kind, id, field, value }));
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    db.close();
  }, { rows, wall, writer });
}
const plant = (id: string, no: string, name: string, more: Record<string, string> = {}): Array<[string, string, string, string]> => [['accession', id, 'acc', no], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing'], ...Object.entries(more).map(([k, v]) => ['accession', id, k, v] as [string, string, string, string])];

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-GB' });

  test("a species page's photograph shows its credit (author and licence) on a phone, not under the name card (visitor 2)", async ({ page }) => {
    await page.route(/inaturalist|wikimedia|api\.gbif\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: png(400, 300) }));
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    const cred = page.locator('.hero .cred');
    await expect(cred).toContainText('CC BY');
    // On the base: elementFromPoint at the credit's left, middle and right was the .idcard each time (margin -30px over the hero).
    const onTop = await cred.evaluate((c) => {
      const r = c.getBoundingClientRect();
      return [r.left + 4, r.left + r.width / 2, r.right - 4].map((x) => { const e = document.elementFromPoint(x, r.top + r.height / 2); return !!e && (e === c || c.contains(e)); });
    });
    expect(onTop).toEqual([true, true, true]);
  });

  test('the front page on a phone: the search with its rows on the first screen, the feature not drawn, and no chart shipped (decision 9, changed at the merge)', async ({ page }) => {
    const html = await (await page.request.get('/')).text();
    expect(html).not.toMatch(/class="climo[ "]/); // the chart is not in the HTML a phone is sent
    await page.goto('/');
    await ready(page);
    const top = async (sel: string) => (await page.locator(sel).first().boundingBox())!.y;
    // The four cards between the search and the rows put the first row two screens down and parted the search from what it
    // searches (round fifty, 1): on a phone the feature is the pitch's link, as in round sixty.
    await expect(page.locator('section.feature')).toBeHidden();
    await expect(page.locator('.featured .strip a').first()).toHaveAttribute('href', /\/species\//); // the strip's first photograph is the featured species
    expect(await top('.featured')).toBeLessThan(await top('.toolrow .searchbar'));
    expect(await top('.toolrow .searchbar')).toBeLessThan(844); // on the first screen
    expect(await top('.rows .grow')).toBeLessThan(844); // and the first row
    // the sample first in the welcome line
    const welcome = await page.locator('#welcome').innerText();
    expect(welcome.indexOf('Try a sample collection')).toBeGreaterThan(-1);
    expect(welcome.indexOf('Try a sample collection')).toBeLessThan(welcome.indexOf('add your first plant'));
    expect(welcome).toContain('kept on this device unless you sync');
  });

  test('Enter on a number two plants share opens the chooser at that number, not one of the two (records 4)', async ({ page }) => {
    await page.goto('/plants'); await ready(page);
    await inject(page, [...plant('r-two-a', '2026-0042', 'Copiapoa cinerea'), ...plant('r-two-b', '2026-0042', 'Copiapoa cinerea', { cultivar: 'B' })], Date.now() - 3_600_000);
    await page.goto('/'); await ready(page);
    const box = page.locator('input[type=search]').first();
    await box.fill('2026-0042');
    await expect(page.locator('.plantsfound a')).toHaveCount(2);
    await box.press('Enter');
    await expect(page).toHaveURL(/\/plants\/2026-0042$/);
    // and the species page's "your plants" chips go by id while the number is shared
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    const hrefs = await page.locator('.idcard .mine a.accno').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.sort()).toEqual(['/plants/r-two-a', '/plants/r-two-b']);
  });
});

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' });

  test('the front page\'s "This is what every species page shows" chart names CHELSA where a reader can see it (visitor 3)', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const fig = page.locator('section.feature figure.climo');
    await expect(fig).toBeVisible();
    // On the base the chart's visible text named only NASA POWER; "CHELSA" was in the SVG <desc> alone.
    expect(await fig.evaluate((f) => (f as HTMLElement).innerText)).toMatch(/CHELSA/);
    expect(await fig.evaluate((f) => (f as HTMLElement).innerText)).not.toMatch(/undated/);
  });

  test('the front page: the search and the photographs come first, the feature under them within a screen, and drawing the chart moves nothing (decision 9)', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
    const feature = page.locator('section.feature');
    await expect(feature.locator('figure.climo')).toBeVisible();
    const search = await box('.toolrow .searchbar'), strip = await box('.featured'), f = await box('section.feature');
    expect(search.y + search.height).toBeLessThan(900); // the search on the first screen
    expect(strip.y).toBeLessThan(900);
    expect(strip.y).toBeLessThan(f.y);
    expect(search.y).toBeLessThan(f.y);
    expect(f.y).toBeLessThan(900); // the feature starts on the first screen
    expect(f.height).toBeLessThanOrEqual(900); // and is no taller than one
    // the four cards two by two beside the chart
    const cards = await feature.locator('.gcards > .card').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().x)));
    expect(cards).toHaveLength(4);
    expect(new Set(cards).size).toBe(2);
    expect((await box('section.feature figure.climo')).x).toBeGreaterThan(Math.max(...cards));
    // the chart is drawn after hydration into a column that held its height from the first paint: the column is the
    // height it was given, not the chart's, so the rows below did not move
    const col = await page.locator('.fchart').evaluate((e) => ({ h: e.getBoundingClientRect().height, min: parseFloat(getComputedStyle(e).minHeight), chart: e.querySelector('figure.climo')!.getBoundingClientRect().height }));
    expect(col.chart).toBeLessThanOrEqual(col.min);
    expect(Math.abs(col.h - col.min)).toBeLessThan(1);
    const html = await (await page.request.get('/')).text();
    expect(html).not.toMatch(/class="climo[ "]/);
    expect(html).toMatch(/class="fchart[^"]*" style="--fh: calc\(\d+px \+ 14rem\);?"/);
  });

  test('labels are the figures\' own names on the species page, with every tied month named (visitor 1, 5)', async ({ page }) => {
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    const g = page.locator('.glance');
    await expect(g.locator('.card.cold')).toContainText('Cold floor (1 night in 100)');
    await expect(g.locator('.card.cold')).toContainText('Record low 4.0 °C in 40 years');
    await expect(g.locator('.card', { hasText: 'Warmest month, mean day' })).toContainText('Jan and Feb at the habitat');
    await expect(g.locator('.card .lab', { hasText: /^Rain a year$/ })).toHaveCount(1);
    await expect(g.locator('.card .lab', { hasText: /^Open-sky light$/ })).toHaveCount(1);
    await expect(g).not.toContainText('in the wild');
    await page.goto('/compare?s=copiapoa-cinerea,copiapoa-humilis');
    await ready(page);
    await expect(page.locator('.rowlab', { hasText: 'Cold floor (1 night in 100)' })).toHaveCount(1);
    await expect(page.locator('.rowlab', { hasText: 'Warmest month, mean day' })).toHaveCount(1);
    await expect(page.locator('.cmp')).not.toContainText('in the wild');
    await expect(page.locator('.row', { hasText: 'Warmest month, mean day' }).locator('.cell').first()).toContainText('Jan and Feb');
  });

  test('a plain 404 says which address, then offers the search (visitor 18)', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.locator('.err')).toContainText('No page at /no-such-page.');
    await expect(page.locator('.err input[type=search]')).toBeVisible();
  });
});

test('at 320 px with 200% text, the refusal pills wrap rather than being cut (a11y 7)', async ({ baseURL }) => {
  const { chromium } = await import('@playwright/test');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-r61w-'));
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: 32, default_fixed_font_size: 26 } } }));
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, locale: 'en-GB', viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('/species/refusia-testii'); await ready(page);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    const [s, c] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    expect(s).toBeLessThanOrEqual(c);
    // each pill's text is whole inside the pill: nothing clipped
    const cut = await page.locator('.idcard .nc .tok').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1 || e.getBoundingClientRect().right > document.documentElement.clientWidth).map((e) => e.textContent));
    expect(cut).toEqual([]);
    await expect(page.locator('.idcard .nc .tok', { hasText: 'Climate not checked' })).toBeVisible();
  } finally {
    await ctx.close();
  }
});

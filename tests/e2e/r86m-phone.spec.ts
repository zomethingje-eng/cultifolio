/**
 * Round eighty-six, the maps agent: review P's phone polish.
 *
 * - P3 (and P2's first cause): at 320 px the habitat line's head ("Habitat in short", the few-records mark, "Figures ›")
 *   wrapped, "Figures ›" under the mark, and their finger margins overlapped: a tap on the lower half of "from 3 records"
 *   opened "Figures". Now the head keeps one line there ("in short" said to a screen reader only, with the mark), and
 *   where it still wraps the lines are set apart by the margins.
 * - P4: a long author ran out of the name card at 320 px ("(Welw. ex Hiern) M.M.Hanes & R.L.Barrett" to x 304, the card
 *   at 289): the author was one unbreakable line. Now it wraps within itself.
 * - P7: at 200 % text the record of sources' rows ran out of the page (the page 495 px wide at 360).
 *
 * On r86base (1b663ea): 1 FAILED (the head on two lines, "Figures ›" 21 px under the mark); 2 FAILED (the author's line
 * ended at x 304, the card's content at 274); 3 FAILED (the page 495 px wide at 360); 4 FAILED, but as a guard only: in a
 * column that narrow the base wrapped otherwise ("Habitat in short" alone, the mark and "Figures ›" side by side under
 * it), so the case it guards, the mark and "Figures ›" on two lines, did not arise there.
 */
import { test, expect, type Page, type Route } from '@playwright/test';
import * as devalue from 'devalue';
import { ready } from './helpers/smoke';

test.use({ serviceWorkers: 'block' });
test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });
const noThirdParty = async (page: Page) => { await page.route(/^https:\/\/(?!127\.0\.0\.1)/, (r: Route) => r.abort()); await photosLoad(page); };

/** A page's data changed on its way in, for a client-side visit (r82u's helper). */
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
type Dossier = { name: Record<string, unknown>; climate: Record<string, unknown>; upstream: Record<string, Record<string, unknown>> };
/** A 4 × 3 PNG for every photograph (r82u's), so a page with photographs is laid out as one, its lead beside nothing. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAEElEQVR4nGNoWJAARww4OQBgthIBDttNdgAAAABJRU5ErkJggg==', 'base64');
const photosLoad = (page: Page) => page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org)\//, (r: Route) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
/**
 * A species page by a client-side visit from another's related tile, its dossier changed by `change`: Copiapoa cinerea
 * (twenty photographs, so the name card is the page's width under its lead, as on a rich page) from Copiapoa humilis.
 */
async function cinerea(page: Page, change: (d: Dossier) => void) {
  await rewrite(page, /\/species\/copiapoa-cinerea\/__data\.json/, (x) => { if (x.d) change(x.d as Dossier); });
  await page.goto('/species/copiapoa-humilis'); await ready(page);
  await page.locator('a.reltile[href="/species/copiapoa-cinerea"]').first().click();
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
}

/** Where a finger on the few-records mark lands: P3's sampling, every 3 by 6 px of the mark's box and the 12 px under it. */
const underFinger = (page: Page, f: { x: number; y: number; width: number; height: number }) => page.evaluate(({ x, y, w, h }) => {
  const out = { few: 0, figs: 0 };
  for (let px = x + 1; px < x + w; px += 3) for (let py = y + 1; py < y + h + 12; py += 6) {
    const a = document.elementFromPoint(px, py)?.closest('a');
    if (a?.id === 'few-records-line') out.few++;
    else if (a?.classList.contains('figs')) out.figs++;
  }
  return out;
}, { x: f.x, y: f.y, w: f.width, h: f.height });

test.describe('at 320 px', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("r86m phone 1: the habitat line's head is one line with the few-records mark, and a finger on the mark reaches the mark @phone-only", async ({ page }) => {
    await noThirdParty(page);
    await cinerea(page, (d) => { d.climate.records = 3; d.climate.cells = 3; });
    const head = page.locator('.hline .hhead');
    const few = page.locator('#few-records-line'), figs = page.locator('.hline .hhead a.figs');
    await expect(few).toBeVisible();
    // One line: the mark and "Figures ›" side by side.
    const [f, g] = [(await few.boundingBox())!, (await figs.boundingBox())!];
    expect(Math.abs(f.y + f.height / 2 - (g.y + g.height / 2))).toBeLessThan(4);
    expect(g.x).toBeGreaterThan(f.x + f.width);
    expect((await head.boundingBox())!.height).toBeLessThan(f.height * 1.6);
    // Its name whole to a screen reader.
    await expect(page.locator('#hline-t')).toHaveText('Habitat in short');
    // Every point of the mark and the 12 px under it reaches the mark, none "Figures" (P3's own sampling).
    const hits = await underFinger(page, f);
    expect(hits.figs).toBe(0);
    expect(hits.few).toBeGreaterThan(20);
  });

  test('r86m phone 2: a long author wraps within the name card @phone-only', async ({ page }) => {
    await noThirdParty(page);
    await cinerea(page, (d) => { d.name.authorship = '(Welw. ex Hiern) M.M.Hanes & R.L.Barrett'; });
    await expect(page.locator('h1.sci .auth')).toHaveText('(Welw. ex Hiern) M.M.Hanes & R.L.Barrett');
    const { lines, right } = await page.locator('h1.sci').evaluate((h) => {
      const card = h.parentElement!;
      const cs = getComputedStyle(card);
      return { lines: [...h.querySelector('.auth')!.getClientRects()].map((r) => Math.round(r.right)), right: Math.round(card.getBoundingClientRect().right - parseFloat(cs.paddingRight)) };
    });
    for (const r of lines) expect(r).toBeLessThanOrEqual(right + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

test.describe('where the head still wraps', () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test('r86m phone 4: a page without a photograph, its name card beside its initial: the lines apart, a finger on the mark reaches the mark @phone-only', async ({ page }) => {
    await noThirdParty(page);
    await rewrite(page, /\/species\/copiapoa-humilis\/__data\.json/, (x) => { const d = x.d as Dossier | undefined; if (d) { d.climate.records = 3; d.climate.cells = 3; } });
    await page.goto('/species/copiapoa-cinerea'); await ready(page);
    await page.locator('a.reltile[href="/species/copiapoa-humilis"]').first().click();
    await expect(page.locator('h1.sci')).toContainText('Copiapoa humilis');
    const few = page.locator('#few-records-line'), figs = page.locator('.hline .hhead a.figs');
    await expect(few).toBeVisible();
    const [f, g] = [(await few.boundingBox())!, (await figs.boundingBox())!];
    expect(g.y).toBeGreaterThan(f.y + f.height); // wrapped: "Figures ›" under the mark, in a column 164 px wide
    expect(g.y + g.height / 2 - (f.y + f.height / 2)).toBeGreaterThanOrEqual(43.5); // the two finger margins, 44 px each, do not meet
    const hits = await underFinger(page, f);
    expect(hits.figs).toBe(0);
    expect(hits.few).toBeGreaterThan(20);
  });
});

test.describe('at 200 % text', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test("r86m phone 3: the record of sources' rows wrap within the page @phone-only", async ({ page }) => {
    await noThirdParty(page);
    await page.addInitScript(() => { const s = document.createElement('style'); s.textContent = 'html{font-size:200% !important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
    // A download's address in a row's words, as the live pages' GBIF occurrence row carries one.
    await cinerea(page, (d) => { const o = d.upstream['gbif.occurrences']; if (o) o.detail = 'GBIF occurrence download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21'; });
    await page.locator('details.prov > summary').click();
    await expect(page.locator('details.prov .row').first()).toBeVisible();
    const out = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, rows: [...document.querySelectorAll('details.prov .row')].map((r) => Math.round(r.getBoundingClientRect().right)) }));
    expect(out.sw).toBeLessThanOrEqual(360);
    for (const r of out.rows) expect(r).toBeLessThanOrEqual(360);
  });
});

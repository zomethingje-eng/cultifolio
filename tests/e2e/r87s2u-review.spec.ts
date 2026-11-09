/**
 * Round eighty-seven, the fixes after the review of stage 2's pages (its probes: review87s2-ui), in the browser:
 *
 * 2. The stage-2 sections and the browse pages grow with the reader's text: at 200% each section's text stands to the
 *    body's as it does at 100% (on 9311e8b they were set in px and stayed 12 to 14 px while the body went to 30).
 * 1. A merge's preview says a file's pinned views as pinned views, never "the numbering scheme".
 * 6. A pinned view's region the reference no longer holds: the pin says so by its code, and its page shows the rest of
 *    the view and says why.
 * 8. The older look's chips and tags are gone outside the tracker: register links, sources, the year's months, a plant's
 *    number, You grow on a tile, the browse tips and the map picker's opener; the footer's links evenly spaced; and each
 *    new control is still a finger's 44 px on a phone.
 *
 * Each failed on 9311e8b, as its comment says.
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { ready } from './helpers/smoke';
import { inject, type Row } from './helpers/inject';
import { rootText } from './helpers/text-size';
import { writeWait, allowWrites } from './helpers/pace';
import { encodeKeys, pinIdOf } from '../../src/lib/browse/pins';

test.use({ serviceWorkers: 'block' });
const DAY = 86_400_000;
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function noThirdParty(page: Page) { await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.abort())); }

/** A pin's record, as PinButton writes it. */
const pinRows = (view: string, label: string, keys: string[]): Row[] => {
  const id = pinIdOf(view);
  return [['setting', id, 'href', `/browse${view}`], ['setting', id, 'view', view], ['setting', id, 'label', label], ['setting', id, 'made', '2026-10-01'], ['setting', id, 'seen', '2026-10-12'], ['setting', id, 'n', keys.length], ['setting', id, 'keys', encodeKeys(keys)]];
};
const GROWER: Row[] = [['accession', 'q1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'q1', 'status', 'growing'], ['accession', 'q1', 'acc', '2026-0001'], ['accession', 'q1', 'nameKind', 'species'], ...pinRows('?r=CLN', 'Species native to Chile North', ['k2735933'])];
async function grower(page: Page, extra: Row[] = []) {
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: writeWait(15_000, 50) });
  await inject(page, [...GROWER, ...extra], Date.now() - DAY);
}

/** Each selector's font size over the body's, on the page as it stands. */
const ratios = (page: Page, sels: string[]) => page.evaluate((sels) => {
  const body = parseFloat(getComputedStyle(document.body).fontSize);
  return Object.fromEntries(sels.map((s) => { const e = document.querySelector(s); return [s, e ? parseFloat(getComputedStyle(e).fontSize) / body : null]; }));
}, sels);

const PAGES: Array<{ path: string; sels: string[]; open?: (p: Page) => Promise<void> }> = [
  { path: '/species/copiapoa-cinerea', sels: ['section#climate-class h2', 'section#climate-class td', 'section#climate-class .note', 'section#at-home h2', 'section#at-home td.how', 'section#at-home .hours', 'section#at-home .hours button', 'section#at-home .note', 'section#hardiness td.how', 'section#hardiness h2'] },
  { path: '/browse?view=list', sels: ['.bv .rail', '.bv .rail .sec', '.bv .rail .note', '.bv .opener', '.bv .tip button', 'table.list td', 'table.list thead th', '.bv .tools', '.bv .foot'] },
  { path: '/browse?view=map', sels: ['.bv .legend', '.bv .foot'] },
  { path: '/region/chile-north', sels: ['section.lens', 'section.lens .sec', '.bv .count'] },
  { path: '/', sels: ['section.pins .sec', 'section.pins li', 'section.pins .foot'] },
  { path: '/browse', sels: ['dialog .listcol', 'dialog .src'], open: async (p) => { await p.getByRole('button', { name: 'Pick regions on a map' }).click(); await expect(p.locator('dialog .listcol')).toContainText('Southern Africa', { timeout: 20_000 }); } }
];

async function measured(context: BrowserContext, percent: number): Promise<Record<string, Record<string, number | null>>> {
  if (percent !== 100) await rootText(context, percent);
  const page = await context.newPage();
  await noThirdParty(page);
  await grower(page);
  const out: Record<string, Record<string, number | null>> = {};
  for (const p of PAGES) {
    await page.goto(p.path); await ready(page);
    if (p.path === '/') await expect(page.locator('section.pins li').first()).toBeVisible({ timeout: 15_000 });
    if (p.path.startsWith('/region')) await expect(page.locator('section.lens')).toBeVisible({ timeout: 15_000 });
    if (p.path.includes('view=list')) await expect(page.locator('.bv .opener')).toBeVisible();
    await p.open?.(page);
    out[p.path] = await ratios(page, p.sels);
  }
  await page.close();
  return out;
}

test('r87s2u 2: at 200% text every new section and the browse pages stand to the body as at 100%', async ({ browser }) => {
  test.skip(test.info().project.name !== 'chromium', 'one engine measures the sizes');
  allowWrites(90_000);
  const a = await browser.newContext({ locale: 'en-GB', serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const b = await browser.newContext({ locale: 'en-GB', serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const at100 = await measured(a, 100), at200 = await measured(b, 200);
  const page = await b.newPage();
  await page.goto('/about'); await ready(page);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px'); // the setting took
  for (const p of PAGES) for (const s of p.sels) {
    const x = at100[p.path][s], y = at200[p.path][s];
    expect(x, `${p.path} ${s} at 100%`).not.toBeNull();
    // 9311e8b: "section#climate-class td" 14/15 at 100%, 14/30 at 200%.
    expect(Math.abs(y! - x!), `${p.path} ${s}: ${x!.toFixed(3)} of the body at 100%, ${y!.toFixed(3)} at 200%`).toBeLessThan(0.02);
  }
  await a.close(); await b.close();
});

test('r87s2u 1: a merge\'s preview says a file\'s pins as pinned views, not the numbering scheme', async ({ page: first, browser, baseURL }) => {
  test.skip(test.info().project.name !== 'chromium', 'the backup is the same file in every project');
  allowWrites(60_000);
  await grower(first, pinRows('?f=cactaceae', 'Species of Cactaceae', ['k2735933', 'k2735990']));
  await first.goto('/backup'); await ready(first);
  await expect(first.locator('#bk-export')).toBeEnabled({ timeout: writeWait(10_000, 50) });
  const dl = first.waitForEvent('download');
  await first.click('#bk-export');
  const file = await (await dl).path();
  // Another device with a plant of its own, so the file is merged, not taken whole.
  const other = await browser.newContext({ baseURL, locale: 'en-GB', serviceWorkers: 'block' });
  const page = await other.newPage();
  await page.goto('/plants'); await ready(page);
  await page.locator('html[data-collection=open]').waitFor({ state: 'attached', timeout: writeWait(15_000, 50) });
  await inject(page, [['accession', 'z1', 'taxonName', 'Echeveria elegans'], ['accession', 'z1', 'status', 'growing'], ['accession', 'z1', 'acc', '2026-0901'], ['accession', 'z1', 'nameKind', 'species']], Date.now() - DAY, 'r87s2uuuuuuuuuu1');
  await page.goto('/backup'); await ready(page);
  await page.locator('#bk-file').setInputFiles(file!);
  const preview = page.locator('#bk-preview');
  await expect(preview).toContainText('2 pinned views', { timeout: writeWait(15_000, 50) }); // 9311e8b: not said; the disclosure said "the numbering scheme"
  await expect(page.locator('.cult', { has: preview })).not.toContainText('numbering scheme');
  await other.close();
});

test('r87s2u 6: a pin of a region the reference no longer holds says so, and its page shows the rest of the view @phone', async ({ page }) => {
  allowWrites(60_000);
  await grower(page, pinRows('?r=XYZ&f=cactaceae', 'Cactaceae native to a region gone', ['k2735933', 'k2735990']));
  await page.goto('/'); await ready(page);
  const row = page.locator('section.pins li', { hasText: 'Cactaceae native to a region gone' });
  // 9311e8b: "2 species · …" of the family alone, and no word of the region.
  await expect(row).toContainText('its region XYZ is no longer in the reference', { timeout: 15_000 });
  await expect(row).toContainText('2 species');
  await row.getByRole('link').click();
  await expect(page).toHaveURL(/\/browse\?f=cactaceae&gone=XYZ$/);
  await expect(page.locator('#bv-gone')).toHaveText('The region XYZ this address names is not in the reference, so the view is shown without it.');
  await expect(page.locator('.bv .head')).toContainText('2 species');
  // A link from the page leaves the code behind.
  expect(await page.locator('.bv a[href*="gone="]').count()).toBe(0);
});

test('r87s2u 8: no chips, tags or filled cells outside the tracker; even footer links; 44 px under a finger @phone', async ({ page }) => {
  await noThirdParty(page);
  await grower(page);
  const phone = test.info().project.name === 'phone';
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const css = (sel: string, props: string[]) => page.locator(sel).first().evaluate((e, props) => { const c = getComputedStyle(e); return Object.fromEntries(props.map((p) => [p, c.getPropertyValue(p)])); }, props);
  // The register links: plain links in a row (9311e8b: a 1 px edge, rounded, padded).
  expect(await css('.links a', ['border-top-width', 'padding-left', 'background-color'])).toEqual({ 'border-top-width': '0px', 'padding-left': '0px', 'background-color': 'rgba(0, 0, 0, 0)' });
  // A figure's source in plain words (9311e8b: a bordered tag).
  const src = phone ? '#s-glance dd i' : '#s-glance .src';
  if (await page.locator(src).count()) expect(await css(src, ['border-top-width', 'display'])).toMatchObject({ 'border-top-width': '0px' });
  // The year's months: no filled grey cell (9311e8b: --sunk under every month).
  const off = page.locator('.strip li:not(.on)').first();
  if (await off.count()) expect(await off.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // A plant's number as text (9311e8b: a filled chip).
  expect(await css('a.accno', ['background-color', 'padding-left'])).toEqual({ 'background-color': 'rgba(0, 0, 0, 0)', 'padding-left': '0px' });
  // The footer's links: the gaps between their words differ by a pixel at most (9311e8b: 2 to 16 px).
  const gaps = await page.locator('footer.credits .links1').evaluate((p) => {
    const words = [...p.querySelectorAll('a')].map((a) => { const r = document.createRange(); r.selectNodeContents(a); return r.getBoundingClientRect(); });
    return words.slice(1).map((w, i) => (Math.abs(w.top - words[i].top) < 4 ? Math.round(w.left - words[i].right) : null)).filter((x): x is number => x !== null);
  });
  expect(gaps.length).toBeGreaterThan(1);
  expect(Math.max(...gaps) - Math.min(...gaps), JSON.stringify(gaps)).toBeLessThanOrEqual(1);
  if (phone) {
    // Each footer link still a finger's 44 px high and its word and 10 px either side wide.
    const box = await page.locator('footer.credits a[href="/about"]').boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }
  // You grow on a tile: a line under the name, not a chip over the photograph (9311e8b: absolute, green).
  await page.goto('/'); await ready(page);
  const chip = page.locator('a.tile .ownchip').first();
  await expect(chip).toHaveText('2026-0001', { timeout: 15_000 });
  expect(await chip.evaluate((e) => [getComputedStyle(e).position, getComputedStyle(e).backgroundColor, !!e.closest('.tx')])).toEqual(['static', 'rgba(0, 0, 0, 0)', true]);
  // The browse tips and the opener: no ring, no edge, a space from the words before (9311e8b: a ringed circle flush
  // against "not counted", a bordered button); under a finger each takes 44 px.
  await page.goto('/browse?view=list'); await ready(page);
  if (phone) await page.getByRole('button', { name: /^Filters/ }).click();
  const tip = page.locator('.bv .rail .tip button').first();
  await expect(tip).toBeVisible();
  expect(await tip.evaluate((b) => [getComputedStyle(b).borderTopWidth, getComputedStyle(b).borderTopLeftRadius])).toEqual(['0px', '0px']);
  const before = await tip.evaluate((b) => { const prev = b.closest('li')!.querySelector('.n')!; const r = document.createRange(); r.selectNodeContents(prev); return Math.round(b.getBoundingClientRect().left - r.getBoundingClientRect().right); });
  expect(before, 'the space between "not counted" and its "?"').toBeGreaterThanOrEqual(4);
  const opener = page.locator('.bv .opener');
  expect(await opener.evaluate((b) => getComputedStyle(b).borderTopWidth)).toBe('0px');
  if (phone) {
    for (const el of [tip, opener]) {
      await el.evaluate((e) => e.scrollIntoView({ block: 'center' })); // a point outside the window finds nothing
      const b = (await el.boundingBox())!;
      const hits = await page.evaluate(({ x, y, w, h }) => [[x + w / 2, y + h / 2 - 20], [x + w / 2, y + h / 2 + 20]].map(([px, py]) => document.elementFromPoint(px, py)?.closest('button')?.className ?? ''), { x: b.x, y: b.y, w: b.width, h: b.height });
      expect(hits.every((c) => c !== ''), `${await el.evaluate((e) => e.className)}: ${JSON.stringify(hits)}`).toBe(true);
    }
  }
});

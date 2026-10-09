/**
 * Round sixty-two, second pass, agent W: the front page's first screen on a desktop (the outside triage's 2), the
 * grower's phone placeholder (the grower review's 7), a refusal said as a refusal on the species page (the grower
 * review's 2), the front page's search sentences (the search review's 3 and 18) and the glance row's heading and scales
 * (the words review's 1, the self-review's N10). Each failed on the base of the second pass.
 *
 * Run against a server already up: PW_REUSE=1 PW_PORT=4193 npx playwright test tests/e2e/r62bw-pages.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { servePhotos, liveShapedHome } from './r62w-shapes';
import { inject } from './helpers/inject';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

/** The front page drawn from live-shaped data (twelve photographs that load, 25 letters, long names), by a client-side visit. */
async function liveHome(page: Page) {
  await servePhotos(page);
  await liveShapedHome(page);
  await page.goto('/about/how');
  await ready(page);
  await page.locator('a[href="/"]').first().click();
  await page.waitForURL(/\/$/);
  await expect(page.locator('.strip .ftile').first()).toBeVisible();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.strip img')].slice(0, 6).every((i) => i.complete && i.naturalWidth > 0));
}

for (const [width, height] of [[1280, 800], [1440, 900], [1024, 768]] as const) {
  test.describe(`desktop, ${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, locale: 'en-GB' });

    test('the search and a whole catalogue row are on the first screen, the chips with the rows, the feature after them', async ({ page }) => {
      await liveHome(page);
      await expect(page.locator('section.feature')).toBeVisible();
      const m = await page.evaluate(() => {
        const b = (s: string) => document.querySelector(s)!.getBoundingClientRect();
        return { scrollY, h: innerHeight, search: b('.toolrow .searchbar').bottom, chips: b('.tools .chiprow').bottom, toolEnd: b('.toolrow').bottom, rowTop: b('.rows .grow').top, row: b('.rows .grow').bottom, feature: b('section.feature').top };
      });
      expect(m.scrollY).toBe(0);
      // On the base the search stood at y 1262 and the first row at 1478 at every one of these sizes.
      expect(m.search, `search bottom ${m.search} of ${m.h}`).toBeLessThanOrEqual(m.h);
      expect(m.chips).toBeLessThanOrEqual(m.h);
      expect(m.row, `first row bottom ${m.row} of ${m.h}`).toBeLessThanOrEqual(m.h);
      expect(m.rowTop - m.toolEnd).toBeLessThan(110); // nothing but the letters between the chips and the rows
      expect(m.feature).toBeGreaterThan(m.row);
    });
  });
}

test.describe('desktop, 1280 × 800, the fixture', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });

  test('opening a row keeps the feature, so no row moves under the pointer', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await expect(page.locator('section.feature')).toBeVisible();
    const top = (s: string) => page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top + scrollY, s);
    const before = await top('#g-copiapoa');
    await page.locator('#g-copiapoa').click();
    await page.waitForURL(/open=copiapoa/);
    await expect(page.locator('#g-copiapoa')).toHaveAttribute('aria-expanded', 'true');
    // The server sends no feature for `?open=`; the page keeps the one it drew.
    await expect(page.locator('section.feature')).toBeVisible();
    expect(Math.abs((await top('#g-copiapoa')) - before)).toBeLessThan(2);
  });

  test('a name pasted with its author is not said to have matched nothing (the search review\'s 3)', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const box = page.getByLabel('Search the whole species catalogue');
    await box.fill('Copiapoa cinerea Phil.');
    await expect(page.locator('.hitrow').first()).toContainText('Copiapoa cinerea');
    const line = page.locator('.seccount.relaxed');
    await expect(line).toHaveText('Searched for “Copiapoa cinerea”, leaving out “Phil.”.');
    await expect(line).not.toContainText('Nothing matched');
  });

  test('a variety the reference files under its species: nothing matched as written, and the retry says so', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.getByLabel('Search the whole species catalogue').fill('Copiapoa cinerea var. nonexista');
    await expect(page.locator('.seccount.relaxed')).toHaveText('Nothing matched “Copiapoa cinerea var. nonexista” as written. Showing results for “Copiapoa cinerea”.');
  });

  test('a similar spelling is said as one (the search review\'s 18)', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    await page.getByLabel('Search the whole species catalogue').fill('Copiapoa cinereaa');
    await expect(page.locator('.hitrow').first()).toContainText('Copiapoa cinerea');
    await expect(page.locator('.seccount.relaxed')).toHaveText('No name in the reference is spelt “Copiapoa cinereaa”; these are similar spellings.');
  });

  test('the glance row is headed "Habitat figures", and each bar states its scale (the words review\'s 1, N10)', async ({ page }) => {
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    const head = page.locator('.ghead .gt').first();
    await expect(head).toHaveText('Habitat figures');
    await expect(page.getByText('In the wild', { exact: true })).toHaveCount(0);
    const gauges = page.locator('.gcards .gauge[role="img"]');
    await expect(gauges).toHaveCount(2);
    await expect(gauges.nth(0)).toHaveAttribute('aria-label', /on a bar from 0 to 1,200 mm$/);
    await expect(gauges.nth(1)).toHaveAttribute('aria-label', /on a bar from 0 to 70 DLI$/);
    await expect(page.locator('.gcards .gscale').first()).toHaveText('bar 0 to 1,200 mm');
  });
});

test.describe('the species page says a refusal as one (the grower review\'s 2)', () => {
  test('a refused occurrence source is "refused the request", never "did not answer"', async ({ request }) => {
    const html = await (await request.get('/species/refusia-testii')).text();
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    expect(text).toContain('GBIF media refused');
    expect(text).not.toContain('occurrence source did not answer');
    expect(text).toContain('The occurrence source refused the request when this species page was built.');
    expect(text).toContain('Records not checked: the occurrence source refused the request when this page was built.');
    expect(text).toContain('GBIF occurrence records'); // Provenance names the source in plain words
    expect(text).not.toMatch(/did not answer\s+asked/); // its pill says "refused"
  });
});

test.describe('phone, 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'en-GB' });

  test("the grower's front-page placeholder fits its box (the grower review's 7)", async ({ page }) => {
    await page.goto('/plants');
    await ready(page);
    await inject(page, [['accession', 'a1', 'acc', '2026-0001'], ['accession', 'a1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'a1', 'status', 'growing']], Date.now() - 86_400_000, 'r62bwplaceh0lder');
    await page.goto('/');
    await ready(page);
    const fit = await page.locator('.searchbar').first().evaluate((el: HTMLInputElement) => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return { label: el.getAttribute('aria-label'), text: Math.round(ctx.measureText(el.placeholder).width), box: Math.round(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
    });
    expect(fit.label).toContain('field number'); // the long form kept where a screen reader reads it
    expect(fit.text).toBeLessThanOrEqual(fit.box); // the base: 399 > 330
  });
});

test.describe('phone, 320 × 640, text at 200%', () => {
  test.use({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, locale: 'en-GB' });

  test('the catalogue grouped by family does not scroll sideways (the self-review\'s N10, a11y 9)', async ({ page }) => {
    await page.goto('/?by=family');
    await ready(page);
    await page.addStyleTag({ content: 'html { font-size: 32px !important; }' });
    await expect(page.locator('.rows .grow').first()).toBeVisible();
    const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: document.documentElement.clientWidth, fs: getComputedStyle(document.documentElement).fontSize }));
    expect(m.fs).toBe('32px');
    expect(m.sw, `page ${m.sw} px wide in ${m.w}`).toBeLessThanOrEqual(m.w); // the base: 323 in 320
  });
});

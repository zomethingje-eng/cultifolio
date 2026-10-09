/**
 * Round sixty-two, agent W: the species page keeps what the grower typed (decision 1, outside review A13), the front
 * page's first screen with a live-shaped corpus (decision 8, A10, B1), the phone's hero credit (A12) and compare's
 * fourth species (visitor-words 13). Each failed on the base of round sixty-two.
 *
 * Run against a server already up: PW_REUSE=1 npx playwright test tests/e2e/r62w-pages.spec.ts
 */
import { test, expect, type Page } from '@playwright/test';
import { servePhotos, liveShapedHome } from './r62w-shapes';

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}

test.describe('the species notes draft (A13)', () => {
  /** Write notes on humilis, then open cinerea's editor and type a draft there. */
  async function draftOnCinerea(page: Page) {
    await page.goto('/species/copiapoa-humilis');
    await ready(page);
    await page.getByRole('button', { name: 'Write what you know' }).click();
    await page.locator('#my-notes').fill('HUMILIS own notes');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.note-slot .cult .body:not(.sheet)')).toHaveText('HUMILIS own notes');
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    await page.getByRole('button', { name: 'Write what you know' }).click();
    await page.locator('#my-notes').fill('CINEREA draft');
  }
  const humilisTile = (page: Page) => page.locator('#s-related ~ .relstrip a.reltile[href="/species/copiapoa-humilis"]').first();

  test('a related tile asks first; leaving drops the draft, and the other species keeps its own notes', async ({ page }) => {
    await draftOnCinerea(page);
    let asked = '';
    page.once('dialog', (d) => { asked = d.message(); void d.accept(); });
    await humilisTile(page).click();
    await page.waitForURL(/copiapoa-humilis$/);
    await ready(page);
    expect(asked).toContain('What you typed here will be lost');
    // The page was made afresh: no editor open, no draft carried, humilis's own notes as they were.
    await expect(page.locator('#my-notes')).toHaveCount(0);
    await expect(page.locator('.note-slot .cult .body:not(.sheet)')).toHaveText('HUMILIS own notes');
    await expect(page.locator('body')).not.toContainText('CINEREA draft');
  });

  test('Cancel on the question keeps the draft on its own page', async ({ page }) => {
    await draftOnCinerea(page);
    page.once('dialog', (d) => void d.dismiss());
    await humilisTile(page).click();
    await page.waitForTimeout(500);
    expect(page.url()).toMatch(/copiapoa-cinerea$/);
    await expect(page.locator('#my-notes')).toHaveValue('CINEREA draft');
  });

  test('an unchanged editor leaves without asking', async ({ page }) => {
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    await page.getByRole('button', { name: 'Write what you know' }).click();
    let asked = false;
    page.once('dialog', (d) => { asked = true; void d.dismiss(); });
    await page.locator('a.reltile[href="/species/copiapoa-humilis"]').first().click();
    await page.waitForURL(/copiapoa-humilis$/);
    expect(asked).toBe(false);
  });
});

test.describe('phone, 390 × 844', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-GB' });

  test('the first screen holds the search, every grouping control and one whole catalogue row, with a live-shaped corpus (A10, B1)', async ({ page }) => {
    await servePhotos(page);
    await liveShapedHome(page);
    await page.goto('/about/how');
    await ready(page);
    // A client-side visit, so the page is drawn from the live-shaped data: twelve photographs that load, 25 letters, long names.
    await page.locator('#tabbar a[href="/"]').first().click();
    await page.waitForURL(/\/$/);
    await expect(page.locator('.strip .ftile')).toHaveCount(12);
    await expect(page.locator('.letters a')).toHaveCount(25);
    await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.strip img')].slice(0, 3).every((i) => i.complete && i.naturalWidth > 0));
    const m = await page.evaluate(() => {
      const b = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const tab = b('#tabbar').top;
      return { scrollY, tab, pitchLines: [...document.querySelectorAll('.pitch li')].filter((l) => (l as HTMLElement).offsetParent).length, strip: b('.featured').height, search: b('.toolrow .searchbar').bottom, group: b('.tools .seg').bottom, chips: b('.tools .chiprow').bottom, az: b('.tools .azbtn').bottom, letters: b('.letters').height, row: b('.rows .grow').bottom };
    });
    expect(m.scrollY).toBe(0);
    expect(m.pitchLines).toBe(1); // the introduction is one sentence
    expect(m.letters).toBeLessThanOrEqual(48); // one line of letters, not four
    expect(m.strip).toBeLessThanOrEqual(200); // the strip's height capped: a loaded photograph keeps its tile's shape
    for (const [k, y] of Object.entries({ search: m.search, group: m.group, chips: m.chips, az: m.az, row: m.row })) expect(y, `${k} bottom ${y} against the tab bar at ${m.tab}`).toBeLessThanOrEqual(m.tab);
    // The placeholder fits its box: measured in the box's own font.
    const fit = await page.locator('.toolrow .searchbar').evaluate((el: HTMLInputElement) => {
      const cs = getComputedStyle(el);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return { text: ctx.measureText(el.placeholder).width, room: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    });
    expect(fit.text).toBeLessThanOrEqual(fit.room);
  });

  test("the hero credit is two lines on a phone, the licence first and whole (A12)", async ({ page }) => {
    await servePhotos(page);
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    const lic = page.locator('.hero .cred .lic');
    await expect(lic).toHaveText('CC BY');
    const g = await page.evaluate(() => {
      const l = document.querySelector('.hero .cred .lic') as HTMLElement, by = document.querySelector('.hero .cred .by') as HTMLElement;
      return { licTop: l.getBoundingClientRect().top, byTop: by.getBoundingClientRect().top, licCut: l.scrollWidth > l.clientWidth };
    });
    expect(g.byTop).toBeGreaterThan(g.licTop); // two lines
    expect(g.licCut).toBe(false);
  });
});

test.describe('desktop, 1280 × 800', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'en-GB' });

  test('the feature follows the first rows, and a chip click moves no row (A10, B1; second pass, the outside triage\'s 2)', async ({ page }) => {
    await page.goto('/');
    await ready(page);
    const feature = page.locator('section.feature');
    await expect(feature).toBeVisible();
    await expect(feature.locator('#feature-h')).toContainText('This is what a species page with a habitat climate shows');
    const at = () => page.evaluate(() => {
      const top = (s: string) => document.querySelector(s)!.getBoundingClientRect().top + scrollY;
      return { feature: top('section.feature'), search: top('.toolrow .searchbar'), chips: top('.chiprow'), toolEnd: document.querySelector('.toolrow')!.getBoundingClientRect().bottom + scrollY, row: top('.rows .grow') };
    });
    const before = await at();
    expect(before.feature).toBeGreaterThan(before.row); // second pass: after the first rows, so the search is on the first screen
    // The rows follow the toolbar that governs them: nothing but the letter index between them, no 700 px feature.
    expect(before.row - before.toolEnd).toBeLessThan(110);
    await page.locator('.chiprow a', { hasText: 'Climate known' }).click();
    await page.waitForURL(/chip=climate/);
    await expect(page.locator('.chiprow a.on')).toContainText('Climate known');
    await expect(feature).toBeVisible(); // kept on a chip's page
    const after = await at();
    expect(Math.abs(after.chips - before.chips)).toBeLessThan(2); // the chip stays under the pointer
    // Second pass: the feature follows the rows, so it moves with what the chip leaves; the rows above it do not.
    // The fixture's chip leaves one letter, so the letter line goes: the rows move by that line at most, never by the feature.
    expect(after.row - after.toolEnd).toBeLessThan(110);
    expect(Math.abs(after.row - before.row)).toBeLessThan(50);
  });

  test('compare says when it left a species out of a shared link (visitor-words 13)', async ({ page }) => {
    await page.goto('/compare?s=copiapoa-cinerea,copiapoa-humilis,refusia-testii,welwitschia-mirabilis');
    await ready(page);
    await expect(page.locator('#left-out')).toContainText('Three at a time: Welwitschia mirabilis was left out.');
    await expect(page.locator('#left-out a')).toHaveAttribute('href', /s=copiapoa-humilis,refusia-testii,welwitschia-mirabilis/);
  });
});

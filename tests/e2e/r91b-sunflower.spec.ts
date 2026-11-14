/**
 * Round ninety-one (the owner's icon, 14 November 2026; docs/REVIEW-ROUND-91.md), in the browser:
 *
 * 1. The header's mark: beside the name, hidden from assistive technology (the link's name is "Cultifolio" alone), about
 *    22 px tall and 8 px before the name, in the name's own colour in both modes, on desktop and phone.
 * 2. Selected text: ink on the icon's sunflower, in both modes.
 * 3. The front page's lead figure: a sunflower stroke behind it on white, a sunflower line under it on the dark ground
 *    (the system's dark and the site's own switch alike), and on paper the stroke; no sunflower on a species page.
 * 4. The apple-touch icon linked and served.
 *
 * On 0812e7b: FAILED. The header held the name alone, selected text was the browser's blue, the lead figure had no mark,
 * and the apple-touch icon was the 192 px icon.
 */
import { test, expect, type Page } from '@playwright/test';
import { servePhotos } from './r62w-shapes';

test.use({ serviceWorkers: 'block' });
const SUN = 'rgb(255, 208, 46)';
const INK_LIGHT = 'rgb(27, 29, 28)';
const INK_DARK = 'rgb(232, 230, 225)';
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
async function home(page: Page, scheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: scheme });
  await servePhotos(page);
  await page.goto('/');
  await ready(page);
}

test('r91b 1: the header\'s mark beside the name, hidden from assistive technology, in the name\'s colour in both modes @phone', async ({ page }) => {
  for (const [scheme, ink] of [['light', INK_LIGHT], ['dark', INK_DARK]] as const) {
    await home(page, scheme);
    const link = page.locator('#topbar a.wordmark');
    const mark = link.locator('svg.mark');
    await expect(mark).toHaveCount(1);
    await expect(mark).toHaveAttribute('aria-hidden', 'true');
    // The link's name is the name alone: the mark adds nothing to it.
    await expect(page.getByRole('link', { name: 'Cultifolio', exact: true }).first()).toBeVisible();
    const m = await link.evaluate((a) => {
      const svg = a.querySelector('svg')!;
      const r = svg.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(a.lastChild!);
      const t = range.getBoundingClientRect();
      return { h: r.height, gap: t.left - r.right, fill: getComputedStyle(svg).fill, svgColor: getComputedStyle(svg).color, name: getComputedStyle(a).color };
    });
    expect(Math.abs(m.h - 22), JSON.stringify(m)).toBeLessThanOrEqual(1);
    expect(Math.abs(m.gap - 8), JSON.stringify(m)).toBeLessThanOrEqual(1.5);
    expect(m.name, scheme).toBe(ink);
    expect(m.svgColor, scheme).toBe(ink);
    expect(m.fill, scheme).toBe(ink);
  }
});

test('r91b 2: selected text is ink on the icon\'s sunflower, in both modes', async ({ page }) => {
  for (const scheme of ['light', 'dark'] as const) {
    await home(page, scheme);
    const sel = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('main p') ?? document.body, '::selection');
      // Where an engine gives no computed style for the pseudo-element, the rule the page holds.
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') return { bg: s.backgroundColor, ink: s.color };
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const r of [...rules]) if (r instanceof CSSStyleRule && r.selectorText === '::selection') return { bg: r.style.backgroundColor, ink: r.style.color };
      }
      return null;
    });
    expect(sel, scheme).toEqual({ bg: 'rgb(255, 208, 46)', ink: INK_LIGHT });
  }
});

test('r91b 3: the lead figure marked in sunflower, a stroke on white and a line on the dark ground; nowhere else', async ({ page }) => {
  const mark = () => page.locator('.leadfig').evaluate((e) => { const s = getComputedStyle(e); return { bg: s.backgroundImage, line: s.textDecorationColor, thick: s.textDecorationThickness, offset: s.textUnderlineOffset }; });
  await home(page, 'light');
  await expect(page.locator('.leadfig')).toHaveText(/^−?\d+(\.\d)? °[CF]$/);
  const light = await mark();
  expect(light.bg).toContain(SUN);
  expect(light.bg).toMatch(/^linear-gradient/);
  expect(light.line).toBe('rgba(0, 0, 0, 0)');
  // The system's dark.
  await home(page, 'dark');
  const dark = await mark();
  expect(dark).toEqual({ bg: 'none', line: SUN, thick: '5px', offset: '8px' });
  // The site's own switch, on a light system: the same.
  await home(page, 'light');
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
  expect(await mark()).toEqual({ bg: 'none', line: SUN, thick: '5px', offset: '8px' });
  // On paper, the stroke, whatever the screen.
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  expect((await mark()).bg).toContain(SUN);
  await page.emulateMedia({ media: 'screen' });
  // A species page: no sunflower on any element, as a ground or a line.
  await page.evaluate(() => { delete document.documentElement.dataset.theme; });
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  const sun = await page.evaluate((c) => [...document.querySelectorAll('body *')].filter((e) => { const s = getComputedStyle(e); return s.backgroundImage.includes(c) || s.backgroundColor === c || (s.textDecorationLine.includes('underline') && s.textDecorationColor === c); }).map((e) => e.tagName + '.' + e.className).slice(0, 5), SUN);
  expect(sun).toEqual([]);
});

test('r91b 4: the apple-touch icon is its own 180 px PNG, linked and served', async ({ page, request }) => {
  await home(page, 'light');
  const link = page.locator('head link[rel="apple-touch-icon"]');
  await expect(link).toHaveAttribute('href', /\/apple-touch-icon\.png$/);
  await expect(link).toHaveAttribute('sizes', '180x180');
  const r = await request.get('/apple-touch-icon.png');
  expect(r.status()).toBe(200);
  expect(r.headers()['content-type']).toMatch(/^image\/png/);
  const b = await r.body();
  expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([180, 180]);
});

/** Species pages: dump the text, crop the climograph and hero in both schemes at both widths. */
import { test, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = '/tmp/r5';
const SPECIES = ['copiapoa-cinerea', 'welwitschia-mirabilis', 'refusia-testii'];

const textOf = (page: Page) => page.evaluate(() => {
  const walk = (n: Node, d: number): string => {
    if (n.nodeType === 3) return (n.textContent ?? '').replace(/\s+/g, ' ');
    const el = n as HTMLElement;
    if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) return '';
    if (el.tagName === 'SVG' || el.tagName === 'svg') { const desc = el.querySelector('desc, title'); return `[svg: ${desc?.textContent ?? ''}]`; }
    const block = /^(P|DIV|H[1-6]|LI|TR|SECTION|ARTICLE|DT|DD|SUMMARY|DETAILS|FIGCAPTION|TABLE|UL|OL|HEADER|FOOTER|NAV|BUTTON|LABEL|FORM)$/.test(el.tagName);
    const inner = [...el.childNodes].map((c) => walk(c, d + 1)).join(el.tagName === 'TR' ? ' | ' : '');
    return block ? `\n${inner.trim()}` : inner;
  };
  return walk(document.body, 0).replace(/\n{2,}/g, '\n');
});

for (const s of SPECIES) {
  test(`species text and crops: ${s}`, async ({ browser }) => {
    for (const [width, scheme] of [[1000, 'light'], [390, 'light'], [390, 'dark'], [1000, 'dark']] as const) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme });
      const page = await ctx.newPage();
      await page.goto(`/species/${s}`);
      await page.waitForLoadState('networkidle').catch(() => {});
      if (width === 1000 && scheme === 'light') fs.writeFileSync(`${OUT}/text-${s}.txt`, await textOf(page));
      const hero = page.locator('.hero').first();
      if (await hero.count()) await hero.screenshot({ path: `${OUT}/crop-${s}-${width}-${scheme}-hero.png` });
      const clim = page.locator('#climate, section:has(h2:has-text("Climate"))').first();
      if (await clim.count()) await clim.screenshot({ path: `${OUT}/crop-${s}-${width}-${scheme}-climate.png` });
      const cult = page.locator('#cultivation, section:has(h2:has-text("Cultivation"))').first();
      if (await cult.count() && scheme === 'light') await cult.screenshot({ path: `${OUT}/crop-${s}-${width}-cultivation.png` });
      const hab = page.locator('#habitat, section:has(h2:has-text("Habitat"))').first();
      if (await hab.count() && scheme === 'light') await hab.screenshot({ path: `${OUT}/crop-${s}-${width}-habitat.png` });
      // viewport-sized shots down the page for reading
      if (scheme === 'light') {
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        const vh = width === 390 ? 844 : 900;
        for (let y = 0, i = 0; y < h && i < 8; y += vh, i++) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(150);
          await page.screenshot({ path: `${OUT}/vp-${s}-${width}-${i}.png` });
        }
      }
      await ctx.close();
    }
  });
}

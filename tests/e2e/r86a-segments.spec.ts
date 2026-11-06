/**
 * Round eighty-six, A3 (outside review B's 3): at 375 px with the text at 200%, Settings cut the temperature choice's
 * "°F and inches" at the group's right edge. The page did not scroll sideways, so the round sixty-seven check (no page
 * wider than the window) passed over it. This one measures what is inside each choice: every segment's words fit the
 * segment, and every segment lies inside its group, on the pages that draw segmented choices.
 *
 * On r86base: Settings FAILED at 320, 375 and 414 px (the temperature choice's second segment overflowed its box).
 */
import { test, expect } from '@playwright/test';
import { ready } from './helpers/smoke';
import { rootText } from './helpers/text-size';

const PAGES = ['/settings', '/plants', '/propagation', '/about/how', '/about/formats', '/'];

for (const width of [320, 375, 414]) {
  test(`r86a: at ${width} px with the text at 200%, every segmented choice's words fit inside it`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ baseURL, locale: 'en-GB', viewport: { width, height: 700 }, serviceWorkers: 'block' });
    await rootText(ctx, 200);
    const page = await ctx.newPage();
    await page.route((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)/.test(u.href), (r) => r.abort());
    try {
      const cut: string[] = [];
      for (const path of PAGES) {
        await page.goto(path); await ready(page);
        expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
        cut.push(...(await page.evaluate((where) => {
          const out: string[] = [];
          for (const g of document.querySelectorAll<HTMLElement>('.seg')) {
            if (!g.offsetParent) continue; // not drawn (a closed fold)
            const gr = g.getBoundingClientRect();
            for (const b of g.querySelectorAll<HTMLElement>(':scope > button, :scope > a')) {
              const r = b.getBoundingClientRect();
              const name = (b.textContent ?? '').trim();
              if (b.scrollWidth > b.clientWidth + 1) out.push(`${where}: "${name}" is ${b.scrollWidth} px of words in a ${b.clientWidth} px segment`);
              if (r.right > gr.right + 1 || r.left < gr.left - 1) out.push(`${where}: "${name}" ends outside its group`);
              if (r.right > document.documentElement.clientWidth + 1) out.push(`${where}: "${name}" ends past the window`);
            }
          }
          return out;
        }, path)));
      }
      expect(cut).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
}

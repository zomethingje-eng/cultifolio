/**
 * Round-5 UI sweep against `vite dev --port 5199`: every page at 1000 and 390 px, light and dark,
 * with console errors and failed requests per page, horizontal overflow and small tap targets.
 *   npx playwright test tests/qa/round5-ui-sweep.spec.ts --config tests/qa/round5-ui.config.ts
 */
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

const OUT = '/tmp/r5';
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5199';
const ROUTES = ['/', '/species/copiapoa-cinerea', '/species/welwitschia-mirabilis', '/species/refusia-testii', '/plants', '/plants/new', '/benches', '/sowings', '/sowings/new', '/labels', '/frost', '/backup', '/sync', '/about/how', '/about/formats', '/offline', '/species/nonsensia-fakeii'];

function watch(page: Page) {
  const out = { console: [] as string[], failed: [] as string[] };
  page.on('console', (m) => { if (m.type() === 'error') out.console.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => out.console.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => out.failed.push(`${r.method()} ${r.url()} → ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) out.failed.push(`${r.request().method()} ${r.url()} → ${r.status()}`); });
  return out;
}

const probe = (page: Page) => page.evaluate(() => {
  const w = window.innerWidth;
  const wide = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > w + 1 && getComputedStyle(el).visibility !== 'hidden' && r.width > 0; }).slice(0, 6).map((el) => `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ').join('.') : ''} right=${Math.round(el.getBoundingClientRect().right)}`);
  const small = [...document.querySelectorAll<HTMLElement>('a, button, input:not([type=hidden]), select, summary, label.row')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && getComputedStyle(el).visibility !== 'hidden'; }).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${typeof el.className === 'string' ? el.className.split(' ').slice(0, 2).join('.') : ''} "${(el.textContent ?? '').trim().slice(0, 25)}" ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
  return { scrollW: document.documentElement.scrollWidth, innerW: w, wide, small: [...new Set(small)].slice(0, 40), smallN: small.length };
});

for (const width of [1000, 390]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`sweep ${width}px ${scheme}`, async ({ browser }) => {
      test.setTimeout(300_000);
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, colorScheme: scheme, baseURL: BASE });
      const page = await ctx.newPage();
      // one plant so the collection pages are populated
      await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
      await page.getByRole('button', { name: /^Add/ }).click();
      await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
      const acc = page.url().split('/').pop()!;
      const report: string[] = [];
      for (const r of [...ROUTES, `/plants/${acc}`]) {
        const w = watch(page);
        await page.goto(r);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(500);
        const p = await probe(page);
        const name = `${width}-${scheme}${r.replace(/\//g, '_') || '_root'}`;
        await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
        report.push(`${r}\n  console: ${w.console.join(' | ') || '-'}\n  failed: ${w.failed.join(' | ') || '-'}\n  overflow: ${p.scrollW > p.innerW + 1 ? `${p.scrollW}>${p.innerW} ${p.wide.join(', ')}` : '-'}\n  small(${p.smallN}): ${p.small.join(' ; ') || '-'}`);
        page.removeAllListeners();
      }
      fs.writeFileSync(`${OUT}/report-${width}-${scheme}.txt`, report.join('\n'));
      await ctx.close();
    });
  }
}

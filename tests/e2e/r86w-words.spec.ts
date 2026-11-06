/**
 * Round eighty-six, the words agent: what the words and small faults look like in the browser.
 *
 * 1. Review S's S15: the "No climate" chip says its pending page, so the chips add up to "All".
 * 2. The plan's A13: a Related tile sets an English name as written, not in a family's capitals (the fixture's related
 *    species have none, so the style is read on a tile marked as one; `class:common` is set where `c.common` is).
 * 3. Review W's W15 and P's P8: the about pages' folds have a mark that they open and a name each.
 * 4. Review W's W14: a photograph that did not load prints nothing, nor its screen-only link.
 * 5. Review W's W12: /labels does not move as 376 plants arrive (round eighty-five held it at 30).
 *
 * On r86base: 1 FAILED (the chip ended "1 not checked"; the pending in its title alone), 2 FAILED (text-transform
 * "uppercase"), 3 FAILED (no "›" before a fold's name), 4 FAILED (the failed hero printed). 5 is a guard: it read CLS
 * 0.000006 on r86base and on this branch here (headless Chromium, the fixture's two species, no network), so review W's
 * 0.0349 on the live site at 376 plants is not reproduced here and nothing was changed for it.
 */
import { test, expect } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ready } from './helpers/smoke';
import { framesSettled } from './helpers/settled';
import { chromiumOnly } from './helpers/engines';

test.use({ serviceWorkers: 'block' });

test('r86w 1: the No climate chip says its pending page too (S15) @phone', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const chip = page.locator('.chiprow a[href*="chip=noclimate"]');
  await expect(chip).toHaveText(/^No climate,?\s*0,\s*1 not asked, 1 not checked, 1 pending$/); // base: "… 1 not checked"
  await expect(chip).toHaveAttribute('aria-label', 'No climate: 0 species; besides them, 1 not asked, 1 not checked, 1 pending');
});

test('r86w 2: a Related tile sets an English name as written, a family in capitals (A13)', async ({ page }) => {
  await page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|api\.gbif\.org)\//, (r) => r.abort());
  await page.goto('/species/copiapoa-humilis'); await ready(page);
  // The fixture's related species have no English name, so the tile shows the family, in capitals (guard) ...
  const rf = page.locator('a.reltile .rf', { hasText: 'Cactaceae' }).first();
  await expect(rf).not.toHaveClass(/\bcommon\b/);
  expect(await rf.evaluate((el) => getComputedStyle(el).textTransform)).toBe('uppercase');
  // ... and the page's own style sets a tile marked as an English name as written (base: no such rule, "uppercase").
  expect(await rf.evaluate((el) => { el.classList.add('common'); return getComputedStyle(el).textTransform; })).toBe('none');
});

test('r86w 3: each fold on the about pages shows that it opens, and has a name of its own (W15, P8) @phone', async ({ page }) => {
  for (const path of ['/about/how', '/about/formats']) {
    await page.goto(path); await ready(page);
    const s = page.locator('article.prose details.full > summary').first();
    expect(await s.evaluate((el) => getComputedStyle(el, '::before').content)).toMatch(/›/); // base: "none"
    const names = await page.locator('article.prose details > summary').evaluateAll((els) => els.map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()));
    expect(names.length).toBeGreaterThan(10);
    expect(new Set(names).size, path).toBe(names.length); // base: "The rules in full" 34 times
  }
  // The suffix is for a screen reader: the fold looks as before.
  await page.goto('/about/how'); await ready(page);
  const sr = page.locator('#names ~ details.in-full summary .sr').first();
  expect(await sr.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1);
});

test('r86w 4: a photograph that did not load prints nothing (W14)', async ({ page }) => {
  await page.route(/^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|static\.inaturalist\.org|upload\.wikimedia\.org|api\.gbif\.org)\//, (r) => r.abort());
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('.hero.photo.failed')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.hero.photo.failed')).toBeHidden(); // base: printed, "The photograph's own page" over it
  await expect(page.locator('h1.sci')).toBeVisible();
});

const SHIFTS = 'a layout-shift reading, which only Chromium reports';
const plants = (n: number): Row[] => Array.from({ length: n }, (_, k) => k + 1).flatMap((i) => [['accession', `q${i}`, 'taxonName', i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis'], ['accession', `q${i}`, 'status', 'growing'], ['accession', `q${i}`, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', `q${i}`, 'acquired', '2025-03-01']] as Row[]);

test('r86w 5: /labels does not move as 376 plants arrive (W12; guard)', chromiumOnly(SHIFTS), async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/plants'); await ready(page);
  await inject(page, plants(376), Date.now() - 86_400_000, 'wwwwwwwwwwwwww86');
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: Array<{ v: number; who: string[] }> };
    w.__cls = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }> }>) {
        if (e.hadRecentInput) continue;
        w.__cls.push({ v: e.value, who: (e.sources ?? []).map((s) => { const n = s.node as Element | null; return `${n?.nodeName ?? '?'}.${(n as Element | null)?.className ?? ''} ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}`; }) });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('.picklist label.pick')).toHaveCount(376, { timeout: 60_000 });
  await expect(page.locator('.sheets')).toBeAttached();
  await framesSettled(page);
  const shifts = await page.evaluate(() => (window as unknown as { __cls: Array<{ v: number; who: string[] }> }).__cls);
  const cls = shifts.reduce((a, b) => a + b.v, 0);
  console.log(`r86w 5: CLS ${cls.toFixed(6)} ${JSON.stringify(shifts.filter((s) => s.v > 0.0005))}`);
  expect(cls).toBeLessThan(0.005); // review W: 0.0349 at 376 plants
});

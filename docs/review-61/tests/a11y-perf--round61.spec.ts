/**
 * Round sixty-one self-review, accessibility and performance (area "a11y-perf"): reproductions and guards.
 *
 * FAILS on f4ab4f8 (reproductions; each asserts the fixed behaviour):
 *   1. select mode, 390 x 844: a tick box reached by Tab is never entirely under the select bar (keepFocusClear does not see
 *      the bar, which floats 8 px above the tab bar);
 *   2. the same at 200% text (needs PW_CHROMIUM for the profile's font size);
 *   3. after Archive in select mode at 375 px, the focused Archive button is not entirely under the Undo toast;
 *   4. Today's "Show N more" leaves focus on a control, not on the page body;
 *   5. a returning grower's front page at 1280 shifts by less than 0.1 while it opens;
 *   6. Today says the species sheets were not checked when they are refused (rule 2);
 *   7. label in name: the species page's photo strip link is named by its visible words.
 * PASSES (guards worth adopting):
 *   8. the toast's live region is in the accessibility tree, empty, before any toast;
 *   9. keyboard only: tick, Archive, Yes, Tab to Undo, Enter: the plant is growing again and focus is on a named control.
 *
 * Run (server already up on 4173): PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/a11y-perf--round61.spec.ts --retries=0
 */
import { test, expect, type Page } from '@playwright/test';

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
type Row = [string, string, string, unknown];
async function inject(page: Page, rows: Row[], wall = Date.now() - 86_400_000, writer = 'r61revaaaaaaaaa') {
  await page.evaluate(async ({ rows, wall, writer }) => {
    let db: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !db; i++) {
      const d = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (d && d.objectStoreNames.contains('changes') && d.objectStoreNames.contains('meta')) db = d; else { d?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!db) throw new Error('no stores');
    const tx = db.transaction(['changes', 'meta'], 'readwrite');
    rows.forEach(([kind, id, field, value], i) => tx.objectStore('changes').put({ t: `${String(wall + i).padStart(13, '0')}-0000-${writer}`, kind, id, field, value }));
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    await new Promise((r) => setTimeout(r, 500));
    const tx2 = db.transaction(['meta'], 'readwrite'); tx2.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx2.oncomplete = () => res(); });
  }, { rows, wall, writer });
}
const dayAgo = (n: number) => { const d = new Date(Date.now() - n * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function plants(n: number, at: [string, string] = ['gh', 'Greenhouse'], from = 1, taxon?: string): Row[] {
  const rows: Row[] = [['location', at[0], 'name', at[1]], ['location', at[0], 'type', 'greenhouse']];
  for (let i = from; i < from + n; i++) {
    const id = `rp${i}`;
    rows.push(['accession', id, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', taxon ?? (i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis')], ['accession', id, 'status', 'growing'], ['accession', id, 'nameKind', 'species'], ['accession', id, 'locationId', at[0]]);
    rows.push(['event', `w${id}`, 'acc', id], ['event', `w${id}`, 'd', dayAgo(30)], ['event', `w${id}`, 't', 'water'], ['event', `w${id}`, 'note', null]);
  }
  return rows;
}
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
});
async function seeded(page: Page, rows: Row[], path = '/plants') {
  await page.goto('/plants'); await ready(page); await inject(page, rows); await page.goto(path); await ready(page);
}
/** Tab through select mode's tick boxes; returns the ones whose row was entirely covered when focused. */
async function hiddenTicks(page: Page): Promise<string[]> {
  await page.locator('a.accrow').first().waitFor();
  await page.locator('#select-toggle').focus(); await page.keyboard.press('Enter');
  await page.locator('.selrow').first().waitFor();
  const hidden: string[] = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab'); await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement; if (!el.matches('.selrow input')) return null;
      const b = el.closest('label')!.getBoundingClientRect();
      const pts = [[b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + 4, b.bottom - 4], [b.right - 4, b.bottom - 4], [b.left + b.width / 2, b.top + b.height / 2]];
      const seen = pts.some(([x, y]) => { if (y < 0 || y >= innerHeight) return false; const h = document.elementFromPoint(x, y); return !!h && !!el.closest('label')!.contains(h); });
      return seen ? '' : el.closest('label')!.textContent!.trim().slice(0, 9);
    });
    if (r) hidden.push(r);
  }
  return hidden;
}

test('a11y-perf 61-1: select mode at 390 x 844: no tick box reached by Tab is entirely under the select bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seeded(page, plants(12));
  expect(await hiddenTicks(page)).toEqual([]);
});

test('a11y-perf 61-2: select mode at 390 x 844 with 200% text: no tick box reached by Tab is entirely under the bars', async ({ baseURL }) => {
  test.setTimeout(180_000);
  const { chromium } = await import('@playwright/test');
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-r61rev-'));
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: 32, default_fixed_font_size: 26 } } }));
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, locale: 'en-GB', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.addInitScript(() => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } });
    await seeded(page, plants(12));
    expect(await hiddenTicks(page)).toEqual([]);
  } finally { await ctx.close(); }
});

test('a11y-perf 61-3: after Archive in select mode at 375 px, the focused Archive button is not entirely under the toast', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seeded(page, plants(6));
  await page.locator('a.accrow').first().waitFor();
  await page.locator('#select-toggle').click();
  await page.locator('.selrow input').nth(2).check();
  await page.locator('#sel-archive').click(); await page.locator('#sel-archive-yes').click();
  await page.locator('.toast .undo').waitFor();
  await expect(page.locator('#sel-archive')).toBeFocused();
  const covered = await page.evaluate(() => { const el = document.activeElement as HTMLElement; const b = el.getBoundingClientRect(); const pts = [[b.left + 3, b.top + 3], [b.right - 3, b.top + 3], [b.left + 3, b.bottom - 3], [b.right - 3, b.bottom - 3], [b.left + b.width / 2, b.top + b.height / 2]]; return pts.every(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.toast')); });
  expect(covered).toBe(false);
});

test('a11y-perf 61-4: Today\'s "Show N more" leaves keyboard focus on a control', async ({ page }) => {
  test.setTimeout(120_000);
  await seeded(page, plants(60, ['gh', 'Greenhouse'], 1, 'Haworthia cooperi'), '/today'); // a name off the reference: no resting row, all 60 overdue
  const more = page.locator('.morechips').first();
  await more.waitFor({ timeout: 60_000 });
  await more.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === null)).toBe(false);
});

test('a11y-perf 61-5: a returning grower\'s front page at 1280 shifts by less than 0.1 while it opens', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await seeded(page, plants(8));
  await page.locator('a.accrow').first().waitFor();
  await page.addInitScript(() => { (window as unknown as { __cls: number }).__cls = 0; new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); });
  const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto('/'); await ready(page); await page.waitForTimeout(3500);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  expect(await page.evaluate(() => (window as unknown as { __cls: number }).__cls)).toBeLessThan(0.1);
});

test('a11y-perf 61-6: Today says the species sheets were not checked when they are refused', async ({ page }) => {
  await seeded(page, plants(4));
  await page.route(/\/api\/sheets/, (r) => r.abort());
  await page.goto('/today'); await ready(page);
  await page.locator('li.stop').first().waitFor({ timeout: 60_000 });
  await expect(page.locator('#water')).toContainText(/not checked|did not answer|not reached/i);
});

test('a11y-perf 61-7: the species page\'s photo strip link is named by its visible words (label in name)', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const strip = page.locator('a.thumbstrip');
  const [vis, name] = await strip.evaluate((a) => [(a.querySelector('.more')?.textContent ?? '').replace('›', '').trim().toLowerCase(), (a.getAttribute('aria-label') ?? '').toLowerCase()]);
  expect(name.startsWith(vis)).toBe(true);
});

test('a11y-perf 61-8 (guard): the toast\'s live region is in the accessibility tree, empty, before any toast', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const region = page.locator('.toastregion [role=status]');
  await expect(region).toHaveCount(1);
  await expect(region).toHaveText('');
  const cdp = await page.context().newCDPSession(page);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 }) as { root: { nodeId: number } };
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.toastregion [role=status]' }) as { nodeId: number };
  const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false }) as { nodes: Array<{ ignored: boolean; role?: { value: string } }> };
  expect(nodes[0].ignored).toBe(false);
  expect(nodes[0].role?.value).toBe('status');
});

test('a11y-perf 61-9 (guard): keyboard only, Archive and its Undo put the plant back and keep focus on named controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seeded(page, plants(4));
  await page.locator('a.accrow').first().waitFor();
  await page.locator('#select-toggle').focus(); await page.keyboard.press('Enter');
  await page.locator('.selrow input').nth(1).focus(); await page.keyboard.press('Space');
  await page.locator('#sel-archive').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#sel-archive-keep')).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.locator('#sel-archive-yes')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#sel-archive')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('.toast .undo')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast [role=status]')).toContainText('Undone: 1 growing again');
  expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  await page.locator('#select-toggle').click();
  await expect(page.locator('a.accrow', { hasText: '2026-0003' })).toHaveCount(1);
});

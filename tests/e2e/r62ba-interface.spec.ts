/**
 * Round sixty-two, second pass, agent A: the verification review's grower findings on the interface, end to end.
 *
 * Adopted from /tmp/r62rev/out/tests/ (each failed on the first pass's merge, and passes here):
 * - grower--tabbar-360.spec.ts (grower 1): a grower's tab bar keeps its words at 360 px with normal text; widened to 320,
 *   375, 390 and 412 px, to the visitor's four, and to the labels being whole;
 * - grower--select-toast-short-list.spec.ts (grower 3): after Archive on a short list the toast clears the focused Archive
 *   button; widened to 390 x 844 with four plants, and to Move's Undo;
 * - grower--today-check-again-focus.spec.ts (grower 5): "Check again" leaves focus on the stop's heading.
 * And this round's own: forced colours draw the front page's cards with an edge; and the self-review's N10: /plants draws its
 * keep line with the list, the Linux font swap, and no sideways scroll at 320 px with 200% text.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';

const quiet = () => { try { localStorage.setItem('cultifolio.persistAfterFirst', '1'); sessionStorage.setItem('cultifolio.backupNudgeHidden', '1'); } catch { /* fine */ } };
test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => { await context.addInitScript(quiet); });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
const dayAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
function plants(n: number, watered = false): Row[] {
  const rows: Row[] = [['location', 'gh', 'name', 'Greenhouse']];
  for (let i = 1; i <= n; i++) {
    rows.push(['accession', `t${i}`, 'acc', `2026-000${i}`], ['accession', `t${i}`, 'taxonName', 'Copiapoa cinerea'], ['accession', `t${i}`, 'status', 'growing'], ['accession', `t${i}`, 'nameKind', 'species'], ['accession', `t${i}`, 'locationId', 'gh']);
    if (watered) rows.push(['event', `w${i}`, 'acc', `t${i}`], ['event', `w${i}`, 'd', dayAgo(30)], ['event', `w${i}`, 't', 'water']);
  }
  return rows;
}
async function seeded(page: Page, rows: Row[], path: string) {
  await page.goto('/plants'); await ready(page);
  await inject(page, rows, Date.now() - 86_400_000, 'r62baaaaaaaaaaaa');
  await page.goto(path); await ready(page);
}

/* ---- the tab bar (grower 1) ---- */

/*
 * Measured on this round's build (the bar's state, each label's width over its column's):
 *   100% text, grower: 320 and 360 px the smaller step (Propagation 63 of 64 and of 72), 375 to 412 px as before;
 *   100% text, visitor: every width as before; 125%: the grower's labels at 390 and 412 px (smaller step), icons below;
 *   150% and 200%: the grower's icons at every width ("Propagation" is one word of 79 to 126 px), the visitor's labels
 *   from 375 px at 200% (smaller step, "My / plants" on two lines) and at every width at 150%.
 */
for (const who of ['grower', 'visitor'] as const) for (const width of [320, 360, 375, 390, 412]) {
  test(`r62ba grower 1: at ${width} px with the default text size a ${who}'s tabs keep their words, whole`, async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({ baseURL, viewport: { width, height: 780 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
    await ctx.addInitScript(quiet);
    const page = await ctx.newPage();
    if (who === 'grower') {
      await seeded(page, plants(1), '/today');
    } else {
      await page.goto('/'); await ready(page);
    }
    await expect(page.locator('#tabbar a:visible')).toHaveCount(5); // the grower's five for a visitor too (round sixty-three, V1)
    await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
    await expect(page.locator('#tabbar')).not.toHaveAttribute('data-icons', '1'); // the first pass: data-icons="1" at 320 and 360, five bare icons
    const labels = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#tabbar a')].filter((a) => a.offsetParent).map((a) => {
      const s = a.querySelector('span')!;
      return { t: s.textContent, w: s.getBoundingClientRect().width, whole: s.scrollWidth <= s.clientWidth + 1 };
    }));
    expect(labels.map((l) => l.t)).toEqual(['Species', 'My plants', 'Places', 'Propagation', 'Today']);
    for (const l of labels) { expect(l.whole, l.t!).toBe(true); expect(l.w, l.t!).toBeGreaterThan(20); }
    await ctx.close();
  });
}

/** Each tab's label: whether it is drawn, whether it is cut, and any line that starts inside a word. */
const tabState = (page: Page) => page.evaluate(() => ({
  icons: document.getElementById('tabbar')!.hasAttribute('data-icons'),
  tabs: [...document.querySelectorAll<HTMLElement>('#tabbar a')].filter((a) => a.offsetParent).map((a) => {
    const s = a.querySelector('span')!;
    const shown = s.getClientRects().length > 0 && s.getBoundingClientRect().width > 2;
    const r = document.createRange(); const text = s.textContent ?? ''; const breaks: string[] = [];
    let lastTop: number | null = null;
    for (let i = 0; i < text.length && shown; i++) {
      r.setStart(s.firstChild!, i); r.setEnd(s.firstChild!, i + 1);
      const top = Math.round(r.getBoundingClientRect().top);
      if (lastTop !== null && top > lastTop + 2 && text[i - 1] !== ' ' && text[i] !== ' ') breaks.push(text.slice(0, i) + '/' + text.slice(i));
      lastTop = top;
    }
    return { name: (a.textContent ?? '').trim(), shown, breaks, cut: s.scrollWidth > s.clientWidth + 1 };
  })
}));
for (const who of ['grower', 'visitor'] as const) {
  test(`r62ba grower 1: at 200% text a ${who}'s tabs, at 320 to 412 px, never break or cut a word; a label that will not fit makes the bar icons`, async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const ctx = await browser.newContext({ baseURL, viewport: { width: 320, height: 780 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
    await ctx.addInitScript(quiet);
    const page = await ctx.newPage();
    // The browser's own text size, as the profile's setting sets it; skipped, with the reason, where it does not take.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    if (who === 'grower') await seeded(page, plants(1), '/today'); else { await page.goto('/'); await ready(page); }
    const text = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    test.skip(text !== '32px', `preference not applied by this browser (its text is ${text}, not 32px)`);
    const seen: string[] = [];
    for (const width of [320, 360, 375, 390, 412]) {
      await page.setViewportSize({ width, height: 780 });
      await expect(page.locator('#tabbar a:visible')).toHaveCount(5); // everyone's five (round sixty-three, V1)
      await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
      const st = await tabState(page);
      seen.push(`${width}: ${st.icons ? 'icons' : 'labels'}`);
      for (const t of st.tabs) {
        expect(t.breaks, `${width} ${t.name}`).toEqual([]);
        if (t.shown) expect(t.cut, `${width} ${t.name}`).toBe(false);
      }
      // Either every label is drawn whole, or none is and the bar is icons, each still named by its label.
      expect(st.tabs.every((t) => t.shown) || (st.icons && st.tabs.every((t) => !t.shown)), `${width}: ${JSON.stringify(st)}`).toBe(true);
    }
    console.log(`${who} at 200%: ${seen.join(', ')}`);
    await ctx.close();
  });
}

/* ---- the toast and a short list's select bar (grower 3) ---- */

/** The share of the focused element under the toast, in per cent. */
const underToast = (page: Page) => page.evaluate(() => {
  const t = document.querySelector('.toast')!.getBoundingClientRect();
  const b = document.activeElement!.getBoundingClientRect();
  const w = Math.max(0, Math.min(t.right, b.right) - Math.max(t.left, b.left));
  const h = Math.max(0, Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top));
  return Math.round((100 * w * h) / (b.width * b.height));
});
for (const [w, h, n] of [[375, 812, 3], [390, 844, 4], [390, 844, 3]] as const) {
  test(`r62ba grower 3: after Archive on a list of ${n} at ${w} x ${h}, the toast does not cover the focused Archive button`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await seeded(page, plants(n), '/plants?select=1');
    await page.locator('.selrow input').first().check();
    await page.locator('#sel-archive').click();
    await page.locator('#sel-archive-yes').click();
    await page.locator('.toast .undo').waitFor();
    await expect(page.locator('#sel-archive')).toBeFocused();
    expect(await underToast(page)).toBe(0); // the first pass: 44 to 56 at 375 x 812 with three
    // And the toast is still on the screen, under the top bar.
    const top = await page.evaluate(() => document.querySelector('.toast')!.getBoundingClientRect().top);
    expect(top).toBeGreaterThan(40);
  });
}

test('r62ba grower 3: Move\'s Undo, and its "Undone" toast, on a short list do not cover the select bar', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const rows = plants(3);
  rows.push(['location', 'cf', 'name', 'Cold frame']);
  await seeded(page, rows, '/plants?select=1');
  await page.locator('.selrow input').first().check();
  await page.locator('#sel-move').click();
  await page.selectOption('#sel-loc', 'cf');
  await page.locator('#sel-move-go').click();
  await page.locator('.toast .undo').waitFor({ timeout: 15_000 });
  const overlap = () => page.evaluate(() => {
    const t = document.querySelector('.toast')!.getBoundingClientRect();
    const b = document.querySelector('.selbar')!.getBoundingClientRect();
    return Math.max(0, Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top));
  });
  // Polled: the toast slides in over 0.18 s and the bar settles as the Move panel closes; a toast left on the bar stays there.
  await expect.poll(overlap, { timeout: 3000 }).toBe(0);
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('Undone: back where they were.');
  await expect.poll(overlap, { timeout: 3000 }).toBe(0); // the review: "Undone: back where they were." sat over Archive
});

/* ---- Today's "Check again" (grower 5) ---- */

test('r62ba grower 5: when "Check again" brings the sheets, focus is on the stop\'s heading, not <body>', async ({ page }) => {
  test.setTimeout(90_000);
  let refuse = true;
  await page.route(/\/api\/sheets/, (r) => (refuse ? r.fulfill({ status: 503, body: 'busy' }) : r.continue()));
  await seeded(page, plants(3, true), '/today');
  const again = page.locator('li.stop .restnc').getByRole('button', { name: 'Check again' });
  await again.waitFor({ timeout: 30_000 });
  refuse = false;
  await again.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('li.stop .restnc')).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('li.stop', { hasText: 'Greenhouse' }).locator('h3')).toBeFocused(); // the first pass: <body>
});

test('r62ba grower 5 (guard): "Check again" that is refused again keeps focus on the button', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route(/\/api\/sheets/, (r) => r.fulfill({ status: 503, body: 'busy' }));
  await seeded(page, plants(2, true), '/today');
  const again = page.locator('li.stop .restnc').getByRole('button', { name: 'Check again' });
  await again.waitFor({ timeout: 30_000 });
  await again.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('li.stop .restnc')).toHaveCount(1);
  await page.waitForTimeout(1500);
  await expect(again).toBeFocused();
});

/* ---- forced colours (grower, smaller) ---- */

test('r62ba grower: in forced colours the front page\'s catalogue rows and strip tiles keep an edge', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/'); await ready(page);
  const edge = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('a.grow, .ftile')].slice(0, 6).map((el) => { const s = getComputedStyle(el); return `${el.className.split(' ')[0]}:${s.outlineStyle}:${s.outlineWidth}`; }));
  expect(edge.length).toBeGreaterThan(0);
  for (const e of edge) expect(e).toMatch(/:solid:1px$/);
});

/* ---- /plants: the keep line and the list arrive together (triage-self N10) ---- */

test('r62ba N10: on /plants the "Kept in this browser only" line is drawn with the list, not a moment after it', async ({ page }) => {
  // The order each first appears in, from before the page's own scripts run: the first pass drew the rows, then the line
  // above them once the browser answered `persist()`, and the rows moved 26 px down (CLS 0.011 to 0.020).
  await page.addInitScript(() => {
    const seen: string[] = ((window as unknown as { __order: string[] }).__order = []);
    new MutationObserver(() => {
      // The line first: drawn in the same update as the rows, it is said first.
      if (!seen.includes('keep') && document.querySelector('p.keepline')) seen.push('keep');
      if (!seen.includes('rows') && document.querySelector('.rows > *')) seen.push('rows');
    }).observe(document, { childList: true, subtree: true });
  });
  await seeded(page, plants(3), '/plants');
  await expect(page.locator('.rows').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('p.keepline')).toBeVisible({ timeout: 15_000 });
  const order = await page.evaluate(() => (window as unknown as { __order: string[] }).__order);
  expect(order).toEqual(['keep', 'rows']); // the first pass: ['rows', 'keep']
});

/* ---- the Linux font swap (triage-self N10) ---- */

// A 1 x 1 PNG for every reference photograph: the fixture's photo hosts do not answer, and a strip that fails moves the page
// for its own reason, which is not this test's.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
for (const path of ['/', '/species/copiapoa-cinerea']) {
  test(`r62ba N10: at 390 px, ${path} shifts by less than 0.05 when the web fonts arrive late`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    // The fallback faces are tuned for Linux's fonts (Liberation, DejaVu), Windows' (Segoe UI, Georgia, Consolas) and
    // Apple's (Helvetica Neue, Georgia, Menlo). Windows shifted 0.107 here in round sixty-two's first strict run on the
    // author's PC: the count beside the title, set in Consolas, wrapped when DM Mono came. Round sixty-three's monospace
    // faces took it to 0.000, measured with open fonts of the Windows faces' widths under their names, so the test runs
    // on Windows too; elsewhere the local fonts are not known, and a shift would say nothing about the faces (round
    // sixty-three, U1).
    test.skip(!['linux', 'win32', 'darwin'].includes(process.platform), `the fallback faces are tuned for Linux's, Windows' and Apple's fonts, not ${process.platform}'s`);
    const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
    await ctx.addInitScript(quiet);
    await ctx.addInitScript(() => {
      const w = window as unknown as { __cls: number };
      w.__cls = 0;
      new PerformanceObserver((l) => { for (const e of l.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) if (!e.hadRecentInput) w.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
    });
    await ctx.route(/inaturalist|wikimedia|staticflickr|gbif\.org\/.*\.(jpe?g|png)|api\.gbif\.org\/v1\/image/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.continue()));
    // The web fonts held back a second and a half, as on a phone's network: the text is set in the fallback first.
    await ctx.route(/\.woff2(\?|$)/, async (r) => { await new Promise((x) => setTimeout(x, 1500)); await r.continue(); });
    const page = await ctx.newPage();
    await page.goto(path); await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(2000);
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
    // Measured on Linux (Liberation and DejaVu, no Arial): 0.148 on the front page and 0.144 on the species page before
    // this round's fallback faces, 0.000 and 0.001 with them.
    expect(cls).toBeLessThan(0.05);
    await ctx.close();
  });
}

/* ---- no sideways scroll at 320 px with 200% text (triage-self N10) ---- */

for (const path of ['/plants/2026-0001', '/plants/2026-0002', '/species/copiapoa-cinerea', '/?by=family']) {
  test(`r62ba N10: at 320 px with 200% text ${path} does not scroll sideways`, async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const ctx = await browser.newContext({ baseURL, viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, locale: 'en-GB', serviceWorkers: 'block' });
    await ctx.addInitScript(quiet);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } });
    // 2026-0002 is a cf. plant, whose page's link reads "Compare: Copiapoa cinerea".
    const rows = plants(1);
    rows.push(['accession', 't2', 'acc', '2026-0002'], ['accession', 't2', 'taxonName', 'Copiapoa cf. cinerea'], ['accession', 't2', 'status', 'growing'], ['accession', 't2', 'nameKind', 'species'], ['accession', 't2', 'locationId', 'gh']);
    await seeded(page, rows, path);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    const text = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
    test.skip(text !== '32px', `preference not applied by this browser (its text is ${text}, not 32px)`);
    // The front page's row names (W's `.grow .gname { overflow-wrap: anywhere }`, merged): "Welwitschiaceae" wraps in its column.
    // The first pass: the cf. plant's page 432 ("Compare: Copiapoa cinerea" kept on one line, 385 px), the front page 323.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    await ctx.close();
  });
}

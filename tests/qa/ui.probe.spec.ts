/**
 * QA probes for the user-facing side. These are not regression tests: several
 * assertions are written as `expect.soft` so one run reports every finding at
 * once. Screenshots land in $QA_SHOTS (default: test-results/qa-shots).
 *
 *   QA_SHOTS=/some/dir PW_CHROMIUM=... npx playwright test qa-probe
 */
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SHOTS = process.env.QA_SHOTS ?? 'test-results/qa-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

const SPECIES = ['copiapoa-cinerea', 'welwitschia-mirabilis', 'refusia-testii'];
const NAMES: Record<string, string> = { 'copiapoa-cinerea': 'Copiapoa cinerea', 'welwitschia-mirabilis': 'Welwitschia mirabilis', 'refusia-testii': 'Refusia testii' };
const STATIC_ROUTES = ['/', '/plants', '/plants/new', '/benches', '/sowings', '/sowings/new', '/labels', '/backup', '/sync', '/frost', '/offline', '/about/how', '/about/formats', ...SPECIES.map((s) => `/species/${s}`)];

/** Everything the browser says or fails to fetch, per page, plus any request that leaves this origin. */
function watch(page: Page) {
  const out = { console: [] as string[], failed: [] as string[], thirdParty: [] as string[] };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') out.console.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => out.console.push(`[pageerror] ${e.message}`));
  page.on('requestfailed', (r) => out.failed.push(`${r.method()} ${r.url()} → ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) out.failed.push(`${r.request().method()} ${r.url()} → ${r.status()}`); });
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== '127.0.0.1:4173' && u.protocol.startsWith('http')) out.thirdParty.push(`${r.method()} ${r.url()}`); });
  return out;
}

async function addPlant(page: Page, name: string, opts: { count?: number; field?: string } = {}) {
  await page.goto('/plants/new');
  await page.fill('#species-name', name);
  await page.locator('#species-name').blur();
  if (opts.field) await page.fill('#f-field', opts.field);
  if (opts.count) await page.fill('#f-count', String(opts.count));
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(opts.count && opts.count > 1 ? /\/plants$/ : /\/plants\/\d{4}-\d{4}$/);
  return page.url().split('/').pop()!;
}

const overflow = (page: Page) => page.evaluate(() => {
  const w = window.innerWidth;
  const wide = [...document.querySelectorAll<HTMLElement>('body *')].filter((el) => { const r = el.getBoundingClientRect(); return r.right > w + 1 && getComputedStyle(el).visibility !== 'hidden' && r.width > 0; }).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : ''} right=${Math.round(el.getBoundingClientRect().right)}`);
  return { scrollW: document.documentElement.scrollWidth, innerW: w, wide };
});

/* ------------------------------------------------------------------ 1. console, failed requests, third-party hosts */

test('every page: console errors, failed requests, and any request that leaves the origin', async ({ page }) => {
  test.setTimeout(120_000);
  const report: Record<string, ReturnType<typeof watch>> = {};
  await addPlant(page, 'Copiapoa cinerea');
  for (const r of STATIC_ROUTES) {
    const w = watch(page);
    await page.goto(r);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(400);
    report[r] = w;
    page.removeAllListeners();
  }
  // The plant page and the species picker as used: type a name and see where it goes.
  const w = watch(page);
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapoa cin');
  await page.waitForTimeout(800);
  await page.locator('#species-name').blur();
  await page.waitForTimeout(800);
  report['/plants/new (typing a name)'] = w;
  const lines: string[] = [];
  for (const [r, x] of Object.entries(report)) {
    if (x.console.length || x.failed.length || x.thirdParty.length) lines.push(`${r}\n  console: ${x.console.join(' | ') || '-'}\n  failed: ${x.failed.join(' | ') || '-'}\n  third-party: ${x.thirdParty.join(' | ') || '-'}`);
  }
  console.log('=== CONSOLE / NETWORK ===\n' + (lines.join('\n') || 'nothing on any page'));
  test.info().annotations.push({ type: 'network', description: lines.join('\n') });
  // Rule: no third-party hosts. The picker talks to api.gbif.org from the browser.
  const third = Object.entries(report).flatMap(([r, x]) => x.thirdParty.map((t) => `${r}: ${t}`));
  expect.soft(third, 'requests to third-party hosts from the browser').toEqual([]);
  // No page errors anywhere.
  const errs = Object.entries(report).flatMap(([r, x]) => x.console.filter((c) => c.startsWith('[pageerror]') || c.startsWith('[error]')).map((c) => `${r}: ${c}`));
  expect.soft(errs, 'console errors').toEqual([]);
});

/* ------------------------------------------------------------------ 2. screenshots at 360 and 1280, overflow */

for (const width of [360, 1280]) {
  test(`render every page at ${width}px: screenshots and horizontal overflow`, async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ viewport: { width, height: width === 360 ? 780 : 900 } });
    const page = await ctx.newPage();
    // One plant of each fixture species, one with a field number and a note.
    const accs: Record<string, string> = {};
    for (const s of SPECIES) accs[s] = await addPlant(page, NAMES[s], { field: s === 'copiapoa-cinerea' ? 'KK 1462' : undefined });
    // A place, so the plant page has a bench to compare with and the labels page has a location.
    await page.goto('/benches');
    await page.getByRole('button', { name: 'New location' }).click();
    await page.fill('#loc-name', 'East sill');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const routes = [...STATIC_ROUTES, ...SPECIES.map((s) => `/plants/${accs[s]}`)];
    const bad: string[] = [];
    for (const r of routes) {
      await page.goto(r);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(500);
      const o = await overflow(page);
      const name = `${width}${r.replace(/\//g, '_') || '_root'}`;
      await shot(page, name);
      if (o.scrollW > o.innerW + 1) bad.push(`${r}: scrollWidth ${o.scrollW} > ${o.innerW}; ${o.wide.join(', ')}`);
    }
    // A bench page with the frost section and edit form open.
    await page.goto('/benches');
    await page.locator('a.row').first().click();
    await page.getByRole('button', { name: 'Edit' }).click();
    await shot(page, `${width}_benches_id_edit`);
    // Plant page with the log form open and the edit form open.
    await page.goto(`/plants/${accs['copiapoa-cinerea']}`);
    await page.getByRole('button', { name: 'Measure' }).click();
    await shot(page, `${width}_plants_acc_measure`);
    await page.getByRole('button', { name: 'Edit' }).click();
    await shot(page, `${width}_plants_acc_edit`);
    const o = await overflow(page);
    if (o.scrollW > o.innerW + 1) bad.push(`/plants/[acc] edit+measure: scrollWidth ${o.scrollW} > ${o.innerW}; ${o.wide.join(', ')}`);
    // Dark scheme, two pages.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/species/copiapoa-cinerea');
    await shot(page, `${width}_dark_species`);
    await page.goto(`/plants/${accs['copiapoa-cinerea']}`);
    await shot(page, `${width}_dark_plant`);
    console.log(`=== OVERFLOW @${width} ===\n` + (bad.join('\n') || 'none'));
    expect.soft(bad, `horizontal overflow at ${width}px`).toEqual([]);
    await ctx.close();
  });
}

/* ------------------------------------------------------------------ 3. the refused-everything species, section by section */

test('Refusia testii: every section says "not checked" rather than showing an absence', async ({ page }) => {
  await page.goto('/species/refusia-testii');
  const body = await page.locator('article.species').innerText();
  // Climate: refused → "Not checked". Good.
  await expect(page.locator('.pill', { hasText: 'Climate not checked' })).toBeVisible();
  await expect(page.getByText('Not checked.', { exact: false })).toBeVisible();
  // Occurrences: refused → stated. Good.
  await expect(page.getByText('The occurrence source did not answer')).toBeVisible();
  // Photographs: gbif.media refused, yet the hero says "No openly licensed photograph yet" (an absence).
  expect.soft(body, 'photo hero renders a refused media source as "no photograph yet"').not.toContain('No openly licensed photograph yet');
  // Literature: the section is simply absent when the source is not ok; here it is "none", so absence is right, but check the wording exists for the refused case.
  expect.soft(body).toContain('Papers');
  // The tab bar promises a Photographs section only when photos.length > 1; for a refused source no tab, no note.
  // Front page tile for this species: climate 'refused' printed as 'no climate'.
  await page.goto('/');
  const tile = page.locator('.tile', { hasText: 'Refusia' });
  await expect(tile).toBeVisible();
  const fig = await tile.locator('.fig').innerText();
  const dotTitle = await tile.locator('.statedot').getAttribute('title');
  console.log(`=== REFUSIA TILE === fig="${fig}" dot title="${dotTitle}" placeholder="${await tile.locator('.im').innerText()}"`);
  expect.soft(fig, 'front tile prints a refused climate as an absence').not.toMatch(/no climate/);
  // The "No climate yet" chip counts it as having none.
  await page.getByRole('button', { name: /No climate yet/ }).click();
  await expect.soft(page.locator('.tile', { hasText: 'Refusia' }), 'refused species listed under "No climate yet"').toHaveCount(0);
  // And a plant of it: the Its-year tile.
  const acc = await addPlant(page, 'Refusia testii');
  await page.goto(`/plants/${acc}`);
  await page.waitForTimeout(800);
  const tileText = await page.locator('.card', { hasText: 'Its year' }).innerText();
  console.log(`=== REFUSIA PLANT its-year tile === ${tileText.replace(/\n/g, ' / ')}`);
  expect.soft(tileText, 'plant tile for a refused climate').not.toMatch(/No habitat climate/);
});

/* ------------------------------------------------------------------ 4. wording on the plant page: verdicts, unsourced figures */

test('plant page: the Its-year tile and the comparison give no verdict and state a source', async ({ page }) => {
  const acc = await addPlant(page, 'Copiapoa cinerea');
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.hvh')).toBeVisible();
  const tile = await page.locator('.card', { hasText: 'Its year' }).innerText();
  console.log(`=== ITS YEAR TILE === ${tile.replace(/\n/g, ' / ')}`);
  // The tile's own words. Any of these is a verdict about the plant, not a comparison of figures.
  expect.soft(tile).not.toMatch(/Rest expected|Growth expected|Winding down|Water when it wakes|Taper water now|beats the calendar|Slows in the extremes/);
  // The tile states no source (CHELSA / the rule) for the season it asserts.
  expect.soft(tile).toMatch(/CHELSA|rainfall curve|read from/i);
  const hvh = await page.locator('.hvh').innerText();
  expect.soft(hvh, 'the "not a verdict" paragraph contains a claim about plant tolerance').not.toMatch(/a dry plant takes cold a wet one does not/);
  // The species page's cultivation sheet: verbs the rules forbid.
  await page.goto('/species/copiapoa-cinerea');
  const sheet = await page.locator('.note-slot').innerText();
  const hits = [...sheet.matchAll(/[^.]*\b(will|won't|rests|tolerat\w*|kills?|fatal|die|dies)\b[^.]*\./gi)].map((m) => m[0].trim()).slice(0, 12);
  console.log('=== SHEET VERDICT SENTENCES ===\n' + hits.join('\n'));
  expect.soft(hits, 'sheet sentences with will/rests/kill/fatal').toEqual([]);
});

/* ------------------------------------------------------------------ 5. accessibility basics */

const a11yScan = (page: Page) => page.evaluate(() => {
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({ l: Number(h.tagName[1]), t: (h.textContent ?? '').trim().slice(0, 40) }));
  const order: string[] = [];
  let prev = 0;
  for (const h of hs) { if (h.l > prev + 1 && prev) order.push(`h${prev} → h${h.l} "${h.t}"`); prev = h.l; }
  const h1s = hs.filter((h) => h.l === 1).length;
  const unlabeled = [...document.querySelectorAll<HTMLElement>('input:not([type=hidden]), select, textarea')].filter((el) => {
    if (el.closest('label')) return false;
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
    if (el.id && document.querySelector(`label[for="${el.id}"]`)) return false;
    return true;
  }).map((el) => `${el.tagName.toLowerCase()}#${el.id || '?'}[placeholder="${el.getAttribute('placeholder') ?? ''}"]`);
  const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).map((i) => i.src.slice(0, 60));
  const emptyButtons = [...document.querySelectorAll<HTMLElement>('button, a')].filter((b) => !(b.textContent ?? '').trim() && !b.getAttribute('aria-label') && !b.getAttribute('title') && !b.querySelector('img[alt]')).length;
  return { order, h1s, unlabeled, noAlt, emptyButtons };
});

test('accessibility: heading order, form labels, alt text, focus visibility, keyboard-only flows', async ({ page }) => {
  test.setTimeout(120_000);
  const acc = await addPlant(page, 'Copiapoa cinerea');
  const findings: string[] = [];
  for (const r of [...STATIC_ROUTES, `/plants/${acc}`]) {
    await page.goto(r);
    await page.waitForTimeout(300);
    if (r.startsWith('/benches')) { /* open the add form so its inputs are scanned */ await page.getByRole('button', { name: 'New location' }).click().catch(() => {}); }
    if (r === `/plants/${acc}`) { await page.getByRole('button', { name: 'Measure' }).click(); await page.getByRole('button', { name: 'Edit' }).click(); }
    const s = await a11yScan(page);
    if (s.order.length) findings.push(`${r}: heading jumps ${s.order.join('; ')}`);
    if (s.h1s !== 1) findings.push(`${r}: ${s.h1s} h1 elements`);
    if (s.unlabeled.length) findings.push(`${r}: unlabeled controls ${s.unlabeled.join(', ')}`);
    if (s.noAlt.length) findings.push(`${r}: images without alt ${s.noAlt.join(', ')}`);
    if (s.emptyButtons) findings.push(`${r}: ${s.emptyButtons} buttons/links with no accessible name`);
  }
  console.log('=== A11Y SCAN ===\n' + findings.join('\n'));
  // Focus visibility: tab through the species page and check the outline is drawn.
  await page.goto('/species/copiapoa-cinerea');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const focus = await page.evaluate(() => { const el = document.activeElement as HTMLElement; const cs = getComputedStyle(el); return { tag: el.tagName, text: (el.textContent ?? '').trim().slice(0, 30), outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor }; });
  console.log('=== FOCUS === ' + JSON.stringify(focus));
  expect.soft(focus.outline, 'focus ring on a tabbed link').toMatch(/solid 2px/);
  // Colour contrast of the muted ink used for every source line and hint.
  const contrast = await page.evaluate(() => {
    const lum = (hex: string) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    return { light_ink3_on_card: ratio('#8a9891', '#ffffff').toFixed(2), light_ink3_on_bg: ratio('#8a9891', '#f3f5f4').toFixed(2), dark_ink3_on_card: ratio('#6f7d77', '#1a201d').toFixed(2), light_ink2_on_card: ratio('#586761', '#ffffff').toFixed(2) };
  });
  console.log('=== CONTRAST (--ink3 is every hint, source line, label and footer) === ' + JSON.stringify(contrast));
  expect.soft(Number(contrast.light_ink3_on_card), 'muted text contrast (WCAG AA 4.5:1)').toBeGreaterThanOrEqual(4.5);
  // Keyboard-only: create a plant.
  await page.goto('/plants/new');
  await page.keyboard.press('Tab'); // Back link
  let steps = 0;
  while (steps++ < 12) { const id = await page.evaluate(() => document.activeElement?.id); if (id === 'species-name') break; await page.keyboard.press('Tab'); }
  expect.soft(steps, 'tabs to reach the species field on /plants/new').toBeLessThan(12);
  await page.keyboard.type('Welwitschia mirabilis');
  await page.keyboard.press('Tab');
  // reach the submit button by tabbing, then Enter
  let reached = false;
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => (document.activeElement as HTMLElement)?.textContent?.trim());
    if (t?.startsWith('Add')) { reached = true; break; }
    await page.keyboard.press('Tab');
  }
  expect.soft(reached, 'keyboard reaches the Add button').toBe(true);
  await page.keyboard.press('Enter');
  await expect.soft(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  // Keyboard-only: the label print flow.
  await page.goto('/labels');
  let printed = false;
  await page.exposeFunction('__qaPrinted', () => { printed = true; });
  await page.evaluate(() => { window.print = () => (window as unknown as { __qaPrinted: () => void }).__qaPrinted(); });
  let ok = false;
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab');
    const id = await page.evaluate(() => document.activeElement?.id);
    if (id === 'lb-print') { ok = true; break; }
  }
  expect.soft(ok, 'keyboard reaches Print on /labels').toBe(true);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect.soft(printed, 'Enter on Print calls window.print').toBe(true);
  expect.soft(findings.filter((f) => /unlabeled|without alt|no accessible name|h1 elements/.test(f)), 'a11y scan findings').toEqual([]);
});

/* ------------------------------------------------------------------ 6. state handling */

test('states: empty collection on every collection page', async ({ page }) => {
  const texts: Record<string, string> = {};
  for (const r of ['/plants', '/benches', '/sowings', '/labels', '/backup', '/sync', '/frost', '/plants/2026-0001', '/benches/nope', '/sowings/S2026-001']) {
    await page.goto(r);
    await page.waitForTimeout(300);
    await expect(page.locator('main')).not.toContainText('Opening your collection');
    texts[r] = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  }
  console.log('=== EMPTY STATES ===\n' + Object.entries(texts).map(([k, v]) => `${k}: ${v.slice(0, 260)}`).join('\n'));
  expect(texts['/plants']).toContain('Nothing here yet');
  expect(texts['/plants/2026-0001']).toContain('No plant with this number');
  expect(texts['/benches/nope']).toContain('No location with that id');
  expect(texts['/sowings/S2026-001']).toContain('No sowing with this number');
  // Labels with nothing: what does it say?
  expect.soft(texts['/labels']).toMatch(/No plants|Nothing/);
});

test('states: a plant whose species has no dossier, a species with no climate, a plant with no photos', async ({ page }) => {
  const acc = await addPlant(page, 'Nonsensia fakeii');
  await page.goto(`/plants/${acc}`);
  await page.waitForTimeout(1000);
  const tile = await page.locator('.card', { hasText: 'Its year' }).innerText();
  console.log(`=== NO-DOSSIER TILE === ${tile.replace(/\n/g, ' / ')}`);
  expect(tile).toContain('No species page');
  // The hvh section must be absent, and the "Species page" button leads to a 404 with a way forward.
  await expect(page.locator('.hvh')).toHaveCount(0);
  await page.getByRole('link', { name: 'Species page' }).click();
  await expect(page.getByText('no dossier yet')).toBeVisible();
  const promise = await page.locator('.err').innerText();
  console.log(`=== 404 TEXT === ${promise}`);
  // "one will be prepared": is there anything that prepares one? (grep shows no queue in the app.)
  // Welwitschia: climate pending → the plant tile.
  const w = await addPlant(page, 'Welwitschia mirabilis');
  await page.goto(`/plants/${w}`);
  await page.waitForTimeout(1000);
  const wt = await page.locator('.card', { hasText: 'Its year' }).innerText();
  console.log(`=== PENDING-CLIMATE TILE === ${wt.replace(/\n/g, ' / ')}`);
  expect.soft(wt, 'pending climate rendered as "No habitat climate"').not.toContain('No habitat climate');
  await expect(page.locator('.hvh')).toHaveCount(0);
  // No photos: the hero offers the species photo and an add row; nothing broken.
  await expect(page.locator('.hero .cred, .hero .ph')).toHaveCount(1);
  await expect(page.locator('#acc-photo-file')).toBeAttached();
  await page.goto('/species/welwitschia-mirabilis');
  const clim = await page.locator('#s-climate + *').innerText();
  console.log(`=== WELWITSCHIA CLIMATE SECTION === ${clim}`);
});

test('states: very long and unicode names through the whole path', async ({ page }) => {
  const long = 'Pseudolithocarpodendron magnificentissimum-extraordinarissimum subsp. longissimumverbosum var. interminabilis';
  const uni = 'Ægilops × Ærösüñ ‘Şträngé Nämé 名前 🌵’';
  const a1 = await addPlant(page, long, { field: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789-ABCDEFGHIJ' });
  const a2 = await addPlant(page, uni);
  for (const [w, h] of [[360, 780], [1280, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const [n, a] of [['long', a1], ['uni', a2]] as const) {
      await page.goto(`/plants/${a}`);
      await page.waitForTimeout(400);
      const o = await overflow(page);
      await shot(page, `${w}_name_${n}_plant`);
      expect.soft(o.scrollW, `${n} name overflow on plant page at ${w}`).toBeLessThanOrEqual(o.innerW + 1);
      const crumb = await page.locator('#topbar .crumb').innerText();
      console.log(`=== CRUMB ${n} @${w} === ${crumb}`);
    }
    await page.goto('/plants');
    await page.waitForTimeout(300);
    const o = await overflow(page);
    await shot(page, `${w}_name_list`);
    expect.soft(o.scrollW, `list overflow at ${w}`).toBeLessThanOrEqual(o.innerW + 1);
    await page.goto('/labels');
    await page.waitForTimeout(600);
    await shot(page, `${w}_name_labels`);
    const clipped = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.page .label .txt')].map((t) => ({ sh: t.scrollHeight, ch: t.clientHeight, sw: t.scrollWidth, cw: t.clientWidth })));
    console.log(`=== LABEL TEXT BOXES @${w} === ${JSON.stringify(clipped)}`);
  }
  // Unicode name survives the search.
  await page.goto('/plants');
  await expect(page.locator('a.accrow')).toHaveCount(2);
  await page.fill('#plants-q', '名前');
  await expect(page.locator('a.accrow')).toHaveCount(1);
  await page.fill('#plants-q', 'ærösüñ');
  await expect(page.locator('a.accrow')).toHaveCount(1);
});

test('states: a collection of 600 plants, list performance and search', async ({ page }) => {
  test.setTimeout(240_000);
  for (const n of ['Copiapoa cinerea', 'Welwitschia mirabilis', 'Refusia testii']) await addPlant(page, n, { count: 200 });
  await page.goto('/plants');
  const t0 = Date.now();
  await expect(page.locator('a.accrow')).toHaveCount(600, { timeout: 60_000 });
  const listMs = Date.now() - t0;
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
  const t1 = Date.now();
  await page.fill('#plants-q', '2026-0333');
  await expect(page.locator('a.accrow')).toHaveCount(1);
  const searchMs = Date.now() - t1;
  const t2 = Date.now();
  await page.fill('#plants-q', 'refusia');
  await expect(page.locator('a.accrow')).toHaveCount(200);
  const search2Ms = Date.now() - t2;
  // Typing latency: how long a single keystroke blocks.
  await page.fill('#plants-q', '');
  const typeMs = await page.evaluate(async () => { const el = document.querySelector<HTMLInputElement>('#plants-q')!; const t = performance.now(); el.value = 'c'; el.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); return Math.round(performance.now() - t); });
  // Other pages that walk the whole collection.
  const t3 = Date.now();
  await page.goto('/labels');
  await expect(page.locator('.pick')).toHaveCount(600, { timeout: 60_000 });
  const labelsMs = Date.now() - t3;
  const t4 = Date.now();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.pill', { hasText: 'you grow 200' })).toBeVisible({ timeout: 60_000 });
  const speciesMs = Date.now() - t4;
  const t5 = Date.now();
  await page.goto('/');
  await page.getByRole('button', { name: /You grow/ }).click();
  await expect(page.locator('.tile')).toHaveCount(3, { timeout: 60_000 });
  const frontMs = Date.now() - t5;
  console.log(`=== 600 PLANTS === list ${listMs} ms (dcl ${nav.dcl}, load ${nav.load}); search by number ${searchMs} ms; search by name ${search2Ms} ms; one keystroke ${typeMs} ms; labels page ${labelsMs} ms; species page ${speciesMs} ms; front "you grow" ${frontMs} ms`);
  expect.soft(listMs, 'plants list with 600 plants').toBeLessThan(3000);
  expect.soft(typeMs, 'one keystroke in search').toBeLessThan(200);
  expect.soft(labelsMs, 'labels page with 600 plants').toBeLessThan(5000);
});

/* ------------------------------------------------------------------ 7. the service worker as a user meets it */

test('service worker: offline navigation to a plant page and to an unread species page', async ({ browser }) => {
  const ctx: BrowserContext = await browser.newContext();
  const page = await ctx.newPage();
  const acc = await addPlant(page, 'Copiapoa cinerea');
  await page.goto('/species/copiapoa-cinerea');
  // wait for the worker to be active and controlling, and for the precache to be complete
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).length; }), { timeout: 20_000 }).toBeGreaterThan(20);
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).map((r) => new URL(r.url).pathname).filter((p) => !p.startsWith('/_app/')); });
  console.log('=== SW CACHE (non-build) === ' + cached.join(' '));
  await ctx.setOffline(true);
  const texts: Record<string, string> = {};
  for (const r of [`/plants/${acc}`, '/species/copiapoa-cinerea', '/species/welwitschia-mirabilis', '/', '/labels', '/benches', '/sowings/new']) {
    try {
      const res = await page.goto(r, { timeout: 15_000 });
      await page.waitForTimeout(1500);
      const ctl = await page.evaluate(() => !!navigator.serviceWorker.controller);
      texts[r] = `[${res?.status()} sw=${ctl}] ` + (await page.locator('main, body').first().innerText()).replace(/\s+/g, ' ').slice(0, 140);
    } catch (e) {
      texts[r] = `NAVIGATION FAILED: ${(e as Error).message.split('\n')[0]}`;
    }
  }
  console.log('=== OFFLINE ===\n' + Object.entries(texts).map(([k, v]) => `${k}: ${v}`).join('\n'));
  expect.soft(texts[`/plants/${acc}`]).toContain('Copiapoa');
  expect.soft(texts['/species/copiapoa-cinerea']).toContain('Copiapoa cinerea');
  expect.soft(texts['/species/welwitschia-mirabilis']).toMatch(/No connection|offline/i);
  // A plant page offline: the Its-year tile depends on /api/dossier, which the worker caches under /api/dossier/; the index (/api/index) is never cached.
  await page.goto(`/plants/${acc}`).catch(() => {});
  await page.waitForTimeout(1500);
  const tile = await page.locator('.card', { hasText: 'Its year' }).innerText().catch(() => 'no tile');
  console.log(`=== OFFLINE ITS-YEAR TILE === ${tile.replace(/\n/g, ' / ')}`);
  expect.soft(tile, 'offline plant page: the dossier tile should not spin forever or say "No species page"').not.toMatch(/reading the species dossier|No species page/);
  await ctx.setOffline(false);
  await ctx.close();
});

/* ------------------------------------------------------------------ 8. a failed index or dossier fetch on the plant page */

test('plant page: an unreachable index or dossier is not rendered as "not in the reference"', async ({ page }) => {
  const acc = await addPlant(page, 'Copiapoa cinerea');
  await page.route('**/api/index', (r) => r.abort());
  await page.goto(`/plants/${acc}`);
  await page.waitForTimeout(1200);
  const t1 = await page.locator('.card', { hasText: 'Its year' }).innerText();
  console.log(`=== INDEX UNREACHABLE TILE === ${t1.replace(/\n/g, ' / ')}`);
  expect.soft(t1, 'index fetch failure rendered as an absence').not.toMatch(/No species page|Not in the reference yet/);
  // (A 503 from /api/dossier cannot be probed here: the service worker answers it from its cache before page.route sees it.)
});

test('bench form: the µ in "µmol" survives the uppercase label style', async ({ page }) => {
  await page.goto('/benches');
  await page.getByRole('button', { name: 'New location' }).click();
  await page.fill('#loc-name', 'Bench A');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('a.row').first().click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const shown = await page.evaluate(() => { const l = [...document.querySelectorAll('form label > span')].find((s) => /mol/.test(s.textContent ?? ''))!; return { text: l.textContent, transform: getComputedStyle(l).textTransform, rendered: (l.textContent ?? '').toUpperCase() }; });
  console.log(`=== µ LABEL === ${JSON.stringify(shown)}`);
  expect.soft(shown.rendered, 'µ uppercased to Greek capital mu / M').not.toMatch(/MMOL|ΜMOL/);
});

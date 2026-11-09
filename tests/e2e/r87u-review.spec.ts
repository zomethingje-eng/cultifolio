/**
 * Round eighty-seven, the fix of the independent review of stage 1, in the browser over the fixture corpus.
 *
 * S2. On a grower's device the visitor's lead, facts line and Browse are not painted before hydration (/about/how: "on a
 *     device that holds plants of its own, the front page shows no such figure"). On the base they were visible.
 * S7. On a phone's first screen (390 × 664, 375 × 548, 360 × 640) one sentence says what the site is, under the figure
 *     and over its photograph. On the base the first screen held the figure and the photograph alone.
 * S6. The lead's photograph is the one preloaded, not the strip's first, which a desktop's first screen does not show.
 * B1. The front page's "By region" count is /region's, and no row says "on a map".
 * S1. The fixture's index counts no cultivated observations: /browse?grown=1 is not "0 species", the rail says "not
 *     counted", "most grown" is not offered, and a genus page says "not counted".
 * S4. The browse pages' HTML is kept by the browser alone.
 * M3. "/" while the menu is open leaves the focus in the menu.
 * M4. The box's "kept on this device" reaches a screen reader: in the live status and the box's description.
 */
import { test, expect, type Browser, type Page } from '@playwright/test';
import { ready } from './helpers/smoke';
import { servePhotos } from './r62w-shapes';

test.use({ serviceWorkers: 'block' });

const PHONE = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
async function phonePage(browser: Browser, baseURL: string | undefined, width: number, height: number): Promise<Page> {
  const ctx = await browser.newContext({ baseURL, viewport: { width, height }, ...PHONE, locale: 'en-GB', serviceWorkers: 'block' });
  return ctx.newPage();
}

test('r87u 1: on a grower\'s device the lead, the facts line and Browse are never painted before the app is ready (S2)', async ({ page }) => {
  // The scripts never arrive, so the page stays as the server drew it, before hydration: what the first paint shows.
  await page.route(/\/_app\/immutable\/.*\.js$/, (r) => r.abort());
  await page.goto('/');
  const seen = () => page.evaluate(() => ['section.lead', 'section.factsline', 'section.browselate', '.featured'].map((s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).visibility : 'absent'; }));
  // A visitor's device paints them (the lead is the visitor's page).
  expect(await seen()).toEqual(['visible', 'visible', 'visible', 'visible']);
  await page.addInitScript(() => { try { localStorage.setItem('cultifolio.hasMine', '1'); } catch { /* the test fails below */ } });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.dataset.grower)).toBe('1');
  // On the base: ['visible', 'visible', 'visible', 'hidden'].
  expect(await seen()).toEqual(['hidden', 'hidden', 'hidden', 'hidden']);
  // No other page's `.lead` is hidden by the rule: /region's lead paragraph is painted on a grower's device.
  await page.goto('/region');
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('p.lead')!).visibility)).toBe('visible');
});

test('r87u 2: a phone\'s first screen says what the site is, under the figure and over its photograph (S7)', async ({ browser, baseURL }) => {
  for (const [w, h] of [[390, 664], [375, 548], [360, 640]] as const) {
    const page = await phonePage(browser, baseURL, w, h);
    await servePhotos(page);
    await page.goto('/'); await ready(page);
    await page.evaluate(() => document.fonts.ready);
    const m = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const tab = document.getElementById('tabbar');
      return { h1: r('section.lead h1'), what: r('section.lead .leadwhat'), photo: r('section.lead .leadph'), tabTop: tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : innerHeight, text: document.querySelector('section.lead .leadwhat')!.textContent };
    });
    const at = `${w} × ${h}: ${JSON.stringify(m)}`;
    expect(m.text, at).toMatch(/^5 plant species, named as Kew names them, with their wild records and, for \d+, the climate where they grow\. Free, with no account and no tracking\.$/);
    expect(m.what.height, at).toBeGreaterThan(0);
    expect(m.what.top, at).toBeGreaterThanOrEqual(m.h1.bottom - 0.5); // directly under the figure
    expect(m.what.top - m.h1.bottom, at).toBeLessThan(24);
    expect(m.what.bottom, at).toBeLessThanOrEqual(m.photo.top + 0.5); // over the photograph
    expect(m.what.bottom, at).toBeLessThanOrEqual(m.tabTop); // on the first screen, above the tab bar
    await page.context().close();
  }
});

test('r87u 3: a desktop has the facts line for it, and the sentence is not drawn twice (S7)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/'); await ready(page);
  await expect(page.locator('section.lead .leadwhat')).toBeHidden();
  await expect(page.locator('.factsline p')).toBeVisible();
});

test('r87u 4: the lead\'s photograph is preloaded, the strip\'s is not (S6)', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const src = await page.locator('section.lead .leadph img').getAttribute('src');
  const preloads = await page.locator('head link[rel="preload"][as="image"]').evaluateAll((ls) => ls.map((l) => [l.getAttribute('href'), l.getAttribute('fetchpriority')]));
  // On the base: the strip's first tile at 'small', and nothing of the lead's.
  expect(preloads).toEqual([[src, 'high']]);
});

test('r87u 5: the Browse table\'s region count is /region\'s, and it says no map (B1) @phone', async ({ page }) => {
  await page.goto('/'); await ready(page);
  const row = page.locator('table.browse tr').first();
  await expect(row.locator('a')).toHaveText('By region');
  await expect(row.locator('td.note')).toHaveText("TDWG's botanical countries, continent by continent");
  const n = (await row.locator('td.n').innerText()).trim();
  await page.goto('/region'); await ready(page);
  // /region: "… and the 14 "botanical countries" Kew gives ranges in." On the base the front page said 3.
  await expect(page.locator('p.lead')).toContainText(`the ${n} "botanical countries"`);
  expect(Number(n)).toBeGreaterThan(3);
});

test('r87u 6: not counted is said, never shown as 0, on /browse and an entrance page (S1) @phone', async ({ page }) => {
  await page.goto('/browse?grown=1'); await ready(page);
  await expect(page.locator('.bv .head .count')).toHaveText('5 species'); // the base: "0 species"
  await expect(page.locator('.bv .wide').first()).toHaveText('Grown, per iNaturalist, is not counted in this build of the reference, so this view is not narrowed by it.');
  await expect(page.locator('.bv .sort')).toHaveText('Order: A–Z (most grown is not counted in this build)');
  if (await page.locator('.phonebar .filters').isVisible()) await page.locator('.phonebar .filters').click();
  const flag = page.locator('#bv-rail input[name="grown"]');
  await expect(flag).toBeDisabled();
  await expect(page.locator('#bv-rail label:has(input[name="grown"]) .n')).toHaveText('not counted');
  await page.goto('/genus/copiapoa'); await ready(page);
  await expect(page.locator('.ehead .sub')).toContainText('grown, per iNaturalist: not counted');
  await expect(page.locator('.ehead .sub')).not.toContainText('0 grown');
  await page.goto('/region/namibia'); await ready(page);
  await expect(page.locator('table.figs tr', { hasText: 'Grown, per iNaturalist' }).locator('td')).toHaveText('not counted');
});

test('r87u 7: the browse pages\' HTML is kept by the browser alone (S4)', async ({ request }) => {
  for (const path of ['/browse', '/browse?view=list', '/region', '/region/namibia', '/genus', '/genus/copiapoa', '/family', '/family/cactaceae']) {
    const r = await request.get(path, { maxRedirects: 0 });
    expect(r.status(), path).toBe(200);
    expect(r.headers()['cache-control'], path).toBe('private, max-age=60');
  }
  const moved = await request.get('/browse?utm_source=x', { maxRedirects: 0 });
  expect(moved.status()).toBe(301);
  expect(moved.headers()['location']).toBe('/browse');
});

test('r87u 8: "/" while the menu is open leaves the focus in the menu (M3)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('button.menubtn').click();
  const menu = page.locator('#menu');
  await expect(menu).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.getElementById('menu')?.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('/');
  // On the base the cursor went to the top bar's box, behind the menu.
  expect(await page.evaluate(() => !!document.getElementById('menu')?.contains(document.activeElement))).toBe(true);
  await expect(page.locator('#topbar .site-search input')).not.toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await page.keyboard.press('/');
  await expect(page.locator('#topbar .site-search input')).toBeFocused();
});

test('r87u 9: the box\'s reason for no rows reaches a screen reader: the live status and the box\'s description (M4); its browse rows are asked under the corpus and the build (M5)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/suggest?')) asked.push(r.url()); });
  await page.goto('/browse'); await ready(page);
  const box = page.getByRole('combobox', { name: 'Search the reference' });
  await box.fill('copiapoa');
  await expect(page.getByRole('listbox', { name: 'Suggestions' }).getByRole('group', { name: 'Browse' })).toBeVisible();
  // On the base: "/api/suggest?q=copiapoa", kept by the edge five minutes under the text alone.
  expect(asked.length).toBeGreaterThan(0);
  const corpus = ((await (await page.request.get('/api/corpus')).json()) as { id: string }).id;
  for (const u of asked) expect(new URL(u).searchParams.get('c'), u).toBe(corpus);
  for (const u of asked) expect(new URL(u).searchParams.get('v'), u).toBeTruthy();
  await box.fill('2026-0013');
  const KEPT = 'Not searched: it is shaped like one of your plant numbers, which stay on this device.';
  // On the base the status said "0 suggestions", and the note was a presentation inside the listbox.
  await expect(page.locator('form.sitesearch [role="status"]')).toHaveText(KEPT);
  await expect(box).toHaveAccessibleDescription(new RegExp(KEPT.replace(/[.]/g, '\\.')));
  expect(await page.getByRole('listbox', { name: 'Suggestions' }).locator('[role="presentation"]').count()).toBe(0);
});

test('r87u 10: a not-found page links the browse pages only where the server says they are there (B2)', async ({ page }) => {
  // A client-side visit to a species address the reference does not hold: its error comes in the page's data, where the
  // server marks it (`browse`). The fixture has a browse table, so it is marked true; here it is also changed to false, as
  // a corpus with no `browse.json` marks it, and the line is then left out.
  for (const mark of [true, false]) {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route(/\/species\/no-such-plantx\/__data\.json/, async (route) => {
      const res = await route.fetch();
      const [first, ...rest] = (await res.text()).split('\n');
      const j = JSON.parse(first) as { type: string; error?: { browse?: boolean }; nodes?: Array<{ type: string; error?: { browse?: boolean } } | null> };
      const errors = [j, ...(j.nodes ?? [])].filter((n): n is { type: string; error: { browse?: boolean } } => !!n && n.type === 'error' && !!n.error);
      expect(errors.length).toBeGreaterThan(0);
      for (const n of errors) { expect(n.error.browse).toBe(true); n.error.browse = mark; }
      const headers = Object.fromEntries(Object.entries(res.headers()).filter(([k]) => !/^(content-length|transfer-encoding|content-encoding)$/i.test(k)));
      await route.fulfill({ status: res.status(), headers, body: [JSON.stringify(j), ...rest].join('\n') });
    });
    await page.goto('/about'); await ready(page);
    await page.evaluate(() => { const a = document.createElement('a'); a.href = '/species/no-such-plantx'; a.id = 'r87u-to'; a.textContent = 'to'; document.body.appendChild(a); });
    await page.locator('#r87u-to').click();
    await expect(page).toHaveURL(/\/species\/no-such-plantx$/);
    await expect(page.locator('h1')).toHaveText('Not found');
    // On the base the line was drawn whatever the corpus held.
    await expect(page.locator('p.browse')).toHaveCount(mark ? 1 : 0);
  }
  // A whole page of an address no route has, drawn by the server: the fixture has its table, so the line is there.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.goto('/no-such-page'); await ready(page);
  await expect(page.locator('p.browse a')).toHaveText(['region', 'genus', 'family']);
});

/**
 * Round seventy-six, agent P: the front page's photograph strip on a phone, and the credits under photographs.
 *
 * 1. Placement (the owner's decision). Round sixty-three (V4) drew the strip after the first three catalogue rows on a
 *    phone, a second copy beside the desktop's; on the owner's iPhone it read as three random plants dropped into the A
 *    section of the list. The strip is now drawn once, between the welcome and the search, at every width, and the list
 *    under the search is unbroken.
 * 2. Credits. The strip's credit was cut after two lines ("Photo: CC BY, Sandy…" on the owner's iPhone), and so were the
 *    catalogue's tiles and the species page's related strip; the species page's hero cut the author's line at an
 *    ellipsis. Rule 4 wants the licence and the author readable: every credit is whole now, on as many lines as it takes,
 *    and the tiles of a row share the tallest one's height.
 *
 * Each test failed on r76base. The credits are made long here (the live corpus's own names) by writing them into the
 * drawn page: the fixture's photographs are credited "grower0" and "iNaturalist", which fit any box.
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { servePhotos, liveShapedHome } from './r62w-shapes';
import { rootText } from './helpers/text-size';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }

const PHONE = { isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
async function context(browser: Browser, baseURL: string | undefined, width: number, height: number, text = 100): Promise<BrowserContext> {
  const ctx = await browser.newContext({ baseURL, viewport: { width, height }, ...(width <= 700 ? PHONE : {}), locale: 'en-GB', serviceWorkers: 'block' });
  if (text !== 100) await rootText(ctx, text);
  return ctx;
}

/** The front page drawn from the live-shaped data (twelve photographs that load, 25 letters, ten A rows), by a client-side visit. */
async function liveHome(page: Page) {
  await servePhotos(page);
  await liveShapedHome(page);
  await page.goto('/about/how');
  await ready(page);
  await page.locator('a[href="/"]:visible').first().click();
  await page.waitForURL(/\/$/);
  await expect(page.locator('.letters a')).toHaveCount(25);
  await expect(page.locator('section.featured .ftile').first()).toBeAttached();
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('section.featured img')].filter((i) => i.offsetParent !== null).slice(0, 3).every((i) => i.complete && i.naturalWidth > 0));
  await page.evaluate(() => document.fonts.ready);
}

/** Where the drawn strip, the search and the catalogue rows are, in page coordinates, and what lies between the strip and the search. */
const placement = (page: Page) => page.evaluate(() => {
  const y = (e: Element) => e.getBoundingClientRect().top + scrollY;
  const strips = [...document.querySelectorAll<HTMLElement>('section.featured')];
  const drawn = strips.filter((e) => e.offsetParent !== null);
  const search = document.querySelector('.toolrow .searchbar')!;
  const tab = document.getElementById('tabbar');
  const s = drawn[0];
  const between = s ? [...document.querySelectorAll('.rows .grow')].filter((r) => y(r) >= y(s) + s.offsetHeight - 1 && y(r) < y(search)).length : -1;
  return {
    inPage: strips.length,
    drawn: drawn.length,
    stripTop: s ? y(s) : NaN,
    stripBottom: s ? y(s) + s.getBoundingClientRect().height : NaN,
    searchTop: y(search),
    searchBottom: search.getBoundingClientRect().bottom,
    rowTop: y(document.querySelector('.rows .grow')!),
    tabTop: tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : innerHeight,
    // Rows drawn between the strip and the search, and whether the strip sits inside the list.
    between,
    inList: !!s?.closest('.rows')
  };
});

test('r76p strip 1: on a 390 px phone the strip is above the search, drawn once, and no catalogue row sits between them', { tag: '@phone' }, async ({ browser, baseURL }) => {
  for (const live of [false, true]) {
    const ctx = await context(browser, baseURL, 390, 664);
    const page = await ctx.newPage();
    if (live) await liveHome(page);
    else { await servePhotos(page); await page.goto('/'); await ready(page); }
    const m = await placement(page);
    // On r76base: two strips in the page, and the one drawn followed the first rows, inside the list.
    expect(m.inPage, live ? 'live-shaped' : 'fixture').toBe(1);
    expect(m.drawn).toBe(1);
    expect(m.inList).toBe(false);
    expect(m.stripBottom).toBeLessThanOrEqual(m.searchTop);
    expect(m.between).toBe(0);
    expect(m.searchTop).toBeLessThan(m.rowTop);
    // The search is still on the owner's first screen: Safari's page on an iPhone 12 to 15.
    expect(m.searchBottom, `the search's foot against the tab bar at ${m.tabTop}`).toBeLessThanOrEqual(m.tabTop);
    // No image in the strip is a placeholder pixel for a hidden copy: what a phone fetches is what it shows.
    expect(await page.locator('section.featured picture, section.featured source').count()).toBe(0);
    await ctx.close();
  }
});

/*
 * The desktop's strip, search and first row where r76base drew them on the fixture (measured there at 1280 × 800 and
 * 1024 × 768, a visitor with the welcome shown), and its photographs fetched as before: the first preloaded, the first
 * three at once, the first two with priority.
 */
const DESKTOP_BASE: Record<string, { stripTop: number; stripBottom: number; searchTop: number; rowTop: number; tile: [number, number] }> = {
  '1280': { stripTop: 307, stripBottom: 496, searchTop: 510, rowTop: 655, tile: [155, 179] },
  '1024': { stripTop: 307, stripBottom: 496, searchTop: 510, rowTop: 654, tile: [155, 179] }
};

test('r76p strip 2: the desktop is unchanged: the same strip at the same place, its photographs fetched as before, and no second copy in the page', async ({ browser, baseURL }) => {
  for (const [w, h] of [[1280, 800], [1024, 768]] as const) {
    const ctx = await context(browser, baseURL, w, h);
    const page = await ctx.newPage();
    await servePhotos(page);
    await page.goto('/');
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    const m = await placement(page);
    const tile = (await page.locator('section.featured .ftile').first().boundingBox())!;
    const got = { stripTop: Math.round(m.stripTop), stripBottom: Math.round(m.stripBottom), searchTop: Math.round(m.searchTop), rowTop: Math.round(m.rowTop), tile: [Math.round(tile.width), Math.round(tile.height)] };
    console.log(`r76p strip 2: ${w} × ${h}: ${JSON.stringify(got)}`);
    // Within 2 px of the base build's figures, measured in Chromium: WebKit and Firefox set the same text a pixel apart (the
    // owner's run: 654 against 655, 496 against 497), which is no change of layout.
    const base = DESKTOP_BASE[String(w)];
    const near = (a: number, b: number) => Math.abs(a - b) <= 2;
    expect.soft(near(got.stripTop, base.stripTop) && near(got.stripBottom, base.stripBottom) && near(got.searchTop, base.searchTop) && near(got.rowTop, base.rowTop) && near(got.tile[0], base.tile[0]) && near(got.tile[1], base.tile[1]), `${w} × ${h}: ${JSON.stringify(got)} against ${JSON.stringify(base)}`).toBe(true);
    expect.soft(m.drawn).toBe(1);
    expect.soft(m.stripBottom).toBeLessThanOrEqual(m.searchTop);
    // On r76base the page held a second, hidden copy for a phone.
    expect.soft(m.inPage).toBe(1);
    const img = page.locator('section.featured .ftile img').first();
    await expect.soft(img).toHaveAttribute('loading', 'eager');
    await expect.soft(img).toHaveAttribute('fetchpriority', 'high');
    await expect.soft(page.locator('head link[rel="preload"][as="image"]')).toHaveAttribute('href', /\/small\.jpe?g$/);
    await ctx.close();
  }
});

/** Long credits from the live corpus, written into the tiles in turn: each wraps to three lines or more in a 112 px tile. */
const LONG = ['Photo: CC BY, Sandy Wolkenberg', 'Photo: CC BY, Николай Соболев', 'Photo: CC BY, Ricard Busquets Reverte', 'Photo: CC BY-SA, Dilrukshan Priyantha Wijesinghe', 'Photo: CC0'];

/** Every credit in the boxes `tiles` names: its text whole (nothing scrolled out of its box) and inside its tile; and the tiles' heights. */
const fit = (page: Page, tiles: string, cred: string) => page.evaluate(([tSel, cSel]) => {
  return [...document.querySelectorAll<HTMLElement>(tSel)].filter((t) => t.offsetParent !== null && t.getBoundingClientRect().height > 0).map((t) => {
    const c = t.querySelector<HTMLElement>(cSel);
    const tr = t.getBoundingClientRect();
    if (!c) return { text: '', whole: true, inside: true, lines: 0, tile: tr.height };
    const cr = c.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(c).lineHeight) || parseFloat(getComputedStyle(c).fontSize) * 1.2;
    return {
      text: c.textContent ?? '',
      whole: c.scrollHeight <= c.clientHeight + 1 && c.scrollWidth <= c.clientWidth + 1 && getComputedStyle(c).textOverflow !== 'ellipsis' && (getComputedStyle(c).webkitLineClamp || 'none') === 'none',
      inside: cr.top >= tr.top - 0.5 && cr.bottom <= tr.bottom + 0.5 && cr.left >= tr.left - 0.5 && cr.right <= tr.right + 0.5,
      lines: Math.round((cr.height - parseFloat(getComputedStyle(c).paddingTop) - parseFloat(getComputedStyle(c).paddingBottom)) / lh),
      tile: tr.height
    };
  });
}, [tiles, cred] as const);

test('r76p strip 3: a credit long enough to wrap is whole inside its card at 320 and 390 px and on a desktop, at 100% and 200% text, and the row stays even', { tag: '@phone' }, async ({ browser, baseURL }) => {
  for (const [w, h, text] of [[320, 568, 100], [390, 664, 100], [1280, 800, 100], [390, 664, 200], [1280, 800, 200]] as const) {
    const ctx = await context(browser, baseURL, w, h, text);
    const page = await ctx.newPage();
    await liveHome(page);
    await page.evaluate((long) => {
      const strip = [...document.querySelectorAll<HTMLElement>('section.featured')].find((e) => e.offsetParent !== null)!;
      strip.querySelectorAll<HTMLElement>('.ftile .fcred').forEach((c, i) => { c.textContent = long[i % long.length]; });
    }, LONG);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const at = `${w} px, ${text}% text`;
    const cards = await fit(page, 'section.featured .ftile', '.fcred');
    expect(cards.length, at).toBeGreaterThanOrEqual(6);
    for (const c of cards) {
      expect(c.whole, `${at}: "${c.text}" cut`).toBe(true);
      expect(c.inside, `${at}: "${c.text}" outside its card`).toBe(true);
    }
    // The case the owner saw: a credit of three lines or more, whole.
    expect(Math.max(...cards.map((c) => c.lines)), at).toBeGreaterThanOrEqual(w <= 700 || text > 100 ? 3 : 2);
    const heights = cards.map((c) => c.tile);
    expect(Math.max(...heights) - Math.min(...heights), `${at}: the row's cards are not one height`).toBeLessThan(1);
    // A name cut to one line is whole in the link's name (the fourth tile, drawn at every width).
    const hw = page.locator('section.featured:visible a.ftile[href="/species/haworthiopsis-attenuata"]');
    if (w <= 700) expect(await hw.locator('.fnm').evaluate((e) => e.scrollWidth > e.clientWidth), `${at}: the name is cut, so the link's name is what holds it`).toBe(true);
    await expect(hw).toHaveAccessibleName(/Haworthiopsis attenuata.*Zebra plant/);
    await ctx.close();
  }
});

test('r76p strip 4: every other credit under a photograph is whole: the catalogue\'s tiles, the species page\'s hero and related strip, and Compare', async ({ browser, baseURL }) => {
  // Sixteen page loads in four contexts: 10 to 11 s alone, on r77base and on round seventy-seven's merge alike, and past
  // the default 30 s beside three other workers on two cores, on both (round seventy-seven, the merge: 2 of 3 on r77base,
  // 3 of 3 merged, and twice in the merged code's whole strict run). The time is the test's, not the pages'.
  test.setTimeout(90_000);
  for (const [w, h, text] of [[320, 568, 100], [390, 664, 100], [1280, 800, 100], [390, 664, 200]] as const) {
    const at = `${w} px, ${text}% text`;
    const ctx = await context(browser, baseURL, w, h, text);
    const page = await ctx.newPage();
    await servePhotos(page);
    // The catalogue's tiles, in an opened row.
    await page.goto('/?by=genus&open=copiapoa');
    await ready(page);
    await expect(page.locator('.hgrid.opened a.tile .cred').first()).toBeVisible();
    await page.evaluate((long) => document.querySelectorAll<HTMLElement>('.hgrid.opened a.tile .cred').forEach((c, i) => { c.textContent = long[(i + 3) % long.length]; }), LONG);
    for (const c of await fit(page, '.hgrid.opened a.tile', '.cred')) {
      expect(c.whole, `${at}: tile "${c.text}" cut`).toBe(true);
      expect(c.inside, `${at}: tile "${c.text}" outside its card`).toBe(true);
    }
    // The species page: the hero's credit, licence first and the author's line whole, clear of the name card.
    await page.goto('/species/copiapoa-cinerea');
    await ready(page);
    await expect(page.locator('.hero .cred .by')).toBeVisible();
    await page.evaluate(() => { document.querySelector('.hero .cred .by')!.textContent = '(c) Dilrukshan Priyantha Wijesinghe, some rights reserved (CC BY) · observed growing wild · 2020-07-24'; });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const hero = await page.evaluate(() => {
      const c = document.querySelector<HTMLElement>('.hero .cred')!;
      const box = c.closest('.hero')!.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const parts = [c, ...c.querySelectorAll<HTMLElement>('span')];
      const foot = document.elementFromPoint(cr.left + 6, cr.bottom - 3);
      // An inline span has no box of its own to cut: its client size is 0, and Firefox gives it a scroll size (the owner's run,
      // 1280 px, where the spans are inline). Only the boxes that could clip are measured.
      return { whole: parts.filter((e) => getComputedStyle(e).display !== 'inline').every((e) => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1), inside: cr.bottom <= box.bottom + 0.5 && cr.top >= box.top - 0.5, footShown: !!foot && (foot === c || c.contains(foot)) };
    });
    expect(hero.whole, `${at}: the hero's credit cut`).toBe(true);
    expect(hero.inside, `${at}: the hero's credit outside the photograph`).toBe(true);
    expect(hero.footShown, `${at}: the hero's credit under the name card`).toBe(true);
    // The related strip, on a page whose related tiles have a photograph (Copiapoa cinerea's, on Copiapoa humilis's page).
    await page.goto('/species/copiapoa-humilis');
    await ready(page);
    await expect(page.locator('.reltile .rc').first()).toBeAttached();
    await page.evaluate((long) => document.querySelectorAll<HTMLElement>('.reltile .rc').forEach((c, i) => { c.textContent = long[(i + 1) % long.length]; }), LONG);
    const rel = await fit(page, '.relstrip .reltile:not(.more)', '.rc');
    expect(rel.length).toBeGreaterThan(0);
    for (const c of rel) {
      expect(c.whole, `${at}: related "${c.text}" cut`).toBe(true);
      expect(c.inside, `${at}: related "${c.text}" outside its card`).toBe(true);
    }
    // Compare's credit under each photograph (whole on r76base too; kept so it stays so).
    await page.goto('/compare?s=copiapoa-cinerea,copiapoa-humilis');
    await ready(page);
    const cmp = page.locator('.cmp .head .cred');
    if (await cmp.count()) {
      await cmp.first().evaluate((c) => { c.textContent = 'CC BY-SA · (c) Dilrukshan Priyantha Wijesinghe, some rights reserved (CC BY-SA)'; });
      expect(await cmp.first().evaluate((c) => c.scrollWidth <= c.clientWidth + 1 && c.scrollHeight <= c.clientHeight + 1), `${at}: Compare's credit cut`).toBe(true);
    }
    await ctx.close();
  }
});

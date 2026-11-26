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
  // Round 102: the catalogue's address, by a link as before (the bare `/` is the front page, with no catalogue).
  await page.evaluate(() => { const a = document.createElement('a'); a.href = '/?by=genus'; document.body.appendChild(a); a.click(); });
  await page.waitForURL(/\/\?by=genus$/);
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
    // The top bar's search (round eighty-seven): the box on a desktop, the button on a phone; each takes the cursor to the page's box.
    barSearchBottom: [...document.querySelectorAll<HTMLElement>('#topbar .site-search, #topbar .searchicon')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect().bottom)[0] ?? NaN,
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
    else { await servePhotos(page); await page.goto('/?by=genus'); await ready(page); } // round 102: the catalogue's address; the bare `/` is the front page
    const m = await placement(page);
    // On r76base: two strips in the page, and the one drawn followed the first rows, inside the list.
    expect(m.inPage, live ? 'live-shaped' : 'fixture').toBe(1);
    expect(m.drawn).toBe(1);
    expect(m.inList).toBe(false);
    expect(m.stripBottom).toBeLessThanOrEqual(m.searchTop);
    expect(m.between).toBe(0);
    expect(m.searchTop).toBeLessThan(m.rowTop);
    // The search is still on the owner's first screen: Safari's page on an iPhone 12 to 15. Since round eighty-seven (plan D1,
    // DESIGN-87) the front page leads with one figure, and the search on the first screen is the top bar's.
    expect(m.barSearchBottom, `the top bar's search against the tab bar at ${m.tabTop}`).toBeLessThanOrEqual(m.tabTop);
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
// Round eighty-two moved these on purpose: the welcome's example is a button (the second review's 6) and the desktop's
// running text is 15 px (the independent review's 24), the tile's lines among it.
// Round seventy-six's figures were 307, 496, 510, 655 (654 at 1024) and a tile 155 × 179; round eighty-six's 311, 502, 516,
// 662 and 155 × 181. Round eighty-seven's (DESIGN-87, plan D1): the lead, the plain facts and Browse above the strip, and
// the page's column 1,080 px wide (980 before), so the strip's tiles are 172 px at 1280. The strip itself is as it was.
// The look measured 899, 1102, 1116, 1257 (900, 1091, 1105, 1247 at 1024) in its own branch, where the changes page's
// module was not in the build and Browse stood alone; merged, "Changed lately" stands beside it (four lines of the rounds'
// records, `changedLately`), taller than the Browse table, and everything under it is 192 px lower at 1280 (214 at
// 1024, where its lines wrap more). The strip, its tiles and the gaps between strip, search and first row are unchanged.
// Round ninety (14 November 2026): R87_LIVE_STAGE raised to 3, so "Changed lately" carries stage 2's first line, longer
// than the stage 1 line it follows, and everything under it is 22 px lower at 1280 (21 at 1024), measured in Chromium:
// on fce7905 the base was 1091, 1294, 1308, 1449 (1114, 1305, 1319, 1461 at 1024). Tiles and gaps unchanged.
// Round ninety-one: "Changed lately" opens with round 91's two lines (the icon), shorter than round 87's they replace there,
// so everything under it is 44 px higher at 1280 (21 at 1024), measured in Chromium; on 0812e7b the base was 1113, 1316,
// 1330, 1471 (1135, 1327, 1341, 1482 at 1024). Tiles and gaps unchanged.
// Round ninety-two: "Changed lately" holds round 92's two lines (flowering from GBIF's download), longer than round 91's
// and round 87's they push down and off, so everything under it is 44 px lower at 1280 and 65 at 1024 (a line more where
// the column is narrower). Measured in Chromium in the launch gate of 15 November 2026 on b9963f7 with round 92's
// /changes line (the base before: 1069, 1272, 1286, 1427 at 1280; 1114, 1305, 1319, 1461 at 1024); WebKit and Firefox
// 1372, 1386, 1527 to 1528 and tiles 157 × 183 at 1024, within the 2 px. Tiles unchanged; nothing else in the test moved.
// Round ninety-three: "Changed lately" holds round 93's two lines (the names GBIF files apart), longer than round 91's
// they push off, so everything under it is 65 px lower at 1280 and 43 at 1024. Measured in Chromium on 16 November 2026
// on f382389 with round 93's /changes lines (the base before: 1113, 1316, 1330, 1471 at 1280; 1179, 1370, 1384, 1526 at 1024); tiles unchanged.
// On f382389 with round 93's lines: FAILED, stripTop 1178 for 1113 at 1280.
// Round ninety-five: "Changed lately" holds round 95's two lines (the keys a page leaves out, a merged key's names), longer
// than round 93's they push down at 1280, so everything under it is 21 px lower there (22 for the first row), and 21 px
// higher at 1024 (22 for the first row), where they wrap to a line fewer. Measured in Chromium on 19 November 2026 on
// bb332a5 with round 95's /changes lines (the base before: 1178, 1381, 1395, 1536 at 1280; 1222, 1414, 1428, 1569 at
// 1024); tiles unchanged. On bb332a5 with round 95's lines: FAILED, stripTop 1199 for 1178 at 1280.
// Round ninety-eight: "Changed lately" holds round 98's two lines (the Walter–Lieth diagram, the Commons sitelink with no
// P373), shorter than round 95's at 1280, so everything under it is 21 px higher there (22 for the first row), and 21 px
// lower at 1024 (22 for the first row), where they wrap to a line more. Measured in Chromium on 19 November 2026 on 8335b5e
// with round 98's /changes lines (the base before: 1199, 1402, 1416, 1558 at 1280; 1201, 1392, 1406, 1547 at 1024); tiles
// unchanged. On 8335b5e with round 98's lines: FAILED, stripTop 1178 for 1199 at 1280.
// Round ninety-nine: "Changed lately" holds round 99's two lines (the collection encrypted on the device) and round 98's,
// round 95's gone, so everything under it is 44 px higher at 1280 and 43 px higher at 1024. Measured in Chromium on
// 20 November 2026 on e89438b with round 99's /changes lines (the base before: 1178, 1381, 1395, 1536 at 1280; 1222,
// 1414, 1428, 1569 at 1024); tiles unchanged. On e89438b with round 99's lines: FAILED, stripTop 1134 for 1178 at 1280.
// Round 102: this page is the catalogue's address now (`/?by=genus`; the bare `/` is the front page), drawn as `/` was.
// Its "Changed lately" holds rounds 102's and 100's lines, round 99's and 98's gone, so everything under it is 43 px
// higher at 1280 and 44 at 1024 (43 for the first row). Measured in Chromium on 20 November 2026 with round 102's code
// (the base before: 1134, 1337, 1351, 1493 at 1280; 1179, 1370, 1384, 1526 at 1024); tiles unchanged. With round 102's
// lines on the base before: FAILED, stripTop 1091 for 1134 at 1280.
// Round 103: "Changed lately" opens on round 103's lines; at 1024 they wrap to a line fewer than the lines before, so
// everything under it is 21 px higher there (1280 unchanged). Measured on the launch gate of 21 November 2026 with round
// 103's code (the base before at 1024: 1135, 1327, 1341, 1482); WebKit and Firefox 1307, 1321, 1462 to 1463 and tiles
// 157 × 183, within the 2 px; tiles unchanged. With round 103's lines on the base before: FAILED, stripTop 1114 for 1135.
// Round 104: "Changed lately" opens on round 104's three lines, each a line longer than round 103's at both widths, so
// everything under it is 22 px lower at 1280 and 21 at 1024. Measured in Chromium on 21 November 2026 with round 104's
// code (the base before: 1091, 1294, 1308, 1449 at 1280; 1114, 1305, 1319, 1461 at 1024); tiles unchanged. With round
// 104's lines on the base before, in every desktop engine: FAILED, stripTop 1113 for 1091 and 1135 for 1114.
// Round 105: "Changed lately" opens on round 105's three lines, shorter than round 104's: 22 px higher at 1280 and 43 at
// 1024. Measured in Chromium on 21 November 2026 with round 105's code (the base before: 1113, 1316, 1330, 1471 at 1280;
// 1135, 1327, 1341, 1482 at 1024). With round 105's lines on the base before: FAILED, stripTop 1091 for 1113.
// Round 106 measured again: round 106's three lines wrap a line fewer at 1280 (22 px higher) and one more at 1024 (22 px
// lower): 1069, 1272, 1286, 1427 at 1280; 1114, 1305, 1319, 1461 at 1024. With round 106's lines on the base before:
// FAILED, stripTop 1069 for 1091 at 1280. The launch gate then found Chromium's column at 1024 7 px narrower than WebKit's
// and Firefox's (343 against 350), so round 106's third line wrapped to three lines there alone; the line was shortened to
// wrap in two in all three, and the base at 1024 is 1092, 1285, 1299, 1441, measured in WebKit and Firefox on that gate.
// Round 107: "Changed lately" opens on round 107's three lines, a line shorter than round 106's at both widths, so
// everything under it is 22 px higher at 1280 and 23 at 1024 (24 for the first row): 1047, 1251, 1265, 1406 at 1280;
// 1070, 1262, 1276, 1417 at 1024. Measured in Chromium on 22 November 2026 with round 107's code (the base before: 1069,
// 1272, 1286, 1427; 1092, 1285, 1299, 1441); WebKit and Firefox measured too. With round 107's lines on the base before:
// FAILED, stripTop 1047 for 1069 at 1280.
// Round 108: its "Changed lately" lines wrap a line fewer at 1024 (21 px higher: 1049, 1240, 1254, 1396), none at 1280;
// measured in Chromium, WebKit and Firefox on 22 November 2026, every engine within 2 px. On 191e13e's base: FAILED at 1024.
const DESKTOP_BASE: Record<string, { stripTop: number; stripBottom: number; searchTop: number; rowTop: number; tile: [number, number] }> = {
  // Rounds 111 to 114: "Changed lately" holds their lines, which wrap more than round 108's: 44 px lower at 1280
  // (1091, 1294, 1308, 1449) and, with rounds 115 and 116's, 86 at 1024 (1135, 1327, 1341, 1482).
  // Round 117's lines wrap a line more at 1280 (1113, 1316, 1330, 1471); 1024 is unchanged.
  // Round 118's lines wrap a line less: 1091, 1294, 1308, 1449 at 1280; 1114, 1305, 1319, 1461 at 1024 (Chromium, 24 November).
  // Rounds 119 to 122's lines, round 122's shortened so no engine wraps one more than another (its first gate: Chromium
  // 1135 at 1024, WebKit and Firefox 1114): 1047, 1251, 1265, 1406 at 1280 in all three; at 1024 1092, 1284 to 1286,
  // 1298 to 1300, 1439 to 1441 (25 November), the middle taken.
  // Round 123's lines: 1069, 1272, 1286, 1427 to 1428 at 1280; 1070 to 1071, 1262 to 1264, 1276 to 1278, 1417 to 1419 at
  // 1024, in all three engines (25 November), the middle taken.
  // Round 127's lines: 1004, 1207, 1221, 1362 to 1363 at 1280; 1070 to 1071, 1262 to 1264, 1276 to 1278, 1417 to 1419 at
  // 1024, in all three engines (26 November; its lux line shortened, as it wrapped in Chromium alone), the middle taken.
  '1280': { stripTop: 1004, stripBottom: 1207, searchTop: 1221, rowTop: 1362, tile: [172, 193] },
  '1024': { stripTop: 1070, stripBottom: 1263, searchTop: 1277, rowTop: 1418, tile: [156, 182] }
};

// Named for what it holds since round eighty-seven's review fix (S7): the desktop's strip is where round eighty-seven put
// it, under the lead, and is no longer "unchanged" from r76base; and the image preloaded is the lead's (S6).
test('r76p strip 2: the desktop\'s strip, search and first row where round eighty-seven puts them under the lead, its tiles fetched at once, the lead\'s photograph preloaded, and no second copy in the page', async ({ browser, baseURL }) => {
  for (const [w, h] of [[1280, 800], [1024, 768]] as const) {
    const ctx = await context(browser, baseURL, w, h);
    const page = await ctx.newPage();
    await servePhotos(page);
    await page.goto('/?by=genus'); // round 102: the catalogue's address; the bare `/` is the front page
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
    // The lead's photograph, the first screen's largest, is the one preloaded (round eighty-seven, S6): the strip starts
    // past a desktop's first screen. It was the strip's first tile, at its small size.
    await expect.soft(page.locator('head link[rel="preload"][as="image"]')).toHaveAttribute('href', (await page.locator('section.lead .leadph img').getAttribute('src'))!);
    await ctx.close();
  }
});

/** Long credits from the live corpus, written into the tiles in turn: each wraps to three lines or more in a 112 px tile. */
const LONG = ['Photo: CC BY, Sandy Wolkenberg', 'Photo: CC BY, Николай Соболев', 'Photo: CC BY, Ricard Busquets Reverte', 'Photo: CC BY-SA, Dilrukshan Priyantha Wijesinghe', 'Photo: CC0'];

/**
 * Every credit in the boxes `tiles` names: its text whole (nothing scrolled out of its box) and inside its tile; and the tiles' heights.
 *
 * Measured two frames after it is called (round ninety-seven). A catalogue tile is `content-visibility: auto` with a 260 px
 * placeholder (theme.css): until the frame that finds it on screen, its contents are skipped and it stands 260 px high
 * whatever they hold. Measured frame by frame from load in Chromium on a8bb7e8, the opened row's first tile was 260 px
 * with its credit below it in frames 0 and 1, and 383 px (377 at 390 px, 200% text) with the credit inside from frame 2 on,
 * in two of four page loads; a reader never sees the placeholder, since a tile is drawn before it shows. So strip 4 failed
 * "tile … outside its card" when it measured inside those frames: once in each of rounds 93, 94 and 95, passing on its retry.
 * On a8bb7e8 (measured at once): FAILED in two of four page loads of the frame-by-frame measure; waited two frames, every frame
 * after is the drawn tile. Run alone, twenty times at four workers, strip 4 passed 20 of 20 both before and after: the race
 * shows only under the whole gate's load, so the frame-by-frame measure is what shows it.
 */
const fit = (page: Page, tiles: string, cred: string) => page.evaluate(async ([tSel, cSel]) => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
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
  // Five layouts of one page (three widths, two text sizes): it ran 30.0 s, the default limit, in Firefox under the
  // gate's three engines at once (rounds 111 to 116's second run).
  test.setTimeout(60_000);
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

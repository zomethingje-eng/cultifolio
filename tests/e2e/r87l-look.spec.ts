/**
 * Round eighty-seven, the look (DESIGN-87, the owner's choice of 7 November): the faces, the tokens in both themes, the
 * top bar's search and "/", the four-place tab bar with More, the owner's footer, the front page's lead figure and its
 * trail, and the species page's trail and facts. Each fails on the base (r86 head), which had none of them.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached', timeout: 60_000 }); }
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function noThirdParty(page: Page) { await page.route(/inaturalist|wikimedia|staticflickr|api\.gbif\.org/, (r) => (r.request().resourceType() === 'image' ? r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }) : r.abort())); }

/** WCAG's contrast of two computed colours. */
const contrast = (a: number[], b: number[]) => {
  const lum = (c: number[]) => { const [r, g, bl] = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const tokens = (page: Page) => page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const hex = (n: string) => { let v = cs.getPropertyValue(n).trim(); if (v.length === 4) v = '#' + [...v.slice(1)].map((c) => c + c).join(''); return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
  return Object.fromEntries(['--bg', '--ink', '--ink2', '--mut', '--link', '--hov', '--edge', '--field', '--sunk'].map((n) => [n, hex(n)]));
});

test('r87 look 1: the text is Source Sans 3, a scientific name Source Serif 4 italic, and one font is preloaded, from this site', async ({ page, request }) => {
  await noThirdParty(page);
  const fonts: string[] = [];
  page.on('request', (r) => { if (/\.woff2(\?|$)/.test(r.url())) fonts.push(r.url()); });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.evaluate(() => document.fonts.ready);
  const f = await page.evaluate(() => ({ body: getComputedStyle(document.body).fontFamily, name: getComputedStyle(document.querySelector('h1.sci .sciname i')!).fontFamily, style: getComputedStyle(document.querySelector('h1.sci .sciname i')!).fontStyle, auth: getComputedStyle(document.querySelector('h1.sci .auth')!).fontFamily, loaded: [...document.fonts].filter((x) => x.status === 'loaded').map((x) => x.family.replace(/"/g, '')) }));
  expect(f.body).toMatch(/^"?Source Sans 3"?,/);
  expect(f.name).toMatch(/^"?Source Serif 4"?,/);
  expect(f.style).toBe('italic');
  expect(f.auth).toMatch(/^"?Source Sans 3"?,/); // the author, as a rank word, upright in the text face
  expect(f.loaded).toContain('Source Sans 3');
  expect(f.loaded).toContain('Source Serif 4');
  for (const u of fonts) expect(new URL(u).origin).toBe(new URL(page.url()).origin);
  const html = await (await request.get('/species/copiapoa-cinerea')).text();
  expect(html.match(/<link rel="preload" as="font"[^>]*>/g)).toEqual([expect.stringMatching(/source-sans-3-latin-wght-normal/)]);
});

for (const scheme of ['light', 'dark'] as const) {
  test(`r87 look 2: the tokens are the plan's in ${scheme}, every text pair at 4.5:1 or more and a field's edge at 3:1`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/about/how'); await ready(page);
    const t = await tokens(page);
    expect(t['--bg']).toEqual(scheme === 'light' ? [255, 255, 255] : [0x14, 0x16, 0x15]);
    expect(t['--link']).toEqual(scheme === 'light' ? [0x1d, 0x5c, 0x45] : [0x8f, 0xcf, 0xb0]);
    for (const fg of ['--ink', '--ink2', '--mut', '--link', '--hov']) for (const bg of ['--bg', '--field', '--sunk']) expect(contrast(t[fg], t[bg]), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    for (const bg of ['--bg', '--field']) expect(contrast(t['--edge'], t[bg]), `--edge on ${bg}`).toBeGreaterThanOrEqual(3);
    // No card and no shadow: a block of figures is its rules.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sh').trim())).toBe('none');
  });
}

test('r87 look 3: "/" puts the cursor in the search, never while a field is being typed in', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  const box = page.locator('#topbar .site-search input');
  await expect(box).toBeVisible();
  await expect(page.locator('#topbar .site-search kbd')).toBeVisible(); // the hint, where there is a keyboard
  await page.locator('body').press('/');
  await expect(box).toBeFocused();
  await expect(box).toHaveValue('');
  // Typing in a field: "/" is a character there.
  await box.fill('Copiapoa');
  await page.goto('/plants/new'); await ready(page);
  await page.locator('#species-name').click();
  await page.keyboard.type('a/b');
  await expect(page.locator('#species-name')).toHaveValue('a/b');
  await expect(page.locator('#topbar .site-search input')).not.toBeFocused();
  // On the front page, its own box, which searches the catalogue and the grower's plants.
  await page.goto('/'); await ready(page);
  await expect(page.locator('#topbar .site-search input')).toHaveCount(0); // the bar's search there is the way to the page's box
  await page.locator('body').press('/');
  await expect(page.locator('main .toolrow .searchbar')).toBeFocused();
});

// Round eighty-seven, the integration: the bar's search is the browse box (r87c), whose Enter opens the row it marks, the
// first by default (r87c search 2), so what was typed reaches the front page's search by the box's last row, "Every
// species matching …", and, with no script, by the form itself, which the box is.
test('r87 look 4: the top bar\'s search opens the front page\'s search for what was typed: its last row, and its form with no script', async ({ page, browser, baseURL }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await page.locator('#topbar .site-search input').fill('Welwitschia');
  await page.getByRole('option', { name: 'Every species matching “Welwitschia”' }).click();
  await expect(page).toHaveURL(/\/\?q=Welwitschia$/);
  await expect(page.locator('main .toolrow .searchbar')).toHaveValue('Welwitschia');
  await expect(page.locator('.rows.hits a.hitrow').first()).toContainText('Welwitschia mirabilis');
  const bare = await browser.newContext({ javaScriptEnabled: false, baseURL, locale: 'en-GB' });
  try {
    const p = await bare.newPage();
    await p.goto('/species/copiapoa-cinerea');
    await p.locator('#topbar .site-search input').fill('Welwitschia');
    await p.locator('#topbar .site-search input').press('Enter');
    await expect(p).toHaveURL(/\/\?q=Welwitschia$/);
  } finally { await bare.close(); }
});

test('r87 look 5: the kbd hint is not drawn under a finger, and the phone has the search as a button @phone-only', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('#topbar .site-search kbd')).toBeHidden();
  const icon = page.getByRole('link', { name: 'Search the reference' });
  await expect(icon).toBeVisible();
  const b = (await icon.boundingBox())!;
  expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(43.5);
});

test('r87 look 6: the tab bar is Reference, My plants, Today and More, and More opens the menu @phone-only', async ({ page }) => {
  await page.goto('/today'); await ready(page);
  await expect(page.locator('#tabbar a:visible')).toHaveText(['Reference', 'My plants', 'Today']);
  await expect(page.locator('#tabbar a[aria-current="page"]')).toHaveText('Today');
  const more = page.locator('#tabbar button.moretab');
  await expect(more).toHaveAccessibleName('More menu');
  await more.click();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#menu a[href="/places"]')).toHaveText('My spaces');
  await expect(page.locator('#menu a[href="/propagation"]')).toHaveText('Propagation');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toHaveCount(0);
  await expect(more).toBeFocused();
  for (const t of await page.locator('#tabbar :is(a, button.moretab)').all()) expect((await t.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test('r87 look 7: the footer says who made the site in his words, then About, Source and Privacy @phone', async ({ page }) => {
  await page.goto('/about/how'); await ready(page);
  const f = page.locator('footer.credits');
  await expect(f.locator('.made')).toHaveText('Made by Jonathan, who grows cacti, succulents and rare bulbs and got tired of care advice that never said where it came from. Built with Claude; no text about a species is written by it.');
  await expect(f.locator('a[href="/about"]')).toHaveText('About');
  await expect(f.locator('a[href="https://github.com/zomethingje-eng/cultifolio"]')).toHaveText('Source');
  await expect(f.locator('a[href="/about/how#privacy"]')).toHaveText('Privacy');
});

test('r87 look 8: the front page leads with one figure from the reference and where it came from @phone', async ({ page }) => {
  await noThirdParty(page);
  await page.goto('/'); await ready(page);
  const lead = page.locator('section.lead');
  // The fixture's strip leads with Copiapoa cinerea, whose record's lowest night over 40 years is 4.0 °C.
  await expect(lead.locator('h1')).toHaveText('The coldest night on record where Copiapoa cinerea grows wild: 4.0 °C.');
  await expect(page.locator('main h1')).toHaveCount(1);
  const rows = lead.locator('table.trail tr');
  await expect(rows.locator('th')).toHaveText(['Records', 'From', 'Temperatures', 'Counted only']);
  await expect(rows.nth(0).locator('td')).toHaveText("352 wild records in 40 grid cells, inside Kew's native range (Chile North)");
  await expect(rows.nth(1).locator('td')).toHaveText("GBIF's occurrence search, asked 20 September 2026");
  await expect(rows.nth(2).locator('td')).toHaveText('NASA POWER, daily, over 40 years, at the grid cell of a typical record');
  await expect(rows.nth(3).locator('a[href="/about/how#records"]')).toHaveText('the rules');
  await expect(lead.locator('a[href="/species/copiapoa-cinerea"]')).toContainText('The whole page for Copiapoa cinerea');
  await expect(lead.locator('figcaption')).toHaveText('(c) grower0, CC BY, via iNaturalist, credit read 20 September 2026');
  // The plain facts, counted from the reference, and the Browse table's counts, each the number its page lists (the
  // review of stage 1, B1: they were the catalogue's groupings, "4" genera where /genus lists the one of two species).
  await expect(page.locator('.factsline')).toContainText('5 plant species, named as Kew\'s World Checklist names them');
  await expect(page.locator('table.browse tr')).toHaveCount(4);
  await expect(page.locator('table.browse tr').nth(2).locator('td').last()).toHaveText('1');
  // Round eighty-seven, the integration: "Grown by someone" is the browse page's filter, with the browse engine's count;
  // the fixture's index counts no cultivated observations, so the row says no number (not counted, never 0).
  const grown = page.locator('table.browse tr').nth(3);
  await expect(grown.locator('a')).toHaveText('Grown by someone');
  await expect(grown.locator('a')).toHaveAttribute('href', '/browse?grown=1');
  await expect(grown.locator('td').last()).toHaveText('');
  await expect(grown.locator('td.note')).toHaveText('iNaturalist records in cultivation: not counted in this build');
  for (const [i, href] of [[0, '/region'], [1, '/family'], [2, '/genus']] as const) await expect(page.locator('table.browse tr').nth(i).locator('a')).toHaveAttribute('href', href);
  // In Fahrenheit for a reader who reads it.
  await page.context().addCookies([{ name: 'cultifolio.units', value: 'us', url: page.url() }]);
  await page.reload(); await ready(page);
  await expect(lead.locator('h1')).toContainText('39.2 °F');
});

test('r87 look 9: the species page has its trail, its other names and its facts in a table, and the figures with their sources', async ({ page }) => {
  await noThirdParty(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/species/copiapoa-cinerea'); await ready(page);
  await expect(page.locator('.spcrumb')).toHaveText('Cactaceae › Copiapoa › 1 of 2');
  await expect(page.locator('.idcard .also')).toHaveText('Also called Echinocactus cinereus.');
  const facts = page.locator('table.spfacts');
  await expect(facts.locator('th')).toHaveText(['Family', 'Native to', 'Group', 'Your plants']);
  await expect(facts.locator('tr').nth(1).locator('td')).toHaveText("Chile North · Kew's World Checklist, file of 2026-06-04");
  // The figures as rows: what it is, the figure, where it came from.
  const row = page.locator('.gcards .card').first();
  const [lab, val, sub] = await Promise.all([row.locator('.lab').boundingBox(), row.locator('.val').boundingBox(), row.locator('.sub').boundingBox()]);
  expect(Math.abs(lab!.y - val!.y)).toBeLessThan(8);
  expect(val!.x).toBeGreaterThan(lab!.x + lab!.width);
  expect(sub!.x).toBeGreaterThan(val!.x);
  await expect(row.locator('.src')).toHaveText('NASA POWER');
  // The photograph beside the name, its credit under it; no blurred fill behind an upright one.
  const [h1, hero] = await Promise.all([page.locator('h1.sci').boundingBox(), page.locator('.hero').boundingBox()]);
  expect(hero!.x).toBeGreaterThan(h1!.x + 300);
});

for (const width of [320, 390, 414]) {
  test(`r87 look 10: at ${width} px the front page and a species page do not scroll sideways @phone-only`, async ({ page }) => {
    await noThirdParty(page);
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/species/copiapoa-cinerea', '/today', '/plants']) {
      await page.goto(path); await ready(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
    }
  });
}

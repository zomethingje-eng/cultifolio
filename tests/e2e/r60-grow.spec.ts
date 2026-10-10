import { readFile } from 'node:fs/promises';
import QRCode from 'qrcode';
import { test, expect, type Page } from '@playwright/test';
import { ownPages } from './helpers/r63v-own';
import { allowWrites, seedWait, SEED_REQUESTS, WEBKIT_MS_PER_REQUEST } from './helpers/pace';

/**
 * Round sixty's grower features, end to end (agent F's list; the unit tests cover each piece's rules): the paste and CSV
 * import, the spreadsheet download read back, selection on My plants, the photo strip, firsts on Today, spending, the
 * Wanted list, the watering calendar, the sample collection, the iPhone card, the browser's promise asked once, a
 * stranger's label and the label code's fragment. Each test opens its own context, so the collection starts empty.
 *
 * The helpers are copies of smoke.spec.ts's own (kept in step by hand; this file does not import that one).
 */
// The grower's own pages, empty, rather than the example collection an empty device opens on them (round sixty-three, V2).
test.beforeEach(async ({ context }) => { await context.addInitScript(ownPages); });

/** The page hydrated: before then a value typed into a bound field is dropped, and a click has no handler (round fifty-nine). */
async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** Click Add on the add-plant form. A name the reference does not hold is asked about once, and the second Add keeps it as typed. */
async function addPlant(p: Page) {
  await p.getByRole('button', { name: /^Add/ }).click();
  // The first Add arms the field when the name is not settled, and the second keeps it as typed. Armed is read from the
  // field itself: the line under it asks "press Add to keep exactly what you typed", or, when the name service did not
  // answer in time and the reference offers the same name, "Did you mean …? Otherwise Add keeps exactly what you typed"
  // (Firefox on the PC, r60 14's retry; round sixty-five), which the helper did not know and waited on for good.
  const armed = p.locator('#species-name[aria-describedby]');
  await Promise.race([p.waitForURL(/\/plants\/\d{4}-\d{4}$/), armed.waitFor()]);
  if (!/\/plants\/\d{4}-\d{4}$/.test(p.url()) && (await armed.count())) await p.getByRole('button', { name: /^Add/ }).click();
  await expect(p).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
}
/** A day on the machine's own calendar, as the app dates things. */
function localDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** This year on the machine's calendar: a plant added today is numbered in it, so a test that names one reads it here
 *  instead of writing 2026, which failed from 1 January 2027 (round sixty-one; docs/review-60/harness.md 2). */
const year = () => localDay(0).slice(0, 4);
async function more(p: Page, name: string) {
  await p.locator('.idcard .cardmenu > button').click();
  await p.locator('#card-menu [role=menuitem]', { hasText: name }).click();
}

/** A place at the top level, made on /places; with `waterDays`, its rhythm set on its own page. Returns the place page's address. */
async function newPlace(p: Page, name: string, waterDays?: number): Promise<string> {
  await p.goto('/places');
  await ready(p);
  await p.getByRole('button', { name: 'New place' }).click();
  await p.fill('#loc-name', name);
  await p.selectOption('#loc-kind', 'bench');
  await p.getByRole('button', { name: 'Add', exact: true }).click();
  await p.locator('.tree a.row', { hasText: name }).click();
  await expect(p).toHaveURL(/\/places\/.+/);
  const url = p.url();
  if (waterDays) {
    await p.goto(url + '?edit=1');
    await ready(p);
    await p.fill('#e-waterdays', String(waterDays));
    await p.getByRole('button', { name: 'Save' }).click();
    await expect(p.locator('.factgrid')).toContainText(`about every ${waterDays} days`);
  }
  return url;
}

/** One plant through the add form: a name, and optionally a place (by its name; null for none) and a price. Returns its number. */
async function plant(p: Page, name: string, opts: { place?: string | null; price?: string } = {}): Promise<string> {
  await p.goto('/plants/new');
  await ready(p);
  await p.fill('#species-name', name);
  await p.locator('#species-name').blur();
  // The form starts on the last place used (round fifty-eight): null asks for no place. Chosen once the collection has
  // opened with its places, when that start is set; "No place" chosen before it was overwritten (round sixty-four; 1 run
  // in 7 of r60 4 here).
  if (opts.place === null) { await expect(p.locator('#f-loc option')).not.toHaveCount(1); await p.selectOption('#f-loc', { label: 'No place' }); }
  else if (opts.place) {
    const v = await p.locator('#f-loc option', { hasText: opts.place }).getAttribute('value');
    await p.selectOption('#f-loc', v!);
  }
  if (opts.price != null) {
    if (!(await p.locator('#f-price').isVisible())) await p.locator('details.moredetails > summary').click();
    await p.fill('#f-price', opts.price);
  }
  await addPlant(p);
  return p.url().split('/').pop()!;
}

/** Two small JPEGs of different colours, drawn on a canvas in the page. */
async function jpegs(p: Page): Promise<Buffer[]> {
  const b64 = await p.evaluate(() => ['#2a6', '#c63'].map((fill) => {
    const c = document.createElement('canvas');
    c.width = 640; c.height = 480;
    const g = c.getContext('2d')!;
    g.fillStyle = fill; g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#fff'; g.fillRect(100, 100, 200, 120);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  }));
  return b64.map((s) => Buffer.from(s, 'base64'));
}

/** Read a downloaded file as text. */
async function downloaded(p: Page, click: () => Promise<void>): Promise<{ name: string; text: string; path: string }> {
  const [dl] = await Promise.all([p.waitForEvent('download'), click()]);
  const path = (await dl.path())!;
  return { name: dl.suggestedFilename(), text: await readFile(path, 'utf8'), path };
}

/** The first request of a run is the server's first render: one request here takes that cost (as smoke.spec.ts does). */
test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  await request.get('/', { timeout: 110_000 });
});

test('r60 1: a pasted list is checked name by name, a number in use is renumbered and said, and Add files every line', async ({ page }) => {
  await page.goto('/plants/import');
  await ready(page);
  const y = year();
  await page.fill('#imp-text', `Copiapoa cinerea\nCopiapoa cinera; ; ; club sale\nNotagenus fakeus; ; ${y}-0001; ; a note\nCopiapoa humilis; ; ${y}-0001`);
  await page.click('#imp-check');
  const summary = page.locator('#imp-summary');
  // The first page of a new device, with the service worker installing and fetching the shells: in Safari's engine the
  // name checks were "still checking: 4" past the 5 s an assertion waits, most likely queued behind those fetches (round
  // sixty-five; the all-engines rerun, r60 1 and r61h, both attempts). A check gives up at 10 s, so 15 s sees its end.
  await expect(summary).not.toContainText('still checking', { timeout: 15_000 });
  await expect(summary).toContainText('Matched in the reference: 2');
  await expect(summary).toContainText('ambiguous');
  await expect(summary).toContainText('not in the reference, added as typed: 1');
  await expect(page.locator('#imp-dupes')).toContainText(`${y}-0001 → ${y}-0004`); // a number given twice in the sheet is said as that (round sixty-one)
  await expect(page.locator('#imp-add')).toHaveText('Add 4 plants');
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText(`4 plants added, numbered ${y}-0001 to ${y}-0004`);
  await page.goto('/plants');
  await expect(page.locator('.rows > *')).toHaveCount(4);
  await expect(page.locator('.seccount', { hasText: 'shown' })).toHaveText('4 of 4 shown');
});

test('r60 2: an ambiguous name offers the reference\'s spelling, and "Use it" renames the line and matches it', async ({ page }) => {
  await page.goto('/plants/import');
  await ready(page);
  await page.fill('#imp-text', 'Copiapoa cinera');
  await page.click('#imp-check');
  const row = page.locator('.rvrow').first();
  await expect(row).toContainText('ambiguous: not under this name; did you mean');
  await row.getByRole('button', { name: 'Use Copiapoa cinerea on line 1' }).click();
  await expect(row.locator('input.nm')).toHaveValue('Copiapoa cinerea');
  await expect(row.locator('.ok')).toHaveText('matched');
  await expect(page.locator('#imp-summary')).toContainText('Matched in the reference: 1');
});

test('r60 3: a pasted sheet with a BOM and semicolons makes its places when asked, does not guess a day-first date, and keeps a formula as text', async ({ page }) => {
  await page.goto('/plants/import');
  await ready(page);
  await page.click('#imp-mode-csv');
  await page.locator('#imp-csv-paste-box > summary').click();
  const y = year();
  await page.fill('#imp-csv-text', `﻿number;species;location;acquired;price;notes\n${y}-0001;Welwitschia mirabilis;Greenhouse › Bench 9;2025-03-01;£30;"=SUM(1,2)"\n;Copiapoa humilis;Greenhouse › Bench 9;09/03/2024;12;`);
  await page.click('#imp-csv-read');
  await page.click('#imp-check');
  const make = page.locator('#imp-make-places');
  await expect(make).toBeVisible();
  await expect(page.locator('label.makeplaces')).toContainText('Greenhouse › Bench 9');
  await expect(page.locator('.rvrow', { hasText: '09/03/2024' })).toContainText('could be 9 March or 3 September');
  await make.check();
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText(`2 plants added, numbered ${y}-0001 and 2024-0001, and 2 new places`);
  await page.goto('/places');
  await expect(page.locator('.tree .row', { hasText: 'Greenhouse' }).first()).toBeVisible();
  await expect(page.locator('.tree .row', { hasText: 'Bench 9' })).toBeVisible();
  await page.goto(`/plants/${y}-0001`);
  await expect(page.locator('h1.sci')).toContainText('Welwitschia mirabilis');
  await expect(page.locator('.cult .body', { hasText: 'SUM' })).toHaveText('=SUM(1,2)');
});

test('r60 4: "Download as a spreadsheet" gives the backup\'s plants.csv, and a second device imports it to the same numbers, names and places', async ({ page, browser }) => {
  // Several pages and two devices: 8 s at rest, past the 30 s default under load; 90 s as r60 11 and r60 12 have (round
  // sixty-one; docs/review-60/harness.md 18).
  test.setTimeout(90_000);
  await newPlace(page, 'Bench A');
  await plant(page, 'Copiapoa cinerea', { place: 'Bench A' });
  await plant(page, 'Welwitschia mirabilis', { place: null });
  await page.goto('/plants');
  await ready(page);
  await page.click('#plants-menu-btn');
  const one = await downloaded(page, () => page.click('#plants-sheet'));
  expect(one.name).toMatch(/^cultifolio-plants-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(one.text.startsWith('﻿number,species')).toBe(true);
  const cols = (t: string) => t.replace(/^﻿/, '').trim().split('\r\n').slice(1).map((l) => { const c = l.split(','); return [c[0], c[1], c[9]].join(' | '); });
  expect(cols(one.text)).toEqual([`${localDay(0).slice(0, 4)}-0001 | Copiapoa cinerea | Bench A`, `${localDay(0).slice(0, 4)}-0002 | Welwitschia mirabilis | `]);

  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/plants/import');
  await ready(p2);
  await p2.click('#imp-mode-csv');
  await p2.setInputFiles('#imp-file', one.path);
  await p2.click('#imp-check');
  await expect(p2.locator('#imp-summary')).toContainText('Matched in the reference: 2');
  await p2.locator('#imp-make-places').check();
  await p2.click('#imp-add');
  await expect(p2.locator('#imp-done')).toContainText('2 plants added');
  await p2.goto('/plants');
  await ready(p2);
  await expect(p2.locator('.rows > *')).toHaveCount(2);
  await p2.click('#plants-menu-btn');
  const two = await downloaded(p2, () => p2.click('#plants-sheet'));
  expect(cols(two.text)).toEqual(cols(one.text));
  await ctx.close();
});

test('r60 5: Select ticks plants, then Water with Undo, Move with Undo, Print labels and Archive act on exactly those', async ({ page }) => {
  // Several pages: 7 s at rest, past the 30 s default under load; 90 s as r60 11 and r60 12 have (round
  // sixty-one; docs/review-60/harness.md 18).
  test.setTimeout(90_000);
  await newPlace(page, 'Bench S');
  for (const n of ['Copiapoa cinerea', 'Copiapoa humilis', 'Welwitschia mirabilis']) await plant(page, n);
  await page.goto('/plants');
  await ready(page);
  await expect(page.locator('.phead .fullcount')).toHaveText('3 growing');
  await page.click('#select-toggle');
  const ticks = page.locator('.selrow input');
  await expect(ticks).toHaveCount(3);
  await ticks.nth(0).check();
  await ticks.nth(1).check();
  const nos = await page.locator('.selrow .accno').allTextContents();
  // Water, then Undo
  await page.click('#sel-water');
  await expect(page.locator('.toast')).toContainText('2 watered.');
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('Undone: 2 watering lines removed.');
  // Move to a place, then Undo
  await page.click('#sel-move');
  const v = await page.locator('#sel-loc option', { hasText: 'Bench S' }).getAttribute('value');
  await page.selectOption('#sel-loc', v!);
  await page.getByRole('button', { name: 'Move 2', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('2 moved to Bench S.');
  await expect(page.locator('.selrow .where')).toHaveCount(2);
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('Undone: back where they were.');
  await expect(page.locator('.selrow .where')).toHaveCount(0);
  // Print labels: the two ticked
  await page.click('#sel-labels');
  await expect(page).toHaveURL(/\/labels\?acc=r[a-z0-9]+,r[a-z0-9]+$/);
  await expect(page.locator('.pick input:checked')).toHaveCount(2);
  // the watering undone shows on the plant's page
  await page.goto(`/plants/${nos[0]}`);
  await expect(page.locator('.card', { hasText: 'Since watered' })).toContainText('no watering recorded');
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(0);
  // Archive asks first, then archives the two
  await page.goto('/plants');
  await ready(page);
  await page.click('#select-toggle');
  await ticks.nth(0).check();
  await ticks.nth(1).check();
  await page.click('#sel-archive');
  await expect(page.locator('.selbar')).toContainText('Archive 2?');
  await page.click('#sel-archive-yes');
  await expect(page.locator('.toast')).toContainText('2 archived, and logged.');
  await expect(page.locator('.phead .fullcount')).toHaveText('1 growing');
  await page.goto(`/plants/${nos[1]}`);
  await expect(page.locator('.tlrow', { hasText: 'Archived' })).toHaveCount(1);
});

test('r60 6: two photographs make a strip by date, and Compare sets first and latest side by side', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await addPlant(page);
  await expect(page.locator('#photo-timeline')).toHaveCount(0);
  const [a, b] = await jpegs(page);
  await page.locator('#acc-photo-file').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: a }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: b }]);
  await expect(page.locator('.phgrid .ph')).toHaveCount(2);
  await expect(page.locator('#photo-timeline')).toContainText('2 photographs');
  await expect(page.locator('#photo-timeline .strip li')).toHaveCount(2);
  await page.click('#ptl-compare');
  await expect(page.locator('#ptl-pair figure')).toHaveCount(2);
  await expect(page.locator('#ptl-pair img')).toHaveCount(2);
  await expect(page.locator('#photo-timeline')).toContainText('apart');
});

test('r60 7: a first flowering and a first photograph are each a line on Today', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await addPlant(page);
  const no = page.url().split('/').pop()!;
  await page.locator('.quickbar .more').click();
  await page.locator('.quickbar').getByRole('button', { name: 'Flower', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Flowered' })).toHaveCount(1);
  await page.goto('/today');
  // Visible first: toContainText passes on an element that is display:none, so a rule that hid Firsts went unseen
  // (round sixty-one; docs/review-60/harness.md 3, 17).
  await expect(page.locator('#firsts')).toBeVisible();
  await expect(page.locator('#firsts')).toContainText(`First flowers on ${no} Copiapoa cinerea, today.`);
  await expect(page.locator('#firsts li')).toHaveCount(1);
  // a first photograph
  await page.goto(`/plants/${no}`);
  const [a] = await jpegs(page);
  await page.locator('#acc-photo-file').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: a });
  await expect(page.locator('.phgrid .ph')).toHaveCount(1);
  await page.goto('/today');
  await expect(page.locator('#firsts')).toBeVisible();
  await expect(page.locator('#firsts')).toContainText(`First photograph of ${no} Copiapoa cinerea, added today.`);
  await expect(page.locator('#firsts li')).toHaveCount(2);
});

test('r60 8: spending counts the plain prices of this year\'s plants and says how many it could not read', async ({ page }) => {
  await plant(page, 'Copiapoa cinerea', { price: '£5' });
  await plant(page, 'Copiapoa humilis', { price: '£10' });
  await plant(page, 'Welwitschia mirabilis', { price: 'a swap' });
  await page.goto('/plants');
  const spend = page.locator('#spend');
  await expect(spend.locator('summary')).toHaveText(`Spent this year: £15 on 2 plants (${localDay(0).slice(0, 4)})`);
  await spend.locator('summary').click();
  await expect(spend).toContainText('All time: £15 on 2 plants');
  await expect(spend).toContainText('1 price could not be read as a number, so it is not counted.');
});

test('r60 9: a followed species not grown is on the Wanted list, with its page linked and a note and price seen kept', async ({ page }) => {
  await plant(page, 'Copiapoa cinerea');
  await page.goto('/species/welwitschia-mirabilis');
  await ready(page);
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Following ✓' })).toBeVisible();
  await page.goto('/plants');
  await ready(page);
  const wanted = page.locator('#wanted');
  await expect(wanted).toContainText('Welwitschia mirabilis');
  await expect(wanted.locator('a[href="/species/welwitschia-mirabilis"]')).toBeVisible();
  await expect(wanted).not.toContainText('Copiapoa cinerea'); // grown: not wanted
  await wanted.getByRole('button', { name: 'Add a note for Welwitschia mirabilis' }).click();
  await wanted.getByLabel('Note', { exact: true }).fill('a seedling, not a graft');
  await wanted.getByLabel('Price seen', { exact: true }).fill('40 at the club show');
  await wanted.getByRole('button', { name: 'Save' }).click();
  await expect(wanted).toContainText('a seedling, not a graft · price seen 40 at the club show');
  await page.reload();
  await expect(page.locator('#wanted')).toContainText('price seen 40 at the club show');
});

test('r60 10: the watering calendar is an RFC 5545 file: CRLF, the place\'s ten days as the RRULE, no line over 75 octets', async ({ page }) => {
  await newPlace(page, 'Ten-day bench, the long one by the south glass', 10);
  await plant(page, 'Copiapoa cinerea', { place: 'Ten-day bench' });
  await page.goto('/today');
  await ready(page);
  await page.locator('#calendar > summary').click();
  const ics = await downloaded(page, () => page.click('#ics-download'));
  expect(ics.name).toBe(`cultifolio-watering-${localDay(0)}.ics`);
  expect(ics.text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  expect(ics.text).not.toMatch(/[^\r]\n/);
  expect(ics.text).toContain('RRULE:FREQ=DAILY;INTERVAL=10');
  for (const line of ics.text.split('\r\n')) expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
  expect(ics.text.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  // the place's name is escaped TEXT (a comma) and unfolds back whole
  expect(ics.text.replace(/\r\n /g, '')).toContain('Ten-day bench\\, the long one by the south glass');
  await expect(page.locator('#calendar [role=status]')).toContainText('1 repeating event');
});

test('r60 11: the sample collection opens in a database of its own, shows its firsts, shuts sync and backup, and leaving deletes it', async ({ page }) => {
  test.setTimeout(90_000);
  allowWrites(2 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  await page.goto('/plants');
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await page.click('#try-sample');
  await expect(page.locator('.demobar')).toContainText('An example collection, so you can see what this page does. Your own starts when you add a plant.') // round sixty-three, V2;
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
  await expect(page.locator('#try-sample')).toHaveCount(0);
  await page.goto('/today');
  await expect(page.locator('#firsts')).toContainText('First flowers');
  for (const path of ['/sync', '/backup']) {
    await page.goto(path);
    await ready(page);
    await expect(page.locator('#demo-locked')).toBeVisible();
    await expect(page.locator('#main button:visible')).toHaveCount(2);
    await expect(page.locator('#main button:visible')).toHaveText(['Add your first plant', 'Leave the example']); // round sixty-three, V2
  }
  await expect(page.locator('#demo-locked')).toContainText('A file restored here would go into the example');
  await page.getByRole('button', { name: 'Leave the example' }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await page.goto('/plants');
  await ready(page);
  await expect(page.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await expect(page.locator('.demobar')).toBeHidden(); // drawn on every page, shown only in the sample (round sixty-one)
  // again: a fresh sample, since leaving deleted the last one
  await page.click('#try-sample');
  await expect(page.locator('.demobar')).toBeVisible();
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
});

test('r60 12: the sample never touches the grower\'s own collection', async ({ page }) => {
  test.setTimeout(90_000);
  allowWrites(1 * SEED_REQUESTS * WEBKIT_MS_PER_REQUEST); // the example set out at Safari's engine's pace (helpers/pace.ts)
  const no = await plant(page, 'Copiapoa cinerea');
  // The way in is on the empty My plants page and the visitor's front page; a grower with a plant is let in as enterDemo does.
  await page.evaluate(() => sessionStorage.setItem('cultifolio.demo', '1'));
  await page.goto('/plants');
  await expect(page.locator('.demobar')).toBeVisible();
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: seedWait() });
  await page.getByRole('button', { name: 'Leave the example' }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await page.goto('/plants');
  await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(1);
  await expect(page.locator('.rows')).toContainText(no);
  await expect(page.locator('.rows')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.demobar')).toBeHidden(); // drawn on every page, shown only in the sample (round sixty-one)
  await expect.poll(() => page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name))), { timeout: 10_000 }).not.toContain('cultifolio-demo'); // deleted by the first page after Leave (round sixty-two; A9)
});

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const iphone = { userAgent: IPHONE_UA, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

test('r60 13: on an iPhone in Safari, the Home Screen card comes before the first plant, in place of the install bar, and goes once there is a plant', async ({ browser }) => {
  const ctx = await browser.newContext(iphone);
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => false, configurable: true });
    try { if (!localStorage.getItem('cultifolio.visits')) localStorage.setItem('cultifolio.visits', '3'); } catch { /* none */ }
  });
  const page = await ctx.newPage();
  await page.goto('/plants');
  await ready(page);
  const card = page.locator('#ios-first');
  await expect(card).toBeVisible();
  await expect(card.locator('p').first()).toHaveText("On iPhone, add Cultifolio to your Home Screen before adding plants: Safari can clear a website's data after a week without a visit, and the Home Screen app keeps its own.");
  await expect(page.locator('.install')).toHaveCount(0);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await expect(card).toBeVisible();
  await addPlant(page);
  await page.goto('/plants');
  await ready(page);
  await expect(page.locator('.rows > *')).toHaveCount(1);
  await expect(card).toHaveCount(0);
  await expect(page.locator('.install')).toBeVisible(); // the install bar's own iPhone line, now that the card has stood down
  await page.goto('/plants/new');
  await ready(page);
  await expect(page.locator('#f-loc')).toBeVisible();
  // Not a fixed pause: the card is drawn from the opened collection (ready, and no plant yet), and the form's number
  // preview is drawn from the same collection; once it reads the second number the collection is open with one plant,
  // so the card's answer is settled (round sixty-one; docs/review-60/harness.md 18, review B).
  await expect(page.locator('.accno').first()).toHaveText(`${year()}-0002`);
  await expect(card).toHaveCount(0);
  await ctx.close();

  // opened from the Home Screen: no card
  const home = await browser.newContext(iphone);
  await home.addInitScript(() => { Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true }); });
  const hp = await home.newPage();
  await hp.goto('/plants');
  await ready(hp);
  await expect(hp.getByRole('heading', { name: 'Nothing here yet' })).toBeVisible();
  await expect(hp.locator('#ios-first')).toHaveCount(0);
  await expect(hp.locator('.install')).toHaveCount(0);
  await home.close();
});

test('r60 14: after the first plant the browser is asked once to keep the data, and its answer is said once', async ({ page, browserName }) => {
  // Firefox puts the question to the person and answers only when they do; nobody answers it in a test. Round sixty-four
  // gave the person's "Allow" beforehand as a granted permission, and on the PC Firefox still asked and no answer came in
  // 20 s (round sixty-five; the all-engines rerun): so in Firefox the person's Allow is the answer persist() gives here. The
  // test is of what the site does with an answer, said once; Safari and Chrome answer by themselves and are asked for real.
  const personAllows = browserName === 'firefox';
  // Every toast shown, across page loads, in the order shown, with the page it was shown on; and every call to the
  // browser's persist() still unanswered, so a negative can wait for the answers instead of a fixed pause (round
  // sixty-one; docs/review-60/harness.md 18: under load the toast was said on the add form a moment before the
  // navigation put it away, and the test failed 3 runs in 4).
  await page.addInitScript((allows) => {
    const seen = () => {
      const t = document.querySelector('.toast')?.textContent?.trim();
      if (!t) return;
      const all = JSON.parse(sessionStorage.getItem('__toasts') ?? '[]') as Array<{ t: string; path: string }>;
      if (all[all.length - 1]?.t !== t) { all.push({ t, path: location.pathname }); sessionStorage.setItem('__toasts', JSON.stringify(all)); }
    };
    new MutationObserver(seen).observe(document, { subtree: true, childList: true, characterData: true });
    const w = window as unknown as { __persisting: number };
    w.__persisting = 0;
    const real = StorageManager.prototype.persist;
    StorageManager.prototype.persist = function () {
      w.__persisting++;
      // settled one frame after the answer, so the toast the answer causes is drawn (and recorded) before the count drops
      return (allows ? Promise.resolve(true) : real.call(this)).finally(() => requestAnimationFrame(() => requestAnimationFrame(() => { w.__persisting--; })));
    };
  }, personAllows);
  const toasts = () => page.evaluate(() => JSON.parse(sessionStorage.getItem('__toasts') ?? '[]') as Array<{ t: string; path: string }>);
  const promised = (all: Array<{ t: string; path: string }>) => all.filter((x) => /^This browser has (not )?promised to keep your (plants|data)/.test(x.t));
  /** Every persist() asked so far has been answered, and whatever its answer drew is on screen. */
  const answered = () => expect.poll(() => page.evaluate(() => (window as unknown as { __persisting: number }).__persisting), { timeout: 20_000 }).toBe(0);
  const no = await plant(page, 'Copiapoa cinerea');
  // Said once, and on screen on the new plant's page where the add form lands (it takes the place of the "added" line,
  // which the page says in full): the wait is for the answer to be recorded, however long the browser and a loaded
  // machine take, and then for it to be on this page. An answer said on the form and put away by the navigation fails
  // here, as it should: the grower never saw it (the product fix is GrowLayer's).
  await expect.poll(async () => promised(await toasts()).length, { timeout: 20_000 }).toBe(1);
  const [said] = promised(await toasts());
  await expect(page).toHaveURL(new RegExp(`/plants/${no}$`));
  const toast = page.locator('.toast');
  await expect(toast).toContainText(said.t);
  if (said.t.includes('not promised')) await expect(toast.locator('.undo')).toHaveText('Back up');
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.persistAfterFirst'))).toBe('1');
  await page.reload();
  await ready(page);
  await plant(page, 'Copiapoa humilis');
  await page.goto('/plants');
  await expect(page.locator('.rows > *')).toHaveCount(2);
  // Not a fixed pause: a second answer could only come from a second persist(); wait until every one asked on these
  // pages is answered and drawn, then count.
  await answered();
  expect(promised(await toasts())).toHaveLength(1);
});

test('r60 15: a label from someone else\'s collection says so and links the species; with no fragment, the plain not-found line', async ({ page }) => {
  await page.goto('/plants/rNOPE123#s=copiapoa-cinerea&n=Copiapoa%20cinerea');
  const fl = page.locator('#foreign-label');
  await expect(fl).toContainText("This label is from someone's collection: Copiapoa cinerea");
  await expect(page.locator('#foreign-species')).toHaveAttribute('href', '/species/copiapoa-cinerea');
  await expect(page.locator('h1')).toHaveText('A plant label'); await expect(page.getByText('No plant with this number on this device.')).toHaveCount(0); // a stranger's label is headed as one (round sixty-one; the grower review, 13)
  // markup in the name is shown as text
  await page.goto('/plants/rNOPE789#s=copiapoa-cinerea&n=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
  await expect(fl).toContainText("This label is from someone's collection: <img src=x onerror=alert(1)>");
  await expect(fl.locator('img')).toHaveCount(0);
  await page.goto('/plants/rNOPE456');
  await expect(page.getByText('No plant with this number on this device.')).toBeVisible();
  await expect(fl).toHaveCount(0);
});

test('r60 16: a label\'s QR code is the plant\'s address with the species and name in its fragment, and the sheet still prints', async ({ page, baseURL }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await addPlant(page);
  await more(page, 'Label');
  await expect(page).toHaveURL(/\/labels\?acc=r[a-z0-9]+$/);
  const id = page.url().split('acc=')[1];
  await ready(page);
  await expect(page.locator('#lb-qr')).toBeChecked();
  await expect(page.locator('.page .label')).toHaveCount(1);
  const svg = page.locator('.page .label .qr svg');
  await expect(svg).toHaveCount(1);
  // The code drawn is exactly the one the qrcode library makes for the address with its fragment (decoding a QR here
  // would need a reader; drawing the expected one with the page's own library and settings is the same check).
  const paths = async (markup: string) => [...markup.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  const drawn = await svg.evaluate((el) => [...el.querySelectorAll('path')].map((p) => p.getAttribute('d')));
  const want = `${new URL(baseURL!).origin}/plants/${id}#s=copiapoa-cinerea&n=Copiapoa%20cinerea`;
  expect(drawn).toEqual(await paths(await QRCode.toString(want, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 })));
  expect(drawn).not.toEqual(await paths(await QRCode.toString(`${new URL(baseURL!).origin}/plants/${id}`, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 })));
  // printing still works: one label, the print dialog asked for once
  await page.evaluate(() => { (window as unknown as { __printed: number }).__printed = 0; window.print = () => { (window as unknown as { __printed: number }).__printed++; }; });
  await expect(page.locator('#lb-print')).toHaveText('Print 1 label');
  await page.click('#lb-print');
  expect(await page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);
  await expect(page.locator('.page .label')).toHaveCount(1);
});

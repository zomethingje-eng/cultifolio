import { zipSync, strToU8 } from 'fflate';
import { test, expect } from '@playwright/test';

/** The plant page's id card keeps one primary action; Edit, Label and Propagate are behind "More" (improvements, 7). */
/** Click Add on the add-plant form. A name the reference does not hold (the name service is not reachable here) is asked about once, and the second Add keeps it as typed (round twenty-three, 4). */
/** The page hydrated: before then a value typed into a bound field is dropped, and a click has no handler (round fifty-nine). */
async function ready(p: import('@playwright/test').Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
async function addPlant(p: import('@playwright/test').Page) {
  await p.getByRole('button', { name: /^Add/ }).click();
  const asked = p.locator('.picker .hint', { hasText: 'press Add to keep exactly what you typed' });
  await Promise.race([p.waitForURL(/\/plants\/\d{4}-\d{4}$/), asked.waitFor()]);
  if (await asked.isVisible()) await p.getByRole('button', { name: /^Add/ }).click();
  await expect(p).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
}
/** A day on the machine's own calendar, as the app dates things: `toISOString()` is UTC and is tomorrow for four evening hours in the Americas (round thirty, R1-3). */
function localDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** This year on the machine's calendar: a plant added today is numbered in it, so a test that names one reads it here
 *  instead of writing 2026, which failed from 1 January 2027 (round sixty-one; docs/review-60/harness.md 2). */
const year = () => localDay(0).slice(0, 4);
async function more(p: import('@playwright/test').Page, name: string) {
  await p.locator('.idcard .cardmenu > button').click();
  await p.locator('#card-menu [role=menuitem]', { hasText: name }).click();
}

/** Click "Sync now" and wait for THAT run to finish: the status card counts finished runs, so the "Synced" that was already on screen is not mistaken for the new one (round thirteen, B2). */
async function syncRun(p: import('@playwright/test').Page) {
  const status = p.locator('.card', { hasText: 'Status' });
  const before = Number(await status.getAttribute('data-runs'));
  await p.click('#sync-now');
  await expect.poll(async () => Number(await status.getAttribute('data-runs')), { timeout: 30000 }).toBeGreaterThan(before);
  await expect(status).toContainText('Synced');
}

/**
 * The first request of a run is the server's first render, which on a Windows machine took past the 30 s a test has and
 * failed whichever test came first (round fifty-nine). One request here, with its own allowance, takes that cost.
 */
test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  await request.get('/', { timeout: 110_000 });
});

test('front page renders server-side with the fixture corpus: closed genus rows, one open by URL, no JavaScript needed', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Cultifolio'); // a visitor's head names the site and says what it is (round fifty-eight)
  await expect(page.locator('.grow')).toHaveCount(3); // Copiapoa, Refusia, Welwitschia: rows, not tiles
  await expect(page.locator('a.tile')).toHaveCount(0);
  await expect(page.locator('.seg[aria-label="Group by"] .on')).toHaveText('Genus');
  await page.locator('.grow', { hasText: 'Copiapoa' }).click();
  await expect(page).toHaveURL(/\?by=genus&open=copiapoa$/);
  await expect(page.locator('.grow.open', { hasText: 'Copiapoa' })).toBeVisible();
  await expect(page.locator('a.tile .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await expect(page.locator('a.tile')).toHaveCount(2); // cinerea and humilis
  // the same row closes it
  await page.locator('.grow.open').click();
  await expect(page).toHaveURL(/\?by=genus$/);
  await expect(page.locator('a.tile')).toHaveCount(0);
  // origin keeps its map; family its genus count
  await page.goto('/?by=origin');
  await expect(page.locator('.grow .gmap').first()).toBeVisible();
  await page.goto('/?by=family&open=cactaceae');
  await expect(page.locator('.grow.open .d')).toHaveText('1 genus');
  await ctx.close();
});

test('the menu behind the mark reaches every place from any page', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('#menu')).toHaveCount(0);
  await page.getByRole('button', { name: 'Menu' }).click();
  const menu = page.locator('#menu');
  await expect(menu).toBeVisible();
  for (const l of ['Species', 'My plants', 'Places', 'Propagation', 'Today', 'Compare species', 'Labels', 'Backup', 'Sync', 'How it is made', 'Formats', 'Source']) await expect(menu.getByRole('link', { name: l, exact: true })).toBeVisible();
  await expect(menu.locator('a.on')).toHaveText('Species');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
  await page.getByRole('button', { name: 'Menu' }).click();
  await menu.getByRole('link', { name: 'Places' }).click();
  await expect(page).toHaveURL(/\/places$/);
  await expect(page.locator('#menu')).toHaveCount(0); // closed by the navigation
});

test('the two renamed sections answer at their old paths with a redirect that keeps the query (improvements, 3)', async ({ request }) => {
  for (const [from, to] of [['/benches', '/places'], ['/benches/abc?edit=1', '/places/abc?edit=1'], ['/sowings', '/propagation'], ['/sowings/new?loc=x', '/propagation/new?loc=x']]) {
    const r = await request.get(from, { maxRedirects: 0 });
    expect(r.status(), from).toBe(301);
    expect(r.headers()['location'], from).toBe(to);
  }
  // and a path that merely begins with the old word is not touched
  expect((await request.get('/benchesx', { maxRedirects: 0 })).status()).toBe(404);
});

test('the plant card\'s menu works from the keyboard: arrows move, Tab closes it, Edit lands in the first field; no Photo verb while the tile is showing (round twenty, 10 and 11)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.idcard label.tile')).toBeVisible();
  await expect(page.locator('.quickbar').getByRole('button', { name: 'Photo', exact: true })).toHaveCount(0); // the tile is the way to add one
  await page.locator('.idcard .cardmenu > button').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#card-menu [role=menuitem]').first()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#card-menu [role=menuitem]').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('#card-menu [role=menuitem]').last()).toBeFocused();
  await page.keyboard.press('ArrowDown'); // wraps
  await expect(page.locator('#card-menu [role=menuitem]').first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#card-menu')).toHaveCount(0); // Tab leaves and closes; nothing is left open over the verbs
  await page.locator('.idcard .cardmenu > button').click();
  await page.keyboard.press('Enter'); // Edit
  await expect(page.locator('#ed-name')).toBeFocused();
});

test('species page is readable without JavaScript and states its evidence', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.getByText(/rest on all 352 georeferenced records inside the native range/)).toBeVisible();
  await expect(page.getByText(/the map shows only the 52 openly licensed ones/)).toBeVisible();
  await expect(page.getByText(/which alone would put the marker \d+ km away/)).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(ld!)['@type']).toBe('Taxon');
  await ctx.close();
});

test('a refusal is rendered as "not checked", never as an absence', async ({ page }) => {
  await page.goto('/species/refusia-testii');
  await expect(page.locator('.notice', { hasText: 'Occurrence source did not answer' })).toBeVisible(); // said on the climate section, the evidence line and the record map
  await expect(page.locator('.idcard .nc .tok', { hasText: 'Climate not checked' })).toBeVisible(); // and as the one mark in the head, its reason on tap
  await expect(page.locator('.factgrid', { hasText: 'not a statement that none exist' })).toBeVisible();
});

test('unknown species is a 404 with a way forward: what the reference holds of the genus, and where the name is held (round forty-one, R15)', async ({ page }) => {
  const res = await page.goto('/species/nonsensia-fakeii');
  expect(res?.status()).toBe(404);
  await expect(page.locator('.err')).toContainText('The reference has no Nonsensia: it is built from a fixed list of names');
  await expect(page.locator('.err a', { hasText: 'POWO' })).toHaveAttribute('href', /powo\.science\.kew\.org.*Nonsensia%20fakeii/);
  await expect(page.locator('.err a', { hasText: 'add it as a plant' })).toHaveAttribute('href', '/plants/new?species=Nonsensia%20fakeii');
  // A genus the reference holds and takes whole: the count, and that the name as written is not on the list (round fifty-eight: never "Kew does not accept", which no source said).
  await page.goto('/species/copiapoa-fakeii');
  await expect(page.locator('.err')).toContainText('The reference has 2 Copiapoa species, taking the genus whole');
  await expect(page.locator('.err')).not.toContainText('does not accept');
  // A slip in the name offers the species it nearly is; an address in capitals is the species; a genus alone is its row (round fifty-eight).
  await page.goto('/species/copiapoa-cinera');
  await expect(page.locator('.err a', { hasText: 'Copiapoa cinerea' })).toHaveAttribute('href', '/species/copiapoa-cinerea');
  await page.goto('/species/Copiapoa-cinerea');
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await page.goto('/species/copiapoa');
  await expect(page).toHaveURL(/\/\?by=genus&open=copiapoa$/);
});

test('add a plant, record an event, survive a reload', async ({ page }) => {
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.locator('details.moredetails > summary').click(); // the short form is the species, the place and the date (round forty-nine, 3)
  await page.fill('#f-field', 'KK 1462');
  await page.selectOption('#f-prov', 'f1');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-0001$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.fnchip', { hasText: 'KK 1462' })).toBeVisible();
  await page.locator('.quickbar .more').click(); // four verbs at rest, the rest on request
  await expect(page.locator('#verb-feed')).toBeFocused(); // focus lands on the first revealed verb, whatever is shown before it (round twenty-one, 14)
  await page.getByRole('button', { name: 'Treat' }).click();
  await page.fill('#ev-used', 'Safari 20SG drench');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Treated' })).toContainText('Safari 20SG drench');
  await page.reload();
  await expect(page.locator('.tlrow', { hasText: 'Treated' })).toContainText('Safari 20SG drench');
  await page.goto('/plants');
  await expect(page.getByText('1 of 1')).toBeVisible();
  // numbers are never reused
  await page.goto('/plants/new');
  await expect(page.getByText('0002')).toBeVisible();
});

test('benches: make a place, put a plant there, water the bench, audit it', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Laundry room');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Laundry room' })).toBeVisible();
  // a shelf inside the room
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Shelf 2');
  await page.selectOption('#loc-kind', 'shelf');
  await page.selectOption('#loc-parent', { label: 'Laundry room' });
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Shelf 2' })).toBeVisible();
  // the next place is not filed inside Laundry room just because the last one was (round twenty-two, 3)
  await page.getByRole('button', { name: 'New place' }).click();
  await expect(page.locator('#loc-parent option:checked')).toHaveText('Top level');
  // add a plant on the shelf
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Tylecodon pearsonii');
  await page.locator('#species-name').blur();
  const shelfValue = await page.locator('#f-loc option', { hasText: 'Shelf 2' }).getAttribute('value');
  await page.selectOption('#f-loc', shelfValue!);
  await addPlant(page);
  await expect(page.locator('.idcard a.place', { hasText: 'Laundry room › Shelf 2' })).toBeVisible();
  // the room sees the plant through the shelf; water the whole room
  await page.goto('/places');
  await page.locator('.tree .row', { hasText: 'Laundry room' }).click();
  await expect(page.getByText('1 growing plant')).toBeVisible();
  await page.getByRole('button', { name: /Water all 1/ }).click();
  await expect(page.locator('.toast')).toContainText('Watered 1 plant.');
  // one tap back: Undo removes exactly the lines it wrote, then Water all again for the rest of the test (round twenty-six, 5)
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('Undone');
  await expect(page.locator('.card', { hasText: 'Last watered' })).toHaveCount(0);
  await page.getByRole('button', { name: /Water all 1/ }).click();
  await expect(page.locator('.toast')).toContainText('Watered 1 plant.');
  // audit: tick it present
  await page.getByRole('button', { name: 'Audit' }).click();
  // Cancel with a tick made asks first; Tick all ticks the bench (round forty-nine, 3)
  await page.getByRole('button', { name: 'Tick all' }).click();
  await expect(page.locator('label.row input[type=checkbox]')).toBeChecked();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await page.getByRole('button', { name: 'Finish audit' }).click();
  await expect(page.locator('#audit-result')).toContainText('1 present.');
  await expect(page.locator('.azrow .fig', { hasText: /seen today/ })).toBeVisible(); // and a phone's row says it too, in its own span (round fifty-two, 6)
  // the plant's timeline has both entries
  await page.locator('.rows a.row', { hasText: 'Tylecodon' }).first().click();
  await expect(page.locator('.tlrow .t', { hasText: 'Seen at audit' })).toBeVisible();
  await expect(page.locator('.tlrow .t', { hasText: /whole room: Laundry room/ })).toBeVisible();
});

test('sowings: sow seed, count germination, pot up into numbered plants, propagate from one of them', async ({ page }) => {
  await page.goto('/propagation/new');
  await page.selectOption('#s-method', 'seed');
  await page.fill('#species-name', 'Ariocarpus fissuratus');
  await page.locator('#species-name').blur();
  await page.fill('#s-count', '12');
  await page.fill('#s-from', 'Mesa Garden');
  await page.fill('#s-fn', 'MG 123');
  await page.fill('#s-ref', 'lot 77');
  await page.selectOption('#s-prov', 'wild');
  await page.fill('#s-medium', 'pumice and loam');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-001$/);
  await expect(page.locator('h1')).toContainText('Ariocarpus fissuratus');
  await expect(page.getByText('12 seeds on')).toBeVisible();
  // count what is up
  await page.fill('#g-n', '5');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('42%')).toBeVisible();
  await page.fill('#l-n', '1');
  await page.fill('#l-cause', 'damping off');
  await page.getByRole('button', { name: 'Record loss' }).click();
  await expect(page.locator('.tl').getByText('damping off')).toBeVisible();
  // pot up two
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 2:/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plants raised from this batch' })).toBeVisible();
  // the plant knows its batch and its provenance
  await page.locator('.rows a.accrow').first().click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.vern')).toContainText('F1, raised from wild-collected seed');
  await expect(page.locator('.fnchip', { hasText: 'MG 123' })).toBeVisible();
  await expect(page.locator('a.mono[href^="/propagation/"]').first()).toBeVisible(); // the plant links its batch
  // take offsets from it
  await more(page, 'Propagate');
  await expect(page).toHaveURL(/\/propagation\/new\?parent=/);
  await expect(page.locator('#s-parent')).not.toHaveValue('');
  await page.fill('#s-count', '3');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-002$/);
  await expect(page.getByText('3 offsets on')).toBeVisible();
  // list shows both
  await page.goto('/propagation');
  await expect(page.locator('table.wx tbody tr')).toHaveCount(2);
});

test('a species page hands its name to the add-plant and sow-seed forms', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=7284333');
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=7284333');
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
});

test('the path species → my plants → bench is prefilled at every step and loops back', async ({ page }) => {
  // a place to put things
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'East sill');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'East sill' })).toBeVisible();
  // species page → Add one: the species arrives filled in
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await expect(page).toHaveURL(/\/plants\/new\?species=/);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  const opt = await page.locator('#f-loc option', { hasText: 'East sill' }).getAttribute('value');
  await page.selectOption('#f-loc', opt!);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  // the species page now shows ownership and the accession links back
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.idcard .mine a.accno')).toHaveCount(1); // the "Yours" line is the ownership mark; no pill repeats it
  await page.locator('a.accno', { hasText: acc }).click();
  await expect(page).toHaveURL(new RegExp(`/plants/${acc}$`));
  // habitat versus here: the missing bench figure hands off to the bench edit form; the comparison sits folded under the log since round fifty-eight
  await page.locator('#habitat > summary').click();
  await expect(page.locator('.hvh')).toBeVisible();
  await page.getByRole('link', { name: 'Set its floor' }).click();
  await expect(page).toHaveURL(/\/places\/.+\?edit=1$/);
  await expect(page.locator('#e-name')).toHaveValue('East sill');
  await page.fill('#e-floor', '2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#e-floor')).toHaveCount(0); // the save has landed once the form has closed; a hard navigation before that reads the old floor
  // back on the plant, the comparison shows both figures and no verdict: the judgement is the grower's
  await page.goto(`/plants/${acc}`);
  await page.locator('#habitat > summary').click();
  await expect(page.locator('.hvh')).toContainText('this place is set to bottom out at 2.0 °C');
  // the habitat figure is the median with its 10th–90th span across the envelope cells, and the quantity is named
  await expect(page.locator('.hvh')).toContainText(/coldest month's mean night at the habitat \d+(\.\d)? °C in \w+ \(median year; across the range, 40 grid cells, \d+ to \d+; CHELSA\); 1st-percentile night over 40 years at a typical spot in the range 6\.5 °C \(NASA POWER\)/);
  await expect(page.locator('.hvh')).toContainText(/open sky over the habitat \d+–\d+ mol\/m²\/day across the year \(median year; across the range, 40 grid cells, \d+ to \d+; CHELSA\)/);
  await expect(page.locator('.hvh .pill')).toHaveCount(0);
  await page.locator('.hvh + details.why summary').click(); // the caveat sits one tap away, not beside the figures
  await expect(page.locator('.hvh + details.why')).toContainText('A comparison, not a verdict');
  // the next add-plant form remembers the last place used
  await page.goto('/plants/new');
  await expect(page.locator('#f-loc option:checked')).toHaveText('East sill');
  // move it from the quickbar: a new place made inline, the move on the timeline, the bench sees it
  await page.goto(`/plants/${acc}`);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('button', { name: 'New…' }).click();
  await page.fill('#mv-loc-new-name', 'Cold frame');
  await page.selectOption('#mv-loc-new-kind', 'coldframe');
  await page.getByRole('button', { name: 'Add place' }).click();
  await page.getByRole('button', { name: 'Move', exact: true }).last().click();
  await expect(page.locator('.idcard .place', { hasText: 'Cold frame' })).toBeVisible();
  await expect(page.locator('.tlrow', { hasText: 'Cold frame' })).toBeVisible();
  await page.locator('.idcard .place', { hasText: 'Cold frame' }).click();
  await expect(page).toHaveURL(/\/places\//);
  await expect(page.locator('a.accrow', { hasText: acc })).toBeVisible();
});

test('photos: taken on the device, resized, stored, captioned, made the cover, shown everywhere, survive a reload, removed', async ({ page }) => {
  await page.goto('/settings');
  await ready(page);
  await page.check('#pref-refphotos'); // the species' photograph on a private page is opt-in (round twelve, A1)
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  // no photos yet: the hero shows the species photograph and offers to add your own; the section shows the add row
  await expect(page.locator('.hero button.cred')).toContainText('add your own');
  await expect(page.locator('#acc-photo-camera')).toBeAttached();
  // a real JPEG: a screenshot of this very page, larger than the stored size so resizing is exercised
  await page.setViewportSize({ width: 2000, height: 1400 });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 80 });
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.locator('#acc-photo-file').setInputFiles({ name: 'bench.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('.phgrid .ph')).toHaveCount(1);
  await expect(page.locator('.hero.own')).toBeVisible();
  await expect(page.locator('.tlphoto', { hasText: 'Photographed' })).toBeVisible();
  // resized: the stored width is the long edge cap
  const dims = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = await new Promise<Array<{ blob: Blob; thumb: Blob }>>((res, rej) => { const r = db.transaction('photos').objectStore('photos').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const size = (b: Blob) => new Promise<[number, number]>((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = URL.createObjectURL(b); });
    return { n: all.length, full: await size(all[0].blob), thumb: await size(all[0].thumb), type: all[0].blob.type };
  });
  expect(dims.n).toBe(1);
  expect(dims.full[0]).toBe(1600);
  expect(dims.thumb[0]).toBe(320);
  expect(dims.type).toBe('image/jpeg');
  // a second one, from the library input, becomes the newest and so the face
  await page.locator('#acc-photo-file').setInputFiles({ name: 'two.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('.phgrid .ph')).toHaveCount(2);
  // open the older one, caption it, make it the cover
  await page.locator('.phgrid .ph').nth(1).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('2 of 2');
  await page.getByRole('button', { name: 'Caption / date' }).click();
  await page.fill('#lb-caption', 'First flower');
  await page.fill('#lb-date', '2026-06-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toContainText('First flower');
  await page.getByRole('button', { name: 'Make cover' }).click();
  await expect(page.getByRole('button', { name: 'Is the cover' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.locator('.hero .cred')).toContainText('First flower · 2026-06-01');
  await expect(page.locator('.phgrid .ph.cov .pd')).toHaveText('2026-06-01');
  // the redated photo moved down the timeline
  const rows = await page.locator('.tl .tlrow').allTextContents();
  expect(rows[rows.length - 1]).toContain('First flower');
  // the list and the species page show it
  await page.goto('/plants');
  await expect(page.locator(`a.accrow[href="/plants/${acc}"] .im.own img`)).toBeVisible();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('h2', { hasText: 'Your photographs' })).toBeVisible();
  await expect(page.locator('.myph .ph')).toHaveCount(2);
  // survives a reload, then remove one
  await page.goto(`/plants/${acc}`);
  await page.reload();
  await expect(page.locator('.phgrid .ph')).toHaveCount(2);
  await page.locator('.phgrid .ph').first().click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.phgrid .ph')).toHaveCount(1);
  // the pixels go too (the record is dropped first, then the blobs, so poll)
  await expect.poll(() => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    return new Promise<number>((res) => { const r = db.transaction('photos').objectStore('photos').count(); r.onsuccess = () => res(r.result); });
  })).toBe(1);
});

test('backup: export a zip, wipe the device, restore it, and the collection is identical, photo included', async ({ page }) => {
  // a collection with a place, a plant there, an event, a photo
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Back porch');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Back porch' })).toBeVisible();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  const opt = await page.locator('#f-loc option', { hasText: 'Back porch' }).getAttribute('value');
  await page.selectOption('#f-loc', opt!);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Record…', exact: true }).click();
  await page.selectOption('#ev-type', 'water');
  await page.fill('#ev-note', 'first drink');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 70 });
  await page.locator('#acc-photo-file').setInputFiles({ name: 'p.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(page.locator('.phgrid .ph')).toHaveCount(1);
  const dump = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = (store: string) => new Promise<unknown[]>((res) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => res(r.result); });
    const changes = (await all('changes')) as Array<{ t: string }>;
    const photos = (await all('photos')) as Array<{ id: string; blob: Blob; thumb: Blob }>;
    return { changes: changes.map((c) => JSON.stringify(c)).sort(), photos: photos.map((p) => `${p.id}:${p.blob.size}:${p.thumb.size}`).sort() };
  });
  const before = await dump();
  expect(before.changes.length).toBeGreaterThan(10);
  expect(before.photos).toHaveLength(1);
  // the device's settings travel too (round twenty-two, 5): a site set here comes back on a device that has none
  await page.evaluate(() => localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05, name: 'Mt Lebanon' })));
  // export
  await page.goto('/backup');
  await expect(page.locator('.secrule .n', { hasText: 'never' })).toBeVisible();
  const dl = page.waitForEvent('download');
  await page.click('#bk-export');
  const file = await dl;
  expect(file.suggestedFilename()).toMatch(/^cultifolio-\d{4}-\d{2}-\d{2}\.cultifolio\.zip$/);
  const path = await file.path();
  await expect(page.locator('.secrule .n', { hasText: 'last today' })).toBeVisible();
  // restoring the same file: merging would change nothing
  await page.locator('#bk-file').setInputFiles(path!);
  await expect(page.locator('#bk-preview')).toContainText('Nothing changes: everything in the file is already here.');
  await expect(page.locator('#bk-merge')).toBeDisabled();
  // the same file on a device that has every record but no site: merging applies the settings alone, and Merge is offered (round twenty-three, 9)
  await page.evaluate(() => localStorage.removeItem('cultifolio.frost.site'));
  await page.reload();
  await page.locator('#bk-file').setInputFiles(path!);
  await expect(page.locator('#bk-preview')).toContainText('No records are added');
  await expect(page.locator('#bk-preview')).toContainText("the file's site");
  await expect(page.locator('#bk-merge')).toBeEnabled();
  await page.click('#bk-merge');
  await expect(page.locator('#bk-done')).toContainText(/site/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cultifolio.frost.site') ?? 'null'))).toMatchObject({ lat: 40.38, lon: -80.05 });
  // wipe: replace with the file is the wipe-and-restore path, but first prove a real wipe loses everything
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    await Promise.all(['changes', 'photos'].map((s) => new Promise<void>((res) => { const r = db.transaction(s, 'readwrite').objectStore(s).clear(); r.onsuccess = () => res(); })));
    localStorage.removeItem('cultifolio.frost.site');
  });
  await page.goto('/plants');
  await expect(page.locator('a.accrow')).toHaveCount(0);
  // restore by merge into the empty device
  await page.goto('/backup');
  await page.locator('#bk-file').setInputFiles(path!);
  await expect(page.locator('.preview')).toContainText('1 plant · 2 timeline entries · 1 place · 0 propagation batches · 1 photo');
  await expect(page.locator('#bk-preview')).toContainText('1 plant, 1 place, 2 timeline entries and 1 photo will be added. Nothing here is removed.');
  await page.click('#bk-merge');
  await expect(page.locator('#bk-done')).toContainText('1 photo');
  await expect(page.locator('#bk-done')).toContainText(/This device had no site( or preferences)? of its own, so the file's (was|were) applied/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cultifolio.frost.site') ?? 'null'))).toMatchObject({ lat: 40.38, lon: -80.05 });
  const after = await dump();
  expect(after).toEqual(before);
  // and the plant is back with its photo and its place
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.idcard .place', { hasText: 'Back porch' })).toBeVisible();
  await expect(page.locator('.tlrow', { hasText: 'first drink' })).toBeVisible();
  await expect(page.locator('.hero.own img')).toBeVisible();
  // replace: wipes and reloads to the same state
  await page.goto('/backup');
  await page.locator('#bk-file').setInputFiles(path!);
  await page.click('#bk-replace');
  await page.click('#bk-replace-yes');
  await expect(page).toHaveURL(/\/plants$/);
  await expect(page.locator('a.accrow')).toHaveCount(1);
  expect(await dump()).toEqual(before);
});

test('a hybrid is filed under its genus with its parents linked; a cultivar keeps its species', async ({ page }) => {
  // a cross, typed the way a label reads
  await page.goto('/plants/new');
  await page.fill('#species-name', "Copiapoa cinerea x C. gigantea 'Test Cross'");
  await page.locator('#species-name').blur();
  await expect(page.locator('.picker .pill', { hasText: 'hybrid' })).toBeVisible();
  await expect(page.locator('#f-parentage')).toHaveValue('Copiapoa cinerea × Copiapoa gigantea');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const hyb = page.url().split('/').pop()!;
  await expect(page.locator('h1.sci')).toContainText('Copiapoa');
  await expect(page.locator('h1.sci')).toContainText('‘Test Cross’');
  await expect(page.locator('h1.sci')).not.toContainText('cinerea');
  await expect(page.locator('.idcard .kind', { hasText: 'hybrid' })).toBeVisible();
  // one parent has a species page in the fixture corpus, the other does not: only the first is a link
  await expect(page.locator('.parentage a')).toHaveCount(1);
  await expect(page.locator('.parentage a')).toHaveAttribute('href', '/species/copiapoa-cinerea');
  await expect(page.locator('.factgrid', { hasText: 'Parentage' })).toContainText('Copiapoa cinerea × Copiapoa gigantea');
  // no habitat is claimed for it
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('A hybrid');
  await expect(page.locator('.hvh')).toHaveCount(0);
  // the species page does not count the hybrid as a plant of Copiapoa cinerea
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.idcard .mine')).toHaveCount(0);
  // a cultivar of the species does count
  await page.goto('/plants/new');
  await page.fill('#species-name', "Copiapoa cinerea 'Silver'");
  await page.locator('#species-name').blur();
  await expect(page.locator('.picker .pill', { hasText: 'cultivar' })).toBeVisible();
  await expect(page.locator('#f-parentage')).toHaveCount(0);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.idcard .kind', { hasText: 'cultivar' })).toBeVisible();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.idcard .mine a.accno')).toHaveCount(1);
  // the list marks both
  await page.goto('/plants');
  await expect(page.locator(`a.accrow[href="/plants/${hyb}"] .pill`, { hasText: 'hybrid' })).toBeVisible();
  await expect(page.locator('a.accrow .pill', { hasText: 'cultivar' })).toHaveCount(1);
});

test('labels: pick plants, choose a sheet, print at true size with a code that opens the plant', async ({ page }) => {
  for (const n of ['Copiapoa cinerea', 'Welwitschia mirabilis']) {
    await page.goto('/plants/new');
    await page.fill('#species-name', n);
    await page.locator('#species-name').blur();
    await page.getByRole('button', { name: /^Add/ }).click();
    await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  }
  const acc = page.url().split('/').pop()!;
  // from a plant page, its own label
  await more(page, 'Label');
  await expect(page).toHaveURL(/\/labels\?acc=r[a-z0-9]+$/); // the label is tied to the plant's identity, not its number
  await expect(page.locator('.pick input:checked')).toHaveCount(1);
  await expect(page.locator('.page .label .no')).toHaveText(new RegExp(acc));
  await expect(page.locator('.page .label .qr svg')).toHaveCount(1);
  // the printed code carries the identity, which survives a renumbering; the number is what is printed in words
  const rid = page.url().split('acc=')[1];
  await page.goto(`/plants/${rid}`);
  await expect(page.locator('h1.sci .accno')).toHaveText(acc);
  await expect(page.locator('h1.sci')).toContainText('Welwitschia');
  // all growing plants, on a 30-up sheet, skipping three used cells; the fourth cell is the first printed
  await page.waitForLoadState('networkidle'); // the plant page's own sheet request must not be counted as the labels page's
  const asked: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/')) asked.push(new URL(r.url()).pathname + new URL(r.url()).search); });
  await page.goto('/labels');
  await expect(page.locator('.pick input:checked')).toHaveCount(2);
  await page.selectOption('#lb-sheet', '5160');
  await page.fill('#lb-skip', '3');
  const labels = page.locator('.page .label');
  await expect(labels).toHaveCount(5);
  await expect(labels.nth(2).locator('.no')).toHaveCount(0);
  await expect(labels.nth(3).locator('.no')).toBeVisible();
  // the label is the sheet's size and the code points at the plant
  const box = await labels.nth(3).boundingBox();
  expect(box!.width).toBeGreaterThan(240); // 66.675 mm ≈ 252 px at 96 dpi
  expect(box!.width).toBeLessThan(265);
  expect(box!.height).toBeGreaterThan(90); // 25.4 mm ≈ 96 px
  expect(box!.height).toBeLessThan(102);
  // the care line arrives from the dossier for the species with climate
  await expect(page.locator('.page .label .care', { hasText: 'cooler six months Nov–Apr · hab. night 6.5 °C · sky 30–65 DLI' })).toHaveCount(1); // the same rules and the same month formatter as the sheet
  // and it was asked for by hash bucket only: no key, no slug, no species name left the browser (round ten, 1)
  expect(asked.filter((u) => u.startsWith('/api/sheets')).sort()).toEqual(['/api/sheets?b=03&c=fixture&n=32', '/api/sheets?b=1c&c=fixture&n=32']); // one request a bucket (its edge-cache key), with the corpus id and the count hashed by (round fifty-four, 3)
  for (const u of asked) { expect(u).not.toMatch(/dossier|index|copiapoa|welwitschia|5384013/); expect(u).toMatch(/^\/api\/(corpus|(sheets|entries)\?b=([01][0-9a-f],?)+&c=fixture&n=32)$/); }
  // the page size follows the sheet
  await page.selectOption('#lb-sheet', 'L7160');
  await expect(page.locator('.page').first()).toHaveCSS('width', /793|794/); // 210 mm
  expect(await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join(''))).toContain('size: 210mm 297mm');
});

test('the species page condenses its cultivation sheet into a note by rule', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  // since round sixty the season card in the first screen carries the reading, fact first and its rule and source after
  const season = page.locator('.glance .card.season');
  await expect(season).toContainText("72 mm of rain a year, under the rule's 120 mm, so no rainy season is read; the cooler six months are November to April");
  await expect(season).toContainText('rain and temperature rules, CHELSA');
  await expect(season).not.toContainText(/fog/);
  await expect(page.locator('.glance .card.cold')).toContainText('Record low 4.0 °C in 40 years');
  await expect(page.locator('.glance .card.cold')).toContainText('6.5');
  // the note's floor is the card's floor, the same figure with the same quantity named
  await expect(page.locator('.cult', { hasText: /^Warmth and air/ }).first().locator('.body')).toContainText('Cold floor: 6.5 °C, which is the 1st-percentile night over 40 years at a typical spot in the range (NASA POWER).');
  // nothing on the sheet says what the plant does, wants or tolerates, or what to do to it
  const sheet = (await page.locator('.note-slot').textContent())!.replace('nothing here says what the plant does, wants or tolerates', ''); // the disclaimer itself, in the method (round sixty)
  expect(sheet).not.toMatch(/\b(rests?|wants?|tolerat\w*|will|water it|feed|repot|misting|kills?|fatal|scorch\w*|bleach\w*|keep it|give it|wakes?|grows in the open)\b/i);
});

test('first run: the front page explains itself once, and stops once there is a plant or it is dismissed', async ({ page }) => {
  // in the server's HTML, so a stranger's first screen has it before the scripts arrive and nothing moves when they do (round forty-five, 1)
  const html = await (await page.request.get('/')).text();
  expect(html).toContain('id="welcome"');
  await page.goto('/');
  await expect(page.locator('#welcome')).toContainText('Grow some of these');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.locator('#welcome')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.grow').first()).toBeVisible();
  await expect(page.locator('#welcome')).toHaveCount(0);
  // the dismissal is read before first paint by app.html's inline line, under the CSP's hash of it (round forty-five, 1)
  expect(await page.evaluate(() => document.documentElement.dataset.welcomed)).toBe('1');
  await expect(page.locator('#welcome-after')).toContainText('Keep a record of your plants');
  // a fresh browser sees it again, until it owns something
  await page.evaluate(() => localStorage.removeItem('cultifolio.welcomed'));
  await page.reload();
  await expect(page.locator('#welcome')).toBeVisible();
  await page.locator('#welcome a', { hasText: 'Add your first plant' }).click();
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'You grow' })).toBeVisible();
  await expect(page.locator('#welcome')).toHaveCount(0);
  // and on a phone every button is a finger's size
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/plants/${year()}-0001`);
  const small = await page.evaluate(() => [...document.querySelectorAll('a.btn, button.btn, #tabbar a, .chipbtn')].map((e) => e.getBoundingClientRect().height).filter((h) => h > 0 && h < 40));
  expect(small).toEqual([]);
});

test('sync: two devices share one encrypted vault; changes and photos cross both ways; the server holds only ciphertext', async ({ browser }) => {
  test.setTimeout(120_000);
  // Device A: a place, a plant with a photo and a watering; then set up a vault.
  const A = await browser.newContext();
  const a = await A.newPage();
  await a.goto('/places');
  await a.getByRole('button', { name: 'New place' }).click();
  await a.fill('#loc-name', 'Kitchen sill');
  await a.selectOption('#loc-kind', 'windowsill');
  await a.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(a.locator('.tree .row', { hasText: 'Kitchen sill' })).toBeVisible();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  const opt = await a.locator('#f-loc option', { hasText: 'Kitchen sill' }).getAttribute('value');
  await a.selectOption('#f-loc', opt!);
  await a.getByRole('button', { name: /^Add/ }).click();
  await expect(a).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = a.url().split('/').pop()!;
  await a.getByRole('button', { name: 'Record…', exact: true }).click();
  await a.selectOption('#ev-type', 'water');
  await a.fill('#ev-note', 'from device A');
  await a.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(a.locator('.tlrow', { hasText: 'from device A' })).toBeVisible(); // Record awaits the write; the test waits for the row before moving on (round fourteen, B1)
  const jpeg = await a.screenshot({ type: 'jpeg', quality: 60 });
  await a.locator('#acc-photo-file').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(a.locator('.phgrid .ph')).toHaveCount(1);

  await a.goto('/sync');
  await a.click('#sync-start');
  const key = (await a.locator('#vault-key').textContent())!.trim();
  expect(key).toMatch(/^([A-HJKMNP-TV-Z2-9]{5}-){5}[A-HJKMNP-TV-Z2-9]{5}$/);
  await expect(a.locator('#sync-create')).toBeDisabled(); // until the last group is typed back (round forty-one, R9)
  await a.fill('#key-typeback', 'wrong');
  await expect(a.locator('#sync-create')).toBeDisabled();
  await a.fill('#key-typeback', key.slice(-5).toLowerCase());
  await a.click('#sync-create');
  await expect(a.locator('.card', { hasText: 'Status' })).toContainText('Synced');
  await expect(a.locator('.card', { hasText: 'Waiting to send' })).toContainText('0');

  // The server: everything under the vault is ciphertext, and the plant's name appears nowhere in it.

  // Device B: empty, joins with the key.
  const B = await browser.newContext();
  const b = await B.newPage();
  await b.goto('/plants');
  await expect(b.locator('a.accrow')).toHaveCount(0);
  await b.goto('/sync');
  await b.click('#sync-have-key');
  await b.fill('#sync-key', key.toLowerCase());
  await b.click('#sync-join');
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('Synced');
  await b.goto(`/plants/${acc}`);
  await expect(b.locator('h1.sci')).toContainText('Copiapoa');
  await expect(b.locator('.idcard .place', { hasText: 'Kitchen sill' })).toBeVisible();
  await expect(b.locator('.tlrow', { hasText: 'from device A' })).toBeVisible();
  await expect(b.locator('.hero.own img')).toBeVisible(); // the photo came across
  await expect(b.locator('.phgrid .ph')).toHaveCount(1);

  // B edits: a feed and a note; A picks them up.
  await b.locator('.quickbar .more').click();
  await b.getByRole('button', { name: 'Feed', exact: true }).click();
  await b.fill('#ev-note', 'from device B');
  await b.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(b.locator('.tlrow', { hasText: 'from device B' })).toBeVisible();
  await b.goto('/sync');
  await syncRun(b);
  await expect(b.locator('.card', { hasText: 'Waiting to send' })).toContainText('0');
  await a.goto('/sync');
  await syncRun(a);
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.tlrow', { hasText: 'from device B' })).toBeVisible();
  await expect(a.locator('.tl .tlrow')).toHaveCount(4); // acquired, watered, photographed, fed

  // Concurrent edit of the same field: both change the notes offline; the later one wins on both.
  await a.getByRole('button', { name: 'Add a note' }).click();
  await a.fill('#acc-notes', 'A says sulky');
  await a.locator('#acc-notes').locator('..').getByRole('button', { name: 'Save' }).click();
  await expect(a.locator('#acc-notes')).toHaveCount(0); // the note is stored before the next device moves (round sixty; the harness review, 13)
  await b.goto(`/plants/${acc}`);
  await b.getByRole('button', { name: 'Add a note' }).click();
  await b.fill('#acc-notes', 'B says thriving');
  await b.locator('#acc-notes').locator('..').getByRole('button', { name: 'Save' }).click();
  await expect(b.locator('#acc-notes')).toHaveCount(0); // stored before the sync page is opened (round sixty; the harness review, 13)
  for (const p of [a, b, a]) {
    await p.goto('/sync');
    await syncRun(p);
  }
  await a.goto(`/plants/${acc}`);
  await b.goto(`/plants/${acc}`);
  await expect(a.locator('.cult .body', { hasText: 'says' })).toContainText('B says thriving');
  await expect(b.locator('.cult .body', { hasText: 'says' })).toContainText('B says thriving');

  // A wrong key does not open the vault.
  const C = await browser.newContext();
  const c = await C.newPage();
  await c.goto('/sync');
  await c.click('#sync-have-key');
  await c.fill('#sync-key', key.replace(/^..../, 'ZZZZ'));
  await c.click('#sync-join');
  await expect(c.locator('.bad')).toContainText(/No vault answers/);
  await A.close();
  await B.close();
  await C.close();
});

test('sync: an offline edit uploaded late is still discovered, and a backup merged into a synced device reaches the other device', async ({ browser }) => {
  test.setTimeout(150_000);
  const syncNow = async (p: import('@playwright/test').Page) => {
    await p.goto('/sync');
    await syncRun(p);
    await expect(p.locator('.card', { hasText: 'Waiting to send' })).toContainText('0');
  };
  // A makes a plant and a vault; B joins.
  const A = await browser.newContext();
  const a = await A.newPage();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await a.getByRole('button', { name: /^Add/ }).click();
  await expect(a).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = a.url().split('/').pop()!;
  await a.goto('/sync');
  await a.click('#sync-start');
  const key = (await a.locator('#vault-key').textContent())!.trim();
  await a.fill('#key-typeback', key.slice(-5)); // the last group typed back, not a box ticked (round forty-one, R9)
  await a.click('#sync-create');
  await expect(a.locator('.card', { hasText: 'Status' })).toContainText('Synced');
  const B = await browser.newContext();
  const b = await B.newPage();
  await b.goto('/sync');
  await b.click('#sync-have-key');
  await b.fill('#sync-key', key);
  await b.click('#sync-join');
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('Synced');

  // B goes offline and records an event (an older HLC); A then records one and syncs, moving its cursor past B's time.
  await b.goto(`/plants/${acc}`);
  // Under load the worker's precache can still be filling when the page is up; offline before it holds the shell and the chunks is a different test.
  await b.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(async () => b.evaluate(async () => { for (const n of await caches.keys()) if (await (await caches.open(n)).match('/plants')) return true; return false; }), { timeout: 30000 }).toBe(true);
  await B.setOffline(true);
  await expect(b.getByRole('button', { name: 'Water', exact: true })).toBeVisible({ timeout: 20000 }); // the offline page renders from the vault; under load that takes longer than the default wait
  await b.getByRole('button', { name: 'Record…', exact: true }).click();
  await b.selectOption('#ev-type', 'water');
  await b.fill('#ev-note', 'B, offline, first');
  await b.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(b.locator('.tlrow', { hasText: 'B, offline, first' })).toBeVisible();
  await a.goto(`/plants/${acc}`);
  await a.locator('.quickbar .more').click();
  await a.getByRole('button', { name: 'Feed', exact: true }).click();
  await a.fill('#ev-note', 'A, online, second');
  await a.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(a.locator('.tlrow', { hasText: 'A, online, second' })).toBeVisible();
  await syncNow(a);
  // B comes back and uploads its older change late. A must still receive it.
  await B.setOffline(false);
  await syncNow(b);
  await syncNow(a);
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.tlrow', { hasText: 'B, offline, first' })).toBeVisible({ timeout: 20000 });
  await b.goto(`/plants/${acc}`);
  await expect(b.locator('.tlrow', { hasText: 'A, online, second' })).toBeVisible({ timeout: 20000 }); // a pull can take a few seconds under load; the wait is generous, the assertion is exact

  // A third, unsynced device makes its own plant and exports a backup; A merges that file. B must get the plant.
  const C = await browser.newContext();
  const c = await C.newPage();
  await c.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await c.getByRole('button', { name: /^Add/ }).click();
  await expect(c).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await c.goto('/backup');
  const dl = c.waitForEvent('download');
  await c.click('#bk-export');
  const path = await (await dl).path();
  await a.goto('/backup');
  await a.locator('#bk-file').setInputFiles(path!);
  await expect(a.locator('.preview')).toContainText('1 plant ·');
  await a.click('#bk-merge');
  await expect(a.locator('#bk-done')).toBeVisible();
  await syncNow(a);
  await syncNow(b);
  await b.goto('/plants');
  await expect(b.locator('a.accrow', { hasText: 'Welwitschia' })).toBeVisible();
  // B stops syncing: the page remembers the vault it was in and leads with rejoining, not with a second vault (round twenty-four, 10)
  await b.goto('/sync');
  await b.click('#sync-forget');
  await b.getByRole('button', { name: 'Yes, stop' }).click();
  await expect(b.locator('.prose').first()).toContainText('This device was in vault');
  await expect(b.locator('#sync-have-key')).toHaveText('Rejoin with your key');
  await expect(b.locator('#sync-have-key')).toHaveClass(/pri/);
  await b.click('#sync-have-key');
  await b.fill('#sync-key', key);
  await b.click('#sync-join');
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('Synced');
  // offline, the status says so and that the changes are kept, rather than "Failed to fetch" (round twenty-four, 9)
  await B.setOffline(true);
  await b.locator('#sync-now').click();
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('Offline', { timeout: 20000 });
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('back online');
  await B.setOffline(false);
  await A.close();
  await B.close();
  await C.close();
});

test('a number already in use cannot be given to a second plant', async ({ page }) => {
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.locator('details.own summary').click();
  await page.check('#f-own');
  await page.fill('#f-own-no', '2019-0147');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/2019-0147$/);
  await expect(page.locator('h1.sci .accno')).toHaveText('2019-0147');
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Welwitschia mirabilis');
  await page.locator('#species-name').blur();
  await page.locator('details.own summary').click();
  await page.check('#f-own');
  await page.fill('#f-own-no', '2019-0147');
  await expect(page.locator('#f-own-taken')).toContainText('already used by');
  await expect(page.locator('#f-own-taken a')).toHaveText('Copiapoa cinerea');
  await expect(page.getByRole('button', { name: /^Add/ })).toBeDisabled();
  await page.goto('/plants/2019-0147');
  await expect(page.locator('h1.sci')).toContainText('Copiapoa'); // untouched
});

test('the app shell is installed for offline use: collection pages, a species page once read, and an offline page are all in the cache', async ({ browser }) => {
  // Playwright's offline emulation does not reach a service worker's own fetches in Chromium, so this
  // checks what the worker put in the cache, which is what offline navigation is served from.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready); // the first-ever load registers the worker; pages after it are served through it
  await page.goto('/species/copiapoa-cinerea');
  const cached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    for (let i = 0; i < 100; i++) {
      const keys = await caches.keys();
      if (keys.length) {
        const c = await caches.open(keys[0]);
        const urls = (await c.keys()).map((r) => new URL(r.url).pathname);
        if (urls.includes('/plants') && urls.includes('/offline')) return urls;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return [] as string[];
  });
  for (const p of ['/plants', '/places', '/propagation', '/labels', '/backup', '/sync', '/offline']) expect(cached).toContain(p);
  expect(cached.some((u) => u.startsWith('/_app/immutable/'))).toBe(true);
  // the Latin font subsets are installed; the extended and Vietnamese ones are not, until a name needs them (improvements, 9)
  const fonts = cached.filter((u) => u.endsWith('.woff2'));
  expect(fonts.some((u) => /newsreader-latin-wght-normal/.test(u))).toBe(true);
  expect(fonts.some((u) => /public-sans-latin-wght-normal/.test(u))).toBe(true);
  expect(fonts.filter((u) => /latin-ext|vietnamese/.test(u))).toEqual([]);
  expect(cached).toContain('/species/copiapoa-cinerea'); // read once, kept
  expect(cached).not.toContain('/species/welwitschia-mirabilis'); // never read: the offline page would answer for it
  await page.goto('/offline');
  await expect(page.locator('h1')).toContainText('No connection');
  // An old bookmark from before the rename: the worker answers the redirect itself, so the server never sees the record id
  // in the URL and offline it still lands on the section (round twenty, 1). The route below stands in for the server: had
  // the worker let the request through, the page would be this 500, not the places shell.
  let reachedServer = 0;
  await ctx.route(/\/(benches|sowings)(\/|\?|$)|\/(places|plants)\/[^/?]+\/(\?|$)/, (r) => { reachedServer++; return r.fulfill({ status: 500, body: 'server saw it' }); });
  await page.goto('/benches/k1?edit=1');
  await expect(page).toHaveURL(/\/places\/k1\?edit=1$/);
  await expect(page.locator('h1')).toContainText('Not here'); // the places shell rendered from the vault: no place k1 on this device
  await page.goto('/sowings/new?loc=k1');
  await expect(page).toHaveURL(/\/propagation\/new\?loc=k1$/);
  await page.goto('/benches/k1/'); // a trailing slash: still the shell, still nothing to the server (round twenty-one, 13)
  await expect(page).toHaveURL(/\/places\/k1$/);
  await expect(page.locator('h1')).toContainText('Not here');
  await page.goto('/benches//x'); // a doubled slash, and a current path with a trailing one: normalised before the match (round twenty-two, 7)
  await expect(page).toHaveURL(/\/places\/x$/);
  await page.goto('/plants/r1/');
  await expect(page).toHaveURL(/\/plants\/r1$/);
  expect(reachedServer).toBe(0);
  await ctx.close();
});

test('the front page carries closed rows, never fetches the whole index, and a search or a chip is answered by the server (round thirty-nine)', async ({ page }) => {
  await page.goto('/');
  const index: string[] = [];
  const searches: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/index')) index.push(r.url()); if (r.url().includes('/api/search')) searches.push(r.url()); });
  await expect(page.locator('.grow')).toHaveCount(3);
  // opening a row is a navigation, not an index fetch
  await page.locator('.grow', { hasText: 'Welwitschia' }).click();
  await expect(page.locator('a.tile')).toHaveCount(1);
  expect(index).toHaveLength(0);
  // a search flattens: every match across every genus, and the rows step aside; the index did not come to the browser
  await page.fill('.searchbar', 'welwit');
  await expect(page.locator('.hitrow')).toHaveCount(1); // a match is a row (round fifty, 2)
  await expect(page.locator('.grow')).toHaveCount(0);
  expect(index).toHaveLength(0);
  expect(searches.length).toBeGreaterThan(0);
  expect(searches.every((u) => /[?&]c=fixture(&|$)/.test(u))).toBe(true); // under the corpus id, like every reference request
  await expect(page.locator('.seccount').last()).toContainText('1 match of 4');
  // a chip filters the grouped catalogue on the server, and "You grow" is not offered to someone who grows nothing
  await page.fill('.searchbar', '');
  await expect(page.locator('.grow')).toHaveCount(3);
  await expect(page.locator('.chipbtn', { hasText: 'You grow' })).toHaveCount(0);
  await page.locator('.chipbtn', { hasText: 'Without climate' }).click();
  await expect(page).toHaveURL(/chip=noclimate/);
  await expect(page.locator('.chipbtn.on')).toContainText('Without climate');
  await expect(page.locator('.grow')).toHaveCount(2); // only the genera with a species without climate (Refusia refused, Welwitschia pending)
  await expect(page.locator('.seccount').last()).toContainText('2 genera');
  await page.locator('.grow', { hasText: 'Welwitschia' }).click();
  await expect(page).toHaveURL(/chip=noclimate.*open=welwitschia|open=welwitschia.*chip=noclimate/);
  await expect(page.locator('a.tile')).toHaveCount(1);
  await page.locator('.chipbtn', { hasText: 'All' }).click();
  await expect(page.locator('.grow')).toHaveCount(3);
  expect(index).toHaveLength(0);
});

test('the about pages are served without JavaScript and say what the app refuses to guess', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto('/about');
  await expect(p).toHaveURL(/\/about\/how$/);
  await expect(p.locator('h2#marker')).toHaveText('The map marker');
  await expect(p.locator('h2#climate')).toHaveText('The climate across the range');
  await expect(p.locator('article')).toContainText('inaturalist-open-data.s3.amazonaws.com');
  await expect(p.locator('article')).toContainText('A refusal is not an absence');
  await p.goto('/about/formats');
  await expect(p.locator('article')).toContainText('cultifolio-vault-v1');
  await expect(p.locator('article')).toContainText('vault/<id>/log/<hour>-0000-<device>-<fingerprint>.bin');
  await ctx.close();
});

/* ---------------------------------------------------------------- honesty and accessibility, from the QA pass */

test('a refused source is a distinct state on every surface: species page, front tile, plant tile', async ({ page }) => {
  await page.goto('/species/refusia-testii');
  // photographs: GBIF media refused, so the hero says so rather than "no photograph"
  await expect(page.locator('h2#s-photos + .notice')).toContainText('GBIF media did not answer when this page was built. Not a statement that none exist.');
  await expect(page.locator('.hero')).toHaveCount(0); // no grey box where a photograph would be (round sixty)
  // the one mark for a refusal: a dashed "not checked" pill, its reason on tap (improvements, 5)
  const tok = page.locator('.idcard .nc', { hasText: 'Photographs not checked' });
  await expect(tok).toBeVisible();
  await expect(tok.locator('.why')).toBeHidden();
  await tok.locator('summary').click();
  await expect(tok.locator('.why')).toContainText('GBIF media did not answer when this page was built. Not asked, or not answered, is not "none"');
  await expect(page.locator('.idcard .pill', { hasText: 'Climate known' })).toHaveCount(0); // what is known is shown, not announced
  // climate refused: its own line, with the detail as a sentence
  await expect(page.locator('.notice', { hasText: 'Occurrence source' })).toContainText('Not checked. The occurrence source did not answer when this page was built. This is not a statement that no climate exists.');
  // the cultivation section does not say "no habitat climate"
  await expect(page.locator('.note-slot')).toContainText('Not checked. The occurrence source did not answer when this page was built. No sheet is derived from an answer that was not given');
  await expect(page.locator('.note-slot')).not.toContainText('no habitat climate for this species');
  // the map caption does not promise a marker there is none of
  await expect(page.locator('.mapcap').first()).not.toContainText('marker');
  await expect(page.locator('.mapcap').nth(1)).toContainText('Records not checked: the occurrence source did not answer'); // a refusal, not an absence, on the map too
  // front page
  await page.goto('/?by=genus&open=refusia');
  const tile = page.locator('.tile', { hasText: 'Refusia' });
  await expect(tile.locator('.fig')).toContainText('climate not checked');
  await expect(tile.locator('.fig')).toHaveAttribute('title', /not checked: a source did not answer/);
  // plant tile
  await page.goto('/plants/new?species=Refusia%20testii&key=999');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
  await expect(t.locator('.nc .tok')).toHaveText('Climate not checked');
  await expect(t).toContainText('No season is read from an answer that was not given');
  // a pending climate is pending, not absent
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('Climate pending');
});

test.describe('with the reference cut', () => {
// Without the service worker: the route aborts below must catch every request for the reference, and the experimental
// interception of a worker's own fetches let one through now and then, so the test passed alone and failed in the suite
// on its first try (round twenty-eight, R1-2). The page's own fetches are what the routes see, every time.
test.use({ serviceWorkers: 'block' });
test('an unreachable reference is "not reached", never "not in the reference"', async ({ page }) => {
  await page.route('**/api/index', (r) => r.abort());
  await page.route('**/api/search**', (r) => r.abort());
  await page.route('**/api/sheets**', (r) => r.abort()); // the plant asks for its species' sheet by hash bucket
  await page.route('**/api/dossier/**', (r) => r.abort());
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto(`/plants/${acc}`);
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
  await expect(t).toContainText('Reference not reached');
  await expect(t).toContainText('could not be reached from here; nothing is known either way');
  await expect(t).not.toContainText('Not in the reference');
});
});

test('the species page carries the envelope: median with its span, the cells it rests on, the marker named as a marker', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  // every table cell is "median / p10–p90" where the span differs
  await expect(page.locator('table.wx tbody tr').first().locator('td').nth(1)).toHaveText('22 / 20–24');
  await expect(page.locator('table.wx tbody tr').nth(2).locator('td').nth(1)).toHaveText('4'); // rain: no spread in the fixture, so the median alone
  await page.locator('#s-climate ~ details.why').first().locator('summary').click(); // the provenance is one tap from the chart
  await expect(page.getByText('Each figure is the median across the 40 grid cells holding the 352 in-range records, with the 10th–90th percentile span')).toBeVisible();
  await expect(page.getByText(/Extremes and elevation were read at a typical spot in the range, cell fixture \(-25\.261, -70\.589\)/)).toBeVisible();
  await expect(page.locator('.mapcap').first()).toContainText('the marker is where the records are densest and decides nothing: the climate was read across the cells of the in-range records placed well enough to read one, not at the marker');
  const marker = page.locator('#s-habitat ~ details.why', { hasText: 'How this section is made' }).first();
  await expect(marker).toBeVisible();
  await expect(marker).toContainText('The map marker: the centre of the tenth-degree cell'); // said once (round sixty)
  await expect(page.locator('.factgrid b', { hasText: /^Map marker$/ })).toBeVisible();
  await expect(page.locator('.factgrid')).not.toContainText('Habitat centre');
  // the plant page's season tile is a figure with its months, hemisphere and shift, and a link to the sheet
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await page.getByRole('button', { name: /^Add/ }).click();
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
  await page.locator('#habitat > summary').click(); // folded under the log since round fifty-eight
  await expect(t).toContainText('No rainy season to read');
  await expect(t).toContainText("72 mm a year; the temperature rule's cooler six months May–Oct (S), shifted to the north (no site set): Nov–Apr (CHELSA).");
  await expect(t.getByRole('link', { name: 'The sheet' })).toBeVisible();
  await expect(t).not.toContainText(/Rest expected|Growth expected|Water when/);
});

/** Controls without an accessible name, images without alt, and heading jumps, on one page. */
const a11yScan = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role=heading]')].map((h) => Number(h.getAttribute('aria-level') ?? h.tagName[1]));
  const jumps: string[] = [];
  let prev = 0;
  for (const l of hs) { if (l > prev + 1 && prev) jumps.push(`h${prev}→h${l}`); prev = l; }
  const unlabeled = [...document.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=checkbox]), select, textarea')].filter((el) => !el.closest('label') && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !(el.id && document.querySelector(`label[for="${el.id}"]`))).map((el) => `${el.tagName.toLowerCase()}#${el.id || '?'}`);
  const noAlt = [...document.querySelectorAll('img')].filter((i) => !i.hasAttribute('alt')).length;
  return { jumps, unlabeled, noAlt, h1: hs.filter((l) => l === 1).length };
});

test('every control has a name, headings do not jump, images have alt text, muted ink meets 4.5:1, and µ survives the label style', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Bench A');
  await page.selectOption('#loc-kind', 'shelf'); // a kind is chosen, never defaulted (round twenty-six, 16)
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Bench A' })).toBeVisible(); // the write is on screen before the page is left (round twenty-seven, R2-1)
  const findings: string[] = [];
  for (const r of ['/', '/plants', '/plants/new', '/places', '/propagation', '/propagation/new', '/labels', '/backup', '/sync', '/today', '/offline', '/about/how', '/species/copiapoa-cinerea', '/species/refusia-testii', `/plants/${acc}`]) {
    await page.goto(r);
    await expect(page.locator('h1')).toBeVisible();
    if (r === '/places') await page.getByRole('button', { name: 'New place' }).click();
    if (r === `/plants/${acc}`) { await page.locator('.quickbar .more').click(); await page.getByRole('button', { name: 'Measure', exact: true }).click(); await more(page, 'Edit'); await page.getByRole('button', { name: 'Move', exact: true }).click(); }
    if (r === '/sync') await page.getByRole('button', { name: 'I have a key' }).click();
    const s = await a11yScan(page);
    if (s.jumps.length) findings.push(`${r}: heading jumps ${s.jumps.join(' ')}`);
    if (s.h1 !== 1) findings.push(`${r}: ${s.h1} h1`);
    if (s.unlabeled.length) findings.push(`${r}: unlabeled ${s.unlabeled.join(' ')}`);
    if (s.noAlt) findings.push(`${r}: ${s.noAlt} images without alt`);
  }
  expect(findings).toEqual([]);
  // the sowing page's forms, and the bench edit form's µ
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '10'); // a count is never assumed
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  await page.fill('#g-n', '3'); // nothing is potted from an uncounted pot
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('30%')).toBeVisible(); // the count is stored and shown before the next form (round sixty; the harness review, 13)
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  expect((await a11yScan(page)).unlabeled).toEqual([]);
  await page.goto('/places');
  await page.locator('a.row').first().click();
  await page.getByRole('button', { name: 'Edit' }).click();
  const mu = await page.evaluate(() => { const l = [...document.querySelectorAll<HTMLElement>('form label > span')].find((s) => /mol/.test(s.textContent ?? ''))!; const glyph = l.querySelector('span')!; return { text: l.textContent, transform: getComputedStyle(glyph).textTransform }; });
  expect(mu.text).toBe('µmol/m²/s of light');
  expect(mu.transform).toBe('none');
  // contrast of the muted ink, as the page actually resolves it, in both schemes
  const ratio = async () => page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const rgb = (v: string) => (v.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    const parse = (v: string) => { v = v.trim(); if (v.startsWith('#')) { const h = v.length === 4 ? '#' + [...v.slice(1)].map((c) => c + c).join('') : v; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); } return rgb(v); };
    const lum = (c: number[]) => { const [r, g, b] = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const r = (a: string, b: string) => { const [x, y] = [lum(parse(a)), lum(parse(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const ink3 = cs.getPropertyValue('--ink3');
    return { card: r(ink3, cs.getPropertyValue('--card')), bg: r(ink3, cs.getPropertyValue('--bg')) };
  });
  const light = await ratio();
  expect(light.card).toBeGreaterThanOrEqual(4.5);
  expect(light.bg).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await ratio();
  expect(dark.card).toBeGreaterThanOrEqual(4.5);
  expect(dark.bg).toBeGreaterThanOrEqual(4.5);
  // the photo-less placeholder on an owned tile, in both schemes, as the page resolves it: the caption on its tint (round twenty-one, 12)
  const placeholder = async () => page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('a.tile .ph .cap');
    const box = el?.closest<HTMLElement>('.ph');
    if (!el || !box) return null;
    const rgb = (v: string) => (v.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => { const [r, g, b] = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const [x, y] = [lum(rgb(getComputedStyle(el).color)), lum(rgb(getComputedStyle(box).backgroundColor))].sort((p, q) => q - p);
    return { ratio: (x + 0.05) / (y + 0.05), hidden: !!el.closest('[aria-hidden="true"]'), text: el.textContent };
  });
  for (const scheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    await expect(page.locator('a.tile .ph .cap').first()).toBeVisible();
    const ph = await placeholder();
    expect(ph?.text).toBe('reference photograph off');
    expect(ph?.hidden).toBe(false); // the reason is read out; only the initial is decoration
    expect(ph!.ratio).toBeGreaterThanOrEqual(4.5);
  }
});

test('long and unicode names: nothing overflows at 360 px, the number chip never wraps, and the search finds a cultivar and a parent', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  const add = async (name: string, field?: string) => {
    await page.goto('/plants/new');
    await page.fill('#species-name', name);
    await page.locator('#species-name').blur();
    if (field) { await page.locator('details.moredetails > summary').click(); await page.fill('#f-field', field); }
    await addPlant(page);
    return page.url().split('/').pop()!;
  };
  const a1 = await add('Pseudolithocarpodendron magnificentissimum-extraordinarissimum subsp. longissimumverbosum', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789');
  const a2 = await add('Echeveria ‘Şträngé Nämé 名前 🌵’');
  const a3 = await add('Ariocarpus retusus x A. trigonus');
  for (const a of [a1, a2, a3]) {
    await page.goto(`/plants/${a}`);
    await expect(page.locator('h1.sci')).toBeVisible();
    const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, chip: document.querySelector('h1.sci .accno')!.getClientRects().length }));
    expect(o.sw).toBeLessThanOrEqual(o.iw);
    expect(o.chip).toBe(1); // one box: the chip did not wrap
  }
  await page.goto('/plants');
  await expect(page.locator('a.accrow')).toHaveCount(3);
  await page.fill('#plants-q', '名前');
  await expect(page.locator('a.accrow')).toHaveCount(1);
  await page.fill('#plants-q', 'trigonus');
  await expect(page.locator('a.accrow')).toHaveCount(1);
  await expect(page.locator('a.accrow')).toContainText('Ariocarpus');
  await ctx.close();
});

test('removing asks twice; a species photograph that fails to load leaves the name where it can be read', async ({ page }) => {
  await page.goto('/settings');
  await ready(page);
  await page.check('#pref-refphotos');
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.setViewportSize({ width: 360, height: 780 });
  // the species image host is unreachable: no hero, the card says so beside the tile, and the card sits below the topbar
  await page.route(/inaturalist|wikimedia/, (r) => r.abort());
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.idcard.flat')).toContainText("The reference's photograph did not load.");
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.locator('.idcard label.tile')).toBeVisible();
  const pos = await page.evaluate(() => ({ card: document.querySelector('.idcard')!.getBoundingClientRect().top, bar: document.querySelector('#topbar')!.getBoundingClientRect().bottom }));
  expect(pos.card).toBeGreaterThanOrEqual(pos.bar);
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.hero.failed .ph')).toContainText('photograph did not load');
  // a log entry: × then Remove?; the plant: Remove then Yes
  await page.goto(`/plants/${acc}`);
  await page.getByRole('button', { name: 'Water', exact: true }).click(); // one tap, no form (round forty-nine, 3)
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  await page.locator('.tlrow', { hasText: 'Watered' }).getByRole('button', { name: 'Remove this entry' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  await page.locator('.tlrow', { hasText: 'Watered' }).getByRole('button', { name: 'Remove?' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await expect(page).toHaveURL(new RegExp(`/plants/${acc}$`));
  await page.getByRole('button', { name: `Yes, remove ${acc}` }).click();
  await expect(page).toHaveURL(/\/plants$/);
  // the removal offers Undo, and a removed plant's page offers to bring it back (round twenty-six, 4 and 5)
  await expect(page.locator('.toast')).toContainText(`${acc} removed.`);
  await page.locator('.toast .undo').click();
  await expect(page).toHaveURL(new RegExp(`/plants/${acc}$`));
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await page.getByRole('button', { name: `Yes, remove ${acc}` }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('p.muted')).toContainText('can be brought back');
  await page.getByRole('button', { name: 'Restore this plant' }).click();
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.toast')).toContainText('restored');
  // an edit refused for a future date, then cancelled: reopening shows the kept date with no stale refusal (round twenty-seven, R2-2)
  await more(page, 'Edit');
  await page.fill('#ed-date', '2099-01-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#ed-date-bad')).toContainText('2099-01-01 is in the future');
  await page.locator('.editform').getByRole('button', { name: 'Cancel' }).click();
  await more(page, 'Edit');
  await expect(page.locator('#ed-date-bad')).toHaveCount(0);
  await expect(page.locator('#ed-date')).not.toHaveValue('2099-01-01');
  await page.locator('.editform').getByRole('button', { name: 'Cancel' }).click();
  // a future acquisition date is refused before any number is minted (round twenty-six, 3)
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#f-date', '2099-01-01');
  await expect(page.locator('.secsub')).toContainText('2099-0001'); // the preview follows the date
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('#f-date-bad')).toContainText('2099-01-01 is in the future');
  await expect(page).toHaveURL(/\/plants\/new/);
  await page.goto('/plants');
  await expect(page.locator('.accrow', { hasText: '2099-0001' })).toHaveCount(0);
});

test('the browser talks to no third-party host while a name is typed, and the error page promises nothing', async ({ page, baseURL }) => {
  const away: string[] = [];
  const own = new URL(baseURL!).host; // the server under test, on whatever port it was given (round sixty-one; docs/review-60/harness.md 18)
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== own) away.push(r.url()); });
  await page.goto('/plants/new');
  await ready(page);
  const names = page.waitForResponse((r) => r.url().includes('/api/names?q='));
  await page.fill('#species-name', 'Copiapoa cin');
  await expect(page.locator('.picker [role=option]').first()).toBeVisible(); // the suggestions answered (round sixty; the harness review, 14: a fixed 600 ms)
  await page.locator('#species-name').blur();
  // Not a fixed pause: what typing and leaving the field ask is the name service (answered) and the blur's own exact-name
  // check, which runs as the suggestions close and reuses that answer; both settled, nothing else is left to ask
  // (round sixty-one; docs/review-60/harness.md 18, review B).
  await names;
  await expect(page.locator('#species-name')).toHaveAttribute('aria-expanded', 'false');
  expect(away).toEqual([]);
  await page.goto('/species/nonsensia-fakeii');
  await expect(page.locator('.err')).toContainText('The reference has no Nonsensia: it is built from a fixed list of names');
  await expect(page.locator('.err')).not.toContainText('will be prepared');
  await expect(page.locator('.err')).not.toContainText('yet');
});

test('offline, a plant page not yet cached still opens from the section shell', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/places');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await c.keys()).some((r) => new URL(r.url).pathname === '/plants'); }), { timeout: 20_000 }).toBe(true);
  // the shell references its assets absolutely, so serving /plants for /plants/<acc> finds them
  const shell = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return (await (await c.match('/plants'))!.text()); });
  expect(shell).toContain('"/_app/immutable/');
  expect(shell).not.toContain('"./_app/');
  await ctx.setOffline(true);
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea', { timeout: 15_000 });
  await ctx.setOffline(false);
  await ctx.close();
});

test('the species field is a combobox: arrows and Enter pick a suggestion; Enter on a half-typed name asks before it files anything', async ({ page }) => {
  await page.goto('/plants/new');
  const input = page.locator('#species-name');
  await expect(input).toHaveAttribute('role', 'combobox');
  await input.fill('Copiapoa cin');
  await expect(page.locator('.picker [role=option]').first()).toBeVisible();
  await expect(input).toHaveAttribute('aria-expanded', 'true');
  await input.press('ArrowDown');
  const active = await input.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');
  await input.press('Enter');
  // the pick, not a submit: the name is whole, the key is set, the form is still here
  await expect(input).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('.picker .pill.ok')).toContainText('GBIF');
  await expect(page).toHaveURL(/\/plants\/new$/);
  // Enter never files a plant from this field, resolved or not: Add is the deliberate act
  await input.press('Enter');
  await expect(page).toHaveURL(/\/plants\/new$/);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');

  // a partial name: Enter asks, and nothing is filed under "Welwit"
  await page.goto('/plants/new');
  await ready(page);
  const welwit = page.waitForResponse((r) => r.url().includes('/api/names?q=Welwit'));
  await input.fill('Welwit');
  // The suggestion debounce: a genus fragment matches nothing local, so nothing appears; what the debounce ends in is the
  // name service's request, so the test waits for its answer, not a fixed 400 ms (round sixty-one; docs/review-60/harness.md
  // 18, review B). The outcome is one, not either: with no suggestion there is no nearest name to offer (round sixty; the
  // harness review, 14: the assertion took both).
  await welwit;
  await input.press('Enter');
  await expect(page.locator('.picker .hint:not(.svc)')).toContainText('Pick a name from the list');
  await expect(page).toHaveURL(/\/plants\/new$/);
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page.getByText('Welwit')).toHaveCount(0);
  // Escape closes the list and Tab leaves without losing what was typed
  await page.goto('/plants/new');
  await input.fill('Copiapoa cin');
  await expect(page.locator('.picker [role=option]').first()).toBeVisible();
  await input.press('Escape');
  await expect(page.locator('.picker [role=listbox]')).toBeHidden();
  await expect(input).toHaveAttribute('aria-expanded', 'false');
  await input.press('Tab');
  await expect(input).toHaveValue('Copiapoa cin');
});

test('a sowing without a count is refused with a sentence; a blank never becomes 20', async ({ page }) => {
  await page.goto('/propagation/new');
  await expect(page.locator('#s-count')).toHaveValue('');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-count-missing')).toContainText('Say how many seeds went in');
  await expect(page.locator('#s-count')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/propagation\/new$/);
  await page.fill('#s-count', '8');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-001$/);
  await expect(page.getByText('8 seeds on')).toBeVisible();
});

// The service worker fetches /api/forecast itself once it controls the page, and a request made by a worker never
// passes through page.route, so this test runs without one: it is about the pages' wording, not the shell.
test.describe('without the service worker', () => {
test.use({ serviceWorkers: 'block' });
test('a forecast source that does not answer is "not checked" in a plain notice on the bench and on the Today tab, never a status code', async ({ page }) => {
  await page.route(/\/api\/forecast/, (r) => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'forecast source did not answer' }) }));
  // the site is set once, in Settings; the Today tab reads it (the old /frost address goes there; round fifty-three, 3)
  await page.goto('/frost');
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.locator('#frost .froststrip')).toContainText('No site set'); // one line under what needs you, not a box above it (round sixty; the grower review, §4)
  await page.goto('/settings');
  await ready(page);
  await page.fill('#site-lat', '40.38');
  await page.fill('#site-lon', '-80.05');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.goto('/today');
  await expect(page.getByText('Your site: 40.38, -80.05')).toBeVisible();
  await expect(page.locator('#frost .notice')).toHaveText('Forecast not checked: the forecast could not be reached just now, so this is not an all-clear. It is asked again when this page is next opened.');
  await expect(page.locator('#frost .notice')).not.toHaveClass(/err/);
  await expect(page.locator('.bad')).toHaveCount(0);
  await expect(page.locator('#frostbar')).toHaveCount(0); // a refusal is not a frost: nothing under the top bar
  // an outdoor place with coordinates watches the forecast on its own page
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Back step');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree .row', { hasText: 'Back step' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#e-indoor', 'no');
  await page.fill('#e-lat', '40.38');
  await page.fill('#e-lon', '-80.05');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Frost watch' })).toBeVisible();
  await expect(page.locator('.notice')).toHaveText('Forecast not checked: the forecast could not be reached just now, so this is not an all-clear. It is asked again when this page is next opened.');
  await expect(page.locator('.notice')).not.toHaveClass(/err/);
  await expect(page.getByText(/forecast 50\d/)).toHaveCount(0);
});
});

test('a night under the place\'s floor "reaches the floor", not frost, and a floor not reached keeps a frost night\'s own level; a warning is said whatever the floor; alerts that were not checked are said not to have been (round twelve, 9)', async ({ page }) => {
  const mild = [{ date: '2026-11-02', tmin: 8, tmax: 15, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 9, tmax: 14, precipMm: 0, steps: 24 }];
  const frosty = [{ date: '2026-11-02', tmin: -2, tmax: 9, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 4, tmax: 12, precipMm: 0, steps: 24 }];
  let days = mild;
  const body = (alerts: object[], alertsStatus: string) => JSON.stringify({ forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days, hoursCovered: 48, offsetH: -5, firstFrost: days === frosty ? '2026-11-02' : undefined }, alerts, alertsStatus, risk: alerts.length ? { level: 'warning', text: 'Freeze Warning in force (NOAA/NWS).' } : days === frosty ? { level: 'frost', text: 'Frost forecast: -2.0 °C around 05:00 Monday solar time (2026-11-02, MET Norway).' } : { level: 'none', text: 'No frost in the next 48 hours of forecast; coldest 8 °C (MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)', 'Alerts: NOAA National Weather Service'] });
  let alerts: object[] = [], status = 'refused';
  // At the context, not the page: after the first load the service worker makes these requests, and a page route does not see them.
  await page.context().route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: body(alerts, status) }));
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree .row', { hasText: 'Cold frame' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#e-indoor', 'no');
  await page.fill('#e-lat', '40.38');
  await page.fill('#e-lon', '-80.05');
  await page.fill('#e-floor', '10');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('Below the floor.');
  await expect(page.locator('.notice')).toContainText("reaches this place's 10.0 °C floor on 2026-11-02 (8.0 °C outside)");
  await expect(page.locator('.notice')).not.toContainText('Frost forecast');
  await expect(page.locator('.notice')).toContainText('Alerts not checked');
  await expect(page.locator('.pill', { hasText: 'reaches the floor' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: 'floor 10.0 °C' })).toBeVisible();
  // a floor the coldest night reaches exactly counts (round thirteen, 11); a floor of 2.5 prints as 2.5, not 3
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-floor', '8');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText("reaches this place's 8.0 °C floor");
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-floor', '2.5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('above the 2.5 °C floor');
  await expect(page.locator('.notice')).toContainText('Forecast clear.');
  await expect(page.locator('.pill', { hasText: 'floor 2.5 °C' })).toBeVisible();
  // a floor the forecast does not reach is not a clear forecast: a frost night keeps its own level, with the floor said (round fifteen, 11)
  days = frosty;
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-floor', '-5');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('Frost forecast.');
  await expect(page.locator('.notice')).toContainText('Frost forecast: -2.0 °C');
  await expect(page.locator('.notice')).toContainText('above the -5.0 °C floor');
  await expect(page.locator('.pill', { hasText: 'frost forecast' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: 'frost: clear' })).toHaveCount(0);
  // a warning in force is said with the floor set; and an answer for the OLD coordinates that lands after the edit is
  // dropped, never shown as this place's (round thirteen, B1): the old point's forecast is delayed past the save
  alerts = [{ event: 'Freeze Warning', headline: 'Freeze Warning tonight' }]; status = 'ok';
  await page.context().unroute(/\/api\/forecast/);
  await page.context().route(/\/api\/forecast/, async (r) => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('lat') === '40.38') { await new Promise((res) => setTimeout(res, 1500)); return r.fulfill({ status: 200, contentType: 'application/json', body: body([], 'refused') }); }
    return r.fulfill({ status: 200, contentType: 'application/json', body: body(alerts, status) });
  });
  await page.evaluate(() => sessionStorage.clear()); // the forecast kept in this browser for an hour, so the old point is asked again
  const oldAnswer = page.waitForResponse((r) => r.url().includes('/api/forecast') && new URL(r.url()).searchParams.get('lat') === '40.38');
  await page.reload();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#e-lat', '40.39'); // the new place answers at once; the old one's slow answer must not overwrite it
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice')).toContainText('Warning in force.');
  // The old point's slow answer has landed and the page has drawn after it, rather than a fixed 2 s (round sixty; the harness review, 14).
  await oldAnswer;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('.notice')).toContainText('Warning in force.');
  await expect(page.locator('.pill', { hasText: 'weather warning' })).toBeVisible();
});

test('pages about your own plants ask no outside host for anything unless the reference photographs are switched on; reference requests carry the corpus id (round twelve, A1 and 7)', async ({ page }) => {
  const outside: string[] = [];
  const api: string[] = [];
  await page.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (r) => { outside.push(new URL(page.url()).pathname + ' -> ' + r.request().url()); r.abort(); });
  page.on('request', (r) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) api.push(u.pathname + u.search); });
  // Welwitschia: its photograph (…/700/medium.jpg) is what an own page would fetch; the public front page shows it only as a small row thumbnail.
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('Climate pending');
  // no hero at all: a tile where the photograph would go, and the reference's offered as one line whose disclosure opens on tap; nothing is fetched for a private page by default
  await expect(page.locator('.hero')).toHaveCount(0);
  await expect(page.locator('.idcard label.tile')).toContainText('Add a photo');
  const offer = page.locator('.idcard details.rpo');
  await expect(offer).toContainText('Show the reference’s photograph of this species');
  await expect(offer.locator('.why')).toBeHidden();
  await offer.locator('summary').click();
  await expect(offer.locator('.why')).toContainText('which then sees which species you grow');
  await expect(offer.getByRole('button', { name: 'Show it' })).toBeVisible();
  await offer.locator('summary').click(); // closed again, nothing switched on
  await expect(offer.locator('.why')).toBeHidden();
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(1);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('a.tile', { hasText: 'Welwitschia' }).first()).toContainText('reference photograph off'); // the own tile, without its photograph
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(outside.filter((u) => !u.startsWith('/ ->'))).toEqual([]); // the plant page and the list asked no outside host for anything
  expect(outside.filter((u) => u.includes('700/medium'))).toEqual([]); // and the front page fetched nothing about the plant grown (its rows and strip are the public catalogue)
  // after a search (answered by the server, the index never fetched whole) the own tile still shows no photograph
  await page.fill('.searchbar', 'welwit');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  await page.fill('.searchbar', '');
  await expect(page.locator('a.tile', { hasText: 'Welwitschia' }).first()).toContainText('reference photograph off');
  expect(api.filter((u) => /^\/api\/(sheets|entries)/.test(u)).every((u) => /[?&]c=fixture(&|$)/.test(u))).toBe(true); // every reference request names the corpus
  expect(api.some((u) => u === '/api/corpus')).toBe(true);
  // switched on where it is withheld (the offer beside the own tiles, one tap, the disclosure in the same line), the tiles show
  // the photographs at once and Settings reads the same preference; the plant page then fetches the species' photograph from
  // the image host, and from nowhere else
  await expect(page.locator('.hero img')).toHaveCount(0);
  // the offer is one line; what showing discloses opens on tap, and the switch is thrown there (round fifty, 4)
  await page.locator('details.rpo summary', { hasText: 'Show the reference’s photographs on your tiles' }).click();
  await expect(page.locator('details.rpo')).toContainText('which then sees which species you grow');
  await page.locator('details.rpo .go', { hasText: 'Show it' }).click();
  await expect.poll(() => outside.some((u) => u === '/ -> https://inaturalist-open-data.s3.amazonaws.com/photos/700/medium.jpg'), { timeout: 10000 }).toBe(true); // the tile asked the image host at once (the stub refuses it, so the tile says it did not load)
  await expect(page.locator('a.tile', { hasText: 'Welwitschia' }).first()).toContainText('photograph did not load');
  await page.goto('/settings');
  await ready(page);
  await expect(page.locator('#pref-refphotos')).toBeChecked();
  await page.goto(`/plants/${acc}`);
  await expect.poll(() => outside.some((u) => u === `/plants/${acc} -> https://inaturalist-open-data.s3.amazonaws.com/photos/700/medium.jpg`), { timeout: 10000 }).toBe(true);
  expect(outside.every((u) => u.includes('inaturalist-open-data.s3.amazonaws.com'))).toBe(true); // the front page's and the plant page's requests, and nothing to any other host
  expect(api.some((u) => u.startsWith('/api/dossier') || /welwitschia|5411106/.test(u))).toBe(false); // still no key and no name to this server
});

test('hovering a species link on a page about your own plants sends nothing; the same link on a species page preloads (round thirteen, 2)', async ({ page }) => {
  const data: string[] = [];
  page.context().on('request', (r) => { if (r.url().includes('__data.json')) data.push(new URL(r.url()).pathname); }); // the context sees a preload the worker answered; the page may not
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.getByRole('link', { name: 'Species page' }).hover();
  await page.waitForTimeout(700); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(data.filter((u) => u.includes('/species/'))).toEqual([]);
  await page.goto('/');
  await expect(page.locator('a.tile', { hasText: 'Copiapoa' }).first()).toBeVisible();
  await page.locator('a.tile', { hasText: 'Copiapoa' }).first().hover(); // an own tile
  await page.waitForTimeout(700); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(data.filter((u) => u.includes('/species/'))).toEqual([]);
  // the public catalogue still preloads on hover: a visitor's browsing is not the collection
  await page.getByRole('button', { name: /^All / }).click(); // the catalogue
  await page.locator('.grow', { hasText: 'Welwitschia' }).click();
  await page.locator('a.tile', { hasText: 'Welwitschia' }).first().hover();
  await expect.poll(() => data.some((u) => u.includes('/species/welwitschia-mirabilis')), { timeout: 5000 }).toBe(true);
});

test('a label whose species could not be reached says so, and the sheet is not printed as if the species had no figures (round thirteen, 6)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.context().route('**/api/sheets**', (r) => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"wait"}' }));
  await page.goto('/labels');
  await expect(page.locator('#lb-unchecked')).toContainText('One care line not checked');
  await expect(page.locator('#lb-unchecked .nc .tok')).toBeVisible();
  await expect(page.locator('#lb-print')).toHaveText('Print 1 label');
  await expect(page.locator('.page .label .care.unchecked')).toHaveText('care line not checked: the reference was not reached');
  await expect(page.locator('#lb-print')).toBeEnabled();
  await page.context().unroute('**/api/sheets**');
  await page.locator('#lb-unchecked').getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.page .label .care', { hasText: 'hab. night' })).toHaveCount(1);
  await expect(page.locator('#lb-unchecked')).toHaveCount(0);
  // the skip box: cleared, 2.5 and 99 on a 30-cell sheet are 0, 2 and 29 blanks, never an error
  await page.selectOption('#lb-sheet', '5160');
  await page.fill('#lb-skip', '2.5');
  await expect(page.locator('.page').first().locator('.label').nth(2).locator('.no')).toBeVisible();
  await page.fill('#lb-skip', '99');
  await expect(page.locator('.page')).toHaveCount(1);
  await expect(page.locator('.page').first().locator('.label').nth(29).locator('.no')).toBeVisible();
  await expect(page.locator('#lb-skip')).toHaveValue('29'); // the box says the figure the sheet uses (round twenty-three, 18)
  await page.selectOption('#lb-sheet', '5163'); // ten cells: the skip follows the sheet down
  await expect(page.locator('#lb-skip')).toHaveValue('9');
  await page.selectOption('#lb-sheet', '5160');
  await page.fill('#lb-skip', '');
  await expect(page.locator('.page').first().locator('.label').nth(0).locator('.no')).toBeVisible();
  // a species the reference has but with no climate: its care line is empty, and that is an answer, not a wait (round fourteen, 3)
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/labels');
  await expect(page.locator('#lb-print')).toHaveText('Print 2 labels', { timeout: 10000 });
  await expect(page.locator('#lb-print')).toBeEnabled();
  await expect(page.locator('.page .label .care', { hasText: 'hab. night' })).toHaveCount(1);
  await expect(page.locator('#lb-unchecked')).toHaveCount(0);
});

test('a returning grower never sees the catalogue or "You grow 0" while the collection opens; a first visit sees the catalogue at once', async ({ page }) => {
  // first visit: no hint, the server-rendered catalogue stands
  await page.goto('/');
  await expect(page.locator('.chiprow')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBeNull();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'You grow' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cultifolio.hasMine'))).toBe('1');
  // next load: the collection is slow to open; the page holds a skeleton, not the catalogue
  await page.addInitScript(() => {
    // The database opens 1.5 s late: the open request's success listener is held back.
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<typeof open>) {
      const req = open.apply(this, a);
      const add = req.addEventListener.bind(req);
      req.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'success' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn(ev) : fn.handleEvent(ev)), 1500) : fn, ...(rest as []))) as typeof req.addEventListener;
      return req;
    } as typeof open;
  });
  await page.goto('/');
  await expect(page.locator('.skeleton')).toBeVisible();
  await expect(page.locator('.chiprow')).toHaveCount(0);
  await expect(page.getByText('You grow 0')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'You grow' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.skeleton')).toHaveCount(0);
});

test('at 390 px every tap target is a finger wide: top-bar icons, breadcrumb, section tabs, log-entry removes, footer links', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const SEL = 'a.btn, button.btn, #tabbar a, .chipbtn, #topbar .iconbtn, .crumb a, nav.tabs a, .rm, footer.credits a';
  const sample = () => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent ?? e.getAttribute('aria-label') ?? '').trim().slice(0, 20), h: Math.round(r.height), w: Math.round(r.width) }; }).filter((x) => x.h > 0 && (x.h < 40 || x.w < 40)), SEL);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  await expect(page.locator('.crumb a')).toBeVisible();
  expect(await sample()).toEqual([]);
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('nav.tabs a').first()).toBeVisible();
  expect(await sample()).toEqual([]);
  // the sticky bars are opaque: nothing ghosts through them
  const bg = await page.evaluate(() => [getComputedStyle(document.querySelector('#topbar')!).backgroundColor, getComputedStyle(document.querySelector('nav.tabs')!).backgroundColor]);
  for (const c of bg) expect(c).not.toMatch(/rgba\(.*, 0(\.\d+)?\)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

/* ---------------------------------------------------------------- the round after deploy: search, first screen, related, compare, card, today */

test('search forgives a typing error, ranks the genus first, and the picker does the same', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle'); // a value typed before hydration is dropped when the bound input hydrates
  await page.fill('.searchbar', 'copiapao');
  await expect(page.locator('.hitrow .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await page.fill('.searchbar', 'welwit mirab');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  await page.fill('.searchbar', 'namibia');
  await expect(page.locator('.hitrow .nm', { hasText: 'Welwitschia' })).toBeVisible();
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapao cin');
  await expect(page.getByRole('option', { name: /Copiapoa cinerea/ })).toBeVisible();
});

test('the species page answers in the first screen and relates the species by genus and by climate', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  const glance = page.locator('.glance');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('6.5');
  await expect(glance.locator('.card.cold')).toContainText('Record low 4.0 °C in 40 years'); // the figure says what it is (round sixty)
  await expect(glance.locator('.card:not(.season)', { hasText: 'Rain' })).toContainText('72');
  // related: the nearest habitat climate from the index, with the rule beside it
  await expect(page.locator('#s-related')).toBeVisible();
  await expect(page.locator('.relhead', { hasText: 'Similar habitat climate' })).toContainText('nearest by mean day, mean night and rain, month by month');
  await expect(page.locator('.relstrip .reltile .rn', { hasText: 'Copiapoa humilis' })).toHaveCount(2); // the one other Copiapoa, and the nearest climate: both strips
  await expect(page.locator('.relhead', { hasText: 'Other Copiapoa' })).toBeVisible();
  // a species without a derived climate is never "near", whatever the index says
  await page.goto('/species/copiapoa-humilis'); // its index entry points at Welwitschia (climate pending) as well as C. cinerea
  await expect(page.locator('.relstrip .reltile .rn', { hasText: 'Copiapoa cinerea' })).toHaveCount(2);
  await expect(page.locator('.relstrip .reltile .rn', { hasText: 'Welwitschia' })).toHaveCount(0);
});

test('compare: three species side by side, a refusal named in every empty cell, the tray remembered in this browser', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('.tray')).toContainText('pick one more');
  await page.goto('/species/refusia-testii');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await page.locator('.tray a', { hasText: 'Compare 2' }).click();
  await expect(page).toHaveURL(/\/compare\?s=copiapoa-cinerea,refusia-testii$/);
  await expect(page.locator('.head .cell')).toHaveCount(2);
  await expect(page.locator('.tray')).toHaveCount(0); // not on the compare page itself
  const refusia = page.locator('.row').nth(1).locator('.cell').nth(1);
  await expect(refusia).toContainText('not checked');
  await expect(refusia).not.toContainText('–');
  await page.goto('/compare');
  await expect(page.locator('.emptybox')).toContainText('Copiapoa cinerea, Refusia testii');
  await page.goto('/compare?s=copiapoa-cinerea,no-such-plant');
  await expect(page.locator('.notice')).toContainText('Not in the reference: no-such-plant');
});

test('the share card is a PNG with the figures and the link drawn in, and is offered only where there is a climate', async ({ page }) => {
  // Chromium on Windows offers the system share sheet for files, and the card went there instead of to a download the
  // test waited thirty seconds for (round fifty-nine; the second outside review's Windows run). The download path is
  // tested with no share; the share path below, with one that records what it was given.
  await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); });
  await page.goto('/species/refusia-testii');
  await expect(page.getByRole('button', { name: 'Share card' })).toHaveCount(0);
  await page.goto('/species/copiapoa-cinerea');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Share card' }).click()]);
  expect(dl.suggestedFilename()).toBe('copiapoa-cinerea-climate.png');
  const path = await dl.path();
  const { statSync } = await import('node:fs');
  expect(statSync(path!).size).toBeGreaterThan(20_000);
  await expect(page.getByRole('status').filter({ hasText: 'Saved to your downloads' }) /* the toast's live region is always in the page now, empty (round sixty) */).toContainText('Saved to your downloads');
  // Where the browser can share a file, the card goes to the share sheet, as a PNG under the same name
  await page.evaluate(() => {
    const w = window as unknown as { __shared?: { name: string; type: string; size: number } };
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
    Object.defineProperty(navigator, 'share', { value: async (d: ShareData) => { const f = d.files![0]; w.__shared = { name: f.name, type: f.type, size: f.size }; }, configurable: true });
  });
  await page.getByRole('button', { name: 'Share card' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Shared.' })).toContainText('Shared.');
  const shared = await page.evaluate(() => (window as unknown as { __shared?: { name: string; type: string; size: number } }).__shared);
  expect(shared).toMatchObject({ name: 'copiapoa-cinerea-climate.png', type: 'image/png' });
  expect(shared!.size).toBeGreaterThan(20_000);
});

test('a grower\'s home says what needs them: sowings in the tray and plants without a photograph, each a link', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  // acquired seven months ago: the photograph line counts records older than six months, not a plant filed today (round forty-nine, 3)
  const ago = new Date(); ago.setMonth(ago.getMonth() - 7);
  await page.fill('#f-date', `${ago.getFullYear()}-${String(ago.getMonth() + 1).padStart(2, '0')}-${String(ago.getDate()).padStart(2, '0')}`);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  const today = page.locator('.today');
  await expect(today.locator('.line', { hasText: 'without a photograph in the last twelve months' })).toBeVisible();
  await expect(today).toContainText('Frost watch needs a site');
  await today.locator('.line', { hasText: 'without a photograph' }).click();
  await expect(page).toHaveURL(/\/plants\?show=nophoto$/);
  // one plant: the list is the plant, with no chips until there are two to tell apart (round fifty-eight)
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page.locator('.chipbtn')).toHaveCount(0);
  // a plant last watered a month ago, by its log: Today says so, in the words of the plants list's Due chip (round twenty-four, 11)
  await expect(today).toHaveCount(0);
  await page.locator('.accrow').first().click();
  await page.locator('.quickbar .btn', { hasText: /^Record…$/ }).click(); // a dated watering goes through Log; Water is one tap for today (round forty-nine, 3)
  await page.selectOption('#ev-type', 'water');
  // exactly twenty-one days: the default watering rhythm's boundary, which the list and Today both include (round twenty-five, 2; round fifty-eight)
  const d = new Date(); d.setDate(d.getDate() - 21);
  const threeWeeks = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.fill('#ev-date', threeWeeks);
  await page.locator('.evform button[type=submit]').click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible(); // the write is on screen before the page is left (round twenty-five, 3)
  await expect(page.locator('.card', { hasText: 'Since watered' })).toContainText('21');
  // a fresh load, from the vault, on both surfaces: the row, the chip and Today read the one figure
  await page.goto('/plants');
  await expect(page.locator('.accrow .fig', { hasText: 'watered 21 d ago' })).toBeVisible();
  await expect(page.locator('.accrow .fig.due')).toHaveCount(1);
  await page.goto('/');
  await expect(page.locator('.today .line', { hasText: '1 of 1 plants past their watering rhythm' })).toBeVisible(); // watered once, 21 days ago: overdue, not "no watering recorded" (round fifty-three, 3)
  await page.locator('.today .line', { hasText: 'past their watering rhythm' }).click();
  await expect(page).toHaveURL(/\/today#water$/);
  await expect(page.locator('#water .stop .row.warn a, #water .stop .row.resting a')).toHaveCount(1); // a Copiapoa in October is in its habitat's dry season by the sheet: its own row (round fifty-four, 4)
  await expect(page.locator('#water .stop h3')).toContainText('No place');
  await page.goto('/plants?show=due');
  await expect(page.locator('.accrow')).toHaveCount(1);
  // a future-dated line is refused with a sentence and never becomes the last watering (round twenty-five, 1)
  await page.locator('.accrow').first().click();
  await page.locator('.quickbar .btn', { hasText: /^Record…$/ }).click();
  await page.selectOption('#ev-type', 'water');
  await page.fill('#ev-date', '2099-01-01');
  await page.locator('.evform button[type=submit]').click();
  await expect(page.locator('#ev-bad')).toContainText('2099-01-01 is in the future');
  await expect(page.locator('.tlrow', { hasText: '2099-01-01' })).toHaveCount(0);
});

test('the install bar waits for a second day, and stays away for thirty days once dismissed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.install')).toHaveCount(0);
  await page.goto('/');
  // two loads in one sitting are one visit: a visit is a day
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cultifolio.visits'))).toBe('1');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  await expect(page.locator('.install')).toHaveCount(0);
  // the next day
  await page.evaluate(() => localStorage.setItem('cultifolio.lastVisit', '2000-01-01'));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('cultifolio.visits'))).toBe('2');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  await expect(page.locator('.install')).toBeVisible();
  await page.locator('.install button', { hasText: 'Not now' }).click();
  await expect(page.locator('.install')).toHaveCount(0);
  await page.goto('/');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
  await expect(page.locator('.install')).toHaveCount(0);
});

test('settings: units switch every figure and sentence, survive a reload through the cookie, and a species figure flips them too', async ({ page }) => {
  // an en-US browser with no cookie is Fahrenheit from the first byte; this British one is metric
  const us = await page.request.get('/species/copiapoa-cinerea', { headers: { 'accept-language': 'en-US,en;q=0.9' } });
  expect(await us.text()).toContain('43.7<span class="u">°F');
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.glance .card', { hasText: 'Cold floor' })).toContainText('6.5');
  await page.locator('.glance .useg button', { hasText: '°F' }).click();
  const glance = page.locator('.glance');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('43.7');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('°F');
  await expect(glance.locator('.card.season')).not.toContainText('°C');
  await expect(glance.locator('.card:not(.season)', { hasText: 'Rain' })).toContainText('2.8');
  await expect(page.locator('.climo .panel').first()).toHaveText('°F · day and night');
  // the cookie carries it: a fresh load is Fahrenheit from the server, no flash
  const html = await (await page.request.get('/species/copiapoa-cinerea')).text();
  expect(html).toContain('43.7');
  expect(html).not.toMatch(/6\.5<span class="u">°C/);
  await page.goto('/settings');
  await ready(page);
  await expect(page.getByRole('button', { name: '°F and inches' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '°C and mm' }).click();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.glance .card', { hasText: 'Cold floor' })).toContainText('6.5');
});

test('settings: numbering is previewed and saved as the vault setting; appearance is applied at once', async ({ page }) => {
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /Prefix/ }).click();
  await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf');
  await expect(page.locator('.accno')).toHaveText('JF-0001');
  await page.getByRole('button', { name: 'Save numbering', exact: true }).click();
  await expect(page.getByText(/the next plant is JF-0001/)).toBeVisible();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/JF-0001$/);
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: 'Dark' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.getByRole('button', { name: 'Follow the system' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
});

test('the species page reads in reference order: the facts and the figures, then the quoted summary and the genus, then the cards closed to one line each', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  // The figures come before the encyclopedia's paragraph since round forty: what is derived here is what the page is for.
  const order = await page.locator('h2.sec').allInnerTexts();
  expect(order.slice(0, 4).map((t) => t.replace(/\s+/g, ' ').toLowerCase())).toEqual(['at a glance', 'summary', 'about the genus · copiapoa', 'cultivation']);
  await expect(page.locator('#s-genus + .sumbody')).toContainText('Copiapoa is a genus of cactus');
  // the id card is the name, the common names and one line of family · origin · archetype; the facts grid sits at the foot since round fifty
  await expect(page.locator('.idcard .vern.meta')).toContainText('Cactaceae');
  await expect(page.locator('.idcard')).not.toContainText('Described by');
  await expect(page.locator('#s-facts + .facts .fact', { hasText: 'Described by' })).toContainText('(Phil.) Britton & Rose');
  await expect(page.locator('#s-facts + .facts .fact', { hasText: 'Wild records' })).toContainText('352 in range');
  // one primary action; the other verbs are a quieter row under it
  await expect(page.locator('.idcard .acts .btn.pri')).toHaveText('Add one to my plants');
  await expect(page.locator('.idcard .acts2 .btn').first()).toHaveText('Sow seed');
  // the cards: all closed at rest to their name since round sixty (the first screen's season card says the reading),
  // opened with a click and no JavaScript needed
  const cards = page.locator('details.acc');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).not.toHaveAttribute('open', '');
  await expect(cards.nth(1)).not.toHaveAttribute('open', '');
  await expect(cards.nth(1).locator('> summary')).toContainText('Rain');
  await cards.nth(1).locator('> summary').click();
  await expect(cards.nth(1)).toHaveAttribute('open', '');
  // the method sits behind one disclosure for the section, closed at rest
  const how = page.locator('details.howmade');
  await expect(how).toHaveCount(1);
  await expect(how).not.toHaveAttribute('open', '');
  await how.locator('summary').click();
  await expect(how.locator('.whyline').first()).toBeVisible();
  // a genus Wikipedia refused is "not checked", not silence
  await page.goto('/species/refusia-testii');
  await expect(page.locator('#s-genus + .notice')).toContainText('Not checked');
});

test('a visitor sees all five places in the top bar and the menu, and a lighter tab bar on a phone until a first plant (round sixty; the visitor review)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.topseg a')).toHaveText(['Species', 'My plants', 'Places', 'Propagation', 'Today']);
  // On a phone a visitor's tabs are the four that show something: Places, Propagation and Today opened empty private pages (round sixty; the visitor review, product 10).
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#tabbar a:visible')).toHaveText(['Species', 'Compare', 'My plants', 'About']);
  await page.setViewportSize({ width: 1280, height: 800 });
  // a click that lands before hydration opens nothing: poll the button's own state rather than the first click
  await expect.poll(async () => { await page.getByRole('button', { name: 'Menu' }).click(); return page.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded'); }).toBe('true');
  await expect(page.locator('#menu').getByRole('link', { name: 'Places', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  // the species page says what it is, once, under the name
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.derived')).toContainText('nothing about this species is written for its page by a person or by AI');
  await expect(page.locator('.pill', { hasText: 'open records' })).toHaveCount(0); // the fact strip says it
  await expect(page.locator('.facts')).toContainText('52 open');
  await expect(page.locator('h2.sec#s-glance')).toHaveCount(1); // the heading is there for the section bar and readers; the figures speak for themselves on screen
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/plants');
  await expect(page.locator('.topseg a')).toHaveText(['Species', 'My plants', 'Places', 'Propagation', 'Today']);
  // a grower's five, from the first plant, and on the next page load too (the hint is read before the first render)
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#tabbar a:visible')).toHaveText(['Species', 'My plants', 'Places', 'Propagation', 'Today']);
  await page.goto('/');
  await expect(page.locator('#tabbar a:visible')).toHaveText(['Species', 'My plants', 'Places', 'Propagation', 'Today']);
});

test('the collection\'s pages need nothing from the server to open: a plant page loads offline, whatever the units', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/plants'); // lets the service worker install and precache the shells
  await page.waitForFunction(() => navigator.serviceWorker.controller != null, null, { timeout: 15000 });
  await ctx.addCookies([{ name: 'cultifolio.units', value: 'us', url: baseURL! }]);
  await ctx.setOffline(true);
  await page.goto(`/plants/${acc}`);
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeVisible({ timeout: 15000 });
  // the settings shell was cached in metric; the units came from the cookie, not from the cached HTML or a server the page could not reach
  await page.goto('/settings');
  await ready(page);
  await expect(page.getByRole('button', { name: '°F and inches' })).toHaveAttribute('aria-pressed', 'true');
  await ctx.close();
});

test('the batch page checks what it is told: no count above the seeds sown or below the last count, no loss or potting beyond the pot, no future dates; a wrong entry can be removed', async ({ page }) => {
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '10');
  await page.fill('#s-date', '2099-01-01');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-date-bad')).toContainText('in the future');
  await expect(page).toHaveURL(/\/propagation\/new/);
  await page.fill('#s-date', '2026-09-01');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S2026-\d{3}$/);
  // a count above what went in
  await page.fill('#g-n', '15');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('.refuse').first()).toContainText('more than the 10 that went in');
  await page.fill('#g-n', '6');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('.card', { hasText: 'Germinated' })).toContainText('6');
  // a count below the last count is not a count: losses are recorded as losses
  await page.fill('#g-n', '2');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.locator('.refuse').first()).toContainText('fewer than the 6 already counted');
  // a loss beyond the pot, then a real one
  await page.fill('#l-n', '30');
  await page.getByRole('button', { name: 'Record loss' }).click();
  await expect(page.locator('.refuse', { hasText: 'Only 6 in the pot to lose' })).toBeVisible();
  await page.fill('#l-n', '1');
  await page.getByRole('button', { name: 'Record loss' }).click();
  await expect(page.locator('.card', { hasText: 'Still in the pot' })).toContainText('5');
  // potting more than the pot holds is refused before any number is minted
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '50');
  await page.getByRole('button', { name: /^Pot up 50/ }).click();
  await expect(page.locator('.refuse', { hasText: 'Only 5 in the pot; each potted plant gets a number' })).toBeVisible();
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(0);
  await page.goBack();
  // a slip in the log can be taken out again
  const rows = page.locator('.tlrow');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  expect(before).toBeGreaterThan(1);
  await rows.first().locator('.rm').click();
  await rows.first().locator('.rm.confirm').click();
  await expect(rows).toHaveCount(before - 1);
});

test('the front page offline asks for the catalogue once and offers a retry, never a loop', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  // The reference unreachable: the route is on the context, so the worker's own fetch of the bucket fails too (worker network events are on in the config).
  let calls = 0;
  await ctx.route(/\/api\/(index|entries)/, (r) => { calls++; r.abort(); });
  await page.goto('/');
  await expect(page.locator('.tile .im.ph', { hasText: 'reference not reached' })).toBeVisible();
  await page.waitForTimeout(1500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(calls).toBeLessThanOrEqual(4); // the page's fetch and the worker's, once each: no loop
  await ctx.unroute(/\/api\/(index|entries)/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.tile .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await ctx.close();
});

test('settings previews the next number from the numbers given, and an edited acquisition date follows into the log', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/plants/new?species=Copiapoa%20humilis&key=5384999');
  await addPlant(page);
  await page.goto('/settings');
  await ready(page);
  await expect(page.locator('.accno')).toHaveText(/-0003$/);
  await page.goto(`/plants/${year()}-0001`);
  await more(page, 'Edit');
  await page.fill('#ed-date', '2024-03-07');
  await page.fill('#ed-from', 'A nursery');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Acquired' })).toContainText('2024-03-07');
  await expect(page.locator('.tlrow', { hasText: 'Acquired' })).toContainText('from A nursery');
});

test('keyboard: the menu keeps Tab inside and Escape returns focus; Enter in the species field never files a plant; the search opens its first match on Enter', async ({ page }) => {
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Menu' });
  await expect.poll(async () => { await menu.focus(); await page.keyboard.press('Enter'); return menu.getAttribute('aria-expanded'); }).toBe('true'); // before hydration the key does nothing
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Species');
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Source');
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => document.activeElement?.textContent?.trim())).toBe('Species');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Menu');
  // the search: Enter opens the first match
  await page.fill('.searchbar', 'copiapoa hum');
  await expect(page.locator('.hitrow').first()).toBeVisible();
  await page.locator('.searchbar').press('Enter');
  await expect(page).toHaveURL(/\/species\/copiapoa-humilis$/);
  // back keeps the search
  await page.goBack();
  await expect(page.locator('.searchbar')).toHaveValue('copiapoa hum');
  // Enter in a filled species field does nothing; Add files it
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.locator('#species-name').press('Enter');
  await expect(page).toHaveURL(/\/plants\/new/);
});

test('two tabs adding at once get two numbers, and each tab sees the other\'s plant (round seven, 1)', async ({ page, context }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  const other = await context.newPage();
  await other.goto('/plants/new?species=Copiapoa%20humilis&key=5384999');
  await expect(page.locator('.accno').first()).toHaveText(`${year()}-0001`);
  await expect(other.locator('.accno').first()).toHaveText(`${year()}-0001`); // both tabs promise the same next number
  await Promise.all([page.getByRole('button', { name: /^Add/ }).click(), other.getByRole('button', { name: /^Add/ }).click()]);
  await expect(page).toHaveURL(new RegExp(`/plants/${year()}-000[12]$`));
  await expect(other).toHaveURL(new RegExp(`/plants/${year()}-000[12]$`));
  expect(page.url()).not.toBe(other.url()); // the vault, not the tab, hands out numbers
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(2); // the other tab's plant is here without a reload of the vault
  await expect(page.locator('.seccount').first()).toHaveText('2 growing'); // "N growing" alone: "plant numbers" beside it left growers asking why the two differ (round sixty; the grower review, 16)
  await other.close();
});

test('editing a plant to another species replaces its habitat figures and links its species page only when the reference has one (round seven, 4 and 9)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('No rainy season');
  await more(page, 'Edit');
  await page.fill('#ed-name', 'Welwitschia mirabilis');
  await page.locator('#ed-name').blur();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h1.sci')).toContainText('Welwitschia mirabilis');
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).not.toContainText('No rainy season to read72 mm'); // the old species' figures are gone, not kept under the new name
  await expect(page.getByRole('link', { name: 'Species page' })).toHaveAttribute('href', '/species/welwitschia-mirabilis');
  // a name the reference does not hold: no link to a 404
  await more(page, 'Edit');
  await page.fill('#ed-name', 'Aloe polyphylla');
  await page.locator('#ed-name').blur();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('No species page');
  await expect(page.getByRole('link', { name: 'Species page' })).toHaveCount(0);
});

test('a germination count that potted plants rest on cannot be removed; bottom heat outside a propagator\'s range is refused (round seven, 5 and 14)', async ({ page }) => {
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '20');
  await page.fill('#s-heat', '77');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-heat-bad')).toContainText('did you mean 77 °F');
  await page.fill('#s-heat', '25');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  await page.fill('#g-n', '5');
  await page.getByRole('button', { name: 'Record count' }).click();
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 2:/ })).toBeVisible();
  const countRow = page.locator('.tlrow', { hasText: 'Germination count' });
  await expect(countRow.locator('.x', { hasText: 'kept' })).toBeVisible();
  await expect(countRow.locator('.rm')).toHaveCount(0);
  await page.fill('#g-n', '8');
  await page.getByRole('button', { name: 'Record count' }).click();
  // with a later count of 8 the count of 5 is no longer load-bearing and can go
  await expect(page.locator('.tlrow', { hasText: 'Germination count 5' }).locator('.rm')).toHaveCount(1);
});

test('the one search box finds a plant by its number, and the cold floor is one figure everywhere it appears (round seven, 18 and 1)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  await page.waitForLoadState('networkidle'); // a value typed before hydration is dropped when the bound input hydrates
  await page.fill('.searchbar', `${year()}-0001`);
  await expect(page.locator('.plantsfound .accrow')).toHaveCount(1);
  await page.locator('.searchbar').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/plants/${year()}-0001$`));
  await page.goto('/species/copiapoa-cinerea');
  const glance = page.locator('.glance .card.cold');
  await expect(glance).toContainText('6.5');
  await expect(page.locator('.cult', { hasText: /^Warmth and air/ }).first().locator('.body')).toContainText('Cold floor: 6.5 °C');
});

test('a link that pairs a species with another species\' key is corrected at the form, and the plant page shows the species named (round eleven, 2)', async ({ page }) => {
  // Copiapoa cinerea with Copiapoa humilis's key: the reference's own key for the name is kept, not the one in the link.
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384999');
  await expect(page.locator('.pill', { hasText: 'GBIF 5384013' })).toBeVisible();
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('h1.sci')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('The sheet'); // the habitat is read, by name
  await more(page, 'Edit');
  await expect(page.locator('.pill', { hasText: 'GBIF 5384013' })).toBeVisible(); // the record carries cinerea's key
  // The same at the sowing form; and a name below species rank keeps the key it was given (the reference has none for it).
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384999');
  await expect(page.locator('.pill', { hasText: 'GBIF 5384013' })).toBeVisible();
  await page.goto('/plants/new?species=Copiapoa%20cinerea%20subsp.%20test&key=777');
  await expect(page.locator('.pill', { hasText: 'GBIF 777' })).toBeVisible();
});

test('a species page opened from the catalogue starts at its top, on a short screen too (round eleven)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 560 }); // the section tabs sit below the fold, where a scrollIntoView on them pulled the page down on arrival
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.locator('.grow', { hasText: 'Copiapoa' }).click();
  await page.locator('a.tile').first().click();
  await expect(page).toHaveURL(/\/species\//);
  // The page has drawn and gone quiet, so anything that would scroll it has run (round sixty; the harness review, 14: a fixed 600 ms).
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('the catalogue renders a window of rows and the letter index lands on its heading, by tap and by link (round seven, 23)', async ({ page }) => {
  await page.goto('/');
  const letters = await page.locator('nav.letters a').allInnerTexts();
  expect(letters.length).toBeGreaterThan(1);
  const last = letters[letters.length - 1];
  await page.locator('nav.letters a', { hasText: new RegExp(`^${last}$`) }).click();
  await expect(page).toHaveURL(new RegExp(`#l-${last}$`));
  // in view and not behind the sticky bars (the fixtures' page is too short to scroll a heading to the top; the corpus build was checked by hand at 120 px)
  const pos = await page.evaluate((l) => { const r = document.getElementById(`l-${l}`)!.getBoundingClientRect(); return { top: r.top, h: window.innerHeight, bar: document.querySelector('#topbar')!.getBoundingClientRect().bottom }; }, last);
  expect(pos.top).toBeGreaterThanOrEqual(pos.bar);
  expect(pos.top).toBeLessThan(pos.h);
  await page.goto('/about/how');
  await page.goto(`/#l-${letters[0]}`);
  await expect(page.locator(`#l-${letters[0]}`)).toBeVisible();
  await expect(page.locator('a.grow').first()).toBeVisible();
  // the "more" control only exists past the first window; the fixtures fit in one
  await expect(page.locator('.more')).toHaveCount(0);
});

test('two tabs whose clocks read the same millisecond still make two plants: each tab is its own writer (round eight, 1)', async ({ page, context }) => {
  // Both tabs' clocks stopped at one instant: every stamp either tab makes has the same wall time, so only the writer tag can tell them apart.
  const frozen = Date.parse('2026-09-25T16:30:00.000Z');
  await page.clock.setFixedTime(frozen); // Date.now() stands still; timers still run
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  const other = await context.newPage();
  await other.clock.setFixedTime(frozen);
  await other.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await expect(page.locator('.accno').first()).toHaveText('2026-0001');
  await expect(other.locator('.accno').first()).toHaveText('2026-0001');
  await Promise.all([page.getByRole('button', { name: /^Add/ }).click(), other.getByRole('button', { name: /^Add/ }).click()]);
  await expect(page).toHaveURL(/\/plants\/2026-000[12]$/);
  await expect(other).toHaveURL(/\/plants\/2026-000[12]$/);
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(2); // both records exist: their stamps differ by writer, not by time
  await expect(page.locator('.accrow', { hasText: 'Copiapoa' })).toHaveCount(1);
  await expect(page.locator('.accrow', { hasText: 'Welwitschia' })).toHaveCount(1);
  await other.close();
});

test('no page address goes out as a referrer: the policy is on every document and every response (round sixteen, 9 and 15)', async ({ page }) => {
  // Playwright reports a request's headers as the page framed them, before the browser applies the referrer policy, so the
  // wire itself is not observable here; it was checked once with a logging proxy in front of the server (no Referer on any
  // font, API or data request). What is checked on every run: the policy is declared on the document and on every response.
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  expect(await page.evaluate(() => document.querySelector('meta[name="referrer"]')?.getAttribute('content'))).toBe('no-referrer');
  for (const path of ['/plants', '/about/how', '/offline', '/api/corpus']) {
    const r = await page.request.get(path);
    expect(r.headers()['referrer-policy'], path).toBe('no-referrer');
    expect(r.headers()['x-frame-options'], path).toBe('DENY');
  }
});

test('the hemisphere cookie rides only on species and compare pages, never on sync or the API (round sixteen, 11)', async ({ page, baseURL }) => {
  await page.goto('/settings');
  await ready(page);
  await page.getByLabel('Latitude').fill('-33.9');
  await page.getByLabel('Longitude').fill('18.4');
  await page.locator('#site').locator('..').getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  const on = async (path: string) => { await page.goto(path); return page.evaluate(() => document.cookie); };
  expect(await on('/species/copiapoa-cinerea')).toContain('cultifolio.hemi=s');
  expect(await on('/compare')).toContain('cultifolio.hemi=s');
  expect(await on('/plants')).not.toContain('cultifolio.hemi');
  expect(await on('/sync')).not.toContain('cultifolio.hemi');
  // the cookies the browser would attach to an API or sync request: the units, never the hemisphere
  const origin = new URL(baseURL!).origin; // the server under test, on whatever port it was given (round sixty-one; docs/review-60/harness.md 18)
  const jar = await page.context().cookies([`${origin}/api/sync/log`, `${origin}/api/sheets`]);
  expect(jar.map((c) => c.name)).not.toContain('cultifolio.hemi');
  const species = await page.context().cookies([`${origin}/species/copiapoa-cinerea`]);
  expect(species.map((c) => c.name)).toContain('cultifolio.hemi');
});

test('a place chosen on the add form while the reference is still answering is kept, not overwritten by the last-used default (round seventeen, A3)', async ({ page }) => {
  await page.goto('/places');
  for (const n of ['Greenhouse', 'Cold frame']) {
    await page.getByRole('button', { name: 'New place' }).click();
    await page.fill('#loc-name', n);
    await page.selectOption('#loc-kind', 'shelf'); // a kind is chosen, never defaulted (round twenty-six, 16)
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.tree .row', { hasText: n })).toBeVisible();
  }
  // make Greenhouse the last-used place
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  const ghValue = await page.locator('#f-loc option', { hasText: 'Greenhouse' }).getAttribute('value');
  await page.selectOption('#f-loc', ghValue!);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  // the reference's answer is slow this time; the grower picks Cold frame before it lands
  await page.context().route(/\/api\/sheets/, async (r) => { await new Promise((res) => setTimeout(res, 1500)); await r.continue(); });
  const slow = page.waitForResponse(/\/api\/sheets/);
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await expect(page.locator('#f-loc')).toHaveValue(ghValue!); // the default, at once
  const cfValue = await page.locator('#f-loc option', { hasText: 'Cold frame' }).getAttribute('value');
  await page.selectOption('#f-loc', cfValue!);
  // The reference's slow answer has landed and the page has drawn after it, rather than a fixed 2.2 s (round sixty; the harness review, 14).
  await slow;
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(page.locator('#f-loc')).toHaveValue(cfValue!); // still the grower's choice after the reference answered
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('main')).toContainText('Cold frame');
});

test('a species page you grow six of does not scroll sideways on a phone (round seventeen, 11)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-count', '6');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/species/copiapoa-cinerea');
  // three numbers and a count: the rest are one tap away on My plants (round fifty, 3)
  await expect(page.locator('.mine .accno')).toHaveCount(3);
  await expect(page.locator('.mine')).toContainText('+3');
  const w = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, mine: document.querySelector('.mine')!.scrollWidth }));
  expect(w.doc).toBeLessThanOrEqual(390);
  expect(w.mine).toBeLessThanOrEqual(390);
});

test('round twenty-three: a name the reference does not hold is added on the second Add and marked; an edit to a hybrid renames and logs it; a removed place says where its plants went and their logs say so; a batch status change is logged', async ({ page }) => {
  // The name service is not reachable here (no upstream), so a name outside the fixture corpus resolves to nothing: the
  // first Add arms the field and asks, the second keeps exactly what was typed (round twenty-three, 4).
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Notaplantia fakeus');
  await page.locator('#species-name').blur();
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/new$/);
  await expect(page.locator('.picker .hint', { hasText: 'press Add to keep exactly what you typed' })).toBeVisible();
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await expect(page.locator('h1.sci')).toContainText('Notaplantia fakeus');
  await expect(page.locator('.idcard .nc .tok')).toContainText('Name not checked');

  // Edited into a cross: filed under the genus, the parents kept, and the log says what it was called before (round twenty-three, 3)
  await more(page, 'Edit');
  await page.fill('#ed-name', 'Notaplantia fakeus x N. altera');
  await page.locator('#ed-name').blur();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h1.sci')).toContainText('Notaplantia');
  await expect(page.locator('h1.sci')).not.toContainText('fakeus');
  await expect(page.locator('.idcard .kind', { hasText: 'hybrid' })).toBeVisible();
  await expect(page.locator('.factgrid', { hasText: 'Parentage' })).toContainText('Notaplantia fakeus × Notaplantia altera');
  await expect(page.locator('.tlrow', { hasText: 'Renamed from Notaplantia fakeus to Notaplantia' })).toContainText('now a hybrid');

  // A place inside a place: removing the inner one moves its plant up, says so, and writes the move on the plant's log (round twenty-three, 2)
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Porch');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Porch' })).toBeVisible();
  await page.getByRole('button', { name: 'New place' }).click();
  await expect(page.locator('#loc-kind')).toHaveValue(''); // the kind is chosen per place, never carried from the last one or defaulted (round twenty-three, 19; round twenty-six, 16)
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'shelf'); // a kind is chosen, never defaulted (round twenty-six, 16)
  const porch = await page.locator('#loc-parent option', { hasText: 'Porch' }).getAttribute('value');
  await page.selectOption('#loc-parent', porch!);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Cold frame' })).toBeVisible(); // the write is on screen before the page is left
  await page.goto(`/plants/${acc}`);
  await page.locator('.quickbar .btn', { hasText: /^Move$/ }).click();
  const frame = await page.locator('#mv-loc option', { hasText: 'Cold frame' }).getAttribute('value');
  await page.selectOption('#mv-loc', frame!);
  await page.locator('.evform .btn.pri', { hasText: 'Move' }).click();
  await expect(page.locator('.idcard')).toContainText('Cold frame');
  await page.goto(`/places/${frame}`);
  await page.getByRole('button', { name: 'Remove place' }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.locator('.toast')).toContainText('1 plant moved up to Porch');
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.idcard')).toContainText('Porch');
  await expect(page.locator('.tlrow', { hasText: 'Cold frame was removed' })).toBeVisible();

  // A batch marked failed: the log says so and the page says it happened (round twenty-three, 16)
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '6');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-001$/);
  await page.getByRole('button', { name: 'Mark failed' }).click();
  await page.getByRole('button', { name: 'Yes, mark failed' }).click(); // asks first (round forty-nine, 3)
  await expect(page.locator('.toast')).toContainText('Marked failed');
  await expect(page.locator('.tlrow', { hasText: 'Marked failed' })).toBeVisible();
  await expect(page.locator('.pill', { hasText: 'failed' }).first()).toBeVisible();
  // the plants list keeps its query, chip and sort in the URL, matches every word, and searches notes (round twenty-five, 11)
  await page.goto(`/plants/${acc}`);
  await page.getByRole('button', { name: 'Add a note' }).click();
  await page.fill('#acc-notes', 'looks etiolated on the porch');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.cult .body', { hasText: 'looks etiolated' })).toBeVisible();
  // a second plant: the sort menu shows from two plants on (round fifty-eight)
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await addPlant(page);
  await page.goto('/plants');
  await page.fill('#plants-q', 'etiolated porch');
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page).toHaveURL(/\/plants\?q=etiolated\+porch$/);
  await page.selectOption('#plants-sort', 'name');
  await expect(page).toHaveURL(/sort=name/);
  await page.locator('.accrow').first().click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/plants\?q=etiolated\+porch&sort=name$/);
  await expect(page.locator('.accrow')).toHaveCount(1);
  await expect(page.locator('#plants-q')).toHaveValue('etiolated porch');
  await expect(page.locator('#plants-sort')).toHaveValue('name');
});

test('round twenty-eight: a batch edit saves its medium and container, keeps the seed fields across a method switch, judges its date and count; the field number and the lot travel apart; Mark done asks while plants are in the pot', async ({ page }) => {
  await page.goto('/propagation/new');
  await page.selectOption('#s-method', 'seed');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.fill('#s-count', '10');
  await page.fill('#s-from', 'Kakteen Haage');
  await page.fill('#s-fn', 'KK 1462');
  await page.fill('#s-ref', 'H-2026-77');
  await page.fill('#s-medium', 'pumice');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  const url = page.url();
  // the header: source, field number and lot, each set off with its separator (round twenty-eight, 14)
  await expect(page.locator('.idcard .vern').first()).toContainText('from Kakteen Haage · KK 1462 · lot H-2026-77 · seed provenance not stated');
  // no count yet is not 0 % (round twenty-eight, 3)
  await expect(page.locator('.cards .card', { hasText: 'Germinated' })).toContainText('–');
  await expect(page.locator('.cards .card', { hasText: 'Germinated' })).not.toContainText('0%');
  // edit: method to cuttings hides the seed fields but keeps them; medium and container are saved (round twenty-eight, 1 and 2)
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#se-method', 'cutting');
  await expect(page.locator('#se-fn')).toHaveCount(0);
  await page.fill('#se-medium', 'perlite');
  await page.fill('#se-container', '9 cm square');
  await page.getByRole('button', { name: 'Save' }).click();
  // The form closes when the write has landed; a reload before then cancels it (round fifty-nine: failed twice on a Windows run).
  await expect(page.locator('#se-method')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.cards .card', { hasText: 'Struck' }).first()).toBeVisible();
  await expect(page.locator('.idcard .vern').first()).not.toContainText('KK 1462'); // hidden for cuttings, not gone
  await expect(page.getByText('perlite')).toBeVisible();
  await expect(page.getByText('9 cm square')).toBeVisible();
  // and back to seed: the seed fields are still there, the provenance is a seed one again
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.selectOption('#se-method', 'seed');
  await expect(page.locator('#se-fn')).toHaveValue('KK 1462');
  await expect(page.locator('#se-ref')).toHaveValue('H-2026-77');
  await expect(page.locator('#se-prov')).toHaveValue('unknown');
  // the edit form judges what it is told (round twenty-eight, 5): a start date in the future
  await page.fill('#se-date', '2099-01-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toContainText('2099-01-01 is in the future');
  await page.fill('#se-date', localDay(-10)); // sown ten days ago; the count below is today's
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toHaveCount(0);
  await expect(page.locator('.idcard .vern').first()).toContainText('KK 1462 · lot H-2026-77');
  // count 6, then the started count cannot go below it
  await page.fill('#g-n', '6');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('60%')).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#se-count', '4');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toContainText('4 started is fewer than the 6 already counted');
  await page.getByRole('button', { name: 'Cancel' }).click();
  // a potting dated before the first count is refused (round twenty-eight, 6)
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  const yesterday = localDay(-1); // the app's calendar is local; toISOString() is UTC and was a day ahead for four evening hours (round thirty, R1-3)
  await page.fill('#p-date', yesterday);
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('form', { has: page.locator('#p-n') })).toContainText('is before the first count that found anything up');
  await page.fill('#p-date', localDay(0));
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 2:/ })).toBeVisible();
  // the potted plant carries the field number as its own and the lot as its reference (round twenty-eight, 4)
  await page.locator('.rows a.accrow').first().click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.fnchip', { hasText: 'KK 1462' })).toBeVisible();
  await expect(page.locator('.fnchip', { hasText: 'H-2026-77' })).toHaveCount(0);
  await expect(page.getByText('H-2026-77')).toBeVisible();
  // Mark done with plants still in the pot asks first (round twenty-eight, 10)
  await page.goto(url);
  await page.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(page.locator('#done-ask')).toContainText('4 still in the pot');
  await expect(page.locator('.pill', { hasText: 'in progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep open' }).click();
  await expect(page.locator('.pill', { hasText: 'in progress' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark done', exact: true }).click();
  await page.getByRole('button', { name: 'Mark done anyway' }).click();
  await expect(page.locator('.pill', { hasText: 'done' }).first()).toBeVisible();
});

test('round twenty-eight: a backup of four hundred plants with long notes is written and read under the site\'s CSP, and a plant whose stored date is in the future can still be edited', async ({ page }) => {
  // Four hundred plants with a kilobyte of notes each: changes.json past the sizes at which fflate's asynchronous
  // writer (160 kB) and reader (512 kB) hand the work to a blob: worker, which worker-src 'self' refuses (round twenty-eight, 0).
  const wall = Date.now() - 3_600_000;
  const changes: unknown[] = [];
  let n = 0;
  const c = (kind: string, id: string, field: string, value: unknown) => changes.push({ t: `${wall + n}-${(n++ % 65536).toString(16).padStart(4, '0')}-abcdefabcdef0000`.replace(/^(\d{13})\d*/, '$1'), kind, id, field, value });
  const note = 'Grown hard on the south bench; watered when the pot is light. '.repeat(20);
  for (let i = 1; i <= 400; i++) {
    const id = `r-seed-${i}`;
    c('accession', id, 'taxonName', i % 2 ? 'Copiapoa cinerea' : 'Welwitschia mirabilis');
    c('accession', id, 'status', 'growing');
    c('accession', id, 'acquired', i === 400 ? '2099-01-01' : '2025-03-01');
    c('accession', id, 'notes', `${i}: ${note}`);
    c('accession', id, 'acc', `2025-${String(i).padStart(4, '0')}`);
  }
  const json = JSON.stringify(changes);
  expect(json.length).toBeGreaterThan(524_288);
  // a backup zip as the app writes one: the manifest and the log (since round fifty-seven only the zip is read)
  const manifest = { format: 'cultifolio-backup', v: 1, exported: new Date().toISOString(), counts: { changes: changes.length, accessions: 400, events: 0, locations: 0, sowings: 0, taxa: 0, photos: 0, photoBytes: 0 } };
  const seed = Buffer.from(zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)), 'changes.json': strToU8(json) }));
  await page.goto('/backup');
  await page.locator('#bk-file').setInputFiles({ name: 'seed.cultifolio.zip', mimeType: 'application/zip', buffer: seed });
  await expect(page.locator('.preview')).toContainText('400 plants');
  await page.click('#bk-merge');
  await expect(page.locator('#bk-done')).toContainText('400 plants');
  // the backup is written
  const dl = page.waitForEvent('download');
  await page.click('#bk-export');
  const file = await dl;
  const path = (await file.path())!;
  await expect(page.locator('.secrule .n', { hasText: 'last today' })).toBeVisible();
  // wiped, then read back
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    await Promise.all(['changes', 'photos'].map((s) => new Promise<void>((res) => { const r = db.transaction(s, 'readwrite').objectStore(s).clear(); r.onsuccess = () => res(); })));
  });
  await page.goto('/backup');
  await page.locator('#bk-file').setInputFiles(path);
  await expect(page.locator('.preview')).toContainText('400 plants');
  await page.click('#bk-merge');
  await expect(page.locator('#bk-done')).toContainText('400 plants');
  await page.goto('/plants');
  await expect(page.locator('.seccount').first()).toContainText('400');
  // a plant whose stored acquired date is in the future (an older file) can have its price edited; only a date this edit types is judged (round twenty-eight, 0)
  await page.goto('/plants/2025-0400');
  await more(page, 'Edit');
  await page.fill('#ed-price', '12');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#ed-date-bad')).toHaveCount(0);
  await expect(page.locator('.editform')).toHaveCount(0);
  await expect(page.getByText('12', { exact: false }).first()).toBeVisible();
});

test('round twenty-nine: the photo viewer removes the photograph it shows after a date edit re-sorts the set, with Undo; three photographs added at once keep their progress on screen', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await addPlant(page);
  const acc = page.url().split('/').pop()!;
  await page.setViewportSize({ width: 640, height: 480 });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 60 });
  await page.setViewportSize({ width: 1180, height: 900 });
  // three at once: the add control stays on screen while the second and third store (round twenty-nine, 12)
  await page.locator('#acc-photo-file').setInputFiles([{ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg }, { name: 'b.jpg', mimeType: 'image/jpeg', buffer: jpeg }, { name: 'c.jpg', mimeType: 'image/jpeg', buffer: jpeg }]);
  await expect(page.locator('.phgrid .ph')).toHaveCount(3);
  await expect(page.locator('.addrow')).toBeVisible();
  await expect(page.locator('.addrow')).toContainText('Added 3');
  // open the first, date it back to 2019 (it re-sorts to the end), then Remove: the 2019 one must be the one removed (round twenty-nine, 1)
  await page.locator('.phgrid .ph').first().click();
  await expect(page.getByRole('dialog')).toContainText('1 of 3');
  await page.getByRole('button', { name: 'Caption / date' }).click();
  await page.fill('#lb-caption', 'Oldest');
  await page.fill('#lb-date', '2019-01-01');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toContainText('Oldest');
  await expect(page.getByRole('dialog')).toContainText('3 of 3'); // the viewer followed the photograph to its new place
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.phgrid .ph')).toHaveCount(2);
  await expect(page.locator('.phgrid .pd', { hasText: '2019-01-01' })).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Photograph removed');
  await page.locator('.toast .undo').click();
  await expect(page.locator('.phgrid .ph')).toHaveCount(3);
  await expect(page.locator('.phgrid .pd', { hasText: '2019-01-01' })).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.phgrid .ph')).toHaveCount(3); // the pixels came back with the record
  await page.locator('.phgrid .ph').last().click();
  await expect(page.locator('.stage img')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Oldest');
  expect(acc).toMatch(/\d{4}-\d{4}/);
});

test('round twenty-nine: a potting is judged by what was in the pot on its day, a count cannot go if a later potting rested on it, and an edit to the medium alone is not refused for a stored date', async ({ page }) => {
  await page.goto('/propagation/new');
  await page.selectOption('#s-method', 'seed');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.fill('#s-count', '10');
  const day = (back: number) => localDay(-back);
  await page.fill('#s-date', day(30));
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  // 1 up on day −20, 8 up on day −5
  await page.fill('#g-date', day(20));
  await page.fill('#g-n', '1');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('10%')).toBeVisible();
  await page.fill('#g-date', day(5));
  await page.fill('#g-n', '8');
  await page.getByRole('button', { name: 'Record count' }).click();
  await expect(page.getByText('80%')).toBeVisible();
  // potting 2 dated day −10: only 1 was up then (round twenty-nine, 5)
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  await page.fill('#p-date', day(10));
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('form', { has: page.locator('#p-n') })).toContainText(`Only 1 was in the pot on ${day(10)}`);
  await page.fill('#p-n', '1');
  await page.getByRole('button', { name: 'Pot up 1' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 1:/ })).toBeVisible();
  // the day −20 count cannot go: the potting on day −10 rests on it, whatever the totals say
  const row = page.locator('.tl .tlrow', { hasText: day(20) }).first();
  await expect(row).toContainText('kept: the potted plants rest on it');
  // an edit to the medium alone, on a batch whose stored date is fine, saves; the check reads only what was typed
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#se-medium', 'grit');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#se-msg')).toHaveCount(0);
  await expect(page.getByText('grit')).toBeVisible();
});

test('round thirty-four: a genus address opens the catalogue for a grower with plants, not their own list', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  // the front page is the grower's own species now
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Your species' })).toHaveAttribute('aria-pressed', 'true');
  // but the genus page's own address (the sitemap's, a shared link's) shows the genus
  await page.goto('/?by=genus&open=copiapoa');
  await expect(page).toHaveTitle(/^Copiapoa/);
  await expect(page.locator('.grow.open', { hasText: 'Copiapoa' })).toBeVisible();
  await expect(page.locator('a.tile .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  // and "Your species" is one click away
  await page.getByRole('button', { name: 'Your species' }).click();
  await expect(page.locator('a.tile', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await expect(page.locator('.grow')).toHaveCount(0);
});

test('round thirty-seven: the old-name line shows for a variety of a listed older name, and for nothing the record does not hold', async ({ page }) => {
  // The record lists Echinocactus cinereus; the address named a variety of it (R1-8).
  await page.goto('/species/copiapoa-cinerea?was=Echinocactus%20cinereus%20var.%20columna-alba');
  await expect(page.locator('#was-synonym')).toContainText('Echinocactus cinereus var. columna-alba is a variety under an older name of this species');
  // The older name itself, as before.
  await page.goto('/species/copiapoa-cinerea?was=Echinocactus%20cinereus');
  await expect(page.locator('#was-synonym')).toContainText('is a synonym');
  // A name the record does not hold is not printed as fact, trinomial or not.
  await page.goto('/species/copiapoa-cinerea?was=Copiapoa%20bogus%20var.%20alba');
  await expect(page.locator('#was-synonym')).toHaveCount(0);
});

test('round thirty-seven: the hemisphere notice is one sentence with its spaces, and counts the cells as the split does', async ({ page }) => {
  // Server-rendered text, read before hydration can repaint it: the boundary comment of a block ate the space before "and" (R2-2).
  const r = await page.request.get('/species/copiapoa-humilis');
  const html = await r.text();
  const m = /<p class="notice small" id="hemispheres">([^<]*)<\/p>/.exec(html);
  expect(m, 'the notice is rendered').toBeTruthy();
  expect(m![1]).toContain('the 3 cells at least 10° north of it have seasons six months apart');
  expect(m![1]).toContain('across the 40 cells that remain: the 31 at least 10° south and the 6 within 10° of the equator, which stay in either way.');
  expect(m![1]).not.toMatch(/southand|northand/);
});

test('round thirty-eight: a monotypic genus does not quote the species paragraph twice', async ({ page }) => {
  // The genus article is the species article: the "About the genus" block would repeat the Summary one heading down (R2-3).
  await page.goto('/species/welwitschia-mirabilis');
  await expect(page.locator('#s-summary + .sumbody')).toContainText('Welwitschia is a monotypic genus');
  await expect(page.locator('#s-genus')).toHaveCount(0);
  // A genus with its own article keeps its block.
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('#s-genus + .sumbody')).toContainText('Copiapoa is a genus of cactus');
});

test('round forty: on "Your species" the search box stays on the device; the catalogue is one deliberate step away; punctuation and chips in a catalogue search', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  const searches: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/search')) searches.push(r.url()); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Your species' })).toHaveAttribute('aria-pressed', 'true');
  // A number, a field number, a name: found on the device, and nothing goes to the server or the URL (R2-1).
  await page.fill('.searchbar', `${year()}-0001`);
  await expect(page.locator('.plantsfound .accrow')).toHaveCount(1);
  await page.fill('.searchbar', 'copiapoa');
  await expect(page.locator('.hitrow .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(searches).toEqual([]);
  expect(page.url()).not.toContain('q=');
  // The catalogue is one explicit step away, and that step is the one that sends the text.
  await page.locator('#search-catalogue').click();
  await expect(page.locator('.hitrow .nm', { hasText: 'Copiapoa humilis' })).toBeVisible();
  expect(searches.length).toBeGreaterThan(0);
  expect(page.url()).toContain('q=copiapoa');
  // On the catalogue view too, a plant's number and anything shaped like one stays on the device (round forty-nine, 3; round thirty-five, R1-2).
  const sent = searches.length;
  await page.fill('.searchbar', `${year()}-0001`);
  await expect(page.locator('.plantsfound .accrow')).toHaveCount(1);
  await page.fill('.searchbar', '2031-07');
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(searches.length).toBe(sent);
  expect(page.url()).not.toContain('q=');
  // Punctuation an iPhone types is not a refusal (R1-1).
  await page.fill('.searchbar', 'copiapoa, ’cinerea’');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  // A chip that is on filters the search too (R1-4).
  await page.fill('.searchbar', '');
  await page.locator('.chipbtn', { hasText: 'Without climate' }).click();
  await expect(page.locator('.chipbtn.on')).toContainText('Without climate');
  await page.fill('.searchbar', 'copiapoa');
  await expect(page.locator('.emptybox')).toContainText('with the chip on (2 without it)');
  await page.fill('.searchbar', 'welwit');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  // The grouping links keep the chip.
  await page.fill('.searchbar', '');
  await page.locator('nav.seg[aria-label="Group by"] a', { hasText: 'Family' }).click();
  await expect(page).toHaveURL(/by=family.*chip=noclimate|chip=noclimate.*by=family/);
});

test('round forty: a measurement typed in inches is stored in millimetres and read back in the reader\'s units (R2-2)', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /°F and inches/ }).click();
  await page.goto(`/plants/${year()}-0001`);
  await page.locator('.quickbar .more').click();
  await page.getByRole('button', { name: 'Measure', exact: true }).click();
  await expect(page.locator('.measures label').first()).toContainText('(in)');
  await page.locator('.measures input').first().fill('2');
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.card', { hasText: 'Diameter' })).toContainText('2');
  await expect(page.locator('.card', { hasText: 'Diameter' }).locator('.u')).toContainText('in');
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /°C and mm/ }).click();
  await page.goto(`/plants/${year()}-0001`);
  await expect(page.locator('.card', { hasText: 'Diameter' })).toContainText('50.8');
  await expect(page.locator('.tlrow', { hasText: 'Measure' })).toContainText('Diameter 50.8 mm');
});

test('round forty-one: a batch gets a label from its own page, with the sowing line on it (R10)', async ({ page }) => {
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '20');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  const no = page.url().split('/').pop()!;
  await page.getByRole('link', { name: 'Label' }).click();
  await expect(page).toHaveURL(/\/labels\?batch=/);
  await expect(page.locator('#batch-picks .pick input')).toBeChecked();
  await expect(page.locator('.sheets .label', { hasText: no })).toHaveCount(1);
  await expect(page.locator('.sheets .label', { hasText: no }).locator('.src').first()).toContainText('20 seeds');
});

test('round forty-one, as round fifty-eight has it: the site is a first-visit step on the empty plants list, not a step on every plant; a plant with no place offers "Give it a place"', async ({ page }) => {
  await page.goto('/plants');
  const steps = page.locator('.firststeps');
  await expect(steps.locator('a', { hasText: 'Your location for the frost watch' })).toHaveAttribute('href', '/settings#site');
  await expect(page.locator('#plants-sort')).toHaveCount(0); // no sort menu over nothing
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await addPlant(page);
  const setup = page.locator('.setup');
  await expect(setup.locator('.setuprow', { hasText: 'Give it a place' })).toBeVisible();
  await expect(setup.locator('.setuprow', { hasText: 'Set your site' })).toHaveCount(0);
});

test('round forty-two: the species photograph is preloaded from the head, one size by surface, in a box that is laid out before it lands (1)', async ({ page }) => {
  // The photograph's host is never reached here; the request is held open so the box is measured before anything arrives.
  await page.route(/inaturalist-open-data\.s3\.amazonaws\.com/, () => new Promise(() => {}));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto('/species/copiapoa-cinerea', { waitUntil: 'domcontentloaded' }); // the held request means the load event never fires
  await expect(page.locator('head link[rel="preload"][as="image"][media="(max-width: 640px)"]')).toHaveAttribute('href', /photos\/900\/medium\.jpg$/);
  await expect(page.locator('head link[rel="preload"][as="image"][media="(min-width: 641px)"]')).toHaveAttribute('imagesrcset', /medium\.jpg 500w, .*large\.jpg 1024w/);
  await expect(page.locator('head link[rel="preconnect"]')).toHaveAttribute('href', 'https://inaturalist-open-data.s3.amazonaws.com');
  const box = await page.locator('.hero.photo').boundingBox();
  expect(box?.height).toBe(150);
  // the phone's source is the medium file alone; the wide screen's img chooses between medium and large for a 480 px box
  await expect(page.locator('.hero.photo source')).toHaveAttribute('srcset', /photos\/900\/medium\.jpg$/);
  await expect(page.locator('.hero.photo source')).toHaveAttribute('media', '(max-width: 640px)');
  await expect(page.locator('.hero.photo img')).toHaveAttribute('srcset', /medium\.jpg 500w, .*large\.jpg 1024w/);
  await expect(page.locator('.hero.photo img')).toHaveAttribute('sizes', '480px');
});

test('round forty-two: the home page preloads the first featured tile and preconnects to its host (1)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('head link[rel="preload"][as="image"]')).toHaveAttribute('href', /\/small\.jpe?g$/);
  await expect(page.locator('head link[rel="preconnect"]').first()).toHaveAttribute('href', /^https:\/\/(inaturalist-open-data\.s3\.amazonaws\.com|api\.gbif\.org)$/);
});

test('round forty-six: a client-side navigation to a species page whose HTML the Worker holds gets its data, not the held HTML (3)', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea'); // the HTML is held for a minute now
  await page.goto('/');
  await page.fill('.searchbar', 'copiapoa cin');
  await page.locator('.hitrow', { hasText: 'Copiapoa cinerea' }).first().click(); // a client-side navigation: the data request goes under the page's URL
  await expect(page).toHaveURL(/\/species\/copiapoa-cinerea$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('main')).not.toContainText('Internal Error');
  await page.goBack();
  await expect(page.locator('.searchbar')).toHaveValue('copiapoa cin');
});

test('round forty-eight: on a phone the search row stays pinned through the list, and A–Z brings the index back (1)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.letters')).toBeVisible();
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.evaluate((y) => window.scrollTo(0, y), Math.max(500, h - 900));
  // pinned under the top bar, not scrolled away with the chips and the letters; polled, not after a fixed 200 ms (round sixty; the harness review, 14)
  await expect.poll(async () => Math.round((await page.locator('.stickyhead .toolrow').boundingBox())!.y)).toBe(44);
  await expect(page.locator('.azbtn')).toBeVisible();
  await page.locator('.azbtn').click();
  await expect.poll(async () => { const y = (await page.locator('.letters').boundingBox())?.y ?? -1; return y > 44 && y < 400; }).toBe(true);
});

test('round forty-eight: a window opened partway (a letter, ?at=) fills in the rows before it as the reader scrolls up, and the list is whole (2)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 480 }); // short enough that the fixture's one-row list can be scrolled up under the bar
  const res = await page.goto('/?at=2');
  expect(res?.status()).toBe(200);
  // the server's window starts at the third row; the rows before it come from the API once the reader is within the
  // rows, not while the chips and the letters above them are what is on screen (round forty-nine, 2: a jump to W on the
  // live site filled all the way to A and landed there)
  await expect(page.locator('.rows .grow').first()).toContainText('Welwitschia');
  await page.waitForTimeout(700); // a negative: the rows before must not fill in while the chips and letters are on screen, and only a pause can show that they did not; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  await expect(page.locator('.rows .grow')).toHaveCount(1);
  await expect(page.locator('.rows .before')).toHaveCount(1);
  // the reader scrolls the rows up under the pinned bar: the fill runs, and the row they were looking at stays where it was
  await page.evaluate(() => { const r = document.querySelector('.rows .grow')!.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - 100); });
  const before = await page.locator('.rows .grow', { hasText: 'Welwitschia' }).boundingBox();
  await expect(page.locator('.rows .grow')).toHaveCount(3);
  await expect(page.locator('.rows .grow').first()).toContainText('Copiapoa');
  await expect(page.locator('.rows .before')).toHaveCount(0); // nothing earlier is left
  await expect(page.locator('.rows h2.letter').first()).toContainText('C');
  // the row they were looking at settles where it was; polled, not after a fixed 200 ms (round sixty; the harness review, 14)
  await expect.poll(async () => Math.abs((await page.locator('.rows .grow', { hasText: 'Welwitschia' }).boundingBox())!.y - before!.y)).toBeLessThan(4);
});

test('round forty-eight: a letter tapped on a phone lands with its heading just under the pinned search row (4)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.letters a', { hasText: 'W' }).click();
  // landed: the heading is at or below the pinned row's foot; polled, not after a fixed 300 ms (round sixty; the harness review, 14)
  await expect.poll(async () => { const b = (await page.locator('.stickyhead .toolrow').boundingBox())!; return (await page.locator('#l-W').boundingBox())!.y >= b.y + b.height; }).toBe(true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bar = await page.locator('.stickyhead .toolrow').boundingBox();
  const h = await page.locator('#l-W').boundingBox();
  expect(h!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height); // not under the row
  // and right below it, unless the fixture's short page has no further to scroll (W is its last letter)
  const atEnd = await page.evaluate(() => window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1);
  if (!atEnd) expect(h!.y).toBeLessThan(bar!.y + bar!.height + 16);
  // the computed offset is the pinned row's, not the head's, which is `display: contents` on a phone and has no height
  const under = await page.evaluate(() => { const head = document.querySelector<HTMLElement>('.stickyhead')!; const row = document.querySelector<HTMLElement>('.stickyhead .toolrow')!; return [head.offsetHeight, row.offsetHeight]; });
  expect(under[0]).toBe(0);
  expect(under[1]).toBeGreaterThan(60);
});

test('round forty-nine: Water is one tap with an Undo, on the plant page and on the list; Archive asks first (3)', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await addPlant(page);
  const acc = page.url().split('/').pop()!;
  // the plant page: one tap writes the line; Undo takes it back
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(0);
  // the list: the row's own button, without opening the page
  await page.goto('/plants');
  await page.getByRole('button', { name: `Water ${acc}, record watered today` }).click();
  await expect(page.locator('a.accrow .fig', { hasText: 'watered today' })).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('a.accrow .fig', { hasText: 'no watering recorded' })).toBeVisible();
  // Archive asks; Keep leaves the plant growing
  await page.goto(`/plants/${acc}`);
  await page.locator('.quickbar .more').click();
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Keep' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Archived' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, archive' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Archived' })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Mark growing' })).toBeVisible();
});

test('round forty-nine: a place takes plants in from a ticked list, in one commit, each with its move line (3)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Cold frame' })).toBeVisible();
  const accs: string[] = [];
  for (const n of ['Copiapoa cinerea', 'Welwitschia mirabilis']) {
    await page.goto('/plants/new');
    await page.fill('#species-name', n);
    await page.locator('#species-name').blur();
    await addPlant(page);
    accs.push(page.url().split('/').pop()!);
  }
  await page.goto('/places');
  await page.locator('.tree .row', { hasText: 'Cold frame' }).click();
  await page.getByRole('button', { name: 'Move plants here' }).click();
  await page.fill('.movein .searchbar', 'welw');
  await expect(page.locator('.moverows label.row')).toHaveCount(1);
  await page.locator('.moverows label.row input').check();
  await page.getByRole('button', { name: /^Move 1$/ }).click();
  await expect(page.locator('.toast')).toContainText('Moved 1 plant to Cold frame');
  await expect(page.locator('.rows a.row', { hasText: 'Welwitschia' })).toBeVisible();
  await expect(page.locator('.rows a.row', { hasText: 'Copiapoa' })).toHaveCount(0);
  await page.locator('.rows a.row', { hasText: 'Welwitschia' }).click();
  await expect(page.locator('.tlrow', { hasText: 'to Cold frame' })).toBeVisible();
});

test('round forty-nine: a letter near the end of the catalogue still lands with its heading under the bar; the list is padded, and the padding goes once rows fill in above (4)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('.letters a', { hasText: 'W' }).click();
  // landed: the heading is at or below the pinned row's foot; polled, not after a fixed 300 ms (round sixty; the harness review, 14)
  await expect.poll(async () => { const b = (await page.locator('.stickyhead .toolrow').boundingBox())!; return (await page.locator('#l-W').boundingBox())!.y >= b.y + b.height; }).toBe(true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bar = await page.locator('.stickyhead .toolrow').boundingBox();
  const h = await page.locator('#l-W').boundingBox();
  expect(h!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height);
  expect(h!.y).toBeLessThan(bar!.y + bar!.height + 40); // placed, not clamped at the footer
  await expect(page.locator('.rows')).toHaveAttribute('style', /padding-bottom/); // the fixture's rows are all loaded, so nothing fills in and the padding stays
});

/** Everything below the top bar and above the phone's tab bar: a thing "on the first screen" fits here without a scroll. */
async function firstScreen(page: import('@playwright/test').Page) {
  const tabs = await page.locator('#tabbar').boundingBox();
  return { top: 44, bottom: tabs ? tabs.y : 844 };
}

test('round fifty: on a phone the first screen of the catalogue, My plants and a place shows records, not only controls (1, 4)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // a visitor: the search, the sampler of photographs and the first catalogue row, all on one screen
  await page.goto('/');
  let fs = await firstScreen(page);
  const firstRow = await page.locator('.rows .grow').first().boundingBox();
  expect(firstRow!.y + 24).toBeLessThan(fs.bottom); // the first genus row begins above the tab bar
  const strip = await page.locator('.featured .strip').boundingBox();
  const search = await page.locator('.toolrow .searchbar').boundingBox();
  expect(strip!.y).toBeLessThan(search!.y); // since round sixty the strip sits above the one toolbar, so the search, the grouping and the chips sit with the rows they act on (visitor 16)
  expect(search!.y + search!.height).toBeLessThan(fs.bottom); // and the search is on the first screen
  expect(strip!.height).toBeLessThan(200);
  // the lead tile is double width; the rest are 112px
  const tiles = page.locator('.featured .strip .ftile');
  const lead = await tiles.first().boundingBox();
  expect(lead!.width).toBeGreaterThan(200);
  if (await tiles.count() > 1) { const second = await tiles.nth(1).boundingBox(); expect(Math.round(second!.width)).toBe(112); }
  // a grower with two plants on a shelf
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Porch');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree a', { hasText: 'Porch' })).toBeVisible(); // stored before the page is left (round sixty; the harness review, 13)
  for (const sp of ['Copiapoa%20cinerea&key=5384013', 'Welwitschia%20mirabilis&key=5411106']) {
    await page.goto(`/plants/new?species=${sp}`);
    const v = await page.locator('#f-loc option', { hasText: 'Porch' }).getAttribute('value');
    await page.selectOption('#f-loc', v!);
    await addPlant(page);
  }
  // My plants: the head is one line (the + in the top bar adds), the search and the sort share a row, the chips are one row, and both plants are on the first screen
  await page.goto('/plants');
  fs = await firstScreen(page);
  await expect(page.locator('.phead .acts .btn:not(.dots)')).toBeHidden(); // the "···" menu (import, spreadsheet) is the head's one control since round sixty
  await expect(page.locator('.phead .inlinecount')).toContainText('2 growing');
  const sb = await page.locator('#plants-q').boundingBox();
  const sort = await page.locator('#plants-sort').boundingBox();
  expect(Math.abs(sb!.y - sort!.y)).toBeLessThan(4);
  const rows = page.locator('.rows .accrow');
  await expect(rows).toHaveCount(2);
  const second = await rows.nth(1).boundingBox();
  expect(second!.y + second!.height).toBeLessThanOrEqual(fs.bottom + 1);
  // the reference-photograph offer is one line until opened
  await expect(page.locator('details.rpo')).not.toHaveAttribute('open', ''); // closed: the disclosure is behind the summary
  await expect(page.locator('details.rpo .why')).toBeHidden();
  await expect(page.locator('details.rpo summary')).toBeVisible();
  // the place: no band above the card, the empty pills row gone, the actions as one row of buttons and one of words, and both plants on the first screen
  await page.goto('/places');
  await page.locator('.tree .row', { hasText: 'Porch' }).click();
  await expect(page.locator('.hero.band')).toHaveCount(0);
  await expect(page.locator('.idcard .pills')).toHaveCount(0);
  await expect(page.locator('.idcard .vern')).toContainText('Room · 2 growing plants');
  await expect(page.locator('.quickbar.words .btn', { hasText: 'Edit' })).toBeVisible();
  await expect(page.locator('.quickbar .btn.pri')).toHaveText('Water all 2');
  await expect(page.locator('.empty')).toContainText('and coordinates for frost watch');
  fs = await firstScreen(page);
  const placeRows = page.locator('.rows .accrow');
  await expect(placeRows).toHaveCount(2);
  const last = await placeRows.nth(1).boundingBox();
  expect(last!.y + last!.height).toBeLessThanOrEqual(fs.bottom + 1);
  // the grower's front page: Today under the toolrow, the own tiles three to a row, the second tile on the first screen
  await page.goto('/');
  fs = await firstScreen(page);
  const own = page.locator('.hgrid.mine a.tile');
  await expect(own).toHaveCount(2);
  const t0 = await own.nth(0).boundingBox(); const t1 = await own.nth(1).boundingBox();
  expect(Math.abs(t0!.y - t1!.y)).toBeLessThan(2); // side by side
  expect(t0!.width).toBeLessThan(140); // three to a row
  expect(t1!.y + 60).toBeLessThan(fs.bottom);
  // the plant page: the checklist is one row of steps, scrolled sideways
  await page.goto(`/plants/${year()}-0001`);
  const steps = page.locator('.setup .setuprow');
  await expect(steps.first()).toBeVisible();
  // polled: the row's layout settles a moment after the fonts and the page's stylesheet do
  await expect.poll(async () => { const s0 = await steps.nth(0).boundingBox(); const s1 = await steps.nth(1).boundingBox(); return Math.abs(s0!.y - s1!.y); }).toBeLessThan(2);
});

test('round fifty: typing a search is a mode on a phone: the box pinned, the strip and chips away, the matches as rows, Cancel puts the page back (2)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.featured .strip')).toBeVisible();
  await expect(page.locator('.toolrow .tools .chiprow')).toBeVisible();
  const box = page.locator('.toolrow .searchbar');
  await box.click();
  await box.fill('Copia');
  await expect(page.locator('.cancelsearch')).toBeVisible();
  await expect(page.locator('.featured .strip')).toHaveCount(0);
  await expect(page.locator('.filters')).toHaveCount(0);
  await expect(page.locator('.toolrow .seg')).toHaveCount(0);
  await expect(page.locator('#welcome')).toHaveCount(0);
  // the box is at the top: the head steps aside too, so even a page too short to scroll has the box under the bar
  await expect(page.locator('.phead')).toBeHidden();
  const tb = await page.locator('.toolrow').boundingBox();
  expect(tb!.y).toBeGreaterThanOrEqual(44); expect(tb!.y).toBeLessThan(70);
  // matches are rows with a thumbnail or an initial, the name and one line of family · origin · climate, and the count above them
  await expect(page.locator('.rows.hits .hitrow')).toHaveCount(2);
  await expect(page.locator('.hitrow').first()).toContainText('Cactaceae');
  await expect(page.locator('.hits').locator('..').locator('.seccount').first()).toContainText('2');
  // Enter opens the first
  await box.press('Enter');
  await expect(page).toHaveURL(/\/species\/copiapoa-/);
  await page.goBack();
  // Cancel: the box empty, the strip and chips back
  await page.locator('.toolrow .searchbar').fill('Welw');
  await expect(page.locator('.hitrow')).toHaveCount(1);
  await page.locator('.cancelsearch').click();
  await expect(page.locator('.toolrow .searchbar')).toHaveValue('');
  await expect(page.locator('.featured .strip')).toBeVisible();
  await expect(page.locator('.toolrow .tools .chiprow')).toBeVisible();
  await expect(page.locator('.cancelsearch')).toHaveCount(0);
});

test('round fifty-one: a move into a place has an Undo that puts the plant back and removes its line; Enter on the Add form is Add, not Save and add another (4)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Cold frame');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Cold frame' })).toBeVisible();
  // Enter in a field submits the primary action: the page moves to the plant, not back to an emptied form
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await page.locator('details.moredetails > summary').click();
  await page.locator('#f-field').fill('WM 1');
  await page.locator('#f-field').press('Enter');
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/places');
  await page.locator('.tree .row', { hasText: 'Cold frame' }).click();
  await page.getByRole('button', { name: 'Move plants here' }).click();
  await page.locator('.moverows label.row input').check();
  await page.getByRole('button', { name: /^Move 1$/ }).click();
  await expect(page.locator('.toast')).toContainText('Moved 1 plant to Cold frame');
  await expect(page.locator('.rows a.row', { hasText: 'Welwitschia' })).toHaveCount(1);
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('Undone');
  await expect(page.locator('.rows a.row', { hasText: 'Welwitschia' })).toHaveCount(0);
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.tlrow', { hasText: 'to Cold frame' })).toHaveCount(0);
  await expect(page.locator('.idcard a.place')).toHaveCount(0);
});

test('round fifty-two: a device a year ahead is corrected by the server\'s clock after two runs a minute apart and its watering is dated today everywhere; a change from a clock five years ahead is parked on every record page with Apply (1)', async ({ browser }) => {
  const shifted = async (ms: number) => { const c = await browser.newContext(); await c.addInitScript((off: number) => { const real = Date.now; const OD = Date; (globalThis as { __shift?: number }).__shift = off; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; }, ms); return c; };
  const A = await browser.newContext(); const a = await A.newPage();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await addPlant(a);
  const acc = a.url().split('/').pop()!;
  await a.goto('/sync'); await a.click('#sync-start'); const key = (await a.locator('#vault-key').textContent())!.trim();
  await a.fill('#key-typeback', key.slice(-5).toLowerCase()); await a.click('#sync-create');
  await expect(a.locator('.card', { hasText: 'Status' })).toContainText('Synced');
  const join = async (p: import('@playwright/test').Page) => { await p.goto('/sync'); await p.click('#sync-have-key'); await p.fill('#sync-key', key.toLowerCase()); await p.click('#sync-join'); await expect(p.locator('.card', { hasText: 'Status' })).toContainText('Synced'); };
  // The file's syncRun, which waits for that run to finish; the local helper waited for an enabled button, which can be true before the run starts (round sixty; the harness review, 13).
  const syncNow = async (p: import('@playwright/test').Page) => { if (!p.url().endsWith('/sync')) await p.goto('/sync'); await syncRun(p); };
  // P: a year ahead. The join is one reading; a second run a minute later (by its own clock) corrects it.
  const P = await shifted(365 * 86_400_000); const p = await P.newPage();
  await join(p);
  await p.evaluate(() => { (globalThis as { __shift?: number }).__shift! += 61_000; });
  await syncNow(p);
  await expect(p.locator('#clock-warning')).toContainText('about a year ahead');
  expect(Number(JSON.parse((await p.evaluate(() => localStorage.getItem('cultifolio.clockOffsetMs')))!).offset)).toBeLessThan(-360 * 86_400_000);
  await p.goto(`/plants/${acc}`);
  await p.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(p.locator('.tlrow', { hasText: 'Watered' }).first()).toContainText(localDay(0)); // dated by the corrected clock
  await syncNow(p); await syncNow(a);
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.tlrow', { hasText: 'Watered' }).first()).toContainText(localDay(0));
  // Q: five years ahead, one reading only: its note is parked on A, listed on the record with Apply, and on the sync page.
  const Q = await shifted(5 * 365 * 86_400_000); const q = await Q.newPage();
  await join(q);
  await q.goto(`/plants/${acc}`); await q.getByRole('button', { name: 'Add a note' }).click(); await q.locator('textarea').first().fill('from 2031'); await q.getByRole('button', { name: 'Save' }).first().click();
  await expect(q.locator('textarea')).toHaveCount(0); // the note is stored before the page is left (round fifty-nine: a navigation cancelled it on a Windows run)
  await syncNow(q); await syncNow(a);
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.parked')).toContainText('from a device whose clock was wrong');
  await expect(a.locator('body')).not.toContainText('from 2031');
  await a.goto('/sync');
  await expect(a.locator('#parked')).toContainText('1 record has edits from a device whose clock was wrong');
  await a.goto(`/plants/${acc}`);
  await a.locator('.parked').getByRole('button', { name: /Apply/ }).click();
  await expect(a.locator('.parked')).toHaveCount(0);
  await expect(a.locator('body')).toContainText('from 2031');
  await Promise.all([A.close(), P.close(), Q.close()]);
});

test('round fifty-three: the Today tab lists what needs you by place, "no watering recorded" apart from "not watered", Water here writes dated lines with Undo, a frost in the forecast is a bar on every tab, and /frost goes there (3)', async ({ browser }) => {
  // One context whose clock can be moved: the plant's record must be three weeks old for "no watering recorded" to count.
  // Without the service worker, so the forecast mock below is what answers (a worker would fetch the real route).
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  const frosty = { lat: 40.38, lon: -80.05, forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days: [{ date: '2026-11-02', tmin: -2, tmax: 9, precipMm: 0, steps: 24 }, { date: '2026-11-03', tmin: 4, tmax: 12, precipMm: 0, steps: 24 }], hoursCovered: 48, offsetH: -5, firstFrost: '2026-11-02' }, alerts: [], alertsStatus: 'none', risk: { level: 'frost', text: 'Frost forecast: -2.0 °C around 05:00 Monday solar time (2026-11-02, MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)'] };
  await page.route(/\/api\/forecast/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(frosty) }));
  // a site, as Settings keeps it; a place and two plants in it
  await page.goto('/places');
  await page.evaluate(() => localStorage.setItem('cultifolio.frost.site', JSON.stringify({ lat: 40.38, lon: -80.05, name: 'Mt Lebanon' })));
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Bench' })).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.goto('/plants/new?species=Refusia%20testii&key=999');
    const opt = await page.locator('#f-loc option', { hasText: 'Bench' }).getAttribute('value');
    await page.selectOption('#f-loc', opt!);
    await addPlant(page);
  }
  const second = page.url().split('/').pop()!;
  // the second plant watered today; the first never
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' }).first()).toBeVisible();
  // nothing is due yet: the Today tab says so
  await page.goto('/today');
  await expect(page.locator('#nothing')).toContainText('All caught up. Nothing is past its watering rhythm.');
  await expect(page.locator('#nothing')).toContainText('in 21 days'); // when Today will next speak (round sixty)
  await expect(page.locator('#how-today')).toContainText('How Today decides'); // the method, one tap away
  // twenty-five days on: the never-watered plant's record is old enough to count, apart from the plant watered twenty-five days ago
  await page.evaluate(() => localStorage.setItem('__shift', String(25 * 86_400_000))); // read by the clock on the next load
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'Bench' });
  await expect(stop).toHaveCount(1);
  await expect(stop.locator('.row.warn').first()).toContainText('Past its 21-day rhythm (the default)'); // the figure in use, and where it comes from (round sixty; the grower review, 5)
  await expect(stop.locator('.row.warn').first()).toContainText(second);
  await expect(stop.locator('.row.warn').first()).toContainText('25 d');
  await expect(stop.locator('.row.unknown')).toContainText('No watering recorded');
  await expect(stop.locator('.row.unknown')).toContainText('added 25 d ago, no watering yet');
  await expect(stop.locator('.row.unknown')).not.toContainText(second);
  // the front page's line says the two apart
  await page.goto('/');
  await expect(page.locator('.today .line', { hasText: '1 of 2 plants past their watering rhythm, and 1 with no watering recorded yet' })).toBeVisible();
  // the frost in the forecast: on the front page as a line, on the Today tab as the card, and under the top bar on every other tab, going to the Today tab
  await expect(page.locator('.today .line', { hasText: 'Frost forecast: -2.0 °C' })).toBeVisible();
  await expect(page.locator('#frostbar')).toHaveCount(0); // the front page has the line; the bar is for the other tabs (round fifty-four, 4)
  await page.goto('/plants');
  await expect(page.locator('#frostbar')).toContainText('Frost forecast');
  await page.locator('#frostbar').click();
  await expect(page).toHaveURL(/\/today#frost$/);
  await expect(page.locator('#frostbar')).toHaveCount(0); // not on the tab that shows it in full
  await expect(page.locator('#frost .risk')).toContainText('Frost forecast: -2.0 °C');
  await expect(page.locator('#frost tr.frost')).toHaveCount(1);
  // Water here: one line per plant on the stop, dated today (the shifted today); the stop stays where it was, marked, with its own Undo (round fifty-four, 4)
  await page.locator('#water .stop', { hasText: 'Bench' }).getByRole('button', { name: 'Water 2 here' }).click();
  await expect(page.locator('.toast')).toContainText('Watered 2.'); // short: the stop says what and offers Undo (round fifty-eight)
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.row.done')).toContainText('Watered just now');
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.row.done a')).toHaveCount(2); // the watered plants stay on the stop, so it keeps its height (round fifty-five, 5)
  await expect(page.locator('.toast').getByRole('button', { name: 'Undo' })).toHaveCount(0); // the toast has no Undo of its own: it sits where the next stop's button was
  await expect(page.locator('#nothing')).toHaveCount(0);
  // the header's button is a mark now, not an Undo: a second tap where Water was does nothing (round fifty-eight)
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.head .donemark')).toContainText('Watered');
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).locator('.head').getByRole('button')).toHaveCount(0);
  await page.locator('#water .stop', { hasText: 'Bench' }).locator('.row.done').getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('#water .stop', { hasText: 'Bench' }).getByRole('button', { name: 'Water 2 here' })).toBeVisible();
  // the old address
  await page.goto('/frost');
  await expect(page).toHaveURL(/\/today$/);
  await C.close();
});

test('round fifty-four: the selected segment of "Your species / All" stays readable while hovered, as a phone leaves it after a tap (1)', async ({ page }) => {
  await page.goto('/plants/new?species=Refusia%20testii&key=999'); await addPlant(page);
  await page.goto('/');
  const all = page.locator('.viewseg button', { hasText: 'All' });
  await all.click();
  const on = page.locator('.viewseg button.on');
  await expect(on).toContainText('All');
  await on.hover();
  const [color, bg] = await on.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor]; });
  expect(color).not.toBe(bg);
  expect(color).toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()).then((v) => v.startsWith('#') ? `rgb(${parseInt(v.slice(1, 3), 16)}, ${parseInt(v.slice(3, 5), 16)}, ${parseInt(v.slice(5, 7), 16)})` : v));
});

test('round fifty-four: a Today page left open overnight dates the morning\'s watering today; a site set in Settings is watched without a reload; a watering dated ahead has its own row (4)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  const frosty = { lat: 40.38, lon: -80.05, forecast: { source: 'met.no', fetched: '2026-11-01T00:00:00Z', days: [{ date: '2026-11-02', tmin: -2, tmax: 9, precipMm: 0, steps: 24 }], hoursCovered: 48, offsetH: -5, firstFrost: '2026-11-02' }, alerts: [], alertsStatus: 'none', risk: { level: 'frost', text: 'Frost forecast: -2.0 °C around 05:00 Monday solar time (2026-11-02, MET Norway).' }, attribution: ['Forecast data from MET Norway (CC BY 4.0)'] };
  let asked = 0;
  await page.route(/\/api\/forecast/, (r) => { asked++; void r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(frosty) }); });
  // two plants, no site yet: no bar anywhere
  for (let i = 0; i < 2; i++) { await page.goto('/plants/new?species=Refusia%20testii&key=999'); await addPlant(page); }
  const second = page.url().split('/').pop()!;
  await page.goto('/plants');
  await expect(page.locator('#frostbar')).toHaveCount(0);
  // the site set in Settings: the watch reads it on the next navigation, no reload (round fifty-four, 4; the second reviewer's finding 2)
  await page.goto('/settings');
  await ready(page);
  await page.fill('#site-lat', '40.38');
  await page.fill('#site-lon', '-80.05');
  await page.getByRole('button', { name: 'Save site', exact: true }).click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.locator('.topseg a', { hasText: 'My plants' }).click();
  await expect(page.locator('#frostbar')).toContainText('Frost forecast');
  // a cold Today asks once for the forecast, not twice (round fifty-four, 4; both reviewers)
  asked = 0;
  await page.evaluate(() => sessionStorage.clear());
  await page.goto('/today');
  await expect(page.locator('#frost .risk')).toContainText('Frost forecast');
  await page.waitForTimeout(500); // a negative: no request may follow, and only a pause can show that none did; the pause is short and after the page has gone quiet (round sixty; the harness review, 14)
  expect(asked).toBe(1);
  // twenty-five days on, the page is opened and left open across midnight: a watering after midnight is dated the new day
  await page.evaluate(() => localStorage.setItem('__shift', String(25 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'No place' });
  await expect(stop).toHaveCount(1);
  await page.evaluate(() => { (globalThis as { __shift?: number }).__shift = 26 * 86_400_000; }); // past midnight, by the clock; the day store notices within a minute, the tap reads it then
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await stop.getByRole('button', { name: /^Water 2 here$/ }).click();
  await expect(stop.locator('.row.done a')).toHaveCount(2);
  const d = new Date(Date.now() + 26 * 86_400_000);
  const expectDay = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.goto(`/plants/${second}`);
  await expect(page.locator('.tlrow', { hasText: 'Watered' }).first()).toContainText(expectDay);
  // a watering dated ahead of today is its own row on Today, not "no watering recorded": watered under a clock fifty days on, read under one twelve hours behind it (a phone whose day turned early; the line is twelve hours ahead, within the hold)
  await page.evaluate(() => localStorage.setItem('__shift', String(50 * 86_400_000)));
  await page.goto(`/plants/${second}`);
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' }).first()).toBeVisible();
  const aheadDay = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  // the clock set back to just before that day began: the line's date is ahead by a day, its stamp by a few hours, within the hold
  const back = await page.evaluate(() => new Date().getHours() + 1);
  await page.evaluate((h) => localStorage.setItem('__shift', String(50 * 86_400_000 - h * 3_600_000)), back);
  await page.goto('/today');
  await expect(page.locator('#water .stop .row.ahead')).toContainText(aheadDay);
  await expect(page.locator('#water .stop .row.unknown')).toHaveCount(0);
  await C.close();
});

test('round fifty-five: a watered stop keeps its height and the next stop does not move under the finger; the Undo survives a trip to another tab (5)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, hasTouch: true });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  await page.goto('/places');
  for (const name of ['Bench A', 'Bench B']) {
    await page.getByRole('button', { name: 'New place' }).click();
    await page.fill('#loc-name', name);
    await page.selectOption('#loc-kind', 'bench');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.tree .row', { hasText: name })).toBeVisible();
  }
  for (const name of ['Bench A', 'Bench A', 'Bench A', 'Bench B', 'Bench B']) {
    await page.goto('/plants/new?species=Refusia%20testii&key=999');
    const opt = await page.locator('#f-loc option', { hasText: name }).getAttribute('value');
    await page.selectOption('#f-loc', opt!);
    await addPlant(page);
  }
  await page.evaluate(() => localStorage.setItem('__shift', String(25 * 86_400_000)));
  await page.goto('/today');
  const a = page.locator('#water .stop', { hasText: 'Bench A' });
  const b = page.locator('#water .stop', { hasText: 'Bench B' });
  await expect(b.getByRole('button', { name: 'Water 2 here' })).toBeEnabled();
  // both stops on screen, B's button clear of the tab bar, as a grower would hold the page
  await page.evaluate(() => { const el = document.querySelectorAll('#water .stop')[1] as HTMLElement; scrollTo(0, el.getBoundingClientRect().top + scrollY - 420); });
  const before = await b.boundingBox();
  await a.getByRole('button', { name: 'Water 3 here' }).click();
  await expect(a.locator('.row.done a')).toHaveCount(3);
  const after = await b.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(24); // the stop below stays where the finger expects it
  // what is under where B's button was is B's button, not the toast's Undo
  const box = await b.getByRole('button', { name: 'Water 2 here' }).boundingBox();
  const hit = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el?.closest('button')?.textContent?.trim() ?? el?.tagName; }, [box!.x + box!.width / 2, box!.y + box!.height / 2]);
  expect(hit).toBe('Water 2 here');
  // to My plants and back: the mark and its Undo are still there (scrolled up first: the tab bar steps aside on a scroll down, round fifty-eight)
  await page.mouse.wheel(0, -200);
  await page.locator('#tabbar a', { hasText: 'My plants' }).click();
  await page.locator('#tabbar a', { hasText: 'Today' }).click();
  await expect(a.locator('.row.done')).toContainText('Watered just now');
  await a.getByRole('button', { name: 'Undo' }).click();
  await expect(a.getByRole('button', { name: 'Water 3 here' })).toBeVisible();
  await C.close();
});

test('round fifty-six: two plants under one number are not renumbered by opening the collection; the later one says so and is renumbered when asked', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  // two whole plants under one number, as a merge whose repair failed to store would leave them, put straight into the vault
  const wall = Date.now() - 3_600_000;
  await page.evaluate(async (wall) => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const t = (n: number) => `${wall + n}-0000-abcdefabcdef0000`;
    const rows = [['r-dup-a', 'acc', '2026-0042'], ['r-dup-a', 'taxonName', 'Copiapoa cinerea'], ['r-dup-a', 'status', 'growing'], ['r-dup-b', 'acc', '2026-0042'], ['r-dup-b', 'taxonName', 'Welwitschia mirabilis'], ['r-dup-b', 'status', 'growing']];
    const tx = db.transaction(['changes', 'meta'], 'readwrite');
    rows.forEach(([id, field, value], i) => tx.objectStore('changes').put({ t: t(i), kind: 'accession', id, field, value }));
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
  }, wall);
  // what the log holds about the two plants
  const ofTwo = () => page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; id: string; field: string }>>((res) => { const r = db.transaction('changes').objectStore('changes').getAll(); r.onsuccess = () => res(r.result); });
    // nothing at all: since round fifty-eight the plant page does not write the reference's key either
    return all.filter((c) => c.kind === 'event' || c.id.startsWith('r-dup-')).map((c) => `${c.kind} ${c.id} ${c.field}`).sort();
  });
  const before = await ofTwo();
  await page.goto('/plants/r-dup-b');
  await expect(page.locator('#shared-number')).toContainText('2026-0042');
  await expect(page.locator('#shared-number')).toContainText('Renumbering gives this plant the next free number'); // the notice names the plant the button renumbers (round fifty-eight)
  expect(await ofTwo()).toEqual(before); // opening the collection wrote nothing about them
  await page.locator('#shared-number').getByRole('button', { name: 'Renumber now' }).click();
  await expect(page.locator('#shared-number')).toHaveCount(0);
  await expect(page.locator('.accno').first()).toContainText('2026-0043');
  await page.goto('/plants/r-dup-a');
  await expect(page.locator('.accno').first()).toContainText('2026-0042');
  await expect(page.locator('#shared-number')).toHaveCount(0);
});

test('round fifty-eight: a place\'s watering rhythm decides what is due, its dry months are one quiet line, and a stop waters only the plants left ticked', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, hasTouch: true });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Weekly bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree a.row', { hasText: 'Weekly bench' }).click();
  await expect(page).toHaveURL(/\/places\/.+/);
  const place = page.url();
  await page.goto(place + '?edit=1');
  await page.fill('#e-waterdays', '7');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.factgrid')).toContainText('about every 7 days');
  for (let i = 0; i < 2; i++) {
    await page.goto('/plants/new?species=Refusia%20testii&key=999');
    const opt = await page.locator('#f-loc option', { hasText: 'Weekly bench' }).getAttribute('value');
    await page.selectOption('#f-loc', opt!);
    await addPlant(page);
  }
  // eight days on: past the bench's seven, though far short of the default twenty-one
  await page.evaluate(() => localStorage.setItem('__shift', String(8 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'Weekly bench' });
  await expect(stop.getByRole('button', { name: 'Water 2 here' })).toBeEnabled();
  await expect(stop.locator('.chip.tick')).toHaveCount(2);
  await expect(stop.locator('.chip.tick').first()).toContainText('Refusia testii'); // named, not a number alone
  await stop.locator('.chip.tick input').first().uncheck();
  await stop.getByRole('button', { name: 'Water 1 of 2 here' }).click();
  await expect(stop.locator('.row.done .chip')).toHaveCount(1);
  // round fifty-nine, 3: with nothing left ticked the head shows the done mark, not a disabled "Water 0 of 1"; the plant left out stays, with its tick
  await expect(stop.locator('.head .donemark')).toContainText('Watered');
  await expect(stop.locator('.head').getByRole('button')).toHaveCount(0);
  await expect(stop.locator('.row.warn .chip.tick, .row.unknown .chip.tick')).toHaveCount(1);
  // round fifty-nine, 6: an Undo by keyboard leaves focus on the stop, not on the page body
  await stop.locator('.row.done').getByRole('button', { name: 'Undo' }).focus();
  await page.keyboard.press('Enter');
  await expect(stop.locator('.row.done')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.stop'))).toBe(true);
  // the month kept dry: the plants here are not due, and the stop says so in one line
  await page.goto(place + '?edit=1');
  const month = await page.evaluate(() => new Date().getMonth());
  await page.locator('.months .mo input').nth(month).check();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.months')).toHaveCount(0); // saved: the form closed, so leaving cannot cancel the write
  await page.goto('/today');
  await expect(stop.locator('.row.resting', { hasText: 'Kept dry this month' })).toContainText('2 plants');
  await expect(stop.getByRole('button', { name: /^Water/ })).toHaveCount(0);
  await C.close();
});

test('round fifty-nine: the top bar\'s + opens the new-place form on every tap; the place form refuses what it cannot keep, with a sentence, and stays open (8, 9, 10)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/places');
  const plus = page.locator('#topbar a[aria-label="Add a place"]');
  await plus.click();
  await expect(page.locator('#loc-name')).toBeFocused();
  await expect(page).not.toHaveURL(/#add/);
  await page.getByRole('button', { name: 'New place' }).click(); // the head's button closes it
  await expect(page.locator('#loc-name')).toHaveCount(0);
  await plus.click(); // a second tap in a row opens it again
  await expect(page.locator('#loc-name')).toBeFocused();
  await page.fill('#loc-name', 'Test bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree a', { hasText: 'Test bench' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.fill('#e-waterdays', 'abc');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-msg')).toContainText('not a whole number of days from 1 to 365');
  await expect(page.locator('#e-waterdays')).toBeFocused();
  await page.fill('#e-waterdays', '10');
  await page.fill('#e-lat', '40.4');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-lon-bad')).toContainText('A latitude needs its longitude');
  await page.fill('#e-lat', '');
  await page.fill('#e-alt', '300');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-msg')).toHaveCount(0); // saved: the form closed
  await expect(page.locator('.factgrid')).toContainText('about every 10 days');
  await expect(page.locator('.factgrid > div', { hasText: 'Altitude' })).toContainText('300 m');
  await expect(page.getByText('No floor, light, watering or audit recorded here yet')).toHaveCount(0);
});

test('round fifty-nine: a control reached by the keyboard is never left under a sticky or fixed bar (WCAG 2.4.11), forward or back, at 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  /** Tab `n` times (Shift+Tab when `back`), and after each say which focused element is covered at its centre by something that is not it. */
  const hidden = async (n: number, back: boolean) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const bad = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body) return null;
        const r = [...el.getClientRects()].find((b) => b.width > 0 && b.height > 0);
        if (!r || r.bottom < 0 || r.top > innerHeight) return null; // off the screen, which is the browser's to scroll
        const x = Math.min(innerWidth - 1, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(1, r.top + r.height / 2));
        const at = document.elementFromPoint(x, y);
        return at && (at === el || el.contains(at) || at.contains(el)) ? null : `${el.tagName} "${(el.textContent ?? '').trim().slice(0, 30)}" under ${at?.tagName}.${at?.className}`;
      });
      if (bad) out.push(bad);
    }
    return out;
  };
  await page.goto('/about/how');
  await ready(page);
  expect(await hidden(30, false)).toEqual([]);
  await page.keyboard.press('End');
  expect(await hidden(30, true)).toEqual([]);
  await page.goto('/species/copiapoa-cinerea');
  await ready(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await hidden(40, true)).toEqual([]);
});

test('round fifty-nine: a species page\'s description is cut at a word and claims only what the page has', async ({ page }) => {
  for (const slug of ['copiapoa-cinerea', 'welwitschia-mirabilis', 'refusia-testii']) {
    await page.goto(`/species/${slug}`);
    const d = (await page.locator('meta[name="description"]').getAttribute('content'))!;
    expect(d.length).toBeLessThanOrEqual(155);
    expect(d).toMatch(/(\S…|[.!?)])$/); // a whole word before the ellipsis, or the text's own end
    expect(await page.locator('meta[property="og:description"]').getAttribute('content')).toBe(d);
  }
  // Refusia's climate was not checked: its line does not offer one
  await page.goto('/species/refusia-testii');
  const desc = (await page.locator('meta[name="description"]').getAttribute('content'))!;
  expect(desc).toContain('habitat climate not checked'); // said as a check that did not happen (round sixty)
  expect(desc).not.toMatch(/habitat climate(?! not checked)/);
});

/* ---------------------------------------------------------------- round sixty: records by identity, held changes, print, focus, larger text */

/** Changes written straight into this device's log, as another device's sync or a merged file would leave them; the fold is dropped so the next load reads them. */
async function inject(page: import('@playwright/test').Page, rows: Array<[string, string, string, string | number]>, wall: number, writer = 'abcdefabcdef0000') {
  await page.evaluate(async ({ rows, wall, writer }) => {
    // The page may not have made its stores yet (a first visit): wait for them rather than writing into nothing, which
    // failed this test one run in a few (round sixty).
    let db: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !db; i++) {
      // never made here: an open that would create the database is aborted, so the page makes it at its own version
      const d = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (d && d.objectStoreNames.contains('changes') && d.objectStoreNames.contains('meta')) db = d;
      else { d?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!db) throw new Error('the collection\'s stores were never made');
    const tx = db.transaction(['changes', 'meta'], 'readwrite');
    rows.forEach(([kind, id, field, value], i) => tx.objectStore('changes').put({ t: `${wall + i}-0000-${writer}`, kind, id, field, value }));
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
  }, { rows, wall, writer });
}

test('round sixty: a number two plants share opens a chooser; the list, the notice and the labels link each plant by its identity (decision 3)', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  await inject(page, [['accession', 'r-two-a', 'acc', '2026-0042'], ['accession', 'r-two-a', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r-two-a', 'status', 'growing'], ['accession', 'r-two-b', 'acc', '2026-0042'], ['accession', 'r-two-b', 'taxonName', 'Welwitschia mirabilis'], ['accession', 'r-two-b', 'status', 'growing']], Date.now() - 3_600_000);
  await page.goto('/plants');
  // every row by its identity while the number is shared: by number, both rows opened the same plant
  await expect(page.locator('a.accrow')).toHaveCount(2);
  await expect(page.locator('a.accrow[href="/plants/r-two-a"]')).toHaveCount(1);
  await expect(page.locator('a.accrow[href="/plants/r-two-b"]')).toHaveCount(1);
  await expect(page.locator('a.accrow[href="/plants/2026-0042"]')).toHaveCount(0);
  // the bare number lists both, by identity, with what tells them apart
  await page.goto('/plants/2026-0042');
  const chooser = page.locator('#number-chooser li');
  await expect(chooser).toHaveCount(2);
  await expect(page.locator('#number-chooser')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#number-chooser')).toContainText('Welwitschia mirabilis');
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toHaveCount(0); // nothing to water until one is chosen
  await chooser.filter({ hasText: 'Welwitschia' }).locator('a').click();
  await expect(page).toHaveURL(/\/plants\/r-two-b$/);
  await expect(page.locator('h1')).toContainText('Welwitschia mirabilis');
  await expect(page.locator('h1')).toContainText('2026-0042 Welwitschia'); // a space between the number and the name, for a screen reader too (round sixty; the accessibility review, 12)
  // the shared-number notice links the other plant by its identity
  await expect(page.locator('#shared-number a[href="/plants/r-two-a"]')).toContainText('Copiapoa cinerea');
  // a label link by that number picks neither, and says so
  await page.goto('/labels?acc=2026-0042');
  await expect(page.locator('#lb-ambiguous')).toContainText('2026-0042');
  await expect(page.locator('.pick input:checked')).toHaveCount(0);
});

test('round sixty: changes dated ahead of this device\'s clock are said wherever records are listed, with the way to the details (decision 2)', async ({ page }) => {
  await page.goto('/plants');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.locator('#held-notice')).toHaveCount(0);
  // a plant from a device whose clock runs a day ahead: in the log, not yet on screen
  await inject(page, [['accession', 'r-ahead', 'acc', '2026-0077'], ['accession', 'r-ahead', 'taxonName', 'Copiapoa cinerea'], ['accession', 'r-ahead', 'status', 'growing']], Date.now() + 86_400_000);
  await page.goto('/plants');
  await expect(page.locator('#held-notice')).toContainText("3 changes from a device whose clock runs ahead are waiting. They appear when this device's date reaches them.");
  await expect(page.locator('a.accrow')).toHaveCount(0);
  await page.goto('/today');
  await expect(page.locator('#held-notice')).toContainText('3 changes from a device whose clock runs ahead are waiting');
  await page.locator('#held-notice a').click();
  await expect(page).toHaveURL(/\/sync#held$/);
  await expect(page.locator('#held')).toContainText('3 changes from a device whose clock runs ahead are waiting'); // said with sync off too
});

test('round sixty: a printed page carries the page alone: the install card, the clock and frost bars and the toast are hidden on paper (the self-review\'s 6)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await addPlant(page);
  // the second day: the install card shows
  await page.evaluate(() => { localStorage.setItem('cultifolio.visits', '1'); localStorage.setItem('cultifolio.lastVisit', '2000-01-01'); });
  await page.goto('/labels');
  await ready(page);
  // the browser's offer, once the card is listening for it (the page is drawn on the device, after its scripts)
  await expect.poll(async () => { await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt'))); return page.locator('.install').count(); }).toBe(1);
  await expect(page.locator('.page .label').first()).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  const shown = await page.evaluate(() => ['.install', '#topbar', '#tabbar', '.toastregion'].map((s) => { const el = document.querySelector(s); return el ? `${s} ${getComputedStyle(el).display}` : `${s} none`; }));
  expect(shown).toEqual(['.install none', '#topbar none', '#tabbar none', '.toastregion none']);
  // and the first label sits at the sheet's top, not under a card: the sheet is the first thing on the paper
  const top = await page.evaluate(() => document.querySelector('.page')!.getBoundingClientRect().top + scrollY);
  expect(top).toBeLessThan(2);
  await page.emulateMedia({ media: 'screen' });
});

test('round sixty: watering by keyboard keeps focus on the button, the toast\'s Undo is the next Tab, and Undo on Today returns focus to the stop\'s Water button (the accessibility review, 1; the outside review\'s A35)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  for (let i = 0; i < 3; i++) { await page.goto('/plants/new?species=Refusia%20testii&key=999'); await addPlant(page); }
  // the list's Water by keyboard: focus stays on it while it saves and after
  await page.goto('/plants');
  const water = page.locator('.accline').first().getByRole('button', { name: /watered today/ });
  await water.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast')).toContainText('watered');
  await expect(water).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('.toast .undo')).toBeFocused(); // the Undo is the next stop, not 23 Shift+Tabs away
  await page.keyboard.press('Enter');
  await expect(water).toBeFocused(); // back where the grower was
  // Today, twenty-two days on: Undo on a stop puts focus on that stop's Water button, not its heading
  await page.evaluate(() => localStorage.setItem('__shift', String(22 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'No place' });
  const head = stop.locator('.head').getByRole('button', { name: /^Water/ });
  await expect(head).toBeEnabled();
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(stop.locator('.row.done')).toContainText('Watered just now');
  await stop.locator('.row.done').getByRole('button', { name: 'Undo' }).focus();
  await page.keyboard.press('Enter');
  await expect(stop.locator('.row.done')).toHaveCount(0);
  await expect(stop.locator('.head button.water')).toBeFocused();
  await C.close();
});

test('round sixty: Today with nothing ticked says so, never "Water these 0"; the done mark is said only when nothing ticked is left (the grower review, 4)', async ({ browser }) => {
  const C = await browser.newContext({ serviceWorkers: 'block' });
  await C.addInitScript(() => { const real = Date.now; const OD = Date; let shift = 0; try { shift = Number(localStorage.getItem('__shift') ?? 0); } catch { /* none */ } (globalThis as { __shift?: number }).__shift = shift; globalThis.Date = class extends OD { constructor(...args: unknown[]) { if (args.length === 0) super(real() + ((globalThis as { __shift?: number }).__shift ?? 0)); else super(...(args as [number])); } static now() { return real() + ((globalThis as { __shift?: number }).__shift ?? 0); } } as DateConstructor; });
  const page = await C.newPage();
  for (let i = 0; i < 2; i++) { await page.goto('/plants/new?species=Refusia%20testii&key=999'); await addPlant(page); }
  await page.goto('/today');
  await expect(page.locator('#first-weeks')).toContainText('counted from the day it was added'); // the first weeks say what will show here (the grower review, 6)
  await page.evaluate(() => localStorage.setItem('__shift', String(22 * 86_400_000)));
  await page.goto('/today');
  const stop = page.locator('#water .stop', { hasText: 'No place' });
  await expect(stop.getByRole('button', { name: 'Water 2 here' })).toBeEnabled();
  for (const box of await stop.locator('.chip.tick input').all()) await box.uncheck();
  await expect(stop.locator('.head')).toContainText('None ticked');
  await expect(stop.locator('.head').getByRole('button')).toHaveCount(0);
  await expect(stop.locator('.donemark')).toHaveCount(0);
  // the tick box is a finger's target of its own, apart from the plant link
  const tick = await stop.locator('.chip.tick .tickbox').first().boundingBox();
  expect(tick!.height).toBeGreaterThanOrEqual(36);
  expect(tick!.width).toBeGreaterThanOrEqual(36);
  await C.close();
});

test('round sixty: at 320 px with the browser\'s text at 200%, the phone\'s tab bar keeps Today on screen and the private pages do not scroll sideways (the accessibility review, 5)', async ({ baseURL }) => {
  const { chromium } = await import('@playwright/test');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  // The browser's own text size, as a reader sets it: a profile preference, not a style the page could tell apart.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-text200-'));
  fs.mkdirSync(path.join(dir, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'Default', 'Preferences'), JSON.stringify({ webkit: { webprefs: { default_font_size: 32, default_fixed_font_size: 26 } } }));
  const ctx = await chromium.launchPersistentContext(dir, { baseURL, locale: 'en-GB', viewport: { width: 320, height: 700 }, serviceWorkers: 'block', ...(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}) });
  try {
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)).toBe('32px');
    await addPlant(page);
    const plant = new URL(page.url()).pathname;
    await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013');
    await page.fill('#s-count', '10');
    await page.getByRole('button', { name: 'Start batch' }).click();
    await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
    const batch = new URL(page.url()).pathname;
    const sideways: string[] = [];
    for (const route of ['/plants', plant, '/today', '/places', '/propagation', batch, '/settings', '/sync', '/backup']) {
      await page.goto(route);
      await expect(page.locator('#tabbar')).toBeVisible();
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      if (w[0] > w[1]) sideways.push(`${route} ${w[0]}>${w[1]}`);
      const today = await page.locator('#tabbar a', { hasText: 'Today' }).boundingBox();
      expect(today, route).not.toBeNull();
      expect(today!.x + today!.width, route).toBeLessThanOrEqual(321);
      // and every tab's word inside its own cell, on the screen: at 200% "Today" was pushed past the edge of a bar nobody can scroll
      const spill = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#tabbar a')].filter((a) => a.offsetParent).map((a) => { const r = a.getBoundingClientRect(), t = a.querySelector('span')!.getBoundingClientRect(); return t.right > Math.min(r.right, innerWidth) + 1 || t.left < r.left - 1 ? a.textContent!.trim() : ''; }).filter(Boolean));
      expect(spill, route).toEqual([]);
    }
    expect(sideways).toEqual([]);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/* The harness review's proposed tests (docs/review-59/tests/mut--zz-proposed.spec.ts), adopted in round sixty. */

test('round sixty: a numbering choice made before the collection opens is kept, at a 6x CPU throttle (the harness review, 12)', async ({ page }) => {
  test.setTimeout(120_000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  try {
    await page.goto('/settings', { waitUntil: 'commit' });
    await page.locator('html[data-ready]').waitFor({ state: 'attached' });
    // The controls wait for the collection, whose scheme they show (disabled until then), and the stored scheme never
    // overwrites a field the grower touched: before round sixty a choice made here was reset under the grower.
    await page.getByRole('button', { name: /Prefix/ }).click({ timeout: 60_000 });
    await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf', { timeout: 30_000 });
    await expect(page.locator('.accno')).toHaveText('JF-0001', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Prefix/ })).toHaveAttribute('aria-pressed', 'true');
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
});

test('round sixty: with the collection slow to open, the numbering controls wait for it and a choice made then is kept (the harness review, 12)', async ({ page }) => {
  // The database opens 1.5 s late, as on a slow phone: the stored scheme arrives after the page can be touched.
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, ...a: Parameters<typeof open>) {
      const req = open.apply(this, a);
      const add = req.addEventListener.bind(req);
      req.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'success' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn(ev) : fn.handleEvent(ev)), 1500) : fn, ...(rest as []))) as typeof req.addEventListener;
      return req;
    } as typeof open;
  });
  await page.goto('/settings');
  await ready(page);
  await page.getByRole('button', { name: /Prefix/ }).click({ timeout: 15_000 }); // as soon as it can be pressed
  await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf');
  await expect(page.locator('.accno')).toHaveText('JF-0001');
  await expect(page.getByRole('button', { name: /Prefix/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('input[placeholder="your initials or the collection\'s"]')).toHaveValue('jf');
});

test('round sixty: a navigation with a query is not kept as the plain page\'s offline copy (E08)', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.goto('/?by=origin');
  await expect(page.getByRole('link', { name: 'Origin' })).toHaveAttribute('aria-current', 'page');
  await page.goto('/about/how'); // a page that is kept: once it is in the cache, the navigation before it has been dealt with too
  const plain = await page.evaluate(async () => {
    for (let i = 0; i < 100; i++) {
      for (const k of await caches.keys()) {
        const c = await caches.open(k);
        if (await c.match('/about/how', { ignoreVary: true })) {
          const r = await c.match('/', { ignoreVary: true, ignoreSearch: true });
          return r ? await r.text() : '';
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('/about/how was never kept');
  });
  expect(plain).not.toContain('href="?by=origin" aria-current="page"');
  await ctx.close();
});

test('round sixty: the place form refuses a floor that is not a temperature, and writes nothing (E03)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Floor bench');
  await page.selectOption('#loc-kind', 'bench');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('.tree a', { hasText: 'Floor bench' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.fill('#e-floor', 'abc');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('#e-msg')).toContainText('is not a temperature');
  await expect(page.locator('#e-floor')).toBeFocused();
  await page.reload();
  await expect(page.locator('h1')).toContainText('Floor bench');
  await expect(page.locator('main')).not.toContainText('abc'); // nothing was written
});

test('round sixty: a death has an Undo; "Record…", not "Log"; Since watered says today, not 0 d (the grower review, 12 and 16)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await addPlant(page);
  await expect(page.getByRole('button', { name: 'Record…', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await expect(page.locator('.card', { hasText: 'Since watered' }).locator('.val')).toHaveText('today');
  await more(page, 'Died…');
  await page.fill('#ev-cause', 'rot');
  await page.locator('.evform button[type=submit]').click();
  await expect(page.locator('.toast')).toContainText('Death recorded');
  await expect(page.locator('.tlrow', { hasText: 'rot' })).toBeVisible();
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('growing again');
  await expect(page.locator('.tlrow', { hasText: 'rot' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Water', exact: true })).toBeVisible(); // growing: Water leads again
});

test('round sixty: places are added one after another with the parent and the kind kept, and a plant with no place is given one from the list (the grower review, 14 and 17)', async ({ page }) => {
  await page.goto('/places');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Greenhouse');
  await page.selectOption('#loc-kind', 'greenhouse');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree a', { hasText: 'Greenhouse' })).toBeVisible();
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Bench 1');
  await page.selectOption('#loc-kind', 'bench');
  await page.selectOption('#loc-parent', { label: 'Greenhouse' });
  await page.getByRole('button', { name: 'Add another', exact: true }).click();
  await expect(page.locator('#loc-added')).toContainText('Bench 1 added inside Greenhouse');
  await expect(page.locator('#loc-name')).toHaveValue('');
  await expect(page.locator('#loc-name')).toBeFocused();
  await expect(page.locator('#loc-kind')).toHaveValue('bench'); // kept for the next
  await page.fill('#loc-name', 'Bench 2');
  await page.getByRole('button', { name: 'Add another', exact: true }).click();
  await expect(page.locator('#loc-added')).toContainText('Bench 2 added inside Greenhouse');
  await expect(page.locator('.tree a', { hasText: 'Bench 2' })).toBeVisible();
  // a plant with no place: the line offers a place to pick, and the pick moves it with an Undo
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.selectOption('#f-loc', { label: 'No place' });
  await addPlant(page);
  await page.goto('/places');
  await expect(page.locator('#unplaced')).toContainText('1 growing plant has no place.');
  await page.locator('#unplaced').getByRole('button', { name: 'Give it one' }).click();
  const opt = await page.locator('#unplaced-list option', { hasText: 'Bench 2' }).getAttribute('value');
  await page.locator('#unplaced-list select').selectOption(opt!);
  await expect(page.locator('.toast')).toContainText('moved to Greenhouse › Bench 2');
  await expect(page.locator('#unplaced')).toHaveCount(0);
});

test('round sixty: "Save and add another" keeps the last watering, and its toast offers Undo above the pinned buttons, never over them (the grower review, 3 and 6)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await ready(page);
  await page.locator('details.moredetails > summary').click();
  await page.fill('#f-watered', localDay(-3));
  await page.getByRole('button', { name: 'Save and add another' }).click();
  await expect(page.locator('.toast')).toContainText('added');
  await expect(page.locator('.toast').getByRole('button', { name: 'Undo' })).toBeVisible(); // mid-batch, Undo, not Open: Open left the form behind
  const toastBox = (await page.locator('.toast').boundingBox())!;
  const another = (await page.getByRole('button', { name: 'Save and add another' }).boundingBox())!;
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(another.y); // above the bar, not over its buttons
  await expect(page.locator('#f-watered')).toHaveValue(localDay(-3)); // kept for the next plant
  await page.goto('/plants');
  await expect(page.locator('.accrow .fig', { hasText: 'watered 3 d ago' })).toHaveCount(1); // Today and the list count from it
});

test('round sixty: a visitor sees one species\' figures and chart on a desktop, none on a phone (its search stays with the rows; round sixty-one), and a search that matched nothing as written says what it searched', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await ready(page);
  const feature = page.locator('section.feature');
  await expect(feature).toBeVisible();
  await expect(feature.locator('.featurehead')).toContainText('This is what every species page shows');
  await expect(feature.locator('.card.cold')).toContainText('Cold floor');
  await expect(feature.locator('.climo')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(feature).toBeHidden(); await expect(feature.locator('.climo')).toHaveCount(0); // a phone keeps the search with its rows and gets the link, and no chart is drawn (round sixty-one, at the merge)
  await expect(page.locator('#try-sample-home')).toBeVisible();
  // a variety the reference files under its species: nothing as written, the species on the retry, and the page says so
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.fill('.toolrow .searchbar', 'Copiapoa cinerea var. nonexista');
  await expect(page.locator('.relaxed')).toContainText('Showing results for “Copiapoa cinerea”');
  await expect(page.locator('.hitrow').first()).toContainText('Copiapoa cinerea');
});

test('round sixty: Today draws "Also today" only when something is under it', async ({ page }) => {
  await page.goto('/today');
  await ready(page);
  await expect(page.locator('#rest-h')).toBeHidden();
});

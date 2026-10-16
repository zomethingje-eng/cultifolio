// smoke.spec.ts, the first part: pages, records, sync, backup and the reference (round seventy-two: split into four files that run in parallel, each in order).
import { test, expect } from '@playwright/test';
import { wipe } from './helpers/inject';
import { fromAddress, docAddress, limitAddress } from './helpers/address';
import { ownPages } from './helpers/r63v-own';
import { openDisclosure } from './helpers/disclosure';
import { writeWait } from './helpers/pace';
import { smokeSetup, ready, addPlant, year, more, syncRun } from './helpers/smoke';

smokeSetup();

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
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
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
  await expect(page.locator('.notice', { hasText: 'Occurrence source refused the request' })).toBeVisible(); // said on the climate section, the evidence line and the record map
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
  await expect(page.locator('.err')).toContainText('The reference has 2 Copiapoa species, a genus the list takes whole');
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
  await page.goto('/plants/new'); await ready(page);
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
  await page.goto('/plants/new'); await ready(page);
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
  await page.goto('/plants/new'); await ready(page);
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
  await page.goto('/propagation/new'); await ready(page);
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
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=7284333'); await ready(page);
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=7284333'); await ready(page);
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
  await expect(page.locator('.hvh')).toContainText(/coldest month's mean nightly low at the habitat \d+(\.\d)? °C in \w+ \(median year; across the range, 40 grid cells, \d+ to \d+; CHELSA\); 1st-percentile night over 40 years at a typical spot in the range 6\.5 °C \(NASA POWER\)/);
  await expect(page.locator('.hvh')).toContainText(/open sky over the habitat \d+–\d+ mol\/m²\/day across the year \(median year; across the range, 40 grid cells, \d+ to \d+; CHELSA\)/);
  await expect(page.locator('.hvh .pill')).toHaveCount(0);
  await page.locator('.hvh + details.why summary').click(); // the caveat sits one tap away, not beside the figures
  await expect(page.locator('.hvh + details.why')).toContainText('A comparison, not a verdict');
  // the next add-plant form remembers the last place used
  await page.goto('/plants/new'); await ready(page);
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
  // From "Add a photo", with the reference's photograph left off (its default): whether an outside host's image loads says
  // nothing about the grower's own, and the test never reached its upload when it did not (round sixty-two; outside
  // review B14). The reference's photograph offering "add your own" is r62h-harness.spec.ts's, over a local image; the
  // sentence for one that did not load is "removing asks twice; a species photograph that fails to load...".
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await ready(page);
  // no photos yet: the card offers "Add a photo" beside the name; the section shows the add row
  await expect(page.locator('.idcard label.tile')).toContainText('Add a photo');
  await expect(page.locator('#acc-photo-camera')).toBeAttached();
  // a real JPEG: a screenshot of this very page, larger than the stored size so resizing is exercised
  await page.setViewportSize({ width: 2000, height: 1400 });
  const jpeg = await page.screenshot({ type: 'jpeg', quality: 80 });
  await page.setViewportSize({ width: 1180, height: 900 });
  await page.locator('#acc-photo-file').setInputFiles({ name: 'bench.jpg', mimeType: 'image/jpeg', buffer: jpeg }); // the section's row, which stays open for the second
  await expect(page.locator('.phgrid .ph')).toHaveCount(1);
  await expect(page.locator('.hero.own')).toBeVisible();
  await expect(page.locator('.tlphoto', { hasText: 'Photographed' })).toBeVisible();
  // resized: the stored width is the long edge cap
  const dims = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    // Blobs, or their bytes where the browser refuses a Blob in its database (Safari's engine in a private window and in
    // the test's own contexts; round sixty-four, the all-engines run).
    type Kept = { blob: Blob; thumb: Blob } | { full: ArrayBuffer; small: ArrayBuffer; fullType: string; smallType: string };
    const kept = await new Promise<Kept[]>((res, rej) => { const r = db.transaction('photos').objectStore('photos').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const all = kept.map((p) => ('full' in p ? { blob: new Blob([p.full], { type: p.fullType }), thumb: new Blob([p.small], { type: p.smallType }) } : p));
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
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
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
    // Blobs, or their bytes where the browser refuses a Blob in its database (Safari's engine in a private window and in the
    // test's own contexts): the sizes are the JPEGs' either way (round sixty-five; the all-engines rerun, as the photos test).
    const photos = (await all('photos')) as Array<{ id: string; blob: Blob; thumb: Blob } | { id: string; full: ArrayBuffer; small: ArrayBuffer }>;
    return { changes: changes.map((c) => JSON.stringify(c)).sort(), photos: photos.map((p) => ('full' in p ? `${p.id}:${p.full.byteLength}:${p.small.byteLength}` : `${p.id}:${p.blob.size}:${p.thumb.size}`)).sort() };
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
  // Through the helper, which drops the snapshot and the arrival rows with the log (round sixty-seven; triage-66 H7).
  await wipe(page);
  await page.evaluate(() => localStorage.removeItem('cultifolio.frost.site'));
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
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', "Copiapoa cinerea x C. gigantea 'Test Cross'");
  await page.locator('#species-name').blur();
  await expect(page.locator('.picker .pill', { hasText: 'hybrid' })).toBeVisible();
  await expect(page.locator('#f-parentage')).toHaveValue('Copiapoa cinerea × Copiapoa gigantea');
  // The name service's answer on screen before Add: the genus's key, or the line under the field saying the service did not
  // answer (as here, with no upstream; it comes after any pill the check writes). Both move Add down, and in Firefox on the
  // PC Add was pressed and let go as they arrived, so the press missed it (round sixty-six; the all-engines run, where the
  // page showed the line and an untouched Add; round sixty-five's smoke 2322 the same in Safari's engine).
  await expect(page.locator('.picker .pill.ok').or(page.locator('.picker .hint.svc')).first()).toBeVisible({ timeout: 15_000 });
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
  await page.goto('/plants/new'); await ready(page);
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
    await page.goto('/plants/new'); await ready(page);
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
  await expect(page.locator('.page .label .care', { hasText: 'cooler six months Nov–Apr · floor 6.5 °C (1 in 100, NASA POWER) · open sky 30–65 DLI' })).toHaveCount(1); // the same rules and the same month formatter as the sheet
  // and it was asked for by hash bucket only: no key, no slug, no species name left the browser (round ten, 1)
  // Each also names the build (`v=`, round sixty-seven; triage-66 S7): a version, never a name, so it is left out here.
  const noBuild = (u: string) => u.replace(/&v=[^&]*$/, '');
  expect(asked.filter((u) => u.startsWith('/api/sheets')).map(noBuild).sort()).toEqual(['/api/sheets?b=03&c=fixture&n=32', '/api/sheets?b=1c&c=fixture&n=32']); // one request a bucket (its edge-cache key), with the corpus id and the count hashed by (round fifty-four, 3)
  for (const u of asked) { expect(u).not.toMatch(/dossier|index|copiapoa|welwitschia|5384013/); expect(noBuild(u)).toMatch(/^\/api\/(corpus|(sheets|entries)\?b=([01][0-9a-f],?)+&c=fixture&n=32)$/); }
  // the page size follows the sheet
  await page.selectOption('#lb-sheet', 'L7160');
  await expect(page.locator('.page').first()).toHaveCSS('width', /793|794/); // 210 mm
  expect(await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join(''))).toContain('size: 210mm 297mm');
});

test('the species page condenses its cultivation sheet into a note by rule', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  // since round sixty the season card in the first screen carries the reading, fact first and its rule and source after
  const season = page.locator('.glance .card.season');
  await expect(season).toContainText("72 mm of rain in the median year, under the rule's 120 mm, so no rainy season is read; the cooler six months are November to April");
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
  await expect(page.locator('#welcome')).toContainText('Grow cacti, succulents or bulbs?'); // the welcome's lead says what the site is on a phone (round sixty-seven; triage-66 V9)
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
  await A.addInitScript(ownPages); // the grower's own pages, not the example (round sixty-three, V2)
  await fromAddress(A); // the vault is made from an address of its own, not 127.0.0.1's five a day (round sixty-two second pass)
  const a = await A.newPage();
  await a.goto('/places');
  await a.getByRole('button', { name: 'New place' }).click();
  await a.fill('#loc-name', 'Kitchen sill');
  await a.selectOption('#loc-kind', 'windowsill');
  await a.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(a.locator('.tree .row', { hasText: 'Kitchen sill' })).toBeVisible();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(a);
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
  await fromAddress(A); // the vault is made from an address of its own (round sixty-two second pass)
  const a = await A.newPage();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013'); await ready(a);
  await a.getByRole('button', { name: /^Add/ }).click();
  await expect(a).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = a.url().split('/').pop()!;
  await a.goto('/sync');
  await a.click('#sync-start');
  const key = (await a.locator('#vault-key').textContent())!.trim();
  await a.fill('#key-typeback', key.slice(-5)); // the last group typed back, not a box ticked (round forty-one, R9)
  await a.click('#sync-create');
  await expect(a.locator('.card', { hasText: 'Status' })).toContainText('Synced', { timeout: 20_000 }); // 22 changes on a loaded server took past the 5 s default once (round sixty-nine)
  const B = await browser.newContext();
  const b = await B.newPage();
  await b.goto('/sync');
  await b.click('#sync-have-key');
  await b.fill('#sync-key', key);
  await b.click('#sync-join');
  // A join stores and folds the vault's changes: in Safari's engine on the owner's PC every IndexedDB request is ~16 ms,
  // and the second join below was still "Receiving 4 of 4…" when 10 s ran out, every step on screen in turn, nothing held
  // (round seventy-b; the owner's all-engines run). Counted in Chromium: a first join of this vault 93 requests, a rejoin
  // 139 with 22 changes; this test's rejoin carries about 60, so it is given 600 at WebKit's pace (helpers/pace.ts).
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('Synced', { timeout: writeWait(10_000, 600) });

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
  await c.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106'); await ready(c);
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
  await expect(b.locator('.card', { hasText: 'Status' })).toContainText('Synced', { timeout: writeWait(10_000, 600) }); // the rejoin, as above
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

test('five new vaults a day from one address: the sixth is refused with a 429 that says so; another address, and opening a vault already made, are not (round sixty-two second pass)', async ({ request }) => {
  // The one test of the per-address limit. Every other spec that makes a vault sends its own documentation address
  // (./helpers/address.ts), so the limit is met here on purpose, from an address kept for it, and nowhere by accident.
  const { createHash } = await import('node:crypto');
  const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const vault = () => { const token = createHash('sha256').update(`limit ${Math.random()} ${Date.now()}`).digest('hex'); const d = createHash('sha256').update('id:' + token).digest(); let id = ''; for (let i = 0; i < 26; i++) id += B32[d[i] % B32.length]; return { id, token }; };
  const make = (ip: string, v: { id: string; token: string }) => request.post('/api/sync/vault', { headers: { 'cf-connecting-ip': ip }, data: { ...v, create: true } });
  // A /48 of its own for each attempt (round seventy; triage-69 W5, S-E5, R47-19): `limitAddress` mixes in the retry
  // and the repeat, so a retry is not handed the address whose five the first attempt spent.
  const ip = limitAddress();
  const first = vault();
  for (const v of [first, vault(), vault(), vault(), vault()]) {
    const r = await make(ip, v);
    expect(r.status(), `a new vault from ${ip}`).toBe(200);
    expect(((await r.json()) as { created: boolean }).created).toBe(true);
  }
  const sixth = await make(ip, vault());
  expect(sixth.status()).toBe(429);
  expect(((await sixth.json()) as { error: string }).error).toBe('too many new vaults from this address today');
  // To midnight UTC, when the day's count starts again (round sixty-seven; triage-66 S9): an hour was refused again until then.
  const now = Date.now();
  const toMidnight = Math.ceil((Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1) - now) / 1000);
  expect(Math.abs(Number(sixth.headers()['retry-after']) - toMidnight)).toBeLessThanOrEqual(5);
  // a vault already made is opened from the same address: nothing new is counted
  const again = await make(ip, first);
  expect(again.status()).toBe(200);
  expect(((await again.json()) as { created: boolean }).created).toBe(false);
  // and another address has its own five
  expect((await make(docAddress(), vault())).status()).toBe(200);
});

test('a number already in use cannot be given to a second plant', async ({ page }) => {
  await page.goto('/plants/new');
  await ready(page); // a value typed before hydration is dropped (round fifty-nine)
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await openDisclosure(page, 'details.own');
  await page.check('#f-own');
  await page.fill('#f-own-no', '2019-0147');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/2019-0147$/);
  await expect(page.locator('h1.sci .accno')).toHaveText('2019-0147');
  await page.goto('/plants/new');
  await ready(page);
  await page.fill('#species-name', 'Welwitschia mirabilis');
  await page.locator('#species-name').blur();
  await openDisclosure(page, 'details.own');
  await page.check('#f-own');
  await page.fill('#f-own-no', '2019-0147');
  await expect(page.locator('#f-own-taken')).toContainText('already used by');
  await expect(page.locator('#f-own-taken a')).toHaveText('Copiapoa cinerea');
  await expect(page.getByRole('button', { name: /^Add/ })).toBeDisabled();
  await page.goto('/plants/2019-0147');
  await expect(page.locator('h1.sci')).toContainText('Copiapoa'); // untouched
});

test('the app shell is installed for offline use: collection pages, a species page once read, and an offline page are all in the cache', async ({ browser, browserName }) => {
  // Playwright's offline emulation does not reach a service worker's own fetches in Chromium, so this
  // checks what the worker put in the cache, which is what offline navigation is served from.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/');
  // The second page registers the worker (round seventy-three: a first page alone does not); pages after it are served through it.
  // The first page must have counted itself before the second loads: on the owner's PC a goto that left before the layout
  // had decided (`data-worker`) left the count at one, and the second page registered nothing.
  await page.locator('html[data-worker]').waitFor({ state: 'attached' });
  await page.goto('/about/formats');
  await page.locator('html[data-worker="on"]').waitFor({ state: 'attached' });
  await page.evaluate(() => navigator.serviceWorker.ready);
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
  // Not in Safari's engine: there Playwright routes a page's navigation from the page's own inspector, before the worker
  // is asked, so the stand-in answered "server saw it" for a request the worker never saw (round sixty-five; the
  // all-engines rerun). The worker's map is the same file in every engine, and Chromium and Firefox check it here; Safari's
  // engine checks it in r67h-offline.spec.ts 3, through a proxy rather than a route (round sixty-seven; triage-66 H2).
  if (browserName === 'webkit') { await ctx.close(); return; }
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
  await page.locator('.chipbtn:visible', { hasText: 'All' }).click(); // the desktop's "All"; the phone's own is not drawn here (round seventy-three)
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

import { test, expect } from '@playwright/test';

test('front page renders server-side with the fixture corpus: closed genus rows, one open by URL, no JavaScript needed', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Species');
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
  for (const l of ['Species', 'My plants', 'Benches', 'Sowings', 'Frost', 'Compare species', 'Labels', 'Backup', 'Sync', 'How it is made', 'Formats', 'Source']) await expect(menu.getByRole('link', { name: l, exact: true })).toBeVisible();
  await expect(menu.locator('a.on')).toHaveText('Species');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Menu' })).toBeFocused();
  await page.getByRole('button', { name: 'Menu' }).click();
  await menu.getByRole('link', { name: 'Benches' }).click();
  await expect(page).toHaveURL(/\/benches$/);
  await expect(page.locator('#menu')).toHaveCount(0); // closed by the navigation
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
  await expect(page.getByText('occurrence source did not answer').first()).toBeVisible(); // said on the climate, the evidence line and the record map
  await expect(page.locator('.factgrid', { hasText: 'not a statement that none exist' })).toBeVisible();
});

test('unknown species is a 404 with a way forward', async ({ page }) => {
  const res = await page.goto('/species/nonsensia-fakeii');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('no dossier yet')).toBeVisible();
});

test('add a plant, record an event, survive a reload', async ({ page }) => {
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.fill('#f-field', 'KK 1462');
  await page.selectOption('#f-prov', 'f1');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-0001$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('.fnchip', { hasText: 'KK 1462' })).toBeVisible();
  await page.getByRole('button', { name: 'More ▾' }).click(); // four verbs at rest, the rest on request
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
  await page.goto('/benches');
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
  // add a plant on the shelf
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Tylecodon pearsonii');
  await page.locator('#species-name').blur();
  const shelfValue = await page.locator('#f-loc option', { hasText: 'Shelf 2' }).getAttribute('value');
  await page.selectOption('#f-loc', shelfValue!);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('a.pill', { hasText: 'Laundry room › Shelf 2' })).toBeVisible();
  // the room sees the plant through the shelf; water the whole room
  await page.goto('/benches');
  await page.locator('.tree .row', { hasText: 'Laundry room' }).click();
  await expect(page.getByText('1 growing plant')).toBeVisible();
  await page.getByRole('button', { name: /Water all 1/ }).click();
  await expect(page.getByText('Watered 1 plant.')).toBeVisible();
  // audit: tick it present
  await page.getByRole('button', { name: 'Audit' }).click();
  await page.locator('label.row input[type=checkbox]').check();
  await page.getByRole('button', { name: 'Finish audit' }).click();
  await expect(page.getByText('1 present.')).toBeVisible();
  await expect(page.getByText(/seen today/)).toBeVisible();
  // the plant's timeline has both entries
  await page.locator('.rows a.row', { hasText: 'Tylecodon' }).first().click();
  await expect(page.locator('.tlrow .t', { hasText: 'Seen at audit' })).toBeVisible();
  await expect(page.locator('.tlrow .t', { hasText: /whole room: Laundry room/ })).toBeVisible();
});

test('sowings: sow seed, count germination, pot up into numbered plants, propagate from one of them', async ({ page }) => {
  await page.goto('/sowings/new');
  await page.selectOption('#s-method', 'seed');
  await page.fill('#species-name', 'Ariocarpus fissuratus');
  await page.locator('#species-name').blur();
  await page.fill('#s-count', '12');
  await page.fill('#s-from', 'Mesa Garden');
  await page.fill('#s-ref', 'MG 123');
  await page.selectOption('#s-prov', 'wild');
  await page.fill('#s-medium', 'pumice and loam');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/sowings\/S\d{4}-001$/);
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
  await expect(page.getByText(/Potted up 2:/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plants raised from this batch' })).toBeVisible();
  // the plant knows its batch and its provenance
  await page.locator('.rows a.accrow').first().click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.vern')).toContainText('F1, raised from wild-collected seed');
  await expect(page.locator('.fnchip', { hasText: 'MG 123' })).toBeVisible();
  await expect(page.locator('a.mono[href^="/sowings/"]').first()).toBeVisible(); // the plant links its batch
  // take offsets from it
  await page.getByRole('link', { name: 'Propagate' }).click();
  await expect(page).toHaveURL(/\/sowings\/new\?parent=/);
  await expect(page.locator('#s-parent')).not.toHaveValue('');
  await page.fill('#s-count', '3');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/sowings\/S\d{4}-002$/);
  await expect(page.getByText('3 offsets on')).toBeVisible();
  // list shows both
  await page.goto('/sowings');
  await expect(page.locator('table.wx tbody tr')).toHaveCount(2);
});

test('a species page hands its name to the add-plant and sow-seed forms', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=7284333');
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
  await page.goto('/sowings/new?species=Copiapoa%20cinerea&key=7284333');
  await expect(page.locator('#species-name')).toHaveValue('Copiapoa cinerea');
});

test('the path species → my plants → bench is prefilled at every step and loops back', async ({ page }) => {
  // a place to put things
  await page.goto('/benches');
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
  await expect(page.locator('.pill', { hasText: 'you grow 1' })).toBeVisible();
  await page.locator('a.accno', { hasText: acc }).click();
  await expect(page).toHaveURL(new RegExp(`/plants/${acc}$`));
  // habitat versus here: the missing bench figure hands off to the bench edit form
  await expect(page.locator('.hvh')).toBeVisible();
  await page.getByRole('link', { name: 'Set its floor' }).click();
  await expect(page).toHaveURL(/\/benches\/.+\?edit=1$/);
  await expect(page.locator('#e-name')).toHaveValue('East sill');
  await page.fill('#e-floor', '2');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#e-floor')).toHaveCount(0); // the save has landed once the form has closed; a hard navigation before that reads the old floor
  // back on the plant, the comparison shows both figures and no verdict: the judgement is the grower's
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.hvh')).toContainText('this place is set to bottom out at 2 °C');
  // the habitat figure is the median with its 10th–90th span across the envelope cells, and the quantity is named
  await expect(page.locator('.hvh')).toContainText(/coldest month's mean night at the habitat \d+(\.\d)? °C in \w+ \(median year; across the 40 envelope cells \d+ to \d+; CHELSA\); 1st-percentile night over 40 years at the typical cell 6\.5 °C \(NASA POWER\)/);
  await expect(page.locator('.hvh')).toContainText(/open sky over the habitat \d+–\d+ mol\/m²\/day across the year \(median year; across the 40 envelope cells \d+ to \d+; CHELSA\)/);
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
  await expect(page.locator('.idcard .pill', { hasText: 'Cold frame' })).toBeVisible();
  await expect(page.locator('.tlrow', { hasText: 'Cold frame' })).toBeVisible();
  await page.locator('.idcard .pill', { hasText: 'Cold frame' }).click();
  await expect(page).toHaveURL(/\/benches\//);
  await expect(page.locator('a.accrow', { hasText: acc })).toBeVisible();
});

test('photos: taken on the device, resized, stored, captioned, made the cover, shown everywhere, survive a reload, removed', async ({ page }) => {
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
  await page.goto('/benches');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Back porch');
  await page.selectOption('#loc-kind', 'outdoor');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  const opt = await page.locator('#f-loc option', { hasText: 'Back porch' }).getAttribute('value');
  await page.selectOption('#f-loc', opt!);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await page.fill('#ev-note', 'first drink');
  await page.getByRole('button', { name: 'Record' }).click();
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
  await expect(page.locator('.preview')).toContainText('change nothing');
  await expect(page.locator('#bk-merge')).toBeDisabled();
  // wipe: replace with the file is the wipe-and-restore path, but first prove a real wipe loses everything
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    await Promise.all(['changes', 'photos'].map((s) => new Promise<void>((res) => { const r = db.transaction(s, 'readwrite').objectStore(s).clear(); r.onsuccess = () => res(); })));
  });
  await page.goto('/plants');
  await expect(page.locator('a.accrow')).toHaveCount(0);
  // restore by merge into the empty device
  await page.goto('/backup');
  await page.locator('#bk-file').setInputFiles(path!);
  await expect(page.locator('.preview')).toContainText('1 plant · 2 timeline entries · 1 place · 0 sowings · 1 photo');
  await expect(page.locator('.preview')).toContainText('bring in 1 photo');
  await page.click('#bk-merge');
  await expect(page.locator('#bk-done')).toContainText('1 photo');
  const after = await dump();
  expect(after).toEqual(before);
  // and the plant is back with its photo and its place
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.idcard .pill', { hasText: 'Back porch' })).toBeVisible();
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
  await expect(page.locator('.idcard .pill', { hasText: 'hybrid' })).toBeVisible();
  // one parent has a species page in the fixture corpus, the other does not: only the first is a link
  await expect(page.locator('.parentage a')).toHaveCount(1);
  await expect(page.locator('.parentage a')).toHaveAttribute('href', '/species/copiapoa-cinerea');
  await expect(page.locator('.factgrid', { hasText: 'Parentage' })).toContainText('Copiapoa cinerea × Copiapoa gigantea');
  // no habitat is claimed for it
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('A hybrid');
  await expect(page.locator('.hvh')).toHaveCount(0);
  // the species page does not count the hybrid as a plant of Copiapoa cinerea
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.pill', { hasText: 'you grow' })).toHaveCount(0);
  // a cultivar of the species does count
  await page.goto('/plants/new');
  await page.fill('#species-name', "Copiapoa cinerea 'Silver'");
  await page.locator('#species-name').blur();
  await expect(page.locator('.picker .pill', { hasText: 'cultivar' })).toBeVisible();
  await expect(page.locator('#f-parentage')).toHaveCount(0);
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await expect(page.locator('.idcard .pill', { hasText: 'cultivar' })).toBeVisible();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.pill', { hasText: 'you grow 1' })).toBeVisible();
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
  await page.getByRole('link', { name: 'Label' }).click();
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
  // the page size follows the sheet
  await page.selectOption('#lb-sheet', 'L7160');
  await expect(page.locator('.page').first()).toHaveCSS('width', /793|794/); // 210 mm
  expect(await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join(''))).toContain('size: 210mm 297mm');
});

test('the species page condenses its cultivation sheet into a note by rule', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('#gen-note')).toContainText('condensed by rule');
  await expect(page.locator('#gen-note')).not.toHaveAttribute('open', ''); // closed at rest: the four figures above say it
  await page.locator('#gen-note summary').click();
  await expect(page.locator('#gen-note .body')).toContainText("Rain rule: no rainy season to read (72 mm a year); the temperature rule's cooler six months are November to April in the northern hemisphere.");
  await expect(page.locator('#gen-note .body')).not.toContainText(/fog/);
  await expect(page.locator('#gen-note .body')).toContainText('Cold floor 6.5 °C (1st-percentile habitat night, NASA POWER).');
  await expect(page.locator('#gen-note .foot')).toContainText('Its year, Rain, Light, Warmth and air');
  // the note's floor is the card's floor, the same figure with the same quantity named
  await expect(page.locator('.cult', { hasText: /^Warmth and air/ }).first().locator('.body')).toContainText('Cold floor: 6.5 °C, which is the 1st-percentile night over 40 years at the typical cell (NASA POWER).');
  // nothing on the sheet says what the plant does, wants or tolerates, or what to do to it
  const sheet = (await page.locator('.note-slot').textContent())!;
  expect(sheet).not.toMatch(/\b(rests?|wants?|tolerat\w*|will|water it|feed|repot|misting|kills?|fatal|scorch\w*|bleach\w*|keep it|give it|wakes?|grows in the open)\b/i);
});

test('first run: the front page explains itself once, and stops once there is a plant or it is dismissed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#welcome')).toContainText('New here');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.locator('#welcome')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.grow').first()).toBeVisible();
  await expect(page.locator('#welcome')).toHaveCount(0);
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
  await page.goto('/plants/2026-0001');
  const small = await page.evaluate(() => [...document.querySelectorAll('a.btn, button.btn, #tabbar a, .chipbtn')].map((e) => e.getBoundingClientRect().height).filter((h) => h > 0 && h < 40));
  expect(small).toEqual([]);
});

test('sync: two devices share one encrypted vault; changes and photos cross both ways; the server holds only ciphertext', async ({ browser }) => {
  test.setTimeout(120_000);
  // Device A: a place, a plant with a photo and a watering; then set up a vault.
  const A = await browser.newContext();
  const a = await A.newPage();
  await a.goto('/benches');
  await a.getByRole('button', { name: 'New place' }).click();
  await a.fill('#loc-name', 'Kitchen sill');
  await a.selectOption('#loc-kind', 'windowsill');
  await a.getByRole('button', { name: 'Add', exact: true }).click();
  await a.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  const opt = await a.locator('#f-loc option', { hasText: 'Kitchen sill' }).getAttribute('value');
  await a.selectOption('#f-loc', opt!);
  await a.getByRole('button', { name: /^Add/ }).click();
  await expect(a).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = a.url().split('/').pop()!;
  await a.getByRole('button', { name: 'Water', exact: true }).click();
  await a.fill('#ev-note', 'from device A');
  await a.getByRole('button', { name: 'Record' }).click();
  const jpeg = await a.screenshot({ type: 'jpeg', quality: 60 });
  await a.locator('#acc-photo-file').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await expect(a.locator('.phgrid .ph')).toHaveCount(1);

  await a.goto('/sync');
  await a.click('#sync-start');
  const key = (await a.locator('#vault-key').textContent())!.trim();
  expect(key).toMatch(/^([A-HJKMNP-TV-Z2-9]{5}-){5}[A-HJKMNP-TV-Z2-9]{5}$/);
  await a.check('#key-saved');
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
  await expect(b.locator('.idcard .pill', { hasText: 'Kitchen sill' })).toBeVisible();
  await expect(b.locator('.tlrow', { hasText: 'from device A' })).toBeVisible();
  await expect(b.locator('.hero.own img')).toBeVisible(); // the photo came across
  await expect(b.locator('.phgrid .ph')).toHaveCount(1);

  // B edits: a feed and a note; A picks them up.
  await b.getByRole('button', { name: 'More ▾' }).click();
  await b.getByRole('button', { name: 'Feed', exact: true }).click();
  await b.fill('#ev-note', 'from device B');
  await b.getByRole('button', { name: 'Record' }).click();
  await b.goto('/sync');
  await b.click('#sync-now');
  await expect(b.locator('.card', { hasText: 'Waiting to send' })).toContainText('0');
  await a.goto('/sync');
  await a.click('#sync-now');
  await expect(a.locator('.card', { hasText: 'Status' })).toContainText('Synced');
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.tlrow', { hasText: 'from device B' })).toBeVisible();
  await expect(a.locator('.tl .tlrow')).toHaveCount(4); // acquired, watered, photographed, fed

  // Concurrent edit of the same field: both change the notes offline; the later one wins on both.
  await a.getByRole('button', { name: 'Add a note' }).click();
  await a.fill('#acc-notes', 'A says sulky');
  await a.locator('#acc-notes').locator('..').getByRole('button', { name: 'Save' }).click();
  await b.goto(`/plants/${acc}`);
  await b.getByRole('button', { name: 'Add a note' }).click();
  await b.fill('#acc-notes', 'B says thriving');
  await b.locator('#acc-notes').locator('..').getByRole('button', { name: 'Save' }).click();
  for (const p of [a, b, a]) {
    await p.goto('/sync');
    await p.click('#sync-now');
    await expect(p.locator('.card', { hasText: 'Status' })).toContainText('Synced');
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
    await p.click('#sync-now');
    await expect(p.locator('.card', { hasText: 'Status' })).toContainText('Synced');
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
  await a.check('#key-saved');
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
  await b.getByRole('button', { name: 'Water', exact: true }).click();
  await b.fill('#ev-note', 'B, offline, first');
  await b.getByRole('button', { name: 'Record' }).click();
  await expect(b.locator('.tlrow', { hasText: 'B, offline, first' })).toBeVisible();
  await a.goto(`/plants/${acc}`);
  await a.getByRole('button', { name: 'More ▾' }).click();
  await a.getByRole('button', { name: 'Feed', exact: true }).click();
  await a.fill('#ev-note', 'A, online, second');
  await a.getByRole('button', { name: 'Record' }).click();
  await syncNow(a);
  // B comes back and uploads its older change late. A must still receive it.
  await B.setOffline(false);
  await syncNow(b);
  await syncNow(a);
  await a.goto(`/plants/${acc}`);
  await expect(a.locator('.tlrow', { hasText: 'B, offline, first' })).toBeVisible();
  await b.goto(`/plants/${acc}`);
  await expect(b.locator('.tlrow', { hasText: 'A, online, second' })).toBeVisible();

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
  for (const p of ['/plants', '/benches', '/sowings', '/labels', '/backup', '/sync', '/offline']) expect(cached).toContain(p);
  expect(cached.some((u) => u.startsWith('/_app/immutable/'))).toBe(true);
  expect(cached).toContain('/species/copiapoa-cinerea'); // read once, kept
  expect(cached).not.toContain('/species/welwitschia-mirabilis'); // never read: the offline page would answer for it
  await page.goto('/offline');
  await expect(page.locator('h1')).toContainText('No connection');
  await ctx.close();
});

test('the front page carries closed rows and fetches the whole catalogue only when a search or a chip cuts across them', async ({ page }) => {
  await page.goto('/');
  const calls: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/api/index')) calls.push(r.url()); });
  await expect(page.locator('.grow')).toHaveCount(3);
  // opening a row is a navigation, not an index fetch
  await page.locator('.grow', { hasText: 'Welwitschia' }).click();
  await expect(page.locator('a.tile')).toHaveCount(1);
  expect(calls).toHaveLength(0);
  // a search flattens: every match across every genus, and the rows step aside
  await page.fill('.searchbar', 'welwit');
  await expect(page.locator('a.tile')).toHaveCount(1);
  await expect(page.locator('.grow')).toHaveCount(0);
  expect(calls.length).toBeGreaterThan(0);
  await expect(page.locator('.seccount').last()).toContainText('1 of 4 shown');
  // a chip does the same, and "You grow" is not offered to someone who grows nothing
  await page.fill('.searchbar', '');
  await expect(page.locator('.grow')).toHaveCount(3);
  await expect(page.locator('.chipbtn', { hasText: 'You grow' })).toHaveCount(0);
  await page.locator('.chipbtn', { hasText: 'Without climate' }).click();
  await expect(page.locator('a.tile')).toHaveCount(2);
  await expect(page.locator('.seccount').last()).toContainText('2 of 4 shown');
});

test('the about pages are served without JavaScript and say what the app refuses to guess', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto('/about');
  await expect(p).toHaveURL(/\/about\/how$/);
  await expect(p.locator('h2#marker')).toHaveText('The map marker');
  await expect(p.locator('h2#climate')).toHaveText('The climate envelope');
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
  await expect(page.locator('.hero .ph')).toContainText('GBIF media did not answer when this page was built. Not a statement that none exist.');
  await expect(page.locator('.pill', { hasText: 'Photographs not checked' })).toBeVisible();
  // climate refused: its own line, with the detail as a sentence
  await expect(page.locator('.notice', { hasText: 'Occurrence source' })).toContainText('Not checked. Occurrence source did not answer. This is not a statement that no climate exists.');
  // the cultivation section does not say "no habitat climate"
  await expect(page.locator('.note-slot')).toContainText('Not checked: Occurrence source did not answer. No sheet is derived from an answer that was not given');
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
  await expect(t).toContainText('Climate not checked');
  await expect(t).toContainText('Not a statement that no climate exists');
  // a pending climate is pending, not absent
  await page.goto('/plants/new?species=Welwitschia%20mirabilis&key=5411106');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('Climate pending');
});

test('an unreachable reference is "not reached", never "not in the reference"', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.route('**/api/index', (r) => r.abort());
  await page.route('**/api/dossier/**', (r) => r.abort()); // the plant asks for its own dossier by key first
  await page.goto(`/plants/${acc}`);
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
  await expect(t).toContainText('Reference not reached');
  await expect(t).toContainText('could not be reached from here; nothing is known either way');
  await expect(t).not.toContainText('Not in the reference');
});

test('the species page carries the envelope: median with its span, the cells it rests on, the marker named as a marker', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  // every table cell is "median / p10–p90" where the span differs
  await expect(page.locator('table.wx tbody tr').first().locator('td').nth(1)).toHaveText('22 / 20–24');
  await expect(page.locator('table.wx tbody tr').nth(2).locator('td').nth(1)).toHaveText('4'); // rain: no spread in the fixture, so the median alone
  await page.locator('details.why', { hasText: 'Where these figures come from' }).locator('summary').click(); // the provenance is one tap from the chart
  await expect(page.getByText('Each figure is the median across the 40 grid cells holding the 352 in-range records, with the 10th–90th percentile span')).toBeVisible();
  await expect(page.getByText(/Extremes and elevation were read at the typical cell fixture \(-25\.261, -70\.589\)/)).toBeVisible();
  await expect(page.locator('.mapcap').first()).toContainText('the marker is where the records are densest and decides nothing: the climate was read across every in-range record\'s cell, not at the marker');
  await expect(page.locator('details.why', { hasText: 'How the map marker was placed' })).toBeVisible();
  await expect(page.locator('.factgrid b', { hasText: /^Map marker$/ })).toBeVisible();
  await expect(page.locator('.factgrid')).not.toContainText('Habitat centre');
  // the plant page's season tile is a figure with its months, hemisphere and shift, and a link to the sheet
  await page.getByRole('link', { name: 'Add one to my plants' }).click();
  await page.getByRole('button', { name: /^Add/ }).click();
  const t = page.locator('.card', { hasText: 'Habitat rain season' });
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
  await page.goto('/benches');
  await page.getByRole('button', { name: 'New place' }).click();
  await page.fill('#loc-name', 'Bench A');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const findings: string[] = [];
  for (const r of ['/', '/plants', '/plants/new', '/benches', '/sowings', '/sowings/new', '/labels', '/backup', '/sync', '/frost', '/offline', '/about/how', '/species/copiapoa-cinerea', '/species/refusia-testii', `/plants/${acc}`]) {
    await page.goto(r);
    await expect(page.locator('h1')).toBeVisible();
    if (r === '/benches') await page.getByRole('button', { name: 'New place' }).click();
    if (r === `/plants/${acc}`) { await page.getByRole('button', { name: 'More ▾' }).click(); await page.getByRole('button', { name: 'Measure', exact: true }).click(); await page.getByRole('button', { name: 'Edit' }).click(); await page.getByRole('button', { name: 'Move', exact: true }).click(); }
    if (r === '/sync') await page.getByRole('button', { name: 'I have a key' }).click();
    const s = await a11yScan(page);
    if (s.jumps.length) findings.push(`${r}: heading jumps ${s.jumps.join(' ')}`);
    if (s.h1 !== 1) findings.push(`${r}: ${s.h1} h1`);
    if (s.unlabeled.length) findings.push(`${r}: unlabeled ${s.unlabeled.join(' ')}`);
    if (s.noAlt) findings.push(`${r}: ${s.noAlt} images without alt`);
  }
  expect(findings).toEqual([]);
  // the sowing page's forms, and the bench edit form's µ
  await page.goto('/sowings/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '10'); // a count is never assumed
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/sowings\/S\d{4}-\d{3}$/);
  await page.fill('#g-n', '3'); // nothing is potted from an uncounted pot
  await page.getByRole('button', { name: 'Record count' }).click();
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  expect((await a11yScan(page)).unlabeled).toEqual([]);
  await page.goto('/benches');
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
});

test('long and unicode names: nothing overflows at 360 px, the number chip never wraps, and the search finds a cultivar and a parent', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  const add = async (name: string, field?: string) => {
    await page.goto('/plants/new');
    await page.fill('#species-name', name);
    await page.locator('#species-name').blur();
    if (field) await page.fill('#f-field', field);
    await page.getByRole('button', { name: /^Add/ }).click();
    await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
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
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.setViewportSize({ width: 360, height: 780 });
  // the species image host is unreachable: the hero says so and keeps its height, so the ID card sits below the topbar
  await page.route(/inaturalist|wikimedia/, (r) => r.abort());
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.hero .ph')).toContainText('No photograph yet.');
  const pos = await page.evaluate(() => ({ card: document.querySelector('.idcard')!.getBoundingClientRect().top, bar: document.querySelector('#topbar')!.getBoundingClientRect().bottom }));
  expect(pos.card).toBeGreaterThanOrEqual(pos.bar);
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.hero .ph')).toContainText('The photograph did not load');
  // a log entry: × then Remove?; the plant: Remove then Yes
  await page.goto(`/plants/${acc}`);
  await page.getByRole('button', { name: 'Water', exact: true }).click();
  await page.getByRole('button', { name: 'Record', exact: true }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  await page.locator('.tlrow', { hasText: 'Watered' }).getByRole('button', { name: 'Remove this entry' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toBeVisible();
  await page.locator('.tlrow', { hasText: 'Watered' }).getByRole('button', { name: 'Remove?' }).click();
  await expect(page.locator('.tlrow', { hasText: 'Watered' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await expect(page).toHaveURL(new RegExp(`/plants/${acc}$`));
  await page.getByRole('button', { name: `Yes, remove ${acc}` }).click();
  await expect(page).toHaveURL(/\/plants$/);
});

test('the browser talks to no third-party host while a name is typed, and the error page promises nothing', async ({ page }) => {
  const away: string[] = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== '127.0.0.1:4173') away.push(r.url()); });
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapoa cin');
  await page.waitForTimeout(600);
  await page.locator('#species-name').blur();
  await page.waitForTimeout(600);
  expect(away).toEqual([]);
  await page.goto('/species/nonsensia-fakeii');
  await expect(page.locator('.err')).toContainText('the reference is built from a fixed list of names');
  await expect(page.locator('.err')).not.toContainText('will be prepared');
});

test('offline, a plant page not yet cached still opens from the section shell', async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  const acc = page.url().split('/').pop()!;
  await page.goto('/benches');
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
  await input.fill('Welwit');
  await page.waitForTimeout(400); // the suggestion debounce; a genus fragment resolves to nothing local
  await input.press('Enter');
  await expect(page.locator('.picker .hint')).toContainText(/Pick a name from the list|Did you mean/);
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
  await page.goto('/sowings/new');
  await expect(page.locator('#s-count')).toHaveValue('');
  await page.fill('#species-name', 'Copiapoa cinerea');
  await page.locator('#species-name').blur();
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-count-missing')).toContainText('Say how many seeds went in');
  await expect(page.locator('#s-count')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/sowings\/new$/);
  await page.fill('#s-count', '8');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/sowings\/S\d{4}-001$/);
  await expect(page.getByText('8 seeds on')).toBeVisible();
});

// The service worker fetches /api/forecast itself once it controls the page, and a request made by a worker never
// passes through page.route, so this test runs without one: it is about the pages' wording, not the shell.
test.describe('without the service worker', () => {
test.use({ serviceWorkers: 'block' });
test('a forecast source that does not answer is "not checked" in a plain notice on the bench and on /frost, never a status code', async ({ page }) => {
  await page.route(/\/api\/forecast/, (r) => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'forecast source did not answer' }) }));
  // the site is set once, in Settings; the frost page reads it
  await page.goto('/frost');
  await expect(page.locator('.emptybox')).toContainText('No site set');
  await page.goto('/settings');
  await page.fill('input[placeholder="40.43"]', '40.38');
  await page.fill('input[placeholder="-80.01"]', '-80.05');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page.getByText('Saved on this device.')).toBeVisible();
  await page.goto('/frost');
  await expect(page.getByText('Your site: 40.38, -80.05')).toBeVisible();
  await expect(page.locator('.notice')).toHaveText('Forecast not checked: the forecast source did not answer.');
  await expect(page.locator('.notice')).not.toHaveClass(/err/);
  await expect(page.locator('.bad')).toHaveCount(0);
  // an outdoor place with coordinates watches the forecast on its own page
  await page.goto('/benches');
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
  await expect(page.locator('.notice')).toHaveText('Forecast not checked: the forecast source did not answer.');
  await expect(page.locator('.notice')).not.toHaveClass(/err/);
  await expect(page.getByText(/forecast 50\d/)).toHaveCount(0);
});
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
  await page.getByRole('button', { name: 'Record', exact: true }).click();
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
  await expect(page.locator('a.tile .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await page.fill('.searchbar', 'welwit mirab');
  await expect(page.locator('a.tile')).toHaveCount(1);
  await page.fill('.searchbar', 'namibia');
  await expect(page.locator('a.tile .nm', { hasText: 'Welwitschia' })).toBeVisible();
  await page.goto('/plants/new');
  await page.fill('#species-name', 'Copiapao cin');
  await expect(page.getByRole('option', { name: /Copiapoa cinerea/ })).toBeVisible();
});

test('the species page answers in the first screen and relates the species by genus and by climate', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  const glance = page.locator('.glance');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('6.5');
  await expect(glance.locator('#gen-note')).toContainText('Cold floor 6.5 °C'); // the card and the note agree: one figure, one rule
  await expect(glance.locator('.card', { hasText: 'Rain' })).toContainText('72');
  // related: the nearest habitat climate from the index, with the rule beside it
  await expect(page.locator('#s-related')).toBeVisible();
  await expect(page.locator('.relhead', { hasText: 'Similar habitat climate' })).toContainText('in calendar order');
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
  await page.goto('/species/refusia-testii');
  await expect(page.getByRole('button', { name: 'Share card' })).toHaveCount(0);
  await page.goto('/species/copiapoa-cinerea');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Share card' }).click()]);
  expect(dl.suggestedFilename()).toBe('copiapoa-cinerea-climate.png');
  const path = await dl.path();
  const { statSync } = await import('node:fs');
  expect(statSync(path!).size).toBeGreaterThan(20_000);
  await expect(page.getByRole('status')).toContainText('Saved to your downloads');
});

test('a grower\'s home says what needs them: sowings in the tray and plants without a photograph, each a link', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/');
  const today = page.locator('.today');
  await expect(today.locator('.line', { hasText: 'without a photograph this year' })).toBeVisible();
  await expect(today).toContainText('Frost watch needs a site');
  await today.locator('.line', { hasText: 'without a photograph' }).click();
  await expect(page).toHaveURL(/\/plants\?show=nophoto$/);
  await expect(page.locator('.chipbtn.on')).toContainText('No photo this year');
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
  await page.locator('.glance .unitbtn').click();
  const glance = page.locator('.glance');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('43.7');
  await expect(glance.locator('.card', { hasText: 'Cold floor' })).toContainText('°F');
  await expect(glance.locator('#gen-note')).toContainText('Cold floor 43.7 °F');
  await expect(glance.locator('#gen-note')).not.toContainText('°C');
  await expect(glance.locator('.card', { hasText: 'Rain' })).toContainText('2.8');
  await expect(page.locator('.climo .panel').first()).toHaveText('°F · day and night');
  // the cookie carries it: a fresh load is Fahrenheit from the server, no flash
  const html = await (await page.request.get('/species/copiapoa-cinerea')).text();
  expect(html).toContain('43.7');
  expect(html).not.toMatch(/6\.5<span class="u">°C/);
  await page.goto('/settings');
  await expect(page.getByRole('button', { name: '°F and inches' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '°C and mm' }).click();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.glance .card', { hasText: 'Cold floor' })).toContainText('6.5');
});

test('settings: numbering is previewed and saved as the vault setting; appearance is applied at once', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Prefix/ }).click();
  await page.fill('input[placeholder="your initials or the collection\'s"]', 'jf');
  await expect(page.locator('.accno')).toHaveText('JF-0001');
  await page.getByRole('button', { name: 'Save', exact: true }).nth(1).click();
  await expect(page.getByText(/the next plant is JF-0001/)).toBeVisible();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/JF-0001$/);
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Dark' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  await page.getByRole('button', { name: 'Follow the system' }).click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBeUndefined();
});

test('the species page reads in reference order: summary, the genus, the facts, the figures, then the cards closed to one line each', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  const order = await page.locator('h2.sec').allInnerTexts();
  expect(order.slice(0, 4).map((t) => t.replace(/\s+/g, ' ').toLowerCase())).toEqual(['summary', 'about the genus · copiapoa', 'at a glance', 'cultivation']);
  await expect(page.locator('#s-genus + .sumbody')).toContainText('Copiapoa is a genus of cactus');
  await expect(page.locator('.facts .fact', { hasText: 'Described by' })).toContainText('(Phil.) Britton & Rose');
  await expect(page.locator('.facts .fact', { hasText: 'Wild records' })).toContainText('352 in range');
  // the cards: the first open, the rest closed to their one-line form, opened with a click and no JavaScript needed
  const cards = page.locator('details.acc:not(#gen-note)');
  await expect(cards).toHaveCount(4);
  await expect(cards.nth(0)).toHaveAttribute('open', '');
  await expect(cards.nth(1)).not.toHaveAttribute('open', '');
  await expect(cards.nth(1).locator('summary .one')).toContainText('Habitat rain 72 mm a year');
  await cards.nth(1).locator('> summary').click();
  await expect(cards.nth(1)).toHaveAttribute('open', '');
  // the method sits behind one disclosure per card, closed at rest
  await expect(cards.nth(1).locator('details.why')).not.toHaveAttribute('open', '');
  await cards.nth(1).locator('details.why summary').click();
  await expect(cards.nth(1).locator('.whyline').first()).toBeVisible();
  // a genus Wikipedia refused is "not checked", not silence
  await page.goto('/species/refusia-testii');
  await expect(page.locator('#s-genus + .notice')).toContainText('Not checked');
});

test('a visitor sees all five places from the start, and the menu has them too', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.topseg a')).toHaveText(['Species', 'My plants', 'Benches', 'Sowings', 'Frost']);
  // a click that lands before hydration opens nothing: poll the button's own state rather than the first click
  await expect.poll(async () => { await page.getByRole('button', { name: 'Menu' }).click(); return page.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded'); }).toBe('true');
  await expect(page.locator('#menu').getByRole('link', { name: 'Benches', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  // the species page says what it is, once, under the name
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('.derived')).toContainText('nothing here is written by a person or a model');
  await expect(page.locator('.pill', { hasText: 'open records' })).toHaveCount(0); // the fact strip says it
  await expect(page.locator('.facts')).toContainText('52 open');
  await expect(page.locator('h2.sec', { hasText: 'At a glance' })).toBeVisible();
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page).toHaveURL(/\/plants\/\d{4}-\d{4}$/);
  await page.goto('/plants');
  await expect(page.locator('.topseg a')).toHaveText(['Species', 'My plants', 'Benches', 'Sowings', 'Frost']);
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
  await expect(page.getByRole('button', { name: '°F and inches' })).toHaveAttribute('aria-pressed', 'true');
  await ctx.close();
});

test('the batch page checks what it is told: no count above the seeds sown or below the last count, no loss or potting beyond the pot, no future dates; a wrong entry can be removed', async ({ page }) => {
  await page.goto('/sowings/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '10');
  await page.fill('#s-date', '2099-01-01');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-date-bad')).toContainText('in the future');
  await expect(page).toHaveURL(/\/sowings\/new/);
  await page.fill('#s-date', '2026-09-01');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/sowings\/S2026-\d{3}$/);
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
  let calls = 0;
  await page.route(/\/api\/(index|entries)/, (r) => { calls++; r.abort(); });
  await page.goto('/');
  await expect(page.locator('.tile .im.ph', { hasText: 'reference not reached' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(calls).toBeLessThanOrEqual(2);
  await page.unroute(/\/api\/index/);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.locator('.tile .nm', { hasText: 'Copiapoa cinerea' })).toBeVisible();
  await ctx.close();
});

test('settings previews the next number from the numbers given, and an edited acquisition date follows into the log', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await page.goto('/plants/new?species=Copiapoa%20humilis&key=5384999');
  await page.getByRole('button', { name: /^Add/ }).click();
  await page.goto('/settings');
  await expect(page.locator('.accno')).toHaveText(/-0003$/);
  await page.goto('/plants/2026-0001');
  await page.getByRole('button', { name: 'Edit' }).click();
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
  await expect(page.locator('a.tile').first()).toBeVisible();
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
  await expect(page.locator('.accno').first()).toHaveText('2026-0001');
  await expect(other.locator('.accno').first()).toHaveText('2026-0001'); // both tabs promise the same next number
  await Promise.all([page.getByRole('button', { name: /^Add/ }).click(), other.getByRole('button', { name: /^Add/ }).click()]);
  await expect(page).toHaveURL(/\/plants\/2026-000[12]$/);
  await expect(other).toHaveURL(/\/plants\/2026-000[12]$/);
  expect(page.url()).not.toBe(other.url()); // the vault, not the tab, hands out numbers
  await page.goto('/plants');
  await expect(page.locator('.accrow')).toHaveCount(2); // the other tab's plant is here without a reload of the vault
  await expect(page.locator('.seccount').first()).toContainText('2 numbers given');
  await other.close();
});

test('editing a plant to another species replaces its habitat figures and links its species page only when the reference has one (round seven, 4 and 9)', async ({ page }) => {
  await page.goto('/plants/new?species=Copiapoa%20cinerea&key=5384013');
  await page.getByRole('button', { name: /^Add/ }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('No rainy season');
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#ed-name', 'Welwitschia mirabilis');
  await page.locator('#ed-name').blur();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('h1.sci')).toContainText('Welwitschia mirabilis');
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).not.toContainText('No rainy season to read72 mm'); // the old species' figures are gone, not kept under the new name
  await expect(page.getByRole('link', { name: 'Species page' })).toHaveAttribute('href', '/species/welwitschia-mirabilis');
  // a name the reference does not hold: no link to a 404
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.fill('#ed-name', 'Aloe polyphylla');
  await page.locator('#ed-name').blur();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.card', { hasText: 'Habitat rain season' })).toContainText('No species page');
  await expect(page.getByRole('link', { name: 'Species page' })).toHaveCount(0);
});

test('a germination count that potted plants rest on cannot be removed; bottom heat outside a propagator\'s range is refused (round seven, 5 and 14)', async ({ page }) => {
  await page.goto('/sowings/new?species=Copiapoa%20cinerea&key=5384013');
  await page.fill('#s-count', '20');
  await page.fill('#s-heat', '77');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page.locator('#s-heat-bad')).toContainText('did you mean 77 °F');
  await page.fill('#s-heat', '25');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/sowings\/S\d{4}-\d{3}$/);
  await page.fill('#g-n', '5');
  await page.getByRole('button', { name: 'Record count' }).click();
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.getByText(/Potted up 2:/)).toBeVisible();
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
  await page.goto('/');
  await page.waitForLoadState('networkidle'); // a value typed before hydration is dropped when the bound input hydrates
  await page.fill('.searchbar', '2026-0001');
  await expect(page.locator('.plantsfound .accrow')).toHaveCount(1);
  await page.locator('.searchbar').press('Enter');
  await expect(page).toHaveURL(/\/plants\/2026-0001$/);
  await page.goto('/species/copiapoa-cinerea');
  const glance = page.locator('.card.unitbtn', { hasText: 'Cold floor' });
  await expect(glance).toContainText('6.5');
  await expect(page.locator('.cult', { hasText: /^Warmth and air/ }).first().locator('.body')).toContainText('Cold floor: 6.5 °C');
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

import { test, expect } from '@playwright/test';

test('front page renders server-side with the fixture corpus', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1')).toContainText('Species');
  await expect(page.locator('.tile .nm', { hasText: /Copiapoa|Welwitschia/ }).first()).toBeVisible();
  await expect(page.locator('.grouphead').first()).toBeVisible();
});

test('species page is readable without JavaScript and states its evidence', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.getByText(/rest on all 352 georeferenced records inside the native range/)).toBeVisible();
  await expect(page.getByText(/the map shows only the 52 openly licensed ones/)).toBeVisible();
  await expect(page.getByText(/which alone would put the centre \d+ km away/)).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').textContent();
  expect(JSON.parse(ld!)['@type']).toBe('Taxon');
  await ctx.close();
});

test('a refusal is rendered as "not checked", never as an absence', async ({ page }) => {
  await page.goto('/species/refusia-testii');
  await expect(page.getByText('The occurrence source did not answer')).toBeVisible();
  await expect(page.getByText('not a statement that none exist')).toBeVisible();
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
  await page.getByRole('button', { name: 'New location' }).click();
  await page.fill('#loc-name', 'Laundry room');
  await page.selectOption('#loc-kind', 'room');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.tree .row', { hasText: 'Laundry room' })).toBeVisible();
  // a shelf inside the room
  await page.getByRole('button', { name: 'New location' }).click();
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
  await expect(page.getByText(/seen 0 d ago/)).toBeVisible();
  // the plant's timeline has both entries
  await page.locator('.rows a.row', { hasText: 'Tylecodon' }).first().click();
  await expect(page.locator('.tlrow .t', { hasText: 'Seen at audit' })).toBeVisible();
  await expect(page.getByText('Watered · whole room: Laundry room').or(page.getByText(/whole room: Laundry room/))).toBeVisible();
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
  await expect(page.locator('.vern')).toContainText('ex-habitat seed');
  await expect(page.locator('.fnchip', { hasText: 'MG 123' })).toBeVisible();
  await expect(page.getByText(/raised from/)).toBeVisible();
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
  await page.getByRole('button', { name: 'New location' }).click();
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
  // back on the plant, the comparison now has a verdict
  await page.goto(`/plants/${acc}`);
  await expect(page.locator('.hvh .pill', { hasText: 'too cold' })).toBeVisible();
  // the next add-plant form remembers the last place used
  await page.goto('/plants/new');
  await expect(page.locator('#f-loc option:checked')).toHaveText('East sill');
  // move it from the quickbar: a new place made inline, the move on the timeline, the bench sees it
  await page.goto(`/plants/${acc}`);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await page.getByRole('button', { name: 'New…' }).click();
  await page.fill('#mv-loc-new-name', 'Cold frame');
  await page.selectOption('#mv-loc-new-kind', 'coldframe');
  await page.getByRole('button', { name: 'Add location' }).click();
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
  await page.getByRole('button', { name: 'New location' }).click();
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
  await expect(page.locator('.preview')).toContainText('1 plants · 2 timeline entries · 1 places · 0 sowings · 1 photos');
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
  await expect(page.locator('.card', { hasText: 'Its year' })).toContainText('A hybrid');
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
  await expect(page.locator('.page .label .care', { hasText: 'cool-season grower' })).toHaveCount(1);
  // the page size follows the sheet
  await page.selectOption('#lb-sheet', 'L7160');
  await expect(page.locator('.page').first()).toHaveCSS('width', /793|794/); // 210 mm
  expect(await page.evaluate(() => [...document.querySelectorAll('style')].map((s) => s.textContent).join(''))).toContain('size: 210mm 297mm');
});

test('the species page condenses its cultivation sheet into a note by rule', async ({ page }) => {
  await page.goto('/species/copiapoa-cinerea');
  await expect(page.locator('#gen-note')).toContainText('condensed by rule');
  await expect(page.locator('#gen-note .body')).toContainText('fog desert');
  await expect(page.locator('#gen-note .body')).toContainText('Keep it above 7 °C');
  await expect(page.locator('#gen-note .foot')).toContainText('Its year, Water, Light, Temperature, Feeding, Repotting');
});

test('first run: the front page explains itself once, and stops once there is a plant or it is dismissed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#welcome')).toContainText('New here');
  await page.getByRole('button', { name: 'Not now' }).click();
  await expect(page.locator('#welcome')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.tile').first()).toBeVisible();
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
  await expect(page.locator('.tile').first()).toBeVisible();
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
  await a.getByRole('button', { name: 'New location' }).click();
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
  await B.setOffline(true);
  await b.getByRole('button', { name: 'Water', exact: true }).click();
  await b.fill('#ev-note', 'B, offline, first');
  await b.getByRole('button', { name: 'Record' }).click();
  await expect(b.locator('.tlrow', { hasText: 'B, offline, first' })).toBeVisible();
  await a.goto(`/plants/${acc}`);
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
  await expect(a.locator('.preview')).toContainText('1 plants');
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

test('the about pages are served without JavaScript and say what the app refuses to guess', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto('/about');
  await expect(p).toHaveURL(/\/about\/how$/);
  await expect(p.locator('h2#centre')).toHaveText('The habitat centre');
  await expect(p.locator('article')).toContainText('A refusal is not an absence');
  await p.goto('/about/formats');
  await expect(p.locator('article')).toContainText('cultifolio-vault-v1');
  await expect(p.locator('article')).toContainText('vault/<id>/log/<hlc>.bin');
  await ctx.close();
});

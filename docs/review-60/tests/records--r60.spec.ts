import { test, expect, type Page } from '@playwright/test';

/**
 * records review of round sixty (numbers, links, restore, the sample collection, the label code). Each test opens its own
 * context, so the collection starts empty. Written to live in tests/e2e/.
 *
 * Run against a server already up: PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/records--r60.spec.ts
 *
 * Each test's title says FAILS (reproduces a finding on commit 21257b7) or PASSES (a guard worth adopting).
 */

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** Writes straight into the page's IndexedDB (a copy of smoke.spec.ts's helper), then the next load folds them. */
async function inject(page: Page, rows: Array<[string, string, string, string | number | boolean]>, wall: number, writer = 'abcdefabcdef0000') {
  await page.evaluate(async ({ rows, wall, writer }) => {
    let db: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !db; i++) {
      const d = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (d && d.objectStoreNames.contains('changes') && d.objectStoreNames.contains('meta')) db = d;
      else { d?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!db) throw new Error('the collection\'s stores were never made');
    const tx = db.transaction(['changes', 'meta'], 'readwrite');
    rows.forEach(([kind, id, field, value], i) => tx.objectStore('changes').put({ t: `${wall + i}-0000-${writer}`, kind, id, field, value }));
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    db.close();
  }, { rows, wall, writer });
}
const plant = (id: string, no: string, name: string, more: Record<string, string> = {}): Array<[string, string, string, string]> => [['accession', id, 'acc', no], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing'], ...Object.entries(more).map(([k, v]) => ['accession', id, k, v] as [string, string, string, string])];

test('FAILS (finding 1): an edit form open on one plant follows a link to another plant, and Save writes it there', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // "Leave this page? What you typed here will be lost."
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-two-a', '2026-0042', 'Copiapoa cinerea', { price: '5' }), ...plant('r-two-b', '2026-0042', 'Welwitschia mirabilis', { price: '40' })], Date.now() - 3_600_000);
  await page.goto('/plants/r-two-a'); await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  await page.fill('#ed-price', '7.50');
  await page.locator('#shared-number a').first().click(); // the notice links the other plant (round sixty)
  await expect(page).toHaveURL(/\/plants\/r-two-b$/);
  // "What you typed here will be lost": it should be, and the other plant's page should open without a form
  await expect(page.locator('#ed-form')).toHaveCount(0);
});

test('FAILS (finding 1): a notes draft carried by browser Back replaces the other plant\'s notes', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // "Leave this page? What you typed here will be lost."
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-a', '2026-0042', 'Copiapoa cinerea', { notes: 'A: grafted' }), ...plant('r-b', '2026-0042', 'Welwitschia mirabilis', { notes: 'B: female, from seed' })], Date.now() - 3_600_000);
  await page.goto('/plants/r-a'); await ready(page);
  await page.locator('#shared-number a').first().click(); // to the other plant, in the app
  await expect(page.locator('h1')).toContainText('Welwitschia');
  await page.locator('.cult .foot .linkish', { hasText: 'Edit' }).first().click();
  await page.fill('#acc-notes', 'B: female, from seed; flowered 2026');
  await page.goBack(); // back to plant A
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#acc-notes')).toHaveCount(0); // FAILS: B's draft is open on A, and Save would replace A's notes
});

test('FAILS (finding 1): a place\'s edit form follows the link into a place inside it, and Save renames that one', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/plants'); await ready(page);
  await inject(page, [['location', 'g', 'name', 'Greenhouse'], ['location', 'b1', 'name', 'Bench 1'], ['location', 'b1', 'parentId', 'g']], Date.now() - 3_600_000);
  await page.goto('/places/g'); await ready(page);
  await page.locator('button', { hasText: /^Edit$/ }).first().click();
  await page.fill('#e-name', 'Glasshouse');
  await page.locator('a.azrow.inside', { hasText: 'Bench 1' }).click();
  await expect(page).toHaveURL(/\/places\/b1$/);
  await expect(page.locator('#e-name')).toHaveCount(0); // FAILS: open, reading "Glasshouse"; Save renames Bench 1
});

test('FAILS (finding 2): scanning the label of your own plant that you removed says it is "from someone\'s collection", and offers no way back', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-a', '2026-0001', 'Copiapoa cinerea'), ['accession', 'r-a', '_deleted', true]], Date.now() - 3_600_000);
  await page.goto('/plants/r-a#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await expect(page.locator('main')).toContainText('can be brought back', { timeout: 10000 });
  await expect(page.locator('#foreign-label')).toHaveCount(0);
});

test('FAILS (finding 3): one plant whose printed name has a character outside the BMP at the 60th place stops every QR code on the sheet', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-a', '2026-0001', 'Copiapoa cinerea'), ...plant('r-b', '2026-0002', 'Copiapoa cinerea', { cultivar: 'Snow ' + 'x'.repeat(36) + '🌵 Queen' }), ...plant('r-c', '2026-0003', 'Copiapoa humilis')], Date.now() - 3_600_000);
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('svg[shape-rendering="crispEdges"]')).toHaveCount(3, { timeout: 10000 });
  expect(errors).toEqual([]);
});

test('FAILS (finding 4): while a number is shared, Enter in the front page\'s search opens one of the two plants, not the chooser', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-two-a', '2026-0042', 'Copiapoa cinerea'), ...plant('r-two-b', '2026-0042', 'Copiapoa cinerea', { cultivar: 'B' })], Date.now() - 3_600_000);
  await page.goto('/'); await ready(page);
  const box = page.locator('input[type=search]').first();
  await box.fill('2026-0042'); await page.waitForTimeout(400); await box.press('Enter');
  await expect(page).toHaveURL(/\/plants\/2026-0042$/); // the chooser; FAILS: it opens /plants/r-two-a
});

test('FAILS (finding 4): /propagation/new?parent=<a shared number> picks one parent by load order', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-two-a', '2026-0042', 'Copiapoa cinerea'), ...plant('r-two-b', '2026-0042', 'Copiapoa humilis')], Date.now() - 3_600_000);
  await page.goto('/propagation/new?parent=2026-0042'); await ready(page); await page.waitForTimeout(800);
  const picked = await page.evaluate(() => [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'r-two-a'))?.value ?? '');
  expect(picked).toBe(''); // neither, as /labels?acc= does
});

test('PASSES: Undo of a removal, pressed after opening another plant, brings back the removed one', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-a', '2026-0001', 'Copiapoa cinerea'), ...plant('r-b', '2026-0002', 'Copiapoa humilis')], Date.now() - 3_600_000);
  await page.goto('/plants/2026-0001'); await ready(page);
  await page.getByRole('button', { name: 'Remove this plant' }).click();
  await page.getByRole('button', { name: 'Yes, remove 2026-0001' }).click();
  await expect(page).toHaveURL(/\/plants$/);
  await page.locator('a.accrow', { hasText: '2026-0002' }).click();
  await expect(page).toHaveURL(/2026-0002/);
  await page.locator('.toast .undo').click();
  await expect(page).toHaveURL(/\/plants\/2026-0001$/);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
});

test('FAILS (finding 13): leaving the sample in one tab reloads a second sample tab with "updated in another tab" and seeds the sample again', async ({ page, context }) => {
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('a.accrow')).toHaveCount(12, { timeout: 30000 });
  const [other] = await Promise.all([context.waitForEvent('page'), page.evaluate(() => { window.open('/plants', '_blank'); })]);
  await ready(other);
  await expect(other.locator('.demobar')).toHaveCount(1); // window.open copies sessionStorage: the new tab is in the sample too
  const said: string[] = [];
  const poll = setInterval(() => { other.evaluate(() => document.body.innerText).then((t) => { if (/updated in another tab/.test(t) && !said.length) said.push('updated in another tab'); }, () => {}); }, 100);
  await page.locator('.demobar button').click();
  await expect(page.locator('.demobar')).toHaveCount(0, { timeout: 15000 }); // back to the grower's own (at / or, by the reload race, the page it was on)
  await other.waitForTimeout(4000);
  clearInterval(poll);
  expect(said).toEqual([]);
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));
  expect(dbs).not.toContain('cultifolio-demo');
});

test('FAILS (finding 13): a sample tab closed without "Leave" keeps its database, and the next "Try it" opens that old sample unseeded', async ({ context }) => {
  const a = await context.newPage();
  await a.goto('/plants'); await ready(a);
  await a.click('#try-sample');
  await expect(a.locator('a.accrow')).toHaveCount(12, { timeout: 30000 });
  await expect(a.locator('.demobar')).not.toContainText('Setting it out', { timeout: 30000 });
  await a.locator('a.accrow').first().click(); await ready(a);
  await expect(a.locator('h1.sci')).toBeVisible();
  await a.getByRole('button', { name: 'Remove this plant' }).click();
  await a.getByRole('button', { name: /^Yes, remove/ }).click();
  await expect(a).toHaveURL(/\/plants$/, { timeout: 15000 });
  await a.close();
  const b = await context.newPage();
  await b.goto('/plants'); await ready(b);
  await b.click('#try-sample');
  await expect(b.locator('a.accrow')).toHaveCount(12, { timeout: 30000 }); // FAILS: 11, the old sample
});

test('PASSES: the sample never reaches the grower\'s own collection, and its tab never hears the grower\'s', async ({ context }) => {
  const mine = await context.newPage();
  await mine.goto('/plants'); await ready(mine);
  await inject(mine, plant('r-mine', '2026-0001', 'Copiapoa humilis'), Date.now() - 3_600_000);
  await mine.goto('/plants'); await ready(mine);
  await expect(mine.locator('a.accrow')).toHaveCount(1);
  const sample = await context.newPage();
  await sample.goto('/'); await ready(sample);
  await sample.evaluate(() => sessionStorage.setItem('cultifolio.demo', '1'));
  await sample.goto('/plants'); await ready(sample);
  await expect(sample.locator('a.accrow')).toHaveCount(12, { timeout: 30000 });
  await sample.locator('.wbtn').first().click();
  await expect(sample.locator('.toast')).toContainText('watered');
  await mine.waitForTimeout(1000);
  await expect(mine.locator('a.accrow')).toHaveCount(1);
  const mineChanges = await mine.evaluate(async () => { const db = await new Promise<IDBDatabase>((r) => { const q = indexedDB.open('cultifolio'); q.onsuccess = () => r(q.result); }); const n = await new Promise<number>((r) => { const q = db.transaction('changes').objectStore('changes').count(); q.onsuccess = () => r(q.result); }); db.close(); return n; });
  expect(mineChanges).toBe(3);
});

import { test, expect, type Page } from '@playwright/test';

/**
 * Round sixty-one (agent L): the record pages keyed by their record (decision 2), adopted from the records review's
 * docs/review-60/tests/records--r60.spec.ts (findings 1, 2 and 4's `?parent=`, which failed on the round-sixty base, and
 * its Undo guard), with the round's other record-page items: a stranger's label headed "A plant label" (the grower
 * review's 13), a removed plant's label after another plant took its number, "Select these" on a place page, the sample
 * collection's locked Sync page keeping its h1 (the accessibility review's 10), the held notice off paper, and the parked
 * notice's fields in words. Each test opens its own context, so the collection starts empty.
 *
 * The review's finding 3 (labels), finding 4's front-page Enter and finding 13 (the sample) are other agents' (G, W).
 */

async function ready(p: Page) {
  await p.locator('html[data-ready]').waitFor({ state: 'attached' });
}
/** Writes straight into the page's IndexedDB (a copy of smoke.spec.ts's helper), then the next load folds them. */
async function inject(page: Page, rows: Array<[string, string, string, string | number | boolean]>, wall: number, writer = 'abcdefabcdef0000', parked = false) {
  await page.evaluate(async ({ rows, wall, writer, parked }) => {
    let db: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !db; i++) {
      const d = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (d && d.objectStoreNames.contains('changes') && d.objectStoreNames.contains('meta') && d.objectStoreNames.contains('order')) db = d;
      else { d?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!db) throw new Error('the collection\'s stores were never made');
    const tx = db.transaction(['changes', 'meta', 'order'], 'readwrite');
    const stamps = rows.map((_, i) => `${wall + i}-0000-${writer}`);
    rows.forEach(([kind, id, field, value], i) => tx.objectStore('changes').put({ t: stamps[i], kind, id, field, value }));
    for (const t of stamps) tx.objectStore('order').add({ t }); // their arrival on this device, in the order written, as the vault keeps it
    if (parked) tx.objectStore('meta').put(stamps, 'parked');
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    db.close();
  }, { rows, wall, writer, parked });
}
const plant = (id: string, no: string, name: string, more: Record<string, string> = {}): Array<[string, string, string, string]> => [['accession', id, 'acc', no], ['accession', id, 'taxonName', name], ['accession', id, 'status', 'growing'], ...Object.entries(more).map(([k, v]) => ['accession', id, k, v] as [string, string, string, string])];

test('an edit form open on one plant does not follow the shared-number link to another plant (records review 1; failed on round sixty)', async ({ page }) => {
  page.on('dialog', (d) => d.accept()); // "Leave this page? What you typed here will be lost."
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-two-a', '2026-0042', 'Copiapoa cinerea', { price: '5' }), ...plant('r-two-b', '2026-0042', 'Welwitschia mirabilis', { price: '40' })], Date.now() - 3_600_000);
  await page.goto('/plants/r-two-a'); await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Edit' }).click();
  await page.fill('#ed-price', '7.50');
  await page.locator('#shared-number a').first().click();
  await expect(page).toHaveURL(/\/plants\/r-two-b$/);
  await expect(page.locator('h1')).toContainText('Welwitschia');
  await expect(page.locator('#ed-form')).toHaveCount(0); // nothing carried: the page is made afresh for the other plant
  await expect(page.locator('#ed-price')).toHaveCount(0);
});

test('a notes draft is not carried by browser Back to the other plant (records review 1; failed on round sixty)', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-a', '2026-0042', 'Copiapoa cinerea', { notes: 'A: grafted' }), ...plant('r-b', '2026-0042', 'Welwitschia mirabilis', { notes: 'B: female, from seed' })], Date.now() - 3_600_000);
  await page.goto('/plants/r-a'); await ready(page);
  await page.locator('#shared-number a').first().click();
  await expect(page.locator('h1')).toContainText('Welwitschia');
  await page.locator('.cult .foot .linkish', { hasText: 'Edit' }).first().click();
  await page.fill('#acc-notes', 'B: female, from seed; flowered 2026');
  await page.goBack();
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
  await expect(page.locator('#acc-notes')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('A: grafted');
});

test('a place\'s edit form does not follow the link into a place inside it (records review 1; failed on round sixty)', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/plants'); await ready(page);
  await inject(page, [['location', 'g', 'name', 'Greenhouse'], ['location', 'b1', 'name', 'Bench 1'], ['location', 'b1', 'parentId', 'g']], Date.now() - 3_600_000);
  await page.goto('/places/g'); await ready(page);
  await page.locator('button', { hasText: /^Edit$/ }).first().click();
  await page.fill('#e-name', 'Glasshouse');
  await page.locator('a.azrow.inside', { hasText: 'Bench 1' }).click();
  await expect(page).toHaveURL(/\/places\/b1$/);
  await expect(page.locator('#e-name')).toHaveCount(0);
  await page.goto('/places/g'); await ready(page);
  await expect(page.locator('h1')).toContainText('Greenhouse'); // and nothing was renamed
});

test('your own removed plant\'s label offers Restore, not "someone\'s collection" (records review 2; failed on round sixty)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-a', '2026-0001', 'Copiapoa cinerea'), ['accession', 'r-a', '_deleted', true]], Date.now() - 3_600_000);
  await page.goto('/plants/r-a#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await expect(page.locator('main')).toContainText('can be brought back', { timeout: 10000 });
  await expect(page.locator('#foreign-label')).toHaveCount(0);
  await expect(page.locator('h1')).toHaveText('2026-0001'); // the number, not the internal id
  await page.getByRole('button', { name: 'Restore this plant' }).click();
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea');
});

test('a removed plant whose number another plant has taken is still found by its label, and comes back under the next number', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const t0 = Date.now() - 3_600_000;
  await inject(page, [...plant('r-a', '2026-0001', 'Copiapoa cinerea'), ['accession', 'r-a', '_deleted', true]], t0);
  await inject(page, plant('r-b', '2026-0001', 'Lithops lesliei'), t0 + 60_000, 'fedcbafedcba0000'); // reached this device after the removal
  await page.goto('/plants/r-a#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await expect(page.locator('#removed-plant')).toContainText('Copiapoa cinerea was removed');
  await page.getByRole('button', { name: 'Restore this plant' }).click();
  await expect(page.locator('.toast')).toContainText('2026-0001 is another plant\'s now');
  await page.goto('/plants/2026-0001'); await ready(page);
  await expect(page.locator('h1')).toContainText('Lithops lesliei');
});

test('a stranger\'s label is headed "A plant label", not the id its code carries (grower review 13)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await page.goto('/plants/rmuvujahh009149b1dd500cl0g5#s=copiapoa-cinerea&n=Copiapoa%20cinerea'); await ready(page);
  await expect(page.locator('h1')).toHaveText('A plant label');
  await expect(page.locator('#foreign-label')).toContainText("This label is from someone's collection");
  await expect(page.locator('main')).not.toContainText('rmuvujahh009149b1dd500cl0g5');
  await expect(page.locator('main')).not.toContainText('No plant with this number');
  await expect(page).toHaveTitle(/^A plant label/);
});

test('/propagation/new?parent=<a shared number> picks neither plant; by id, it picks that one (records review 4; failed on round sixty)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [...plant('r-two-a', '2026-0042', 'Copiapoa cinerea'), ...plant('r-two-b', '2026-0042', 'Copiapoa humilis')], Date.now() - 3_600_000);
  await page.goto('/propagation/new?parent=2026-0042'); await ready(page);
  await expect(page.locator('#s-parent')).toBeVisible();
  await expect(page.locator('#s-parent option')).toHaveCount(3); // "Not one of my plants" and the two under the number
  expect(await page.locator('#s-parent').inputValue()).not.toMatch(/^r-two/);
  await page.goto('/propagation/new?parent=r-two-b'); await ready(page);
  await expect.poll(() => page.locator('#s-parent').inputValue()).toBe('r-two-b');
});

test('Undo of a removal, pressed after opening another plant, brings back the removed one (records review guard)', async ({ page }) => {
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

test('a place page offers "Select these": My plants filtered to the place, in select mode (decision 12)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [['location', 'g', 'name', 'Greenhouse'], ...plant('r-a', '2026-0001', 'Copiapoa cinerea', { locationId: 'g' })], Date.now() - 3_600_000);
  await page.goto('/places/g'); await ready(page);
  await expect(page.locator('#select-these')).toHaveAttribute('href', '/plants?place=g&select=1');
});

test('the sample collection\'s Sync page keeps its h1 and draws no sync controls (accessibility review 10; decision 10)', async ({ page }) => {
  await page.goto('/'); await ready(page);
  await page.evaluate(() => sessionStorage.setItem('cultifolio.demo', '1'));
  await page.goto('/sync'); await ready(page);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('h1')).toHaveText('Sync');
  await expect(page.locator('#sync-start')).toHaveCount(0);
  await expect(page.locator('#sync-have-key')).toHaveCount(0);
});

test('the held notice is not printed (decision 4)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('r-a', '2026-0001', 'Copiapoa cinerea'), Date.now() - 3_600_000);
  await inject(page, [['accession', 'r-a', 'notes', 'from a clock an hour fast']], Date.now() + 3_600_000, 'fedcbafedcba0000');
  await page.goto('/plants'); await ready(page);
  await expect(page.locator('#held-notice')).toBeVisible();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#held-notice')).toBeHidden();
});

test('a parked notes edit is listed by its fields in words: "notes", not "notes, notesBase" (grower review 9)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, plant('r-a', '2026-0001', 'Copiapoa cinerea'), Date.now() - 3_600_000);
  await inject(page, [['accession', 'r-a', 'notes', 'from 2031'], ['accession', 'r-a', 'notesBase', 'x']], Date.now() + 5 * 365 * 86_400_000, 'fedcbafedcba0000', true);
  await page.goto('/plants/r-a'); await ready(page);
  const notice = page.locator('.notice.parked');
  await expect(notice).toContainText(': notes)');
  await expect(notice).not.toContainText('notesBase');
});

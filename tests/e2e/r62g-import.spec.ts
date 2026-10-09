/**
 * Round sixty-two, agent G: the import, rule 4's font request and the sample's Leave, in the browser
 * (docs/REVIEW-TRIAGE-61.md, decisions 1, 4 and 9). Adopts the records review's import spec
 * (docs/review-61/tests/records--r61-import.spec.ts) as tests 1 to 3, and the grower review's test 2.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject as sharedInject } from './helpers/inject';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test.use({ locale: 'en-GB' });
test.describe.configure({ timeout: 240_000 });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
/** Changes written straight into the vault, as an older collection or another device left them: the shared seed helper (round sixty-two; the harness's one write contract). */
const inject = (page: Page, rows: Array<[string, string, string, string]>, wall: number) => sharedInject(page, rows, wall);
/** Every plant in the vault, field by field. */
async function filed(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; id: string; field: string; value: unknown }>>((res) => { const q = db.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    const by: Record<string, Record<string, unknown>> = {};
    for (const c of all) if (c.kind === 'accession') (by[c.id] ??= { id: c.id })[c.field] = c.value;
    return Object.values(by);
  });
}
async function sheet(page: Page, text: string) {
  await page.goto('/plants/import'); await ready(page);
  await page.locator('#imp-mode-csv').click();
  await page.locator('#imp-csv-paste-box summary').click();
  await page.fill('#imp-csv-text', text);
  await page.locator('#imp-csv-read').click();
}

test('r62g 1: "Use it" keeps what the sheet said beyond the species, and is named for its suggestion and line (the records review, 2; A37)', async ({ page }) => {
  await sheet(page, 'number,species\n2024-0001,Copiapoa cf. cinera\n2024-0002,Copiapoa cinera subsp. haseltoniana (white spines)\n');
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await expect(page.locator('.rvrow[data-line="2"]')).toContainText('filed as written, with no reference key');
  await page.getByRole('button', { name: 'Use Copiapoa cinerea on line 2' }).click();
  await page.getByRole('button', { name: 'Use Copiapoa cinerea on line 3' }).click();
  await expect(page.locator('.rvrow[data-line="2"] input.nm')).toHaveValue('Copiapoa cf. cinerea');
  await expect(page.locator('.rvrow[data-line="3"] input.nm')).toHaveValue('Copiapoa cinerea subsp. haseltoniana (white spines)');
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const got = await filed(page);
  const one = got.find((a) => a.acc === '2024-0001')!, two = got.find((a) => a.acc === '2024-0002')!;
  expect(one).toMatchObject({ taxonName: 'Copiapoa cf. cinerea', nameAsReceived: 'Copiapoa cf. cinera' });
  expect(one.taxonKey ?? null).toBeNull();
  expect(two).toMatchObject({ taxonName: 'Copiapoa cinerea subsp. haseltoniana', nameAsReceived: 'Copiapoa cinera subsp. haseltoniana (white spines)' });
});

test('r62g 2: a choice changed after "Check names" reads the sheet again at once, says so, and is what is added (the records review, 6; the grower review, 5; A19)', async ({ page }) => {
  await sheet(page, 'species,acquired,locality\nCopiapoa cinerea,09/03/2024,Taltal\n');
  await page.locator('input[name=imp-date-order][value=dmy]').check();
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await expect(page.locator('.rvrow[data-line="2"]')).toContainText('2024-03-09');
  await page.locator('input[name=imp-date-order][value=mdy]').check();
  await expect(page.locator('#imp-reread')).toHaveText('Your choice changed, so the sheet was read again: the review below follows it.');
  await expect(page.locator('.rvrow[data-line="2"]')).toContainText('2024-09-03');
  await page.locator('#imp-extra').uncheck();
  await expect(page.locator('.rvrow[data-line="2"]')).not.toContainText('Taltal');
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const a = (await filed(page))[0];
  expect(a.acquired).toBe('2024-09-03'); // base: 2024-03-09, the choice made before the review
  expect(String(a.notes ?? '')).not.toContain('Taltal');
});

test('r62g 3: a sheet of 2,003 lines whose first 2,000 look already here offers the last three (the records review, 5)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const rows: Array<[string, string, string, string]> = [];
  for (let i = 1; i <= 2000; i++) { const id = `r-${i}`; rows.push(['accession', id, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', 'Copiapoa cinerea'], ['accession', id, 'status', 'growing']); }
  await inject(page, rows, Date.now() - 3_600_000);
  const lines = ['number,species'];
  for (let i = 1; i <= 2003; i++) lines.push(`2026-${String(i).padStart(4, '0')},Copiapoa cinerea`);
  const dir = mkdtempSync(join(tmpdir(), 'r62g-imp-'));
  const f = join(dir, 'big.csv');
  writeFileSync(f, lines.join('\n'));
  await page.goto('/plants/import'); await ready(page);
  await page.locator('#imp-mode-csv').click();
  await page.locator('#imp-file').setInputFiles(f);
  rmSync(dir, { recursive: true, force: true });
  await page.locator('#imp-check').click({ timeout: 120_000 }); // the page folds 2,000 plants first: slow on a shared machine
  await page.locator('#imp-review-h').waitFor({ timeout: 120_000 });
  await expect(page.locator('#imp-add')).toContainText('Add 3 plants'); // base: "Add 0 plants", and the rest never reached
});

test('r62g 4: with only the lines that need me shown, "Use it" moves focus to the next line, never the page (A37)', async ({ page }) => {
  await sheet(page, 'species\nCopiapoa cinera\nCopiapoa humilis\nCopiapoa cinera\n');
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await page.locator('#imp-only-needs').check();
  await page.getByRole('button', { name: 'Use Copiapoa cinerea on line 2' }).click();
  await expect(page.getByRole('button', { name: 'Use Copiapoa cinerea on line 4' })).toBeFocused();
});

test('r62g 5: a second run of the same sheet adds nothing again, numbered or not (the records review, 1; the grower review, 3; A18)', async ({ page }) => {
  const text = 'species,acquired,qty\nCopiapoa cinerea,2019,2\nLithops lesliei,,1\n';
  await sheet(page, text);
  await page.locator('#imp-check').click();
  await page.locator('#imp-add').click();
  await expect(page.locator('#imp-done')).toContainText('3 plants added');
  await sheet(page, text);
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await expect(page.locator('#imp-done-lines')).toContainText('2 lines were imported before');
  await expect(page.locator('#imp-add')).toContainText('Add 0 plants');
});

test('r62g 6: no request a plant page makes carries a Referer (A1, rule 4)', async ({ page }) => {
  await sheet(page, 'species\nCopiapoa cinerea\n');
  await page.locator('#imp-check').click();
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const id = String((await filed(page))[0].id);
  const leaks: string[] = [];
  const fonts: string[] = [];
  page.on('requestfinished', async (r) => {
    const h = await r.allHeaders().catch(() => r.headers());
    if (h.referer) leaks.push(`${r.url()} <- ${h.referer}`);
    if (/\.woff2/.test(r.url())) fonts.push(r.url());
  });
  await page.goto(`/plants/${id}`);
  await ready(page);
  await expect(page.locator('h1')).toContainText('Copiapoa cinerea'); // italic: the italic face is asked for
  await page.waitForLoadState('networkidle');
  expect(fonts.some((u) => /italic/.test(u))).toBe(true);
  expect(leaks).toEqual([]); // base: the italic font's request carried /plants/<id>
});

test('r62g 7: Leave on a page with an unsaved edit, answered Cancel, leaves a working sample tab (A9)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 20_000 });
  await page.locator('.rows a').first().click();
  await ready(page);
  await page.getByRole('button', { name: /More for this plant/ }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.fill('#ed-price', '12');
  let asked = '';
  page.once('dialog', (d) => { asked = d.type(); void d.dismiss(); });
  await page.getByRole('button', { name: 'Leave the sample' }).click();
  await expect.poll(() => asked).toBe('beforeunload');
  await expect(page.locator('.demobar')).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('cultifolio.demo'))).toBe('1'); // base: gone, with the database closed
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.notice.err')).toHaveCount(0);
  await expect(page.locator('main')).toContainText('12');
  await expect(page.getByRole('button', { name: 'Leave the sample' })).toBeEnabled({ timeout: 10_000 });
});

test('r62g 8: Leave says how many records the visitor added or changed, and asks; the sample is deleted on the next page (A9)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants'); await ready(page);
  await page.click('#try-sample');
  await expect(page.locator('.rows > *')).toHaveCount(12, { timeout: 20_000 });
  await page.goto('/plants/new'); await ready(page);
  await page.fill('#species-name', 'Aloe vera');
  await page.locator('#species-name').blur();
  page.on('dialog', (d) => void d.accept());
  await page.locator('button.add').click();
  await page.locator('button.add').click().catch(() => {}); // "Add as typed", when the name service is not reached
  await expect(page).toHaveURL(/\/plants\//, { timeout: 15_000 });
  let said = '';
  page.removeAllListeners('dialog');
  page.once('dialog', (d) => { said = d.message(); void d.dismiss(); });
  await page.getByRole('button', { name: 'Leave the sample' }).click();
  await expect.poll(() => said).toMatch(/^Leave the sample collection\? The \d+ records you added or changed here are deleted with it\.$/);
  await expect(page.locator('.demobar')).toBeVisible(); // Cancel: still the sample
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Leave the sample' }).click();
  await expect(page).toHaveURL(/^http:\/\/[^/]+\/$/);
  await expect.poll(() => page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name))), { timeout: 10_000 }).not.toContain('cultifolio-demo');
});

test('r62g 9: the labels page remembers the plants picked across a reload (the grower review, 11)', async ({ page }) => {
  const names = Array.from({ length: 26 }, (_, i) => (i < 3 ? `Copiapoa cinerea; Clone ${i}` : `Aloe vera; Clone ${i}`)).join('\n');
  await page.goto('/plants/import'); await ready(page);
  await page.fill('#imp-text', names);
  await page.click('#imp-check');
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('26 plants added');
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('#lb-print')).toHaveText('Print 0 labels'); // more than a sheet or two: none picked by default
  await page.fill('#lb-q', 'cinerea');
  await page.click('#lb-pick-plants');
  await expect(page.locator('#lb-print')).toHaveText('Print 3 labels');
  await page.reload(); await ready(page);
  await expect(page.locator('#lb-print')).toHaveText('Print 3 labels'); // base: "Print 0 labels"
  // A reload only: coming to the page again afresh starts from its default (round sixty-two, at the merge).
  await page.goto('/plants'); await ready(page);
  await page.goto('/labels'); await ready(page);
  await expect(page.locator('#lb-print')).toHaveText('Print 0 labels');
});

/**
 * Round sixty-two, second pass, agent G: in the browser. A Leave answered Cancel is no Leave (triage-outside 1, the
 * verification grower review, 4; adopts /tmp/r62rev/out/tests/triage-outside--a9-cancelled-leave.spec.ts); two tabs
 * importing one sheet (the verification data review, 4); the import's words and names (the verification grower
 * review); a cf. plant's label care line (A21) and the add form's "already used by" (A35), which had no test.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject } from './helpers/inject';

test.use({ locale: 'en-GB' });
test.describe.configure({ timeout: 180_000 });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
async function sheet(page: Page, text: string) {
  await page.goto('/plants/import'); await ready(page);
  await page.locator('#imp-mode-csv').click();
  await page.locator('#imp-csv-paste-box summary').click();
  await page.fill('#imp-csv-text', text);
  await page.locator('#imp-csv-read').click();
}
async function accessions(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; id: string; field: string; value: unknown }>>((res) => { const q = db.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    const by: Record<string, Record<string, unknown>> = {};
    for (const c of all) if (c.kind === 'accession') (by[c.id] ??= { id: c.id })[c.field] = c.value;
    return Object.values(by);
  });
}

test('r62bg 1: a Leave answered Cancel is called off: the button comes back at once, and a reload stays in the sample (triage-outside 1; A9)', async ({ page, browserName }) => {
  test.setTimeout(120_000);
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
  await page.getByRole('button', { name: 'Leave the example' }).click();
  await expect.poll(() => asked).toBe('beforeunload');
  // At once, not after 4 s under "Leaving…" (base: disabled and "Leaving…" for 4 s), where the browser says the Cancel
  // (Chromium's `navigateerror`); Safari's engine did not, and another engine is given the page's 3 s for a "Leave site?" that
  // is still showing (`leaveDemo`; round sixty-four, the all-engines run).
  await expect(page.getByRole('button', { name: 'Leave the example' })).toBeEnabled({ timeout: browserName === 'chromium' ? 1500 : 4500 });
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('main')).toContainText('12');
  expect(await page.evaluate(() => sessionStorage.getItem('cultifolio.demo'))).toBe('1');
  await page.reload(); await ready(page);
  expect(await page.evaluate(() => sessionStorage.getItem('cultifolio.demo'))).toBe('1'); // base: null, the tab left the sample
  expect(await page.evaluate(() => sessionStorage.getItem('cultifolio.sampleLeft'))).toBeNull();
  await expect(page.locator('.demobar')).toBeVisible();
  await expect(page.locator('main')).toContainText('12'); // the visitor's edit, still there
  expect(await page.evaluate(() => indexedDB.databases().then((d) => d.map((x) => x.name)))).toContain('cultifolio-demo');
});

test('r62bg 2: two tabs importing one sheet add each plant once; the second says the lines were imported elsewhere (the verification data review, 4)', async ({ page, context }) => {
  const text = 'species,qty\nCopiapoa cinerea,1\nLithops lesliei,2\n';
  const other = await context.newPage();
  await sheet(page, text);
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await sheet(other, text);
  await other.locator('#imp-check').click();
  await other.locator('#imp-review-h').waitFor();
  await expect(other.locator('#imp-add')).toHaveText('Add 3 plants');
  await page.locator('#imp-add').click();
  await expect(page.locator('#imp-done')).toContainText('3 plants added');
  await other.locator('#imp-add').click();
  await other.locator('#imp-done-h').waitFor();
  await expect(other.locator('#imp-done')).toContainText('0 plants added'); // base: 3 more, "renumbered"
  await expect(other.locator('#imp-already-here')).toHaveText('Meanwhile 2 lines were imported elsewhere (in another tab, or by sync), so their plants were left out, never added twice: line 2, line 3.');
  const got = await accessions(page);
  expect(got).toHaveLength(3);
  expect(new Set(got.map((a) => a.importKey)).size).toBe(3);
  await other.close();
});

test('r62bg 3: the import\'s words agree with what it files (the verification grower review; triage-self N10)', async ({ page }) => {
  await sheet(page, [
    'species,acquired,location',
    'Copiapoa sp.,09/03/2024,Cold frame (N/S)',
    'Copiapoa cf. cinerea,17/11/2007,S/W window',
    'Copiapoa cinerea var. albispina,Aug-17,',
    'Copia­poa cinerea,45123,'
  ].join('\n') + '\n');
  // The date question shows what the sheet's other dates say of its order.
  await expect(page.locator('#imp-dates-hint')).toHaveText('This sheet also has 17/11/2007, which can only be day first, so its dates seem to be written day first.');
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await expect(page.locator('#imp-summary')).not.toContainText('still checking', { timeout: 20_000 });
  // One verdict for the rows and the summary: three keyless, one matched (the soft hyphen taken out).
  await expect(page.locator('#imp-summary')).toContainText('Matched in the reference: 1 · filed as written, with no reference key (cf., aff., sp., or a rank below the species): 3.');
  await expect(page.locator('.rvrow[data-line="4"]')).toContainText('filed as written, with no reference key; the reference has Copiapoa cinerea'); // base: "matched as Copiapoa cinerea"
  await expect(page.locator('.rvrow[data-line="5"] input.nm')).toHaveValue('Copiapoa cinerea');
  await expect(page.locator('.rvrow[data-line="5"]')).toContainText('matched');
  // Why a date was not read.
  await expect(page.locator('.rvrow[data-line="4"]')).toContainText('"Aug-17" looks like a spreadsheet\'s month and two-digit year (August 2017)');
  await expect(page.locator('.rvrow[data-line="5"]')).toContainText('in the usual count it would be 16 July 2023');
  // A slash inside a place's own name is not a path: no path question, and the places are made whole.
  await expect(page.locator('#imp-paths')).toHaveCount(0);
  await expect(page.locator('#imp-make-places')).toBeVisible();
  await expect(page.locator('label.makeplaces').last()).toContainText('Cold frame (N/S), S/W window');
  await page.locator('#imp-add').click();
  await expect(page.locator('#imp-done')).toContainText('4 plants added, numbered 2024-0001, 2007-0001 and 2026-0001 to 2026-0002.');
  const got = await accessions(page);
  expect(got.find((a) => a.taxonName === 'Copiapoa cinerea')).toMatchObject({ nameAsReceived: 'Copia­poa cinerea' });
});

test('r62bg 4: a cf. plant\'s label says whose care it borrows (A21, which had no test)', async ({ page }) => {
  await page.goto('/plants/import'); await ready(page);
  await page.fill('#imp-text', 'Copiapoa cf. cinerea\nCopiapoa cinerea');
  await page.click('#imp-check');
  await page.click('#imp-add');
  await expect(page.locator('#imp-done')).toContainText('2 plants added');
  await page.getByRole('link', { name: 'Labels for these' }).click();
  await ready(page);
  const cares = page.locator('.sheets .label .care');
  await expect(cares).toHaveCount(2, { timeout: 20_000 });
  const lines = await cares.allTextContents();
  const cf = lines.filter((l) => l.startsWith('care as for C. cinerea: '));
  expect(cf).toHaveLength(1); // reverted: no "care as for", the cf. plant's label read as the species' own
  expect(cf[0].slice('care as for C. cinerea: '.length)).toBe(lines.find((l) => !l.startsWith('care as for'))); // the compared species' line, borrowed whole
});

test('r62bg 5: "already used by" names every plant with the number, and a removed one by its own page, never /plants/undefined (A35, which had no test)', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  await inject(page, [
    ['accession', 'r-a', 'acc', '0013'], ['accession', 'r-a', 'taxonName', 'Haworthia retusa'], ['accession', 'r-a', 'cultivar', 'King'], ['accession', 'r-a', 'status', 'growing'],
    ['accession', 'r-b', 'acc', '0013'], ['accession', 'r-b', 'taxonName', 'Aloe vera'], ['accession', 'r-b', 'status', 'growing'],
    ['accession', 'r-c', 'acc', '0099'], ['accession', 'r-c', 'taxonName', 'Lithops lesliei'], ['accession', 'r-c', 'cultivar', 'Albinica'], ['accession', 'r-c', 'status', 'growing'], ['accession', 'r-c', '_deleted', true]
  ], Date.now() - 3_600_000);
  await page.goto('/plants/new'); await ready(page);
  await page.locator('details.own summary').click();
  await page.check('#f-own');
  await page.fill('#f-own-no', '0013');
  const said = page.locator('#f-own-taken');
  await expect(said).toHaveText('0013 is already used by Haworthia retusa ‘King’ and Aloe vera. A number is never reused; pick another.'); // reverted: the first only, with no cultivar
  expect(await said.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['/plants/r-a', '/plants/r-b']);
  await page.fill('#f-own-no', '0099');
  await expect(said).toHaveText('0099 is already used by Lithops lesliei ‘Albinica’, a plant you removed. A number is never reused; pick another.');
  expect(await said.locator('a').getAttribute('href')).toBe('/plants/r-c'); // reverted: /plants/undefined
});

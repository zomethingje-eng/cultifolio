import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Self-review of round sixty-one, records area: the import page. All three FAIL on f4ab4f8 (reproductions).
 *  1. "Use it" on a qualified or infraspecific name replaces the whole name with the suggestion: "cf.", "subsp. …" and a
 *     bracketed note are lost, and the plant is filed at species rank with the reference's key.
 *  2. The date choice and the notes box can be changed after "Check names"; the review and the commit keep the old
 *     choice while the page shows the new one.
 *  3. A sheet of more than 2,000 lines can never be finished: its first 2,000 are read again on every run, skipped as
 *     already imported, and the rest are never reached ("import the rest after").
 * Run against the shared server: PW_REUSE=1 PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/e2e/records--r61-import.spec.ts --retries=0
 */

test.describe.configure({ timeout: 240_000 }); // the 2,000-plant test, and a loaded machine

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }
async function inject(page: Page, rows: Array<[string, string, string, string]>, wall: number) {
  await page.evaluate(async ({ rows, wall }) => {
    let db: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !db; i++) {
      const d = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open('cultifolio'); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (d && d.objectStoreNames.contains('changes') && d.objectStoreNames.contains('order')) db = d; else { d?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!db) throw new Error('no stores');
    const tx = db.transaction(['changes', 'meta', 'order'], 'readwrite');
    rows.forEach(([kind, id, field, value], i) => { const t = `${wall + i}-0000-abcdefabcdef0000`; tx.objectStore('changes').put({ t, kind, id, field, value }); tx.objectStore('order').add({ t }); });
    tx.objectStore('meta').delete('fold');
    await new Promise<void>((res) => { tx.oncomplete = () => res(); });
    db.close();
  }, { rows, wall });
}
async function filed(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res) => { const r = indexedDB.open('cultifolio'); r.onsuccess = () => res(r.result); });
    const all = await new Promise<Array<{ kind: string; id: string; field: string; value: unknown }>>((res) => { const q = db.transaction('changes').objectStore('changes').getAll(); q.onsuccess = () => res(q.result); });
    db.close();
    const by: Record<string, Record<string, unknown>> = {};
    for (const c of all) if (c.kind === 'accession') (by[c.id] ??= {})[c.field] = c.value;
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

test('1. "Use it" keeps what the sheet said beyond the species: cf., the subspecies and the bracketed note', async ({ page }) => {
  await sheet(page, 'number,species\n2024-0001,Copiapoa cf. cinera\n2024-0002,Copiapoa cinera subsp. haseltoniana (white spines)\n');
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await expect(page.getByRole('button', { name: /^Use it/ })).toHaveCount(2);
  while (await page.getByRole('button', { name: /^Use it/ }).count()) { await page.getByRole('button', { name: /^Use it/ }).first().click(); await page.waitForTimeout(300); }
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const got = await filed(page);
  const one = got.find((a) => a.acc === '2024-0001')!, two = got.find((a) => a.acc === '2024-0002')!;
  // On f4ab4f8 both are "Copiapoa cinerea" with key 5384013 and no name as received: the sheet's doubt, its subspecies and its note are gone.
  expect(String(one.taxonName)).toContain('cf.');
  expect(`${two.taxonName} ${two.nameAsReceived ?? ''}`).toContain('haseltoniana');
  expect(`${two.taxonName} ${two.nameAsReceived ?? ''} ${two.notes ?? ''}`).toContain('white spines');
});

test('2. a choice changed after "Check names" is not silently ignored: the review is redone or the choice is locked', async ({ page }) => {
  await sheet(page, 'species,acquired,locality\nCopiapoa cinerea,09/03/2024,Taltal\n');
  await page.locator('input[name=imp-date-order][value=dmy]').check();
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor();
  await page.locator('input[name=imp-date-order][value=mdy]').check({ force: true }).catch(() => {});
  await page.locator('#imp-extra').uncheck({ force: true }).catch(() => {});
  const mdy = await page.locator('input[name=imp-date-order][value=mdy]').isChecked();
  const extra = await page.locator('#imp-extra').isChecked();
  await page.locator('#imp-add').click();
  await page.locator('#imp-done-h').waitFor();
  const a = (await filed(page))[0];
  // On f4ab4f8: the page shows "Month first" and the box unticked, and the plant is filed 2024-03-09 with "Locality: Taltal".
  if (mdy) expect(a.acquired).toBe('2024-09-03'); else expect(a.acquired).toBe('2024-03-09');
  if (!extra) expect(String(a.notes ?? '')).not.toContain('Taltal');
});

test('3. a sheet of 2,003 lines whose first 2,000 are already here offers the last three', async ({ page }) => {
  await page.goto('/plants'); await ready(page);
  const rows: Array<[string, string, string, string]> = [];
  for (let i = 1; i <= 2000; i++) { const id = `r-${i}`; rows.push(['accession', id, 'acc', `2026-${String(i).padStart(4, '0')}`], ['accession', id, 'taxonName', 'Copiapoa cinerea'], ['accession', id, 'status', 'growing']); }
  await inject(page, rows, Date.now() - 3_600_000);
  const lines = ['number,species'];
  for (let i = 1; i <= 2003; i++) lines.push(`2026-${String(i).padStart(4, '0')},Copiapoa cinerea`);
  const f = join(mkdtempSync(join(tmpdir(), 'imp-')), 'big.csv');
  writeFileSync(f, lines.join('\n'));
  await page.goto('/plants/import'); await ready(page);
  await page.locator('#imp-mode-csv').click();
  await page.locator('#imp-file').setInputFiles(f);
  await page.locator('#imp-check').click();
  await page.locator('#imp-review-h').waitFor({ timeout: 120_000 });
  // On f4ab4f8: "0 lines (2000 dropped), 0 plants … Only the first 2000 lines are read at once; import the rest after." and "Add 0 plants".
  await expect(page.locator('#imp-add')).toContainText('Add 3 plants');
});

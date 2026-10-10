/**
 * Round sixty-seven, agent R: the place pickers and the plant page's guards (triage-66 R7, R11, R12). Adopted from the
 * self-review's probe /tmp/rev66/E/tests/e2e/zz-e-places.spec.ts (E places 1 to 4), inverted to assert the fix, with
 * IND-5's two forms, the import's picker at "Check names", the batch page's Save, and the death Undo as one commit.
 * Every read-write transaction's completion is held as a slow engine's is, so a second press lands while the first writes.
 * On the round-sixty-six base: E places 1, 2 and 4 wrote two moves; IND-5 made the Edit form's place; E places 3 left
 * an unhandled AbortError; the import's rows got no place; the death Undo was two commits.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ownPages } from './helpers/r63v-own';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => { await context.addInitScript(ownPages); });
async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** From the next load, every read-write transaction's completion is told `ms` late (a slow engine's commit). */
async function slowIdb(page: Page, ms: number) {
  await page.addInitScript((delay: number) => {
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, s: string | string[], mode?: IDBTransactionMode, o?: IDBTransactionOptions) {
      const tx = real.call(this, s, mode, o);
      if (mode === 'readwrite') {
        const add = tx.addEventListener.bind(tx);
        tx.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'complete' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn.call(tx, ev) : fn.handleEvent(ev)), delay) : fn, ...(rest as []))) as typeof tx.addEventListener;
      }
      return tx;
    } as typeof real;
  }, ms);
}
/** Counts the read-write transactions over the change log from now on, in `window.__rw`. */
async function countWrites(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __rw: number };
    w.__rw = 0;
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, s: string | string[], mode?: IDBTransactionMode, o?: IDBTransactionOptions) {
      if (mode === 'readwrite' && (Array.isArray(s) ? s.includes('changes') : s === 'changes')) w.__rw++;
      return real.call(this, s, mode, o);
    } as typeof real;
  });
}

async function onePlant(page: Page) {
  await page.goto('/plants'); await ready(page);
  const rows: Row[] = [['accession', 'rP1', 'acc', '2026-0001'], ['accession', 'rP1', 'taxonName', 'Copiapoa cinerea'], ['accession', 'rP1', 'status', 'growing'], ['accession', 'rP1', 'nameKind', 'species']];
  await inject(page, rows, Date.now() - 86_400_000);
}
const inVault = (p: Page, name = 'Shelf X') => p.evaluate((name) => new Promise<{ places: string[]; moveEvents: number; locWrites: number; named: number }>((res) => {
  const r = indexedDB.open('cultifolio');
  r.onsuccess = () => {
    const g = r.result.transaction('changes').objectStore('changes').getAll();
    g.onsuccess = () => {
      const ch = g.result as Array<{ kind: string; id: string; field: string; value: unknown }>;
      res({
        places: ch.filter((c) => c.kind === 'location' && c.field === 'name').map((c) => String(c.value)).sort(),
        named: ch.filter((c) => c.kind === 'location' && c.field === 'name' && c.value === name).length,
        moveEvents: ch.filter((c) => c.kind === 'event' && c.field === 't' && c.value === 'move').length,
        locWrites: ch.filter((c) => c.kind === 'accession' && c.field === 'locationId').length
      });
    };
  };
}), name);

test('R11: Move pressed twice while the new place is written moves once (E places 1)', async ({ page }) => {
  test.setTimeout(90_000);
  await onePlant(page);
  await slowIdb(page, 600);
  await page.goto('/plants/rP1'); await ready(page);
  await page.getByRole('button', { name: 'Move', exact: true }).first().click();
  await page.locator('.picker button:has-text("New…")').first().click();
  await page.fill('#mv-loc-new-name', 'Shelf X');
  const move = page.locator('.actions button.pri:has-text("Move")');
  await move.click();
  await move.click({ timeout: 2000 }).catch(() => {});
  await expect.poll(async () => (await inVault(page)).moveEvents, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(2500); // a second move would land within two slow commits
  const v = await inVault(page);
  expect([v.named, v.moveEvents, v.locWrites]).toEqual([1, 1, 1]);
});

test('R11: the Edit form\'s Save pressed twice while its new place is written saves once (E places 2)', async ({ page }) => {
  test.setTimeout(90_000);
  await onePlant(page);
  await slowIdb(page, 600);
  await page.goto('/plants/rP1'); await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page.locator('#ed-loc').waitFor();
  await page.locator('.editform .picker button:has-text("New…")').click();
  await page.fill('#ed-loc-new-name', 'Shelf X');
  const save = page.locator('.editform button[type=submit]').first();
  await save.click();
  await save.click({ timeout: 2000 }).catch(() => {});
  await expect.poll(async () => (await inVault(page)).moveEvents, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(2500);
  const v = await inVault(page);
  expect([v.named, v.moveEvents, v.locWrites]).toEqual([1, 1, 1]);
});

test('R11: Move pressed twice to a place that is here writes one move (E places 4)', async ({ page }) => {
  test.setTimeout(90_000);
  await onePlant(page);
  await inject(page, [['location', 'lZ', 'name', 'Shelf X'], ['location', 'lZ', 'type', 'shelf']], Date.now() - 80_000_000, 'abcdefabcdef0001');
  await slowIdb(page, 600);
  await page.goto('/plants/rP1'); await ready(page);
  await page.getByRole('button', { name: 'Move', exact: true }).first().click();
  await page.selectOption('#mv-loc', { label: 'Shelf X' });
  const move = page.locator('.actions button.pri:has-text("Move")');
  await move.click();
  await move.click({ timeout: 2000 }).catch(() => {});
  await expect.poll(async () => (await inVault(page)).moveEvents, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(2500);
  expect((await inVault(page)).moveEvents).toBe(1);
});

test('R12: Move settles only its own picker: the Edit form\'s unsaved new place is not made (IND-5)', async ({ page }) => {
  test.setTimeout(90_000);
  await onePlant(page);
  await page.goto('/plants/rP1'); await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await page.locator('.editform .picker button:has-text("New…")').click();
  await page.fill('#ed-loc-new-name', 'Unsaved edit shelf');
  await page.getByRole('button', { name: 'Move', exact: true }).first().click();
  await page.locator('#mv-loc').locator('xpath=..').locator('button:has-text("New…")').click();
  await page.fill('#mv-loc-new-name', 'Move destination');
  await page.locator('.actions button.pri:has-text("Move")').click();
  await expect.poll(async () => (await inVault(page)).moveEvents, { timeout: 15_000 }).toBe(1);
  await page.locator('.editform button:has-text("Cancel")').first().click();
  expect((await inVault(page)).places).toEqual(['Move destination']);
});

test('R12: a place that cannot be made says why in the picker, with no unhandled rejection, and a second press works (E places 3)', async ({ page }) => {
  test.setTimeout(90_000);
  await onePlant(page);
  await page.goto('/plants/rP1'); await ready(page);
  await page.getByRole('button', { name: 'Move', exact: true }).first().click();
  await page.locator('.picker button:has-text("New…")').first().click();
  await page.fill('#mv-loc-new-name', 'Shelf X');
  await page.evaluate(() => {
    const real = IDBDatabase.prototype.transaction;
    let once = true;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, s: string | string[], mode?: IDBTransactionMode, o?: IDBTransactionOptions) {
      const tx = real.call(this, s, mode, o);
      if (once && mode === 'readwrite') { once = false; setTimeout(() => { try { tx.abort(); } catch { /* done */ } }, 0); }
      return tx;
    } as typeof real;
  });
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.locator('.actions button.pri:has-text("Move")').click();
  await expect(page.locator('#mv-loc-err')).toContainText('The place was not made.');
  await expect(page.locator('#mv-loc-new-name')).toBeVisible();
  await page.waitForTimeout(500);
  expect(errs).toEqual([]);
  await page.locator('.actions button.pri:has-text("Move")').click();
  await expect.poll(async () => (await inVault(page)).moveEvents, { timeout: 15_000 }).toBe(1);
  expect((await inVault(page)).named).toBe(1);
});

test('R11: the batch page\'s Save pressed twice saves once', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/plants'); await ready(page);
  await inject(page, [['sowing', 'sB1', 'no', 'S2026-001'], ['sowing', 'sB1', 'taxonName', 'Copiapoa cinerea'], ['sowing', 'sB1', 'method', 'seed'], ['sowing', 'sB1', 'sown', '2026-09-01'], ['sowing', 'sB1', 'count', 20], ['sowing', 'sB1', 'status', 'active']], Date.now() - 86_400_000);
  await slowIdb(page, 600);
  await page.goto('/propagation/sB1'); await ready(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.locator('#se-loc').waitFor();
  await page.locator('.editform .picker button:has-text("New…")').click();
  await page.fill('#se-loc-new-name', 'Shelf X');
  const save = page.locator('.editform button[type=submit]').first();
  await save.click();
  await save.click({ timeout: 2000 }).catch(() => {});
  await expect.poll(async () => (await inVault(page)).named, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(2500);
  const n = await page.evaluate(() => new Promise<number>((res) => {
    const r = indexedDB.open('cultifolio');
    r.onsuccess = () => { const g = r.result.transaction('changes').objectStore('changes').getAll(); g.onsuccess = () => res((g.result as Array<{ kind: string; field: string }>).filter((c) => c.kind === 'sowing' && c.field === 'locationId').length); };
  }));
  expect(n).toBe(1);
});

test('R12: the import\'s place picker is settled at "Check names": the rows get the new place', async ({ page }) => {
  test.setTimeout(90_000);
  await onePlant(page);
  await page.goto('/plants/import'); await ready(page);
  await page.fill('#imp-text', 'Lithops lesliei');
  await page.locator('#imp-loc').locator('xpath=..').locator('button:has-text("New…")').click();
  await page.fill('#imp-loc-new-name', 'Import shelf');
  await page.locator('#imp-check').click();
  await expect(page.locator('.rvrow').first()).toContainText('Import shelf');
  expect((await inVault(page, 'Import shelf')).named).toBe(1);
});

test('R7: the death Undo is one commit, and only while the plant is still dead', async ({ page }) => {
  test.setTimeout(90_000);
  await onePlant(page);
  await page.goto('/plants/rP1'); await ready(page);
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: 'Died…' }).click();
  await page.fill('#ev-cause', 'rot');
  await page.locator('.evform button[type=submit]').click();
  await expect(page.locator('.toast')).toContainText('Death recorded');
  await countWrites(page);
  await page.locator('.toast .undo').click();
  await expect(page.locator('.toast')).toContainText('growing again');
  await expect(page.locator('.tlrow', { hasText: 'rot' })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __rw: number }).__rw)).toBe(1); // base: 2
});

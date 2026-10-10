/**
 * Round sixty-seven, the harness (triage-66 H4, R45-26): the place pickers' reverts that stayed green.
 *
 * - One write per new place (LocationPicker's `making`): "Add place" pressed twice while the place is still being written
 *   makes one place. No test pressed it twice in flight.
 * - `settlePlaces` before each form reads its picker: on Start batch, Pot up, the batch's Save and the plant's Save, a new
 *   place named in "New…" and not added is made, and the record goes there. No spec used "New…" in those pickers; only
 *   the add form (r66y 7) and Move (r66y 6) had a test.
 * - The race round sixty-six fixed: Move pressed while "Add place" is still writing moves the plant to the new place,
 *   once. It had no deterministic test: here every read-write transaction's completion is told late, so the press always
 *   lands while the place is being written.
 * - Each form settles its own picker alone (IND-5, R's change this round): with the plant's Edit form open and a new
 *   place typed in it, Move makes Move's place and moves the plant, and the Edit form's place is not made. Red on the
 *   base, where Move made both; it passes once R's per-form `settlePlaces` is merged.
 *
 * Each is checked in the vault itself (the places by name, and the record's latest place), so the test says what was
 * stored, not what a page happens to draw. Nothing here is Chromium's alone.
 */
import { test, expect, type Page } from '@playwright/test';
import { inject, type Row } from './helpers/inject';
import { ownPages } from './helpers/r63v-own';

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ context }) => { await context.addInitScript(ownPages); });

async function ready(p: Page) { await p.locator('html[data-ready]').waitFor({ state: 'attached' }); }

/** From the next load, every read-write transaction's completion is told `ms` late: a write takes as long as on a slow phone. */
async function slowWrites(page: Page, ms: number) {
  await page.addInitScript((delay: number) => {
    const real = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (this: IDBDatabase, s: string | string[], mode?: IDBTransactionMode, o?: IDBTransactionOptions) {
      const tx = real.call(this, s, mode, o);
      if (mode === 'readwrite') {
        const add = tx.addEventListener.bind(tx);
        tx.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, ...rest: unknown[]) => add(type, type === 'complete' ? (ev: Event) => setTimeout(() => (typeof fn === 'function' ? fn.call(tx, ev) : fn.handleEvent(ev)), delay) : fn, ...(rest as []))) as typeof tx.addEventListener;
        const on = Object.getOwnPropertyDescriptor(IDBTransaction.prototype, 'oncomplete')!;
        Object.defineProperty(tx, 'oncomplete', { configurable: true, get: () => on.get!.call(tx), set: (fn: ((ev: Event) => void) | null) => on.set!.call(tx, fn ? (ev: Event) => setTimeout(() => fn.call(tx, ev), delay) : null) });
      }
      return tx;
    } as typeof real;
  }, ms);
}

/** A plant and a batch of the grower's own, written as another device's sync would leave them. */
async function plantAndBatch(page: Page) {
  await page.goto('/plants'); await ready(page);
  const rows: Row[] = [
    ['accession', 'rPl', 'acc', '2026-0001'], ['accession', 'rPl', 'taxonName', 'Copiapoa cinerea'], ['accession', 'rPl', 'status', 'growing'], ['accession', 'rPl', 'nameKind', 'species'],
    ['sowing', 'sBa', 'no', 'S2026-001'], ['sowing', 'sBa', 'taxonName', 'Ariocarpus fissuratus'], ['sowing', 'sBa', 'method', 'seed'], ['sowing', 'sBa', 'sown', '2026-03-01'], ['sowing', 'sBa', 'count', 12], ['sowing', 'sBa', 'status', 'active']
  ];
  await inject(page, rows, Date.now() - 86_400_000);
}

/** What the vault holds: the ids of the places of each name, and each record's latest value of a field. */
async function vault(page: Page) {
  return page.evaluate(() => new Promise<{ places: Record<string, string[]>; latest: Record<string, unknown> }>((res, rej) => {
    const r = indexedDB.open('cultifolio');
    r.onerror = () => rej(r.error);
    r.onsuccess = () => {
      const g = r.result.transaction('changes').objectStore('changes').getAll();
      g.onsuccess = () => {
        const ch = (g.result as Array<{ t: string; kind: string; id: string; field: string; value: unknown }>).sort((a, b) => (a.t < b.t ? -1 : 1));
        const places: Record<string, string[]> = {};
        const latest: Record<string, unknown> = {};
        for (const c of ch) {
          if (c.kind === 'location' && c.field === 'name') (places[String(c.value)] ??= []).push(c.id);
          latest[`${c.kind}:${c.id}:${c.field}`] = c.value;
        }
        r.result.close();
        res({ places, latest });
      };
    };
  }));
}

/** Open "New…" in the picker `id` and name a place, without pressing "Add place". */
async function nameNew(page: Page, id: string, name: string) {
  await page.locator(`.picker:has(#${id}) button:has-text("New…")`).click();
  await page.fill(`#${id}-new-name`, name);
}

/** The plant's card menu item. */
async function cardMenu(page: Page, name: string) {
  await page.locator('.idcard .cardmenu > button').click();
  await page.locator('#card-menu [role=menuitem]', { hasText: name }).click();
}

test('r67h places 1: "Add place" pressed twice while the place is being written makes one place (LocationPicker\'s one write)', async ({ page }) => {
  await plantAndBatch(page);
  await slowWrites(page, 800);
  await page.goto('/plants/2026-0001'); await ready(page);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await nameNew(page, 'mv-loc', 'Shelf twice');
  const add = page.getByRole('button', { name: 'Add place' });
  await add.click();
  await add.click({ timeout: 2_000 }); // still on screen: the first is being written
  await expect.poll(async () => (await vault(page)).places['Shelf twice']?.length ?? 0, { timeout: 15_000 }).toBe(1);
  await page.waitForTimeout(2_000); // a second write would land within this
  expect((await vault(page)).places['Shelf twice']).toHaveLength(1); // reverted: 2
});

test('r67h places 2: Move pressed while "Add place" is still writing moves the plant to the new place, once (round sixty-six\'s race)', async ({ page }) => {
  await plantAndBatch(page);
  await slowWrites(page, 800);
  await page.goto('/plants/2026-0001'); await ready(page);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await nameNew(page, 'mv-loc', 'Shelf race');
  await page.getByRole('button', { name: 'Add place' }).click();
  await page.locator('.actions button.pri', { hasText: 'Move' }).click(); // the place's write has not completed
  await expect(page.locator('.idcard .place', { hasText: 'Shelf race' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(2_000);
  const v = await vault(page);
  expect(v.places['Shelf race']).toHaveLength(1);
  expect(v.latest['accession:rPl:locationId']).toBe(v.places['Shelf race'][0]);
});

test('r67h places 3: Start batch with a new place named and not added starts the batch there', async ({ page }) => {
  await plantAndBatch(page);
  await page.goto('/propagation/new?species=Copiapoa%20cinerea&key=5384013'); await ready(page);
  await page.fill('#s-count', '6');
  await nameNew(page, 's-loc', 'Seed tray shelf');
  await page.getByRole('button', { name: 'Start batch' }).click();
  await expect(page).toHaveURL(/\/propagation\/S\d{4}-\d{3}$/);
  await page.waitForTimeout(500);
  const v = await vault(page);
  expect(v.places['Seed tray shelf']).toHaveLength(1);
  const id = v.places['Seed tray shelf'][0];
  const batch = Object.entries(v.latest).find(([k, val]) => /^sowing:.*:locationId$/.test(k) && val === id);
  expect(batch, 'a batch at the new place').toBeTruthy(); // reverted: no place made, the batch at none
});

test('r67h places 4: Pot up with a new place named and not added pots the plants up there', async ({ page }) => {
  await plantAndBatch(page);
  await page.goto('/propagation/S2026-001'); await ready(page);
  await page.fill('#g-n', '5');
  await page.getByRole('button', { name: 'Record count' }).click();
  await page.getByRole('button', { name: 'Pot up…' }).click();
  await page.fill('#p-n', '2');
  await nameNew(page, 'p-loc', 'Potting bench');
  await page.getByRole('button', { name: 'Pot up 2' }).click();
  await expect(page.locator('.notice', { hasText: /Potted up 2:/ })).toBeVisible();
  const v = await vault(page);
  expect(v.places['Potting bench']).toHaveLength(1);
  const id = v.places['Potting bench'][0];
  const potted = Object.entries(v.latest).filter(([k, val]) => /^accession:.*:locationId$/.test(k) && val === id);
  expect(potted).toHaveLength(2); // reverted: no place made, the two plants at the batch's place
});

test("r67h places 5: the batch's Save with a new place named and not added moves the batch there", async ({ page }) => {
  await plantAndBatch(page);
  await page.goto('/propagation/S2026-001'); await ready(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await nameNew(page, 'se-loc', 'Heat mat');
  await page.locator('.editform button[type=submit]', { hasText: 'Save' }).click();
  await expect(page.locator('.editform')).toHaveCount(0);
  await page.waitForTimeout(500);
  const v = await vault(page);
  expect(v.places['Heat mat']).toHaveLength(1);
  expect(v.latest['sowing:sBa:locationId']).toBe(v.places['Heat mat'][0]); // reverted: no place made, the batch at none
});

test("r67h places 6: the plant's Save with a new place named and not added moves the plant there", async ({ page }) => {
  await plantAndBatch(page);
  await page.goto('/plants/2026-0001'); await ready(page);
  await cardMenu(page, 'Edit');
  await nameNew(page, 'ed-loc', 'Top shelf');
  await page.locator('.editform button[type=submit]').first().click();
  await expect(page.locator('.editform')).toHaveCount(0);
  await expect(page.locator('.idcard .place', { hasText: 'Top shelf' })).toBeVisible();
  const v = await vault(page);
  expect(v.places['Top shelf']).toHaveLength(1);
  expect(v.latest['accession:rPl:locationId']).toBe(v.places['Top shelf'][0]); // reverted: no place made
});

test("r67h places 7: Move settles Move's picker alone, not the open Edit form's (IND-5; passes with R's per-form settlePlaces)", async ({ page }) => {
  await plantAndBatch(page);
  await page.goto('/plants/2026-0001'); await ready(page);
  await cardMenu(page, 'Edit');
  await nameNew(page, 'ed-loc', 'Unsaved edit shelf');
  await page.getByRole('button', { name: 'Move', exact: true }).first().click();
  await nameNew(page, 'mv-loc', 'Move destination');
  await page.locator('.actions button.pri', { hasText: 'Move' }).click();
  await expect(page.locator('.idcard .place', { hasText: 'Move destination' })).toBeVisible();
  await page.waitForTimeout(1_000);
  const v = await vault(page);
  expect(v.places['Move destination']).toHaveLength(1);
  expect(v.latest['accession:rPl:locationId']).toBe(v.places['Move destination'][0]);
  expect(v.places['Unsaved edit shelf'] ?? []).toEqual([]); // base: made too, by Move's settlePlaces
});

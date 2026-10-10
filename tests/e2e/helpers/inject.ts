import type { Page } from '@playwright/test';

/** One change to write: kind, record id, field, value. */
export type Row = [string, string, string, unknown];

/**
 * Writes changes straight into the page's IndexedDB, as another device's sync would leave them, under the vault's own
 * write contract (src/lib/db/vault.ts `storeIn` and `dropFoldIn`), all in ONE transaction:
 * - each change goes into `changes`, and gets its row in `order` (its arrival on this device, in the order written);
 * - the numbers they carry go on the ledger of issued numbers, as a stored change's do;
 * - the fold snapshot is dropped and the fold counter (`foldGen`) moves.
 *
 * Why all three (round sixty-two; the harness review's 2, outside review A44 and B13): the four copies of this helper
 * wrote `changes` and deleted the snapshot, and only one wrote the arrival rows. A snapshot's tail is read from the
 * arrival order, so rows without one are invisible to every load that starts from a snapshot; and the page's own first
 * load saves its snapshot without being awaited, so one saved after the delete hid the rows. With the arrival rows a
 * snapshot saved before this write has a lower number, and its tail includes them; with the counter moved, a snapshot
 * being written of the log as it was before is refused, whenever it lands. No pause is needed, and none is made.
 *
 * Nothing goes in the outbox: these are another device's changes, already on the server. `parked` parks the stamps
 * written (a union with what is parked, as `parkStamps` does). The stamps are `wall + i`, counter 0, by `writer` (16
 * characters, as a device's tag is), and are returned in order.
 *
 * The database is the grower's own (`cultifolio`) unless `db` names another (the sample's is `cultifolio-demo`). The
 * page may not have made its stores yet (a first visit): the helper waits for them rather than making them itself, so
 * the page makes them at its own version.
 */
export async function inject(page: Page, rows: Row[], wall: number, writer = 'abcdefabcdef0000', parked = false, db = 'cultifolio'): Promise<string[]> {
  const changes = rows.map(([kind, id, field, value], i) => ({ t: `${String(wall + i).padStart(13, '0')}-0000-${writer}`, kind, id, field, value }));
  await injectChanges(page, changes, parked ? changes.map((c) => c.t) : [], db);
  return changes.map((c) => c.t);
}

/** One change with its own stamp, for a test that needs given stamps (a marked one, a far one, a peer's). */
export type Stamped = { t: string; kind: string; id: string; field: string; value: unknown };

/**
 * The same write contract as `inject`, for changes whose stamps the test gives; `parked` names stamps to park (a union
 * with what is parked). `inject` is this with stamps made from a wall and a writer (round sixty-two, at the merge: agent
 * L's plant spec needed given stamps, and kept its own copy of the write).
 */
export async function injectChanges(page: Page, changes: Stamped[], parked: string[] = [], db = 'cultifolio', keepFold = false): Promise<void> {
  await page.evaluate(async ({ changes, parked, name, keepFold }) => {
    let d: IDBDatabase | null = null;
    for (let i = 0; i < 100 && !d; i++) {
      const o = await new Promise<IDBDatabase | null>((res) => { const r = indexedDB.open(name); r.onupgradeneeded = () => r.transaction!.abort(); r.onsuccess = () => res(r.result); r.onerror = () => res(null); });
      if (o && ['changes', 'meta', 'order'].every((s) => o.objectStoreNames.contains(s))) d = o;
      else { o?.close(); await new Promise((r) => setTimeout(r, 100)); }
    }
    if (!d) throw new Error("the collection's stores were never made");
    const tx = d.transaction(['changes', 'meta', 'order'], 'readwrite');
    const done = new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('the write was aborted')); });
    const get = <T>(store: IDBObjectStore, key: string) => new Promise<T | undefined>((res) => { const r = store.get(key); r.onsuccess = () => res(r.result as T | undefined); });
    const ch = tx.objectStore('changes'), order = tx.objectStore('order'), meta = tx.objectStore('meta');
    for (const c of changes) ch.put(c);
    for (const c of changes) order.add({ t: c.t });
    // The ledger, as storeIn keeps it: a plant's `acc` and a batch's `no` are numbers given out.
    for (const [kind, field, key] of [['accession', 'acc', 'issued:accession'], ['sowing', 'no', 'issued:sowing']] as const) {
      const nos = changes.filter((c) => c.kind === kind && c.field === field && typeof c.value === 'string').map((c) => c.value as string);
      if (!nos.length) continue;
      const had = await get<string[]>(meta, key);
      meta.put([...new Set([...(Array.isArray(had) ? had : []), ...nos])], key);
    }
    if (parked.length) {
      const had = await get<string[]>(meta, 'parked');
      meta.put([...new Set([...(Array.isArray(had) ? had : []), ...parked])], 'parked');
    }
    if (!keepFold) {
      const gen = Number((await get<number>(meta, 'foldGen')) ?? 0) + 1;
      meta.delete('fold');
      meta.put(gen, 'foldGen');
    }
    await done;
    d.close();
  }, { changes, parked, name: db, keepFold });
}

/**
 * Changes written as a sync pull stores another device's batch (`storeIn`): into `changes`, each with its arrival row, the
 * numbers on the ledger, and the fold snapshot KEPT, so the next load reads the snapshot and then these as its tail, in
 * arrival order. For a test of what a load costs with a tail since its snapshot (round sixty-seven; triage-66 H1). The
 * page must have saved its snapshot first (`snapshotSaved`); with no page open on the collection, nothing has folded
 * the log since, so the snapshot and its tail are the whole log.
 */
export async function injectTail(page: Page, rows: Row[], wall: number, writer = 'abcdefabcdef0000', db = 'cultifolio'): Promise<string[]> {
  const changes = rows.map(([kind, id, field, value], i) => ({ t: `${String(wall + i).padStart(13, '0')}-0000-${writer}`, kind, id, field, value }));
  await injectChanges(page, changes, [], db, true);
  return changes.map((c) => c.t);
}

/** Wait until the collection `db` holds a fold snapshot (a load saves one when there is none). */
export async function snapshotSaved(page: Page, db = 'cultifolio', timeout = 30_000): Promise<void> {
  await page.waitForFunction(async (name) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    try {
      if (!d.objectStoreNames.contains('meta')) return false;
      return await new Promise<boolean>((res) => { const r = d.transaction('meta').objectStore('meta').get('fold'); r.onsuccess = () => res(r.result != null); r.onerror = () => res(false); });
    } finally { d.close(); }
  }, db, { timeout, polling: 250 });
}

/**
 * Wipe the log as `replaceFromStaging`'s wipe does (src/lib/db/vault.ts), in ONE transaction: the changes, the photographs,
 * the outbox and the arrival order cleared, the fold snapshot dropped and the fold counter moved. The ledger of issued
 * numbers and the rest of `meta` are kept, as that wipe keeps them.
 *
 * Why (round sixty-seven; triage-66 H7, R45-29): two smoke tests cleared `changes` and `photos` by hand and left the
 * snapshot and the arrival rows, so a load could fold the snapshot of the log that was gone, and a snapshot being written
 * of it was not refused: the race class this helper's `inject` closed in round sixty-two (A44).
 */
export async function wipe(page: Page, db = 'cultifolio'): Promise<void> {
  await page.evaluate(async (name) => {
    const d = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const stores = ['changes', 'photos', 'outbox', 'order', 'meta'].filter((s) => d.objectStoreNames.contains(s));
    const tx = d.transaction(stores, 'readwrite');
    const done = new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error ?? new Error('the wipe was aborted')); });
    for (const s of stores) if (s !== 'meta') tx.objectStore(s).clear();
    if (stores.includes('meta')) {
      const meta = tx.objectStore('meta');
      const gen = await new Promise<number>((res) => { const r = meta.get('foldGen'); r.onsuccess = () => res(Number(r.result ?? 0)); });
      meta.delete('fold');
      meta.put(gen + 1, 'foldGen');
    }
    await done;
    d.close();
  }, db);
}

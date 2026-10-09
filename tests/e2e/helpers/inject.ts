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
export async function injectChanges(page: Page, changes: Stamped[], parked: string[] = [], db = 'cultifolio'): Promise<void> {
  await page.evaluate(async ({ changes, parked, name }) => {
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
    const gen = Number((await get<number>(meta, 'foldGen')) ?? 0) + 1;
    meta.delete('fold');
    meta.put(gen, 'foldGen');
    await done;
    d.close();
  }, { changes, parked, name: db });
}

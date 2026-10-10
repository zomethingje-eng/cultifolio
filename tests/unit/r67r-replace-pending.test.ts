/**
 * Round sixty-seven, triage-66 R1 (the self-review's C1): "Replace this device with the file" cut off during the switch
 * (the live vault already wiped, the copy from staging stopped by a full device). Adopted from the self-review's probe
 * (/tmp/rev66/C/tests/unit/rev66c-promote-failure.test.ts), whose three cases failed on the round-sixty-six base:
 *  - a plant added in that tab after the failure was lost at the next open: it is now refused, with the reason, and the
 *    next open finishes the replacement;
 *  - a second Replace deleted the staging copy, the only one, and the collection opened empty: openStaging now refuses
 *    while a switch needs it;
 *  - with the device still full, every load rejected and the collection never opened: it now opens, with the reason said.
 * A full device is stood in by refusing the live `photos` put.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const plant = (id: string, no: string, base: number, device = 'bbbbbbbbbbbb'): Change[] => [
  { t: stamp(base, 0, device), kind: 'accession', id, field: 'taxonName', value: 'Lithops ' + id },
  { t: stamp(base, 1, device), kind: 'accession', id, field: 'status', value: 'growing' },
  { t: stamp(base, 2, device), kind: 'accession', id, field: 'acc', value: no }
];
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { vault, collection: store.collection };
}
const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n, 0xff, 0xd9])], { type: 'image/jpeg' });
const realPut = IDBObjectStore.prototype.put;
const fullLivePhotos = () =>
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, v: unknown, k?: IDBValidKey) {
    if (this.name === 'photos' && this.transaction.db.name === 'cultifolio') throw new DOMException('', 'QuotaExceededError');
    return realPut.call(this, v, k);
  });
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});

/** The grower's plant, a file with one plant and one photograph staged, and the switch stopped by a full device. */
async function cutOff() {
  const base = Date.now() - 86_400_000;
  const a = await boot();
  await a.vault.appendChanges(plant('mine', '2026-0001', base, DEV), true);
  await a.collection.load();
  const st = await a.vault.openStaging();
  await st.putPhoto({ id: 'pfile', blob: jpeg(1), thumb: jpeg(2) });
  await st.appendChanges(plant('file', '2025-0001', base - 1000));
  fullLivePhotos();
  await expect(st.promote()).rejects.toThrow();
  return a;
}

describe('a replace cut off during the switch (R1)', () => {
  it('base: a write in that tab is refused with the reason, not stored and lost; the next open finishes the replacement', async () => {
    let a = await cutOff();
    vi.restoreAllMocks();
    await expect(a.collection.addAccession({ taxonName: 'Copiapoa cinerea' })).rejects.toThrow(/replacement from a backup has begun/);
    expect(a.collection.lastWriteError).toMatch(/finishes when there is room/);
    await expect(a.collection.put('accession', 'mine', { notes: 'lost?' })).rejects.toThrow(a.vault.ReplacePendingError);
    a = await boot();
    await a.collection.load();
    expect(a.collection.accessions.map((x) => x.id)).toEqual(['file']);
    // Finished: writes go in again.
    const added = await a.collection.addAccession({ taxonName: 'Copiapoa cinerea' });
    expect(a.collection.accession(added.id)).toBeDefined();
  });

  it('base: a second Replace is refused while the switch needs the staging copy, and the next open is the file', async () => {
    let a = await cutOff();
    vi.restoreAllMocks();
    await expect(a.vault.openStaging()).rejects.toThrow(a.vault.ReplacePendingError);
    a = await boot();
    await a.collection.load();
    expect(a.collection.accessions.map((x) => x.id)).toEqual(['file']);
  });

  it('base: on a device that stays full, the collection still opens, the reason is said, and writes are refused', async () => {
    let a = await cutOff();
    a = await boot();
    let err: unknown = null;
    await a.collection.load().catch((e) => { err = e; });
    expect(err).toBeNull();
    let said: string | null = null;
    a.vault.onVaultNotice((t) => (said = t));
    expect(said).toMatch(/could not finish: this device is out of space\. It finishes when there is room/);
    await expect(a.collection.addAccession({ taxonName: 'Copiapoa cinerea' })).rejects.toThrow(a.vault.ReplacePendingError);
    // Room again: the next open finishes it.
    vi.restoreAllMocks();
    a = await boot();
    await a.collection.load();
    expect(a.collection.accessions.map((x) => x.id)).toEqual(['file']);
    expect(await a.vault.photoBlobIds()).toEqual(['pfile']);
  });
});

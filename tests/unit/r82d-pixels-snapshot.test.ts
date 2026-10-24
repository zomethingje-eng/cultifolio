/**
 * Round eighty-two, the independent review's 38, on the real vault over an in-memory IndexedDB:
 *  - pixels nothing names were taken off the device only by sync's run, so without sync they stayed for good: a removal
 *    cut off between its record and its pixels, a photograph a Merge's file had removed, an add cut off between its pixels
 *    and its record. `collection.sweepPixels()` (run after each load, and after a Merge) takes them, and nothing else;
 *  - a Merge that parks the file's changes before taking them in moved the fold counter, and the snapshot written after it
 *    was refused: the next load folded the whole log again. The fold that already reads them as parked takes the counter.
 * On r82base `sweepPixels` did not exist, and the snapshot after the park was refused (false).
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { vault, collection: store.collection };
}
const jpeg = (n: number) => new Blob([new Uint8Array([0xff, 0xd8, 0xff, n, 0xff, 0xd9])], { type: 'image/jpeg' });
/** A photograph id as the app makes one: the time it was made, then sixteen characters. */
const idAt = (ms: number, tail: string) => 'p' + ms.toString(36) + tail.padEnd(16, '0').slice(0, 16);

beforeEach(async () => {
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});

describe('pixels nothing names, without sync (the independent review\'s 38)', () => {
  it('a removed photograph\'s pixels and pixels with no change in the log, made two days ago or more, go; nothing else does', async () => {
    const a = await boot();
    await a.collection.load();
    const plant = await a.collection.addAccession({ taxonName: 'Lithops lesliei' });
    const keep = await a.collection.addPhoto({ acc: plant.id, d: '2026-10-01', w: 4, h: 3, bytes: 6, blob: jpeg(1), thumb: jpeg(2) });
    const gone = await a.collection.addPhoto({ acc: plant.id, d: '2026-10-02', w: 4, h: 3, bytes: 6, blob: jpeg(3), thumb: jpeg(4) });
    await a.collection.removePhoto(gone.id);
    // The removal's pixels left behind (the tab closed between the record and the delete), as the vault would hold them.
    await a.vault.putPhotoBlobs({ id: gone.id, blob: jpeg(3), thumb: jpeg(4) });
    const old = idAt(Date.now() - 3 * 86_400_000, 'oldorphan');
    const fresh = idAt(Date.now() - 60_000, 'freshorphan');
    const held = idAt(Date.now() - 3 * 86_400_000, 'heldrecord');
    for (const id of [old, fresh, held]) await a.vault.putPhotoBlobs({ id, blob: jpeg(9), thumb: jpeg(9) });
    // A record the fold holds back (stamped far ahead by another device): in the log, not in the fold.
    const far = Date.now() + 10 * 86_400_000;
    await a.vault.appendChanges([{ t: stamp(far, 0), kind: 'photo', id: held, field: 'acc', value: plant.id }], true);
    const b = await boot();
    await b.collection.load();
    expect(b.collection.photoKnown(held)).toBe(false);
    expect(await b.collection.sweepPixels()).toBe(2); // r82base: no such method
    expect((await b.vault.photoBlobIds()).sort()).toEqual([keep.id, fresh, held].sort());
    expect(await b.collection.sweepPixels()).toBe(0);
  });

  it('an Undo of a removal still puts the pixels back after a sweep', async () => {
    const a = await boot();
    await a.collection.load();
    const plant = await a.collection.addAccession({ taxonName: 'Lithops lesliei' });
    const p = await a.collection.addPhoto({ acc: plant.id, d: '2026-10-01', w: 4, h: 3, bytes: 6, blob: jpeg(1), thumb: jpeg(2) });
    const undo = await a.collection.removePhoto(p.id);
    await a.vault.putPhotoBlobs({ id: p.id, blob: jpeg(1), thumb: jpeg(2) });
    expect(await a.collection.sweepPixels()).toBe(1);
    await undo();
    expect(a.collection.photoKnown(p.id)).toBe(true);
    expect(await a.vault.photoBlobIds()).toEqual([p.id]);
    expect(await a.collection.sweepPixels()).toBe(0);
  });
});

describe('the snapshot after a Merge that parks (the independent review\'s 38)', () => {
  it('is written: the fold that reads the parks takes the counter they moved', async () => {
    const a = await boot();
    await a.collection.load();
    await a.collection.addAccession({ taxonName: 'Lithops lesliei' });
    await a.collection.saveSnapshot();
    // The file's changes, two of them parked by the device that wrote the file: parked first, then taken in, as a Merge does.
    const wall = Date.now() - 86_400_000;
    const file: Change[] = [
      { t: stamp(wall, 0), kind: 'accession', id: 'f1', field: 'taxonName', value: 'Conophytum minimum' },
      { t: stamp(wall, 1), kind: 'accession', id: 'f1', field: 'status', value: 'growing' },
      { t: stamp(wall, 2), kind: 'accession', id: 'f1', field: 'acc', value: '2025-0001' },
      { t: stamp(wall, 3), kind: 'accession', id: 'f1', field: 'notes', value: 'parked one' }
    ];
    expect(await a.collection.markParked([file[3]])).toBe(false);
    await a.collection.ingest(file);
    expect(await a.collection.saveSnapshot()).toBe(true); // r82base: false, refused for the counter the park moved
    // And the next load reads it, and comes out as the whole log does: the parked note is not folded.
    const b = await boot();
    await b.collection.load();
    expect(b.collection.loaded?.from).toBe('snapshot');
    expect(b.collection.accession('f1')?.notes ?? null).toBeNull();
    expect(b.collection.accessions.map((x) => x.taxonName).sort()).toEqual(['Conophytum minimum', 'Lithops lesliei']);
  });

  it('is still refused when the park is of a change the fold had already taken as ordinary', async () => {
    const a = await boot();
    await a.collection.load();
    const wall = Date.now() - 86_400_000;
    const c: Change = { t: stamp(wall, 0), kind: 'accession', id: 'f2', field: 'taxonName', value: 'Conophytum minimum' };
    await a.collection.ingest([c, { t: stamp(wall, 1), kind: 'accession', id: 'f2', field: 'status', value: 'growing' }]);
    expect(await a.collection.markParked([c])).toBe(true);
    expect(await a.collection.saveSnapshot()).toBe(false);
  });
});

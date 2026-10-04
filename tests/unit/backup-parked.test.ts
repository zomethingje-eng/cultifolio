/**
 * What a backup carries beyond its changes, through the real store (round fifty-nine; the outside review's list of
 * mutations no test caught). A stamp the exporting device had parked is parked on the device that restores it, so a
 * restore never folds a broken clock's change; and the meta write the counters lean on is one transaction.
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
  const io = await import('$lib/backup/io');
  return { vault, collection: store.collection, io };
}

beforeEach(async () => {
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});

describe('a parked stamp travels with the backup', () => {
  it('a merge parks what the exporting device had parked, and does not fold it', async () => {
    const base = Date.now() - 86_400_000;
    const plant: Change[] = [
      { t: stamp(base, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(base, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(base, 2), kind: 'accession', id: 'p1', field: 'acc', value: '2024-0001' }
    ];
    const odd: Change = { t: stamp(base, 3), kind: 'accession', id: 'p1', field: 'notes', value: 'from a broken clock' };
    let a = await boot();
    await a.vault.appendChanges([...plant, odd], true);
    await a.vault.setMeta('parked', [odd.t]); // parked here before, as a sync of a broken clock's batch leaves it
    await a.collection.load();
    expect(a.collection.accession('p1')?.notes).toBeUndefined();
    const prepared = await a.io.prepareBackup();

    // Another device: an empty collection that restores the file by merging.
    await a.vault.wipeVault();
    await wipeMeta(a.vault);
    await a.vault.setMeta('device', 'cccccccccccc');
    a = await boot();
    await a.collection.load();
    const opened = await a.io.openBackup(new File([prepared.blob], prepared.name));
    expect(opened.file.manifest.parked).toEqual([odd.t]);
    await a.io.restoreBackup(opened, 'merge');
    expect(a.collection.accession('p1')?.taxonName).toBe('Lithops lesliei');
    expect(a.collection.accession('p1')?.notes).toBeUndefined(); // parked here too
    expect(a.collection.parkedFor('accession', 'p1').map((c) => c.t)).toEqual([odd.t]);
    // and after a reload, from the stored set rather than the restore's own pass
    a = await boot();
    await a.collection.load();
    expect(a.collection.accession('p1')?.notes).toBeUndefined();
  });
});

describe('a meta update is one read and one write in one transaction', () => {
  it('twenty at once lose none', async () => {
    const { vault } = await boot();
    await Promise.all(Array.from({ length: 20 }, () => vault.updateMeta<number>('count', (n) => (n ?? 0) + 1)));
    expect(await vault.getMeta('count')).toBe(20);
  });
});

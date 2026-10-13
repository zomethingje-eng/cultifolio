/**
 * Round seventy, agent R: Replace refuses while the device holds changes it cannot read (triage-69 R4; the
 * self-review's D5). The preview was built from the changes the fold reads, so with such a change here and none in the
 * file it said "every plant here is in the file too", and the replacement cleared the log, the change with it, for
 * good. Round sixty-nine refused Replace for a file holding such a change; the device's own is refused the same way.
 * And a guard for a mutation the self-review found surviving (MR3c): `exportLog` setting the unreadable rows apart, on
 * which My plants' spreadsheet depends. Each case marked "base" fails on 526ecaf.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
// The real vault over an in-memory IndexedDB is slow on a loaded machine: a wipe or a replace took over ten seconds.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const T = Date.now() - 86_400_000;
const plant: Change[] = [
  { t: stamp(T, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
  { t: stamp(T, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
  { t: stamp(T, 2), kind: 'accession', id: 'p1', field: 'acc', value: '2024-0001' }
];
const BAD: Record<string, Change> = {
  'a reserved field': { t: stamp(T, 3), kind: 'event', id: 'e1', field: 'id', value: 'x' } as Change,
  'an unknown kind': { t: stamp(T, 4), kind: 'harvest', id: 'h1', field: 'kg', value: 2 } as unknown as Change,
  'a broken stamp': { t: '1-2-3', kind: 'accession', id: 'p1', field: 'notes', value: 'x' } as Change
};

async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const io = await import('$lib/backup/io');
  const backup = await import('$lib/backup/backup');
  return { vault, collection: store.collection, io, backup };
}
beforeEach(async () => {
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});


describe('Replace with an unreadable change on this device (S-D5)', () => {
  it('base: the preview names it, Replace is refused in round sixty-nine\'s words, and the change stays', async () => {
    const a = await boot();
    const bad = BAD['an unknown kind'];
    await a.vault.appendChanges([...plant, bad], true);
    await a.collection.load();
    expect(a.collection.malformed).toBe(1);
    const built = await a.backup.buildBackup({ changes: plant, readPhoto: async () => null });
    const opened = await a.io.openBackup(new File([new Blob(built.parts as BlobPart[])], 'old.zip'));
    expect(opened.unreadableHere).toEqual(['unknown kind "harvest"']);
    await expect(a.io.restoreBackup(opened, 'replace')).rejects.toThrow('1 change on this device cannot be read by this version (unknown kind "harvest"), and a replacement would lose it for good. Merge instead, which keeps it here; this device is unchanged.');
    const after = await a.vault.allChanges();
    expect(after.some((c) => (c as { kind: string }).kind === 'harvest')).toBe(true);
    expect(after).toHaveLength(plant.length + 1);
  });
  it('base: every kind of unreadable row counts, a reserved field and a broken stamp too', async () => {
    const a = await boot();
    await a.vault.appendChanges([...plant, BAD['a reserved field'], BAD['a broken stamp']], true);
    await a.collection.load();
    const built = await a.backup.buildBackup({ changes: plant, readPhoto: async () => null });
    const opened = await a.io.openBackup(new File([new Blob(built.parts as BlobPart[])], 'old.zip'));
    expect(opened.unreadableHere).toHaveLength(2);
    expect(a.io.unreadableHereRefusal(opened.unreadableHere)).toMatch(/^2 changes on this device cannot be read by this version \(.*\), and a replacement would lose them for good\. Merge instead, which keeps them here; this device is unchanged\.$/);
  });
  it('guard: a merge from the same file keeps the change', async () => {
    const a = await boot();
    await a.vault.appendChanges([...plant, BAD['an unknown kind']], true);
    await a.collection.load();
    const built = await a.backup.buildBackup({ changes: [...plant, { t: stamp(T, 9), kind: 'accession', id: 'p2', field: 'taxonName', value: 'Aloe vera' }, { t: stamp(T, 10), kind: 'accession', id: 'p2', field: 'status', value: 'growing' }], readPhoto: async () => null });
    const file = () => new File([new Blob(built.parts as BlobPart[])], 'new.zip');
    await a.io.restoreBackup(await a.io.openBackup(file()), 'merge');
    expect((await a.vault.allChanges()).some((c) => (c as { kind: string }).kind === 'harvest')).toBe(true);
    expect(a.collection.accession('p2')?.taxonName).toBe('Aloe vera');
  });
  it('base: a device without one is not refused', async () => {
    const a = await boot();
    expect(a.io.unreadableHereRefusal([])).toBeNull();
  });
});

describe('guard: My plants\' spreadsheet from a log holding an unreadable change (MR3c)', () => {
  it('is made, with the plant in it', async () => {
    const a = await boot();
    await a.vault.appendChanges([...plant, BAD['a reserved field']], true);
    await a.collection.load();
    const { plantsSheet } = await import('$lib/export/sheet');
    expect(await plantsSheet()).toContain('Lithops lesliei');
    const log = await a.collection.exportLog();
    expect([log.changes.length, log.unreadable.length]).toEqual([plant.length, 1]);
  });
});

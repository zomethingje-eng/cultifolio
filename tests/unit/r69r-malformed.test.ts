/**
 * Round sixty-nine, agent R: a change the fold skips (triage-68 R3; the self-review's D3, R46-18). Round sixty-seven
 * skipped it in the fold only, so on a device whose log held one:
 *  - with a reserved field ("id"), no backup could be made, and no backup could be opened for Merge or Replace;
 *  - with an unknown kind or a broken stamp, the backup was made and then refused whole when read back;
 *  - sync's first push carried it, and every peer set its batch aside.
 * Now the backup carries it apart (`unreadable.json`), the preview and the outbox leave it out, and the Backup page's
 * "They stay in the log, and in a backup" is true. Each case marked "base" fails on 1609c19.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('a backup of a log holding a change the fold skips', () => {
  for (const [what, bad] of Object.entries(BAD)) {
    it(`base: ${what}: the backup is made, read back, and opened on this device; the change rides apart in unreadable.json`, async () => {
      const a = await boot();
      await a.vault.appendChanges([...plant, bad], true);
      await a.collection.load();
      expect(a.collection.malformed).toBe(1);
      const prepared = await a.io.prepareBackup();
      const read = await a.backup.readBackup(new Uint8Array(await prepared.blob.arrayBuffer()));
      expect(read.changes.map((c) => c.t)).toEqual(plant.map((c) => c.t));
      expect(read.skipped).toEqual([bad]);
      expect(read.unreadable).toHaveLength(1);
      const opened = await a.io.openBackup(new File([prepared.blob], prepared.name));
      expect(opened.merge.fresh).toEqual([]);
      expect(opened.counts.accessions).toBe(1);
    });
  }
  it('base: another backup opened on this device previews its merge', async () => {
    const a = await boot();
    const other: Change[] = [{ t: stamp(T + 10, 0), kind: 'accession', id: 'p2', field: 'taxonName', value: 'Aloe vera' }, { t: stamp(T + 10, 1), kind: 'accession', id: 'p2', field: 'status', value: 'growing' }];
    const file = await a.backup.buildBackup({ changes: other, readPhoto: async () => null });
    await a.vault.appendChanges([...plant, BAD['a reserved field']], true);
    await a.collection.load();
    const opened = await a.io.openBackup(new File(file.parts as BlobPart[], 'x.cultifolio.zip'));
    expect(opened.merge.addedByKind).toEqual({ accession: 1 });
  });
  it('Replace from such a file is refused, naming the change, and the device is unchanged', async () => {
    const a = await boot();
    await a.vault.appendChanges([...plant, BAD['an unknown kind']], true);
    await a.collection.load();
    const prepared = await a.io.prepareBackup();
    const opened = await a.io.openBackup(new File([prepared.blob], prepared.name));
    await expect(a.io.restoreBackup(opened, 'replace')).rejects.toThrow(/unreadable\.json row 1: unknown kind "harvest"/);
  });
});

describe('sync does not push a change the fold skips', () => {
  it('base: the outbox fill leaves it out', async () => {
    const a = await boot();
    await a.vault.appendChanges([...plant, BAD['a reserved field']], true);
    expect(await a.vault.outboxFill()).toBe(plant.length);
    expect((await a.vault.outboxKeys()).sort()).toEqual(plant.map((c) => c.t).sort());
  });
  it('base: one already in the outbox (a newer build wrote it) is not sent, and stays in the log', async () => {
    const a = await boot();
    await a.vault.appendChanges([...plant, BAD['an unknown kind']], false);
    const { sync } = await import('$lib/sync/engine.svelte');
    const todo = await (sync as unknown as { toPush(): Promise<Change[]> }).toPush();
    expect(todo.map((c) => c.t).sort()).toEqual(plant.map((c) => c.t).sort());
    expect((await a.vault.allChanges()).length).toBe(plant.length + 1);
  });
});

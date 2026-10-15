/**
 * Round seventy-one, agent D: a restored change this version cannot read reaches sync once a version reads it (the
 * self-review's D3). Round seventy appended a backup's unreadable rows to the log as from the server, so with no outbox
 * entry, and `outboxFill` (the first push of a sync set up later) left every such row out: once the device was updated to
 * a version that reads the change, it folded here and no other device ever had it. Now such a change waits apart
 * (`unsentUnreadable`) and the first load that reads it puts it in the outbox; none goes in the outbox before, where the
 * push would hold it back for good and the sync page count it as waiting. A later version is stood in for by adding the
 * kind to the module's `KINDS`, as a build that knows it would. Cases marked "base" fail on r71base.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });
const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const T = Date.now() - 86_400_000;
const plant: Change[] = [
  { t: stamp(T, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
  { t: stamp(T, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' }
];
const harvest = { t: stamp(T, 4), kind: 'harvest', id: 'h1', field: 'kg', value: 2 };
async function boot() {
  vi.resetModules();
  return { vault: await import('$lib/db/vault'), log: await import('$core/log'), collection: (await import('$lib/db/collection.svelte')).collection, io: await import('$lib/backup/io'), backup: await import('$lib/backup/backup') };
}
type B = Awaited<ReturnType<typeof boot>>;
beforeEach(async () => { const { vault } = await boot(); await vault.wipeVault(); await wipeMeta(vault); await vault.setMeta('device', DEV); });
async function file(b: B, changes: Change[], unreadable: unknown[]): Promise<File> {
  const built = await b.backup.buildBackup({ changes, unreadable, readPhoto: async () => null });
  return new File([new Blob(built.parts as BlobPart[])], 'f.cultifolio.zip');
}
const waiting = (b: B) => b.vault.getMeta<string[]>('unsentUnreadable');
/** A version that reads the kind. */
const reads = (b: B) => (b.log.KINDS as unknown as string[]).push('harvest');

describe('a restored change this version cannot read (D3)', () => {
  it('base: Merge keeps it apart, out of the outbox, and a version that reads it queues it', async () => {
    const a = await boot();
    await a.collection.load();
    await a.io.restoreBackup(await a.io.openBackup(await file(a, plant, [harvest])), 'merge');
    const box = await a.vault.outboxKeys();
    expect(box).toContain(plant[0].t);
    expect(box).not.toContain(harvest.t);
    expect(await waiting(a)).toEqual([harvest.t]);
    const b = await boot();
    reads(b);
    const queued = await b.vault.queueReadable();
    expect(queued.map((c) => c.t)).toEqual([harvest.t]);
    expect(await b.vault.outboxKeys()).toContain(harvest.t);
    expect(await waiting(b)).toBeUndefined();
  });
  it('base: this version queues nothing, and a second Merge of the file appends and notes nothing twice', async () => {
    const a = await boot();
    await a.collection.load();
    await a.io.restoreBackup(await a.io.openBackup(await file(a, plant, [harvest])), 'merge');
    await a.io.restoreBackup(await a.io.openBackup(await file(a, plant, [harvest])), 'merge');
    expect((await a.vault.allChanges()).filter((c) => c.t === harvest.t)).toHaveLength(1);
    expect(await a.vault.queueReadable()).toEqual([]);
    expect(await waiting(a)).toEqual([harvest.t]);
  });
  it('base: Replace keeps it apart too, not in the outbox', async () => {
    const a = await boot();
    await a.collection.load();
    await a.io.restoreBackup(await a.io.openBackup(await file(a, plant, [harvest])), 'replace');
    expect(await a.vault.outboxKeys()).not.toContain(harvest.t);
    expect(await waiting(a)).toEqual([harvest.t]);
  });
  it('base: a sync set up over a log holding one leaves it out of the first push and keeps it apart', async () => {
    const a = await boot();
    await a.vault.appendChanges([...plant, harvest as unknown as Change], true);
    await a.vault.outboxFill();
    expect(await a.vault.outboxKeys()).not.toContain(harvest.t);
    expect(await waiting(a)).toEqual([harvest.t]);
  });
  it('base: the first load that reads a waiting change puts it in the outbox and tells sync', async () => {
    const a = await boot();
    await a.vault.appendChanges(plant, true);
    await a.vault.setMeta('unsentUnreadable', [plant[1].t, stamp(T, 9)]); // a change now read, and one no longer in the log
    const told: Change[][] = [];
    a.collection.onLocalChange((c) => told.push(c));
    await a.collection.load();
    await vi.waitFor(async () => expect(await a.vault.outboxKeys()).toEqual([plant[1].t]));
    expect(told.flat().map((c) => c.t)).toEqual([plant[1].t]);
    expect(await waiting(a)).toBeUndefined();
  });
});

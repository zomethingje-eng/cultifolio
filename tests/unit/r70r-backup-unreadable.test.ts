/**
 * Round seventy, second pass, agent R: unreadable changes in a backup (triage-69 R6; R47-15). Round sixty-nine carried a
 * change the fold cannot read in `unreadable.json`, and no build read it back: every row was set apart, Merge took only
 * what it read, and Replace was refused. A version that could read the change still left it out, a restore lost it, and
 * the next backup no longer carried it. Now the readable rows of `unreadable.json` are read back as changes, and the rest
 * are appended to the log as they are on Merge and Replace, which the fold skips, so a restore loses nothing. A row with
 * no stamp to keep it under, or with a value its field never takes, is still left out, and Replace refused for it; R4
 * (the device's own unreadable changes) stands. Each case marked "base" fails on 526ecaf.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { unzipSync } from 'fflate';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';
// The real vault over an in-memory IndexedDB is slow on a loaded machine.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 60_000 });

const DEV = 'aaaaaaaaaaaa';
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
const T = Date.now() - 86_400_000;
const plant: Change[] = [
  { t: stamp(T, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
  { t: stamp(T, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' }
];
const harvest = { t: stamp(T, 4), kind: 'harvest', id: 'h1', field: 'kg', value: 2 };
/** A change a newer build set apart that this build reads: a plant's notes, written as that build's fold skipped it. */
const notes: Change = { t: stamp(T, 5), kind: 'accession', id: 'p1', field: 'notes', value: 'from the newer build' };

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
/** A backup of `plant`, with `rows` in its unreadable.json. */
async function fileWith(b: Awaited<ReturnType<typeof boot>>, rows: unknown[]): Promise<File> {
  const built = await b.backup.buildBackup({ changes: plant, unreadable: rows, readPhoto: async () => null });
  return new File([new Blob(built.parts as BlobPart[])], 'f.cultifolio.zip');
}

describe('unreadable.json read back (R47-15)', () => {
  it('base: a row this version reads is read back as a change, and Merge folds it', async () => {
    const a = await boot();
    const opened = await a.io.openBackup(await fileWith(a, [notes, harvest]));
    expect(opened.file.changes.map((c) => c.t)).toContain(notes.t);
    expect(opened.file.skipped).toEqual([harvest]);
    await a.collection.load();
    await a.io.restoreBackup(opened, 'merge');
    expect(a.collection.accession('p1')?.notes).toBe('from the newer build');
  });
  it('base: Merge appends the rest as they are; the fold skips them, and the next backup carries them', async () => {
    const a = await boot();
    await a.collection.load();
    await a.io.restoreBackup(await a.io.openBackup(await fileWith(a, [harvest])), 'merge');
    expect((await a.vault.allChanges()).filter((c) => (c as { kind: string }).kind === 'harvest')).toEqual([harvest]);
    expect(a.collection.malformed).toBe(1);
    const again = await a.io.prepareBackup();
    const files = unzipSync(new Uint8Array(await again.blob.arrayBuffer()));
    expect(JSON.parse(new TextDecoder().decode(files['unreadable.json']))).toEqual([harvest]);
  });
  it('base: Replace keeps them as they are, rather than refusing', async () => {
    const a = await boot();
    await a.vault.appendChanges([{ t: stamp(T, 9), kind: 'accession', id: 'p9', field: 'taxonName', value: 'Aloe vera' }], true);
    await a.collection.load();
    const opened = await a.io.openBackup(await fileWith(a, [harvest]));
    expect(opened.file.leftOut).toEqual([]);
    await a.io.restoreBackup(opened, 'replace');
    const after = await a.vault.allChanges();
    expect(after.map((c) => c.t).sort()).toEqual([...plant.map((c) => c.t), harvest.t].sort());
  });
  it('guard: a row with no stamp to keep it under is left out, named, and Replace is refused for it', async () => {
    const a = await boot();
    await a.collection.load();
    const opened = await a.io.openBackup(await fileWith(a, [{ kind: 'harvest', id: 'h2', field: 'kg', value: 1 }]));
    expect(opened.file.unreadable).toHaveLength(1);
    await expect(a.io.restoreBackup(opened, 'replace')).rejects.toThrow(/cannot be read by this version.*Merge instead/);
  });
  it('guard: a merge does not displace a change the log holds under the same stamp', async () => {
    const a = await boot();
    await a.vault.appendChanges(plant, true);
    await a.collection.load();
    const clash = { ...harvest, t: plant[0].t };
    // A file of another collection whose set-apart row has the stamp of this device's plant name.
    const built = await a.backup.buildBackup({ changes: [{ t: stamp(T, 7), kind: 'accession', id: 'p7', field: 'taxonName', value: 'Aloe vera' }], unreadable: [clash], readPhoto: async () => null });
    const opened = await a.io.openBackup(new File([new Blob(built.parts as BlobPart[])], 'g.cultifolio.zip'));
    expect(opened.file.skipped).toEqual([clash]);
    await a.io.restoreBackup(opened, 'merge');
    expect(a.collection.accession('p1')?.taxonName).toBe('Lithops lesliei');
  });
});

/**
 * Round sixty-two, second pass (agent L): a backup written by a build before round sixty-two lists as parked what it
 * held parked in memory too (a park judged by its clock alone), and a restore of it stored such a park for good: B7
 * through an old file (the data review's suspected items). Since this round a file names its app "cultifolio 3 (stored
 * parks)" and lists stored verdicts only; a version-1 manifest naming the old app, or none, has its list not read, and
 * its changes are judged here as any change arriving now is. Real vault over fake IndexedDB.
 * The first two cases FAILED on the first pass (the park was stored); the third is a guard of a new file's verdicts.
 * Run: npx vitest run tests/unit/r62bl-records.test.ts
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;
const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}
beforeEach(async () => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => { if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage; });

/** A file another device wrote: a plant, and a peer's edit 2.5 days ahead listed as parked, under the app name given. */
async function fileFrom(app: string | undefined) {
  const { buildBackup } = await import('$lib/backup/backup');
  const now = Date.now();
  const at = (count: number) => hlcEncode({ wall: now - DAY, count, device: 'cccccccccccc0000' });
  const changes: Change[] = [
    { t: at(0), kind: 'accession', id: 'r-1', field: 'taxonName', value: 'Copiapoa cinerea' },
    { t: at(1), kind: 'accession', id: 'r-1', field: 'status', value: 'growing' },
    { t: at(2), kind: 'accession', id: 'r-1', field: 'acc', value: '2026-0001' }
  ];
  const ahead: Change = { t: hlcEncode({ wall: now + 2.5 * DAY, count: 0, device: PEER }), kind: 'accession', id: 'r-1', field: 'notes', value: 'parked there by its clock alone' };
  const built = await buildBackup({ changes: [...changes, ahead], device: 'cccccccccccc', app, parked: [ahead.t], readPhoto: async () => null } as never);
  return { blob: new Blob(built.parts as BlobPart[], { type: 'application/zip' }), ahead };
}

describe('a backup from a build before round sixty-two: its parks are not stored', () => {
  it('merge: the change is judged here (held, the clock not confirmed), and nothing is stored as parked', { timeout: 120_000 }, async () => {
    const { blob, ahead } = await fileFrom('cultifolio 3');
    const b = await boot();
    await b.store.collection.load();
    const io = await import('$lib/backup/io');
    await io.restoreBackup(await io.openBackup(new File([blob], 'old.cultifolio.zip')), 'merge');
    expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([]);
    expect(b.store.collection.heldList()).toContain(ahead.t);
  });
  it('replace: nothing is stored as parked', { timeout: 120_000 }, async () => {
    const { blob } = await fileFrom(undefined);
    let b = await boot();
    await b.store.collection.load();
    const io = await import('$lib/backup/io');
    await io.restoreBackup(await io.openBackup(new File([blob], 'old.cultifolio.zip')), 'replace');
    b = await boot();
    expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([]);
  });
  it('a file of this build keeps its verdicts: merge stores the park', { timeout: 120_000 }, async () => {
    const io = await import('$lib/backup/io');
    expect(io.fileParks({ v: 1, app: 'cultifolio 3', parked: ['x'] })).toEqual([]);
    expect(io.fileParks({ v: 1, parked: ['x'] })).toEqual([]);
    expect(io.fileParks({ v: 2, app: 'cultifolio 3', parked: ['x'] })).toEqual(['x']); // version 2 is this round's
    const { blob, ahead } = await fileFrom('cultifolio 3 (stored parks)');
    const b = await boot();
    await b.store.collection.load();
    const io2 = await import('$lib/backup/io');
    await io2.restoreBackup(await io2.openBackup(new File([blob], 'new.cultifolio.zip')), 'merge');
    expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([ahead.t]);
  });
  it('a backup this build writes names the new app', { timeout: 120_000 }, async () => {
    const b = await boot();
    await b.store.collection.load();
    await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea' } as never);
    const io = await import('$lib/backup/io');
    const { readBackup } = await import('$lib/backup/backup');
    const file = await readBackup(new Uint8Array(await (await io.prepareBackup()).blob.arrayBuffer()));
    expect(file.manifest.app).toBe('cultifolio 3 (stored parks)');
  });
});

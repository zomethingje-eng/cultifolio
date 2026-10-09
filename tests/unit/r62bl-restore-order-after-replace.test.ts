/**
 * Adopted in the second pass of round sixty-two (agent L) from the data review's 6 (and the self-review's N3). The fix:
 * a replace marks the rows it wrote as of unknown order (`orderFrom`), so after it the restore reads "not known" (the
 * plant that stayed keeps the number) where it read two stamps; a change that arrives after the replace has a place.
 * The second case FAILED on the base and on the first pass (the number left shared); the cases added below too.
 * Reviewer "data", round sixty-two: the restore rule reads "the order in which the two arrived here, one device's order,
 * never two clocks" (A22, records 8). A replace from a backup writes the order store afresh, in stamp order (copyStagingIn
 * stores the staged changes as one write, read back by key), so after a replace every change has a place and that place
 * is its stamp's: the rule is two clocks again, and the "not known" case of round sixty-two never comes up.
 * A peer ten minutes slow makes a plant under a number after this device removed its own plant under that number: before
 * the replace the restore yields the number (right); after it, the two keep the number shared (the stamps say the other
 * plant came first), and the record pages say the number is shared and offer "Renumber now". The other way round (a
 * peer's plant held on arrival because its clock was fast, then the removal) the replaced order says the other plant
 * "reached this device while this one was removed", which it did not.
 * Real vault over fake IndexedDB. Run: npx vitest run tests/unit/data--restore-order-after-replace.test.ts
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
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

async function scene() {
  const b = await boot();
  await b.store.collection.load();
  const mine = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0001' } as never);
  await b.store.collection.remove('accession', mine.id);
  // after the removal, a peer whose clock is ten minutes slow sends a plant it made under the same number
  const w = Date.now() - 10 * 60_000;
  const other: Change[] = [
    { t: hlcEncode({ wall: w, count: 0, device: PEER }), kind: 'accession', id: 'r-other', field: 'taxonName', value: 'Lithops lesliei' },
    { t: hlcEncode({ wall: w, count: 1, device: PEER }), kind: 'accession', id: 'r-other', field: 'status', value: 'growing' },
    { t: hlcEncode({ wall: w, count: 2, device: PEER }), kind: 'accession', id: 'r-other', field: 'acc', value: '2026-0001' }
  ];
  await b.store.collection.ingest(other, 'server');
  return { b, mine };
}

describe('the restore rule after a replace from a backup', () => {
  it('without a replace: the other plant reached this device while this one was removed, and the restored plant yields', async () => {
    const { b, mine } = await scene();
    const moved = await b.store.collection.restore('accession', mine.id);
    expect(moved?.from).toBe('2026-0001');
    expect(b.store.collection.accession('r-other')?.acc).toBe('2026-0001');
  });
  it('after a replace from a backup of that same collection, the same restore is judged the same way', { timeout: 120_000 }, async () => {
    const { mine } = await scene();
    const io = await import('$lib/backup/io');
    const { readBackup } = await import('$lib/backup/backup');
    const { replaceThroughStaging } = await import('$lib/backup/replace');
    const file = await readBackup(new Uint8Array(await (await io.prepareBackup()).blob.arrayBuffer()));
    const b0 = await boot();
    await replaceThroughStaging(file, b0.vault.openStaging);
    const b = await boot();
    await b.store.collection.load();
    const moved = await b.store.collection.restore('accession', mine.id);
    // actual: null, the number is left shared, judged by the two stamps
    expect(moved?.from).toBe('2026-0001');
    expect(b.store.collection.sharesNumber('accession', 'r-other')).toEqual([]);
    // what the file cannot say is said as not known (second pass)
    expect(moved?.unknown).toBe(true);
    expect(b.store.collection.events(mine.id).find((e) => e.t === 'note')?.note).toMatch(/which of the two this device received first is not known/);
    // and the snapshot's catch-up still reads every row the replace wrote
    expect((await b.vault.arrivalsAfter(0)).changes.length).toBe((await b.vault.allChanges()).length);
  });
  it('the other way round (the other plant reached this device first): after a replace the note does not say it came while this one was removed', { timeout: 120_000 }, async () => {
    let b = await boot();
    await b.store.collection.load();
    const mine = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0001' } as never);
    const w = Date.now() + 4 * 60_000; // a peer four minutes fast gave out the same number offline: its plant arrives before the removal, stamped after it
    await b.store.collection.ingest([
      { t: hlcEncode({ wall: w, count: 0, device: PEER }), kind: 'accession', id: 'r-other', field: 'taxonName', value: 'Lithops lesliei' },
      { t: hlcEncode({ wall: w, count: 1, device: PEER }), kind: 'accession', id: 'r-other', field: 'status', value: 'growing' },
      { t: hlcEncode({ wall: w, count: 2, device: PEER }), kind: 'accession', id: 'r-other', field: 'acc', value: '2026-0001' }
    ], 'server');
    await b.store.collection.remove('accession', mine.id);
    const io = await import('$lib/backup/io');
    const { readBackup } = await import('$lib/backup/backup');
    const { replaceThroughStaging } = await import('$lib/backup/replace');
    const file = await readBackup(new Uint8Array(await (await io.prepareBackup()).blob.arrayBuffer()));
    const b0 = await boot();
    await replaceThroughStaging(file, b0.vault.openStaging);
    b = await boot();
    await b.store.collection.load();
    const moved = await b.store.collection.restore('accession', mine.id);
    expect(moved?.unknown).toBe(true);
    expect(b.store.collection.events(mine.id).find((e) => e.t === 'note')?.note ?? '').not.toMatch(/while this one was removed/);
  });
  it('a plant that arrives after the replace has a place: it came while this one was removed', { timeout: 120_000 }, async () => {
    let b = await boot();
    await b.store.collection.load();
    const mine = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0001' } as never);
    await b.store.collection.remove('accession', mine.id);
    const io = await import('$lib/backup/io');
    const { readBackup } = await import('$lib/backup/backup');
    const { replaceThroughStaging } = await import('$lib/backup/replace');
    const file = await readBackup(new Uint8Array(await (await io.prepareBackup()).blob.arrayBuffer()));
    const b0 = await boot();
    await replaceThroughStaging(file, b0.vault.openStaging);
    b = await boot();
    await b.store.collection.load();
    const w = Date.now() - 10 * 60_000;
    await b.store.collection.ingest([
      { t: hlcEncode({ wall: w, count: 0, device: PEER }), kind: 'accession', id: 'r-other', field: 'taxonName', value: 'Lithops lesliei' },
      { t: hlcEncode({ wall: w, count: 1, device: PEER }), kind: 'accession', id: 'r-other', field: 'status', value: 'growing' },
      { t: hlcEncode({ wall: w, count: 2, device: PEER }), kind: 'accession', id: 'r-other', field: 'acc', value: '2026-0001' }
    ], 'server');
    const moved = await b.store.collection.restore('accession', mine.id);
    expect(moved).toMatchObject({ from: '2026-0001' });
    expect(moved?.unknown).toBeUndefined();
    expect(b.store.collection.events(mine.id).find((e) => e.t === 'note')?.note).toMatch(/reached this device while this one was removed/);
  });
});

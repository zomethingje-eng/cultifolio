/**
 * Round sixty-two (agent L), decision 5's records, on the real vault over fake IndexedDB:
 *  - stored verdicts only, through a file: a backup made while a park judged by the clock alone is in memory lists no
 *    such park, and neither a merge nor a replace from it stores one (B7, A16, the records review's 7; the replace half
 *    adopted from docs/review-61/tests/records--r61-backup-rule5.test.ts, which failed on the base);
 *  - a new vault's first fill puts in what this device holds as parked too, sent with its verdict (A15; changed in the
 *    second pass by the data review's 5);
 *  - restore with no arrival order (a removal from before round sixty-one): said as not known, and the live record keeps
 *    the number (A22); with the removal's order unknown and the other record's known, the other came after;
 *  - Apply takes the latest parked removal or restore (A26: does not reproduce on the base; kept as a guard);
 *  - "Apply all from this device" applies this device's parked changes and leaves a peer's.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode, hlcPast } from '$core/hlc';
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
afterEach(() => { vi.useRealTimers(); if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage; });

/** A peer's change two and a half days ahead, read from a file, parked for this load by the confirmed clock alone. */
async function clockOnlyPark() {
  let b = await boot();
  await b.store.collection.load();
  const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
  const ahead: Change = { t: hlcEncode({ wall: Date.now() + 2.5 * DAY, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'from a peer file, 2.5 days ahead' };
  await b.store.collection.ingest([ahead], 'import');
  b.hlc.trustServerTime(Date.now());
  b = await boot();
  await b.store.collection.load();
  expect(b.store.collection.parkedRecords).toBe(1);
  expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([]);
  return { b, p, ahead };
}

describe('a clock-only park never becomes a stored one through a file (B7, A16)', () => {
  it('the backup lists no such park, and a replace from it stores none', { timeout: 120_000 }, async () => {
    let { b } = await clockOnlyPark();
    const io = await import('$lib/backup/io');
    const { readBackup } = await import('$lib/backup/backup');
    const { replaceThroughStaging } = await import('$lib/backup/replace');
    const file = await readBackup(new Uint8Array(await (await io.prepareBackup()).blob.arrayBuffer()));
    expect(file.manifest.parked ?? []).toEqual([]);
    await replaceThroughStaging(file, b.vault.openStaging);
    b = await boot();
    expect((await b.vault.getMeta<string[]>('parked')) ?? []).toEqual([]);
  });
  it('a merge of that backup into another collection stores none, and the change is judged again there', { timeout: 120_000 }, async () => {
    const { b, ahead } = await clockOnlyPark();
    const io = await import('$lib/backup/io');
    const blob = (await io.prepareBackup()).blob;
    // another collection: an empty vault, its clock not confirmed
    await b.vault.wipeVault();
    await wipeMeta(b.vault);
    await b.vault.setMeta('device', 'cccccccccccc');
    b.hlc._resetClockOffset();
    const c = await boot();
    await c.store.collection.load();
    const io2 = await import('$lib/backup/io');
    const opened = await io2.openBackup(new File([blob], 'b.cultifolio.zip'));
    await io2.restoreBackup(opened, 'merge');
    expect((await c.vault.getMeta<string[]>('parked')) ?? []).toEqual([]);
    expect(c.store.collection.heldList()).toContain(ahead.t); // held here (its clock is not confirmed), not parked for good
  });
});

describe('a new vault is sent what this device holds as parked, with its verdict (A15; the second pass, the data review\'s 5)', () => {
  it('outboxFill puts every change in, the stored parks too: the push sends their verdicts with them', async () => {
    const b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
    const parked: Change = { t: hlcEncode({ wall: Date.now() - 4 * DAY, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'parked a week ago' };
    const marked: Change = { t: hlcPast(hlcEncode({ wall: Date.now() + 365 * DAY, count: 0, device: PEER }), PEER), kind: 'accession', id: p.id, field: 'price', value: 'placed past a far stamp' };
    await b.vault.appendChanges([parked, marked], true);
    await b.vault.parkStamps([parked.t, marked.t]); // as a round-sixty build stored them both
    await b.vault.outboxClear();
    await b.vault.outboxFill();
    const out = await b.vault.outboxKeys();
    expect(out).toContain(parked.t);
    expect(out).toContain(marked.t);
    expect(out.length).toBe((await b.vault.allChanges()).length);
  });
});

/** Take a change's row out of the order store, as for a change stored before round sixty-one kept the order. */
async function forgetOrder(vault: typeof import('$lib/db/vault'), stamps: string[]) {
  const db = (await vault.openVault()) as unknown as import('idb').IDBPDatabase<{ order: { key: number; value: { t: string } } }>;
  const tx = db.transaction('order', 'readwrite');
  let cur = await tx.store.openCursor();
  while (cur) { if (stamps.includes(cur.value.t)) await cur.delete(); cur = await cur.continue(); }
  await tx.done;
}

describe('restore with no arrival order (A22)', () => {
  async function scene(otherKnown: boolean) {
    let b = await boot();
    await b.store.collection.load();
    const mine = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0001' } as never);
    await b.store.collection.remove('accession', mine.id);
    const removal = (await b.vault.allChanges()).find((c) => c.id === mine.id && c.field === '_deleted')!;
    // another plant under the number, from a peer
    const w = Date.now() - 60_000;
    const other: Change[] = [
      { t: hlcEncode({ wall: w, count: 0, device: PEER }), kind: 'accession', id: 'r-other', field: 'taxonName', value: 'Lithops lesliei' },
      { t: hlcEncode({ wall: w, count: 1, device: PEER }), kind: 'accession', id: 'r-other', field: 'status', value: 'growing' },
      { t: hlcEncode({ wall: w, count: 2, device: PEER }), kind: 'accession', id: 'r-other', field: 'acc', value: '2026-0001' }
    ];
    await b.store.collection.ingest(other, 'server');
    // both from before round sixty-one: no row in the order of arrival (or only the removal, when the other is known)
    await forgetOrder(b.vault, otherKnown ? [removal.t] : [removal.t, ...other.map((c) => c.t)]);
    await b.vault.dropFold(); // a snapshot is replayed from the order store: the log is folded whole, as a load before the order was kept did
    b = await boot();
    await b.store.collection.load();
    return { b, mine };
  }
  it('neither order known: the restored plant takes the next number, the live one keeps its own, and the note and the words say the order is not known', async () => {
    const { b, mine } = await scene(false);
    const moved = await b.store.collection.restore('accession', mine.id);
    expect(moved).toMatchObject({ from: '2026-0001', unknown: true });
    expect(b.store.collection.accession('r-other')?.acc).toBe('2026-0001');
    expect(b.store.collection.accession(mine.id)?.acc).toBe(moved!.to);
    expect(b.store.collection.sharesNumber('accession', 'r-other')).toEqual([]);
    const note = b.store.collection.events(mine.id).find((e) => e.t === 'note')?.note ?? '';
    expect(note).toMatch(/not known/);
    const { restoredWords } = await import('$lib/ui/held-words');
    expect(restoredWords(moved!, 'plant')).toMatch(/not known/);
  });
  it('the removal from before the order was kept, the other plant after it: the other came while this one was removed', async () => {
    const { b, mine } = await scene(true);
    const moved = await b.store.collection.restore('accession', mine.id);
    expect(moved).toMatchObject({ from: '2026-0001' });
    expect(moved?.unknown).toBeUndefined();
    expect(b.store.collection.events(mine.id).find((e) => e.t === 'note')?.note).toMatch(/reached this device while this one was removed/);
  });
});

describe('Apply on parked changes', () => {
  it('(A26) a removal and a later restore both parked: Apply restores the plant (the latest by stamp)', async () => {
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
    const far = Date.now() + 5 * DAY;
    const removal: Change = { t: hlcEncode({ wall: far, count: 0, device: PEER }), kind: 'accession', id: p.id, field: '_deleted', value: true };
    const restore: Change = { t: hlcEncode({ wall: far + 1000, count: 0, device: PEER }), kind: 'accession', id: p.id, field: '_deleted', value: false };
    await b.vault.appendChanges([removal, restore], true);
    await b.store.collection.markParked([removal, restore]);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)?.notes).toBe('mine');
    await b.store.collection.applyParked('accession', p.id);
    expect(b.store.collection.accession(p.id)?.notes).toBe('mine');
    const rm: Change = { t: hlcEncode({ wall: far + 2000, count: 0, device: PEER }), kind: 'accession', id: p.id, field: '_deleted', value: true };
    await b.vault.appendChanges([rm], true);
    await b.store.collection.markParked([rm]);
    await b.store.collection.applyParked('accession', p.id);
    expect(b.store.collection.accession(p.id)).toBeUndefined();
  });
  it('"Apply all from this device" applies this device\'s parked changes and leaves a peer\'s listed', async () => {
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' } as never);
    const q = await b.store.collection.addAccession({ taxonName: 'Lithops lesliei', notes: 'mine too' } as never);
    const far = Date.now() + 5 * DAY;
    const own: Change = { t: hlcEncode({ wall: far, count: 0, device: DEV + 'zz00' }), kind: 'accession', id: p.id, field: 'notes', value: 'typed while fast here' };
    const peer: Change = { t: hlcEncode({ wall: far, count: 1, device: PEER }), kind: 'accession', id: q.id, field: 'notes', value: 'a peer, fast' };
    await b.vault.appendChanges([own, peer], true);
    await b.store.collection.markParked([own, peer]);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.parkedOwn()).toEqual([{ kind: 'accession', id: p.id }]);
    expect(await b.store.collection.applyAllOwnParked()).toBe(1);
    expect(b.store.collection.accession(p.id)?.notes).toBe('typed while fast here');
    expect(b.store.collection.accession(q.id)?.notes).toBe('mine too');
    expect(b.store.collection.parkedRecords).toBe(1);
    expect(b.store.collection.parkedOwn()).toEqual([]);
  });
});

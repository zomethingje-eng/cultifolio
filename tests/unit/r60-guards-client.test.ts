/**
 * Proposed by the round-59 harness review: tests that fail under mutations of the collection's round-58/59 fixes that
 * the suite let through (ids from /tmp/review59/harness.md). Real vault over fake-indexeddb, as rule5.test.ts does.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');
type Hlc = typeof import('$core/hlc');
const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';
const DAY = 86_400_000;

async function boot(): Promise<{ store: Store; vault: Vault; hlc: Hlc }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const hlc = await import('$core/hlc');
  return { store, vault, hlc };
}
beforeEach(async () => {
  vi.useRealTimers();
  const { vault, hlc } = await boot();
  hlc._resetClockOffset();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => vi.useRealTimers());

describe('the clock (proposed)', () => {
  it('C05: a server reading confirms the clock for a week, not for good', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const { hlc } = await boot();
    hlc.trustServerTime(T0);
    expect(hlc.clockChecked()).toBe(true);
    vi.setSystemTime(T0 + 8 * DAY);
    expect(hlc.clockChecked()).toBe(false);
  });
});

describe('notes replaced, as the plant page reads them (proposed)', () => {
  it('C15: a peer\'s blind edit the fold is holding has replaced nothing on screen', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Lithops', notes: 'mine' } as never);
    const peer: Change[] = [{ t: hlcEncode({ wall: T0 + 3_600_000, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'the peer\'s, from a clock an hour ahead' }];
    await b.store.collection.ingest(peer, 'server');
    expect(b.store.collection.heldList()).toContain(peer[0].t);
    expect(b.store.collection.accession(p.id)?.notes).toBe('mine');
    expect(await b.store.collection.replacedNotes('accession', p.id)).toEqual([]);
  });
  it('C16: a peer\'s blind edit the fold has parked has replaced nothing on screen', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const b = await boot();
    b.hlc.trustServerTime(T0);
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Haworthia', notes: 'mine' } as never);
    const far: Change[] = [{ t: hlcEncode({ wall: T0 + 400 * DAY, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'a year ahead' }];
    await b.store.collection.ingest(far, 'server');
    expect(b.store.collection.parkedRecords).toBe(1);
    expect(await b.store.collection.replacedNotes('accession', p.id)).toEqual([]);
  });
  it('C17: a species\' own notes saved twice in sight of each other replace nothing unseen, however the caller passes the base', async () => {
    const b = await boot();
    await b.store.collection.load();
    const c = b.store.collection;
    await c.put('taxon', 'copiapoa-cinerea', { name: 'Copiapoa cinerea', myNotes: 'first' });
    await c.put('taxon', 'copiapoa-cinerea', { myNotes: 'second' }); // the base is the text on screen
    expect(await c.replacedNotes('taxon', 'copiapoa-cinerea')).toEqual([]);
    const fields = (await b.vault.allChanges()).filter((x) => x.kind === 'taxon').map((x) => x.field);
    expect(fields.filter((f) => f === 'myNotesBase')).toHaveLength(2);
  });
  it('C18: a push is never cut between a species\' notes and their base', async () => {
    const { cutBefore } = await import('$lib/sync/engine.svelte');
    const w = (tab: string) => `1789520000000-0000-aaaaaaaaaaaa${tab}`;
    const list = [{ t: w('tab1'), field: 'price' }, { t: w('tab1'), field: 'myNotes', kind: 'taxon', id: 'aloe-vera' }, { t: w('tab1'), field: 'myNotesBase', kind: 'taxon', id: 'aloe-vera' }, { t: w('tab1'), field: 'acc' }] as never[];
    expect(cutBefore(list, 2)).toBe(1);
  });
});

describe('the snapshot heartbeat and a future savedAt (proposed; the fold-rules hash was the only guard)', () => {
  const base = { device: DEV, offset: 0, seq: 0, records: [], seen: [], born: [], parents: [], held: [], last: '', changes: 0, build: 'x' };
  it('C29/C30: touchFold moves savedAt when it is over ten minutes old or in the future, and not otherwise', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    const { vault } = await boot();
    const gen = await vault.foldGen();
    vi.setSystemTime(T0);
    expect(await vault.writeFold({ ...base, rules: 4 }, gen)).toBe(true);
    vi.setSystemTime(T0 + 5 * 60_000);
    await vault.touchFold(4);
    expect((await vault.readFold())!.fold.savedAt).toBe(T0); // five minutes: left alone
    vi.setSystemTime(T0 + 11 * 60_000);
    await vault.touchFold(4);
    expect((await vault.readFold())!.fold.savedAt).toBe(T0 + 11 * 60_000);
    vi.setSystemTime(T0 + DAY); // a clock that ran a day ahead, then put back
    await vault.touchFold(4);
    vi.setSystemTime(T0 + 12 * 60_000);
    await vault.touchFold(4);
    expect((await vault.readFold())!.fold.savedAt).toBe(T0 + 12 * 60_000);
  });
  it('C31: a load from the snapshot is the heartbeat', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    await b.store.collection.load();
    await b.store.collection.addAccession({ taxonName: 'Lithops' } as never);
    b = await boot();
    await b.store.collection.load();
    await b.store.collection.snapshotWritten;
    const first = (await b.vault.readFold())!.fold.savedAt!;
    vi.setSystemTime(first + 20 * 60_000);
    b = await boot();
    await b.store.collection.load();
    expect(b.store.collection.loaded.from).toBe('snapshot');
    await vi.waitFor(async () => expect((await b.vault.readFold())!.fold.savedAt).toBe(first + 20 * 60_000));
  });
  it('C32: a snapshot under newer rules dated in the future (a clock put back) does not lock an older shell out', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    const { vault } = await boot();
    const gen = await vault.foldGen();
    vi.setSystemTime(T0 + 3 * DAY);
    expect(await vault.writeFold({ ...base, rules: 5 }, gen)).toBe(true);
    vi.setSystemTime(T0);
    expect(await vault.writeFold({ ...base, rules: 4 }, gen)).toBe(true);
  });
});

describe('notes.ts (proposed)', () => {
  it('C19: a base is used once: a second base by the same writer with no notes between does not re-pair the edit', async () => {
    const { replacedNotes } = await import('$core/notes');
    const t = (ms: number, dev: string) => hlcEncode({ wall: 1_789_520_000_000 + ms, count: 0, device: dev });
    const A = 'aaaaaaaaaaaat1t1', B = 'bbbbbbbbbbbbt1t1';
    const ch = (ms: number, dev: string, field: string, value: unknown) => ({ t: t(ms, dev), kind: 'accession' as const, id: 'r1', field, value });
    const log = [ch(0, A, 'notes', 'one'), ch(1, B, 'notes', 'two'), ch(2, A, 'notes', 'three'), ch(3, A, 'notesBase', t(1, B)), ch(4, A, 'notesBase', t(0, A))];
    // A's edit was made from B's text: knowing. The stray later base (an older build's lone write) must not re-pair it.
    expect(replacedNotes(log as never).map((r) => r.text)).toEqual(['one']);
  });
});

describe('a replace from a backup takes the file\'s parked set (proposed; round fifty-eight 2.11)', () => {
  it('C44: the broken clock\'s change stays parked after a replace and a reload', async () => {
    const stamp = (wall: number, count = 0) => hlcEncode({ wall, count, device: 'bbbbbbbbbbbb' });
    const base0 = Date.now() - DAY;
    const plant: Change[] = [
      { t: stamp(base0, 0), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(base0, 1), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(base0, 2), kind: 'accession', id: 'p1', field: 'acc', value: '2024-0001' }
    ];
    const odd: Change = { t: stamp(base0, 3), kind: 'accession', id: 'p1', field: 'notes', value: 'from a broken clock' };
    vi.resetModules();
    let vault = await import('$lib/db/vault');
    let io = await import('$lib/backup/io');
    let { collection } = await import('$lib/db/collection.svelte');
    await vault.appendChanges([...plant, odd], true);
    await vault.setMeta('parked', [odd.t]);
    await collection.load();
    const prepared = await io.prepareBackup();
    await vault.wipeVault();
    await wipeMeta(vault);
    await vault.setMeta('device', 'cccccccccccc');
    vi.resetModules();
    vault = await import('$lib/db/vault'); io = await import('$lib/backup/io'); ({ collection } = await import('$lib/db/collection.svelte'));
    await collection.load();
    await io.restoreBackup(await io.openBackup(new File([prepared.blob], prepared.name)), 'replace');
    vi.resetModules();
    vault = await import('$lib/db/vault'); ({ collection } = await import('$lib/db/collection.svelte'));
    await collection.load();
    expect(collection.accession('p1')?.taxonName).toBe('Lithops lesliei');
    expect(collection.accession('p1')?.notes).toBeUndefined();
    expect(await vault.getMeta('parked')).toEqual([odd.t]);
  });
});

/**
 * Round fifty-eight, the client review's reproductions turned round: a held change reaches the fold's held list through
 * the pull, so an edit made here meanwhile is stamped past it; a text replaced unseen is read from the log however it
 * came due, and nothing is written; a batch from the server that cannot be stored is not "this change was not saved";
 * the grower's own write is checked as a pull is; a snapshot under rules no build reads any more is replaced after an
 * hour; and a backup carries the parked set. Real vault over fake-indexeddb, as fold-snapshot.test.ts does.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import { replacedNotes } from '$core/notes';
import type { Change } from '$core/log';
import { buildBackup, readBackup } from '$lib/backup/backup';

type Store = typeof import('$lib/db/collection.svelte');
type Vault = typeof import('$lib/db/vault');

const DEV = 'aaaaaaaaaaaa';
const PEER = 'bbbbbbbbbbbbq0q0';

async function boot(): Promise<{ store: Store; vault: Vault }> {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { store, vault };
}

beforeEach(async () => {
  vi.useRealTimers();
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault); // every key, not the ones a test remembered to reset (round fifty-nine)
  await vault.setMeta('device', DEV);
});
afterEach(() => vi.useRealTimers());

describe('a held change goes through the collection (the client review\'s finding 8)', () => {
  it('a batch whose every change is held is on the fold\'s held list, so an edit made here meanwhile is stamped past it', async () => {
    const b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea' } as never);
    const ahead = Date.now() + 10 * 60_000;
    const peer: Change[] = [{ t: hlcEncode({ wall: ahead, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'sourceFrom', value: 'peer, fast clock' }];
    await b.store.collection.ingest(peer, 'server'); // what takeBatch does now, held changes and all
    expect(b.store.collection.accession(p.id)!.sourceFrom ?? null).toBeNull(); // held: in the log, not in the state
    expect(b.store.collection.heldList()).toEqual([peer[0].t]);
    await b.store.collection.put('accession', p.id, { sourceFrom: 'typed here after the pull' });
    const mine = (await b.vault.allChanges()).find((c) => c.value === 'typed here after the pull')!;
    expect(mine.t > peer[0].t).toBe(true); // the grower's edit wins when the held one comes due
  });
  it('a notes text replaced by a held change that came due across a reload is read as replaced, and nothing is written', async () => {
    const T0 = Date.now();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    let b = await boot();
    await b.store.collection.load();
    const p = await b.store.collection.addAccession({ taxonName: 'Copiapoa cinerea', acc: '2026-0001' } as never);
    await b.store.collection.put('accession', p.id, { notes: 'my text, written here' });
    const ahead = T0 + 10 * 60_000;
    const peer: Change[] = [
      { t: hlcEncode({ wall: ahead, count: 0, device: PEER }), kind: 'accession', id: p.id, field: 'notes', value: 'their text' },
      { t: hlcEncode({ wall: ahead, count: 1, device: PEER }), kind: 'accession', id: p.id, field: 'notesBase', value: null }
    ];
    await b.store.collection.ingest(peer, 'server');
    vi.setSystemTime(T0 + 11 * 60_000); // due
    // Taken before the reload, and whole: the load is a reading too, and a count would miss a change replaced in place (round fifty-nine).
    const before = JSON.stringify(await b.vault.allChanges());
    b = await boot(); // the page reloaded after it came due: the load folds it
    await b.store.collection.load();
    expect(b.store.collection.accession(p.id)!.notes).toBe('their text');
    expect((await b.store.collection.replacedNotes('accession', p.id)).map((r) => r.text)).toEqual(['my text, written here']);
    await b.store.collection.ingest(peer, 'server'); // the engine's refold, next run
    expect(JSON.stringify(await b.vault.allChanges())).toBe(before); // rule 5: nothing written by the load or either reading
  });
});

describe('what is said on the record pages (the client review\'s finding 10)', () => {
  it('a batch from the server that cannot be stored is the sync page\'s to report, not "this change was not saved"', async () => {
    const b = await boot();
    await b.store.collection.load();
    await b.vault.setMeta('sync', { key: 'new-vault-key' });
    const c: Change = { t: hlcEncode({ wall: Date.now() - 1000, count: 0, device: PEER }), kind: 'taxon', id: 'lithops-lesliei', field: 'name', value: 'Lithops lesliei' };
    await expect(b.store.collection.ingest([c], 'server', { requireKey: 'old-vault-key' })).rejects.toThrow(/stopped/);
    expect(b.store.collection.lastWriteError).toBeNull();
  });
  it('the grower\'s own write is checked as a pull is: a place form\'s "1e999" is refused with the reason, and nothing is stored', async () => {
    const b = await boot();
    await b.store.collection.load();
    const before = (await b.vault.allChanges()).length;
    await expect(b.store.collection.put('location', 'l-test', { name: 'Bench', floorC: Number('1e999') })).rejects.toThrow(/floorC of a location must be a finite number/);
    expect(b.store.collection.lastWriteError).toMatch(/floorC/);
    expect((await b.vault.allChanges()).length).toBe(before);
  });
});

describe('a snapshot under rules no build reads any more (the client review\'s finding 12)', () => {
  it('is kept from an older build for an hour after its last write, then replaced', async () => {
    const { vault } = await boot();
    const gen = await vault.foldGen();
    const snap = (rules: number) => ({ rules, build: 'x', device: DEV, offset: 0, seq: 0, records: [], seen: [], born: [], parents: [], held: [], last: '', changes: 0 });
    expect(await vault.writeFold(snap(9), gen)).toBe(true); // a newer build's
    expect(await vault.writeFold(snap(3), gen)).toBe(false); // an older shell open beside it
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + vault.NEWER_FOLD_KEPT_MS + 1000); // the newer build rolled back: nobody writes rules 9 any more
    expect(await vault.writeFold(snap(3), gen)).toBe(true);
    expect((await vault.readFold())!.fold.rules).toBe(3);
  });
});

describe('a backup carries the parked set (the client review)', () => {
  it('the manifest names the parked stamps the file holds, and reading it back gives them', async () => {
    const t = (n: number) => hlcEncode({ wall: 1_790_000_000_000 + n, count: 0, device: PEER });
    const changes: Change[] = [{ t: t(1), kind: 'taxon', id: 'aloe-vera', field: 'name', value: 'Aloe vera' }, { t: t(2), kind: 'taxon', id: 'aloe-vera', field: 'followed', value: true }];
    const built = await buildBackup({ changes, parked: [t(2), t(99)], readPhoto: async () => null });
    const read = await readBackup(built.bytes);
    expect(read.manifest.parked).toEqual([t(2)]); // a stamp the file does not hold is not named
  });
});

describe('notes replaced unseen, the rule (src/lib/core/notes.ts)', () => {
  const s = (wall: number, device: string, count = 0) => hlcEncode({ wall, count, device });
  const n = (t: string, field: string, value: unknown): Change => ({ t, kind: 'accession', id: 'r1', field, value });
  it('an edit made from the text it replaced is knowing; one made from another, or with no base, is unseen; an empty text or the same text is nothing', () => {
    const a = s(1000, 'aaaaaaaaaaaatab1'), b = s(2000, 'bbbbbbbbbbbbtab1'), c = s(3000, 'aaaaaaaaaaaatab1');
    expect(replacedNotes([n(a, 'notes', 'one'), n(b, 'notes', 'two'), n(s(2000, 'bbbbbbbbbbbbtab1', 1), 'notesBase', a)])).toEqual([]);
    expect(replacedNotes([n(a, 'notes', 'one'), n(b, 'notes', 'two'), n(s(2000, 'bbbbbbbbbbbbtab1', 1), 'notesBase', 'x')])).toEqual([{ text: 'one', was: a, by: b }]);
    expect(replacedNotes([n(a, 'notes', 'one'), n(b, 'notes', 'two')])).toEqual([{ text: 'one', was: a, by: b }]);
    expect(replacedNotes([n(a, 'notes', ''), n(b, 'notes', 'two')])).toEqual([]);
    expect(replacedNotes([n(a, 'notes', 'one'), n(b, 'notes', 'one')])).toEqual([]);
    // a base of another writer is not this edit's; its own writer's is, even with another writer's notes stamped between (round fifty-nine)
    expect(replacedNotes([n(a, 'notes', 'one'), n(b, 'notes', 'two'), n(s(2000, 'cccccccccccctab1', 1), 'notesBase', a)])).toEqual([{ text: 'one', was: a, by: b }]);
    expect(replacedNotes([n(a, 'notes', 'one'), n(b, 'notes', 'two'), n(c, 'notes', 'three'), n(s(3000, 'bbbbbbbbbbbbtab1', 1), 'notesBase', a)]).map((r) => r.text)).toEqual(['two']);
  });
});

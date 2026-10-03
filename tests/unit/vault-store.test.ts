/**
 * The vault on a real (in-memory) IndexedDB: what `storeIn` keeps when two changes arrive under one stamp, what it
 * reports back, and the ledger it fills (round sixteen, 4); the meta write that refuses once the stored key has gone
 * (round sixteen, 1).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appendChanges, allChanges, outboxKeys, outboxAck, getMeta, setMeta, setMetaIfKey, wipeVault } from '$lib/db/vault';
import { hlcEncode, hlcDecode, hlcCompare, MAX_AHEAD_MS } from '$core/hlc';
import type { Change } from '$core/log';

const t = (count: number) => hlcEncode({ wall: 1_700_000_000_000, count, device: 'aaaaaaaaaaaa' });
const ch = (count: number, id: string, field: string, value: unknown): Change => ({ t: t(count), kind: 'accession', id, field, value });

beforeEach(async () => {
  await wipeVault().catch(() => {});
  await setMeta('issued:accession', []);
  await setMeta('sync', null);
});

describe('two changes under one stamp', () => {
  it('the vault keeps the one that ranks higher by content, whichever arrived first, tells the caller which, and puts only that on the ledger', async () => {
    const a = ch(0, 'v2-2024-0001-e0', 'acc', '2024-0001'); // the same event named two ways by two devices, under one stamp
    const b = ch(0, 'v2-2024-0001-e7', 'acc', '2024-0002');
    // device one met a then b
    expect((await appendChanges([a], true)).kept).toEqual([a]);
    expect(await appendChanges([b], true)).toMatchObject({ kept: [b], replaced: [a] }); // b ranks higher (its id sorts later): it replaces a on disk and is reported as kept
    const one = await allChanges();
    expect(one).toEqual([b]);
    // the other order (a second pair, under the next stamp): the higher-ranking one is kept again
    const c = ch(1, 'v2-2024-0003-e0', 'acc', '2024-0003');
    const d = ch(1, 'v2-2024-0003-e7', 'acc', '2024-0004');
    expect((await appendChanges([d], true)).kept).toEqual([d]);
    expect(await appendChanges([c], true)).toMatchObject({ kept: [], replaced: [] }); // c ranks lower: declined, and the caller is told nothing was kept
    const two = await allChanges();
    expect(two).toEqual([b, d]); // the same log whichever order a device met each pair in
    const issued = (await getMeta<string[]>('issued:accession')) ?? [];
    expect(issued).toContain('2024-0002');
    expect(issued).toContain('2024-0004');
    expect(issued).not.toContain('2024-0003'); // the declined change's number was not put on the ledger
  });
  it('the same change twice is a re-send: stored once, reported kept', async () => {
    const a = ch(0, 'X', 'notes', 'n');
    expect((await appendChanges([a], true)).kept).toEqual([a]);
    expect((await appendChanges([{ ...a }], true)).kept).toEqual([a]);
    expect(await allChanges()).toEqual([a]);
    expect(await outboxKeys()).toEqual([]);
  });
});

describe('the meta write that checks the stored key', () => {
  it('writes while the stored record carries the key, refuses once it is null or another vault\'s', async () => {
    await setMeta('sync', { key: 'K1', since: 1 });
    expect(await setMetaIfKey('sync', { key: 'K1', since: 2 }, 'K1')).toBe(true);
    expect(await getMeta<{ since: number }>('sync')).toMatchObject({ since: 2 });
    await setMeta('sync', null);
    expect(await setMetaIfKey('sync', { key: 'K1', since: 3 }, 'K1')).toBe(false);
    expect(await getMeta('sync')).toBeNull();
    await setMeta('sync', { key: 'K2', since: 0 });
    expect(await setMetaIfKey('sync', { key: 'K1', since: 3 }, 'K1')).toBe(false);
    expect(await getMeta<{ key: string }>('sync')).toMatchObject({ key: 'K2' });
  });
});

describe('writes guarded by the stored sync key (round seventeen, A1)', () => {
  it('an ack under a key the stored record no longer carries is refused, in the same transaction, and the outbox is untouched', async () => {
    const a = ch(0, 'X', 'notes', 'n');
    await appendChanges([a], false);
    expect(await outboxKeys()).toEqual([a.t]);
    await setMeta('sync', { key: 'K2' });
    await expect(outboxAck([a.t], 'K1')).rejects.toThrow(/stopped/);
    expect(await outboxKeys()).toEqual([a.t]);
    await outboxAck([a.t], 'K2');
    expect(await outboxKeys()).toEqual([]);
  });
  it('a server write under a key the stored record no longer carries writes nothing', async () => {
    await setMeta('sync', { key: 'K2' });
    await expect(appendChanges([ch(0, 'X', 'notes', 'n')], true, false, 'K1')).rejects.toThrow(/stopped/);
    expect(await allChanges()).toEqual([]);
    expect((await appendChanges([ch(0, 'X', 'notes', 'n')], true, false, 'K2')).kept.length).toBe(1);
  });
});

describe('a displaced change leaves the screen (round seventeen, 3)', () => {
  it('the collection re-folds from the log when the vault replaced a stored change, in the writing tab; two under one stamp in one batch keep the higher', async () => {
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const a = ch(0, 'ghost', 'taxonName', 'Aloe');
    const b = ch(0, 'kept', 'taxonName', 'Lithops'); // ranks higher (its id sorts later)
    await collection.ingest([a, ch(2, 'ghost', 'status', 'growing'), ch(3, 'kept', 'status', 'growing')], 'server', { repair: false });
    expect(collection.accessions.map((r) => r.id)).toEqual(['ghost']);
    await collection.ingest([b], 'server', { repair: false });
    expect(collection.accessions.map((r) => r.id)).toEqual(['kept']); // the ghost is gone without a reload (its name displaced, it is not whole)
    expect((await allChanges()).filter((c) => c.field === 'taxonName').map((c) => c.id)).toEqual(['kept']);
    const c = ch(1, 'one', 'taxonName', 'Conophytum');
    const d = ch(1, 'two', 'taxonName', 'Crassula');
    const out = await appendChanges([c, d], true);
    expect(out.kept.map((x) => x.id)).toEqual(['two']); // reduced to one per stamp by rank, not by order
    expect((await allChanges()).filter((x) => x.field === 'taxonName').map((x) => x.id).sort()).toEqual(['kept', 'two']);
  });
});

describe('a duplicate number already in the log is repaired at load (round thirty-eight, R2-1)', () => {
  it('two whole plants under one number: the later-created one is renumbered before the collection is ready, with the note', async () => {
    await appendChanges([
      ch(10, 'a1', 'acc', '2026-0013'), ch(11, 'a1', 'taxonName', 'Welwitschia mirabilis'), ch(12, 'a1', 'status', 'growing'),
      ch(13, 'a2', 'acc', '2026-0013'), ch(14, 'a2', 'taxonName', 'Welwitschia mirabilis'), ch(15, 'a2', 'status', 'growing')
    ], true);
    vi.resetModules(); // a fresh store, as a new tab has: its load must do the repair by itself
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const nos = collection.accessions.map((r) => r.acc).sort();
    expect(nos).toEqual(['2026-0013', '2026-0014']);
    expect(collection.accession('2026-0014')?.id).toBe('a2');
    expect((await allChanges()).some((c) => c.kind === 'event' && c.field === 'note' && /Renumbered from 2026-0013 to 2026-0014/.test(String(c.value)))).toBe(true);
  });
});

describe('the oldest record shape is given its number as a field at load (round forty-one, R4)', () => {
  it('a plant whose number is its id gets an `acc` change, once; a batch likewise gets `no`; a record that has one is untouched', async () => {
    await appendChanges([
      ch(20, '2019-0003', 'taxonName', 'Haworthia attenuata'), ch(21, '2019-0003', 'status', 'growing'),
      ch(22, 'r7', 'acc', '2026-0007'), ch(23, 'r7', 'taxonName', 'Lithops'), ch(24, 'r7', 'status', 'growing'),
      { t: t(25), kind: 'sowing', id: 'S2024-002', field: 'taxonName', value: 'Aloe' }, { t: t(26), kind: 'sowing', id: 'S2024-002', field: 'method', value: 'seed' }, { t: t(27), kind: 'sowing', id: 'S2024-002', field: 'sown', value: '2024-03-01' }, { t: t(28), kind: 'sowing', id: 'S2024-002', field: 'count', value: 3 }, { t: t(29), kind: 'sowing', id: 'S2024-002', field: 'status', value: 'active' }
    ], true);
    vi.resetModules();
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const all = await allChanges();
    expect(all.filter((c) => c.kind === 'accession' && c.id === '2019-0003' && c.field === 'acc').map((c) => c.value)).toEqual(['2019-0003']);
    expect(all.filter((c) => c.kind === 'accession' && c.id === 'r7' && c.field === 'acc')).toHaveLength(1); // the one it had
    expect(all.filter((c) => c.kind === 'sowing' && c.id === 'S2024-002' && c.field === 'no').map((c) => c.value)).toEqual(['S2024-002']);
    expect(collection.accession('2019-0003')?.acc).toBe('2019-0003');
  });
});

describe('the written number never beats a person\'s, and is not written where it might (round forty-nine, 1; round thirty-five, R1-1)', () => {
  it('the `acc` change is stamped below the record\'s oldest change, so a number edit made anywhere, at any time, outranks it', async () => {
    await appendChanges([ch(20, '2019-0003', 'taxonName', 'Haworthia attenuata'), ch(21, '2019-0003', 'status', 'growing')], true);
    vi.resetModules();
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const written = (await allChanges()).find((c) => c.id === '2019-0003' && c.field === 'acc')!;
    expect(written).toBeTruthy();
    expect(hlcCompare(written.t, t(20))).toBeLessThan(0);
    // The other device renumbered the plant while offline, before this load ran; its change arrives later and still wins.
    await collection.ingest([ch(19, '2019-0003', 'acc', '2019-0001')], 'server', { repair: false });
    expect(collection.accession('2019-0001')?.id).toBe('2019-0003');
  });
  it('a record whose log already holds a number change (one the fold is holding, stamped far ahead) is left alone, as is an incomplete record', async () => {
    const ahead = hlcEncode({ wall: Date.now() + MAX_AHEAD_MS + 3_600_000, count: 0, device: 'bbbbbbbbbbbb' });
    await appendChanges([
      ch(20, '2019-0003', 'taxonName', 'Haworthia attenuata'), ch(21, '2019-0003', 'status', 'growing'), { t: ahead, kind: 'accession', id: '2019-0003', field: 'acc', value: '2019-0009' },
      ch(30, '2019-0004', 'taxonName', 'Lithops') // no status: not whole, so not a plant this build may shape
    ], true);
    vi.resetModules();
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    const all = await allChanges();
    expect(all.filter((c) => c.id === '2019-0003' && c.field === 'acc').map((c) => c.t)).toEqual([ahead]);
    expect(all.filter((c) => c.id === '2019-0004' && c.field === 'acc')).toHaveLength(0);
  });
});

describe('an edit made while a peer\'s change to the field is held keeps the field when the held change comes due (round forty-nine, 1)', () => {
  it('the local stamp is bumped past the held one', async () => {
    const ahead = hlcEncode({ wall: Date.now() + MAX_AHEAD_MS + 3_600_000, count: 0, device: 'bbbbbbbbbbbb' });
    await appendChanges([ch(20, 'p1', 'acc', '2026-0001'), ch(21, 'p1', 'taxonName', 'Lithops'), ch(22, 'p1', 'status', 'growing'), { t: ahead, kind: 'accession', id: 'p1', field: 'notes', value: 'from the wrong clock' }], true);
    vi.resetModules();
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    expect(collection.accession('2026-0001')?.notes).toBeUndefined(); // held
    await collection.put('accession', 'p1', { notes: 'what I see' });
    const mine = (await allChanges()).find((c) => c.id === 'p1' && c.field === 'notes' && c.value === 'what I see')!;
    expect(hlcCompare(mine.t, ahead)).toBeGreaterThan(0);
  });
  it('but not past one years ahead: that is a broken clock, and following it would carry it to every correct device (round fifty-one, 1)', async () => {
    const ahead = hlcEncode({ wall: Date.now() + 5 * 365 * 86_400_000, count: 0, device: 'bbbbbbbbbbbb' });
    await appendChanges([ch(20, 'p1', 'acc', '2026-0001'), ch(21, 'p1', 'taxonName', 'Lithops'), ch(22, 'p1', 'status', 'growing'), { t: ahead, kind: 'accession', id: 'p1', field: 'notes', value: 'from the 2031 phone' }], true);
    vi.resetModules();
    const { collection } = await import('$lib/db/collection.svelte');
    await collection.load();
    expect(collection.accession('2026-0001')?.notes).toBeUndefined(); // held
    await collection.put('accession', 'p1', { notes: 'what I see' });
    expect(collection.accession('2026-0001')?.notes).toBe('what I see'); // shown here, since the other is held
    const mine = (await allChanges()).find((c) => c.id === 'p1' && c.field === 'notes' && c.value === 'what I see')!;
    expect(hlcCompare(mine.t, ahead)).toBeLessThan(0); // stamped at real time: every correct device shows it at once
    expect(hlcDecode(mine.t).wall).toBeLessThan(Date.now() + MAX_AHEAD_MS);
  });
});

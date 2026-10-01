/**
 * The vault on a real (in-memory) IndexedDB: what `storeIn` keeps when two changes arrive under one stamp, what it
 * reports back, and the ledger it fills (round sixteen, 4); the meta write that refuses once the stored key has gone
 * (round sixteen, 1).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { appendChanges, allChanges, outboxKeys, outboxAck, getMeta, setMeta, setMetaIfKey, wipeVault } from '$lib/db/vault';
import { hlcEncode } from '$core/hlc';
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
    expect(await appendChanges([b], true)).toEqual({ kept: [b], replaced: [a] }); // b ranks higher (its id sorts later): it replaces a on disk and is reported as kept
    const one = await allChanges();
    expect(one).toEqual([b]);
    // the other order (a second pair, under the next stamp): the higher-ranking one is kept again
    const c = ch(1, 'v2-2024-0003-e0', 'acc', '2024-0003');
    const d = ch(1, 'v2-2024-0003-e7', 'acc', '2024-0004');
    expect((await appendChanges([d], true)).kept).toEqual([d]);
    expect(await appendChanges([c], true)).toEqual({ kept: [], replaced: [] }); // c ranks lower: declined, and the caller is told nothing was kept
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

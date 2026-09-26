/**
 * The vault on a real (in-memory) IndexedDB: what `storeIn` keeps when two changes arrive under one stamp, what it
 * reports back, and the ledger it fills (round sixteen, 4); the meta write that refuses once the stored key has gone
 * (round sixteen, 1).
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { appendChanges, allChanges, outboxKeys, getMeta, setMeta, setMetaIfKey, wipeVault } from '$lib/db/vault';
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
    expect(await appendChanges([a], true)).toEqual([a]);
    expect(await appendChanges([b], true)).toEqual([b]); // b ranks higher (its id sorts later): it replaces a on disk and is reported as kept
    const one = await allChanges();
    expect(one).toEqual([b]);
    // the other order (a second pair, under the next stamp): the higher-ranking one is kept again
    const c = ch(1, 'v2-2024-0003-e0', 'acc', '2024-0003');
    const d = ch(1, 'v2-2024-0003-e7', 'acc', '2024-0004');
    expect(await appendChanges([d], true)).toEqual([d]);
    expect(await appendChanges([c], true)).toEqual([]); // c ranks lower: declined, and the caller is told nothing was kept
    const two = await allChanges();
    expect(two).toEqual([b, d]); // the same log whichever order a device met each pair in
    const issued = (await getMeta<string[]>('issued:accession')) ?? [];
    expect(issued).toContain('2024-0002');
    expect(issued).toContain('2024-0004');
    expect(issued).not.toContain('2024-0003'); // the declined change's number was not put on the ledger
  });
  it('the same change twice is a re-send: stored once, reported kept', async () => {
    const a = ch(0, 'X', 'notes', 'n');
    expect(await appendChanges([a], true)).toEqual([a]);
    expect(await appendChanges([{ ...a }], true)).toEqual([a]);
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

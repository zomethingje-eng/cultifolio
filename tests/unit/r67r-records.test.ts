/**
 * Round sixty-seven, agent R: records (triage-66 R8, R9, R10). Real vault over fake IndexedDB where a load is needed.
 *  - R8 (the outside review's 19): "Renumber now" chooses from every number the log ever gave, and a sibling note whose
 *    "to" is not the record's number now is hidden.
 *  - R9 (the outside review's 22): a recorded time `w` is read only within sane bounds.
 *  - R10 (the self-review's E15, the outside review's 23): a malformed change in the log is skipped and counted, and a
 *    refused database is a failed state with a sentence.
 * Each case marked "base" failed on the round-sixty-six base.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import { readChanges, type Change } from '$core/log';
import { isRecordedTime, shownTime, W_MIN } from '$core/when';

const DEV = 'aaaaaaaaaaaa';
const DAY = 86_400_000;
const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  return { vault, collection: store.collection };
}
beforeEach(async () => {
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', DEV);
});
afterEach(() => vi.restoreAllMocks());

const rec = (id: string, no: string, wall: number, device = 'bbbbbbbbbbbb'): Change[] => [
  { t: stamp(wall, 0, device), kind: 'accession', id, field: 'taxonName', value: 'Lithops ' + id },
  { t: stamp(wall, 1, device), kind: 'accession', id, field: 'status', value: 'growing' },
  { t: stamp(wall, 2, device), kind: 'accession', id, field: 'acc', value: no }
];

describe('R8: Renumber now', () => {
  it('base: chooses past every number the log ever gave, not only the numbers records hold now', async () => {
    const T = Date.now() - 10 * DAY;
    const { vault, collection } = await boot();
    // X and Y were both given 2026-0007; device A renumbered Y to 0009 (it had Z at 0008), device B to 0008; B's won.
    await vault.appendChanges([
      ...rec('X', '2026-0007', T),
      ...rec('Y', '2026-0007', T + 1000),
      ...rec('Z', '2026-0008', T + 2000, 'cccccccccccc'),
      { t: stamp(T + 5000, 0, 'zzaaaaaaaaaaaaaa'), kind: 'accession', id: 'Y', field: 'acc', value: '2026-0009' },
      { t: stamp(T + 5000, 0, 'zzbbbbbbbbbbbbbb'), kind: 'accession', id: 'Y', field: 'acc', value: '2026-0008' }
    ], true);
    await collection.load();
    expect(collection.accession('Y')?.acc).toBe('2026-0008');
    expect(collection.sharesNumber('accession', 'Y')).toEqual(['Z']);
    expect(await collection.repairNumbers({ kind: 'accession', no: '2026-0008' })).toBe(true);
    // Z, made later, takes the next number never given: 2026-0009 was Y's for a moment, on device A and in the log.
    expect(collection.accession('Z')?.acc).toBe('2026-0010'); // base: 2026-0009
  });
  it('base: of two notes for one repair made two ways, the one whose "to" is the number now is shown', async () => {
    const T = Date.now() - 10 * DAY;
    const { vault, collection } = await boot();
    const note = (id: string, to: string, w: number, dev: string): Change[] => [
      { t: stamp(w, 0, dev), kind: 'event', id, field: 'acc', value: 'Y' },
      { t: stamp(w, 1, dev), kind: 'event', id, field: 'd', value: '2026-10-01' },
      { t: stamp(w, 2, dev), kind: 'event', id, field: 't', value: 'note' },
      { t: stamp(w, 3, dev), kind: 'event', id, field: 'note', value: `Renumbered from 2026-0007 to ${to}: another plant, recorded first, had been given 2026-0007 (on another device, or in a file merged in).` }
    ];
    await vault.appendChanges([...rec('Y', '2026-0007', T), { t: stamp(T + 5000, 0, 'zzbbbbbbbbbbbbbb'), kind: 'accession', id: 'Y', field: 'acc', value: '2026-0009' }, ...note('e_a', '2026-0009', T + 5001, 'zzaaaaaaaaaaaaaa'), ...note('e_b', '2026-0008', T + 5001, 'zzbbbbbbbbbbbbbb')], true);
    await collection.load();
    expect(collection.events('Y').map((e) => e.note?.slice(0, 40))).toEqual(['Renumbered from 2026-0007 to 2026-0009: ']); // base: both
  });
  it('a chain of repairs keeps every note: from 0007 to 0008, then from 0008 to 0010', async () => {
    const T = Date.now() - 10 * DAY;
    const { vault, collection } = await boot();
    const line = (id: string, from: string, to: string, w: number): Change[] => [
      { t: stamp(w, 0), kind: 'event', id, field: 'acc', value: 'Y' },
      { t: stamp(w, 1), kind: 'event', id, field: 'd', value: '2026-10-01' },
      { t: stamp(w, 2), kind: 'event', id, field: 't', value: 'note' },
      { t: stamp(w, 3), kind: 'event', id, field: 'note', value: `Renumbered from ${from} to ${to}: another plant, recorded first, had been given ${from} (on another device, or in a file merged in).` }
    ];
    await vault.appendChanges([...rec('Y', '2026-0010', T), ...line('e1', '2026-0007', '2026-0008', T + 1), ...line('e2', '2026-0008', '2026-0010', T + 2)], true);
    await collection.load();
    expect(collection.events('Y')).toHaveLength(2);
  });
});

describe('R9: a recorded time is read only within sane bounds', () => {
  const t = stamp(Date.UTC(2026, 9, 1));
  it('base: 1 (1970) and 1e300 are not recorded times', () => {
    expect(isRecordedTime(1)).toBe(false);
    expect(isRecordedTime(1e300)).toBe(false);
    expect(isRecordedTime(W_MIN - 1)).toBe(false);
    expect(isRecordedTime(Date.UTC(2026, 8, 1))).toBe(true);
  });
  it('base: one more than a day past its stamp\'s wall is not; one before it is (a marked stamp sits ahead of its time)', () => {
    expect(isRecordedTime(Date.UTC(2026, 9, 3), t)).toBe(false);
    expect(isRecordedTime(Date.UTC(2025, 9, 1), t)).toBe(true);
  });
  it('base: a change from outside keeps its value and loses a bogus w', () => {
    const { changes } = readChanges([{ t, kind: 'accession', id: 'r1', field: 'notes', value: 'x', w: 1 }]);
    expect(changes[0]).toEqual({ t, kind: 'accession', id: 'r1', field: 'notes', value: 'x' });
  });
  it('base: a marked stamp with a bogus w is shown by its wall', () => {
    const marked = hlcEncode({ wall: Date.UTC(2026, 9, 1), count: 0x800001, device: 'bbbbbbbbbbbb' });
    expect(shownTime({ t: marked, w: 1 })).toBe(Date.UTC(2026, 9, 1));
    expect(shownTime({ t: marked, w: Date.UTC(2025, 9, 1) })).toBe(Date.UTC(2025, 9, 1));
  });
});

describe('R10: a malformed change, and a refused database', () => {
  it('base: a change no build can fold is skipped and counted; the collection opens with the rest', async () => {
    const T = Date.now() - DAY;
    const { vault, collection } = await boot();
    await vault.appendChanges([...rec('p1', '2026-0001', T), { t: stamp(T + 10), kind: 'event', id: 'e1', field: 'id', value: 'x' } as Change], true);
    await collection.load(); // base: threw '"id" is a reserved record field', and the page stayed at "Opening…"
    expect(collection.ready).toBe(true);
    expect(collection.accessions.map((a) => a.id)).toEqual(['p1']);
    expect(collection.malformed).toBe(1);
    expect(await collection.snapshotWritten).toBe(false); // every load reads it again, and counts it
    const again = await boot();
    await again.collection.load();
    expect(again.collection.malformed).toBe(1);
  });
  it('base: a refused database is a failed state with a sentence, not "opening" for good', async () => {
    const { collection } = await boot();
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('A mutation operation was attempted on a database that did not allow mutations.', 'InvalidStateError'); });
    await expect(collection.load()).rejects.toBeTruthy();
    expect(collection.ready).toBe(false);
    expect(collection.failed).toMatch(/^This browser refused to open the storage the collection is kept in/);
  });
});

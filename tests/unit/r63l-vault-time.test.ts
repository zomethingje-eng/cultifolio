/**
 * Round sixty-three (agent L), L1: the recorded time beside the stamp (`w`) in the vault and in a backup. On a real
 * (in-memory) IndexedDB: the same change met twice keeps the earliest recorded time either copy carries, whatever order
 * it met them in, and a copy without one (a restore on a round-sixty-two build drops it) does not take it away. A backup
 * holding one is format 3, which a round-sixty-two build refuses with a sentence rather than restore without the times,
 * and this build reads it with the times kept. Each failed on the round-sixty-two base.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach } from 'vitest';
import * as v from 'valibot';
import { appendChanges, allChanges, wipeVault } from '$lib/db/vault';
import * as vaultModule from '$lib/db/vault';
import { hlcEncode, PAST_BIT } from '$core/hlc';
import type { Change } from '$core/log';
import { buildBackup, readBackup } from '$lib/backup/backup';
import { BACKUP_V } from '$lib/backup/format';

const t = (count: number) => hlcEncode({ wall: 1_760_000_000_000, count, device: 'zzrepair0000' });
const ch = (count: number, w?: number): Change => ({ t: t(count), kind: 'event', id: 'e_note', field: 'note', value: 'Renumbered from 0007 to 0008', ...(w === undefined ? {} : { w }) });

beforeEach(async () => {
  await wipeVault().catch(() => {});
  await wipeMeta(vaultModule);
});

describe('the vault keeps one recorded time per change', () => {
  it('two devices that wrote the same change at two times: the earliest is kept, in either order', async () => {
    await appendChanges([ch(0, 2000)], true);
    await appendChanges([ch(0, 1000)], true);
    await appendChanges([ch(1, 1000)], true);
    await appendChanges([ch(1, 2000)], true);
    expect((await allChanges()).map((c) => c.w)).toEqual([1000, 1000]);
  });
  it('a copy without a recorded time does not take it away; one with it fills it in', async () => {
    await appendChanges([ch(0, 1500)], true);
    await appendChanges([ch(0)], false);
    await appendChanges([ch(1)], true);
    await appendChanges([ch(1, 1700)], true);
    expect((await allChanges()).map((c) => c.w)).toEqual([1500, 1700]);
  });
});

describe('a backup with recorded times', () => {
  const log: Change[] = [
    { t: hlcEncode({ wall: 1_760_000_000_000, count: 0, device: 'aaaaaaaaaaaa' }), kind: 'accession', id: 'r1', field: 'taxonName', value: 'Aloe', w: 1_760_000_000_000 },
    { t: hlcEncode({ wall: 1_760_000_000_000, count: 1, device: 'aaaaaaaaaaaa' }), kind: 'accession', id: 'r1', field: 'status', value: 'growing', w: 1_760_000_000_000 },
    { t: hlcEncode({ wall: 1_790_000_000_000, count: PAST_BIT | 2, device: 'aaaaaaaaaaaa' }), kind: 'accession', id: 'r1', field: 'notes', value: 'placed past', w: 1_760_000_100_000 }
  ];
  it('is format 3, and this build reads it back with the times', async () => {
    expect(BACKUP_V).toBe(3);
    const { bytes } = await buildBackup({ changes: log, readPhoto: async () => null });
    const back = await readBackup(bytes);
    expect(back.manifest.v).toBe(3);
    expect(back.changes.map((c) => c.w)).toEqual(log.map((c) => c.w));
  });
  it('without recorded times it is written as before (1, or 2 with a marked stamp), for older builds to read', async () => {
    const strip = log.map(({ w: _w, ...c }) => (void _w, c));
    expect((await readBackup((await buildBackup({ changes: strip.slice(0, 2), readPhoto: async () => null })).bytes)).manifest.v).toBe(1);
    expect((await readBackup((await buildBackup({ changes: strip, readPhoto: async () => null })).bytes)).manifest.v).toBe(2);
  });
  it('why: a reader of round sixty-two\'s rows (its `ChangeRow`, a valibot object) drops the field, silently', () => {
    const old = v.object({ t: v.string(), kind: v.string(), id: v.string(), field: v.string(), value: v.unknown() });
    const read = v.parse(v.array(old), log);
    expect(read.every((c) => !('w' in c))).toBe(true);
  });
});

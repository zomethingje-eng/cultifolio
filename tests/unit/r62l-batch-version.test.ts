/**
 * Round sixty-two (agent L), B8: a batch, and a backup, that holds a marked stamp says so by its version, so a build that
 * would misread the mark sets it aside (a batch) or refuses it with a sentence (a backup) rather than fold it otherwise.
 *  - `logBatch` seals version 2 when any change carries the mark and version 1 otherwise; its own reading of the mark is
 *    `isPastStamp`'s (limits.ts reads it without the clock module, so the Worker's bundle does not take it);
 *  - the backup's manifest is version 2 when the log holds a marked stamp, 1 otherwise; this build reads both, and refuses
 *    a newer one with a sentence, as round sixty's reader refuses a version 2 (checked in its source: "This backup was
 *    written by a newer Cultifolio (format 2); update the app to restore it.").
 * The backup half needs G's two lines (format.ts BACKUP_V = 2; backup.ts writes the version by the mark): see L's report.
 */
import { describe, it, expect } from 'vitest';
import { logBatch, BATCH_VERSIONS } from '$lib/sync/limits';
import { hlcEncode, hlcPast, isPastStamp, PAST_BIT, MAX_COUNT } from '$core/hlc';
import type { Change } from '$core/log';

const now = Date.UTC(2026, 9, 4, 12, 0, 0);
const plain = hlcEncode({ wall: now, count: 3, device: 'aaaaaaaaaaaa0000' });
const marked = hlcPast(hlcEncode({ wall: now + 365 * 86_400_000, count: 0, device: 'bbbbbbbbbbbb0000' }), 'aaaaaaaaaaaa0000');
const change = (t: string, value: string): Change => ({ t, kind: 'accession', id: 'p1', field: 'notes', value });

describe('batch versions', () => {
  it('a batch with a marked stamp is version 2; one without, and an empty one, version 1; this build reads both', () => {
    expect(logBatch('aaaaaaaaaaaa', [change(plain, 'a'), change(marked, 'b')]).v).toBe(2);
    expect(logBatch('aaaaaaaaaaaa', [change(plain, 'a')]).v).toBe(1);
    expect(logBatch('aaaaaaaaaaaa', []).v).toBe(1);
    expect([...BATCH_VERSIONS]).toEqual([1, 2]);
  });
  it('the batch\'s reading of the mark is isPastStamp\'s, at every edge of the counter', () => {
    const counts = [0, 1, 0xffff, 0x10000, PAST_BIT - 1, PAST_BIT, PAST_BIT + 1, MAX_COUNT];
    for (const count of counts) {
      const t = hlcEncode({ wall: now, count, device: 'cccccccccccc' });
      expect(logBatch('c', [change(t, 'x')]).v === 2).toBe(isPastStamp(t));
    }
  });
});

describe('backup versions', () => {
  it('a backup holding a marked stamp is version 2, one without is version 1, and this build reads both', async () => {
    const { buildBackup, readBackup } = await import('$lib/backup/backup');
    const two = await buildBackup({ changes: [change(plain, 'a'), change(marked, 'b')], readPhoto: async () => null });
    const one = await buildBackup({ changes: [change(plain, 'a')], readPhoto: async () => null });
    const a = await readBackup(two.bytes), b = await readBackup(one.bytes);
    expect([a.manifest.v, b.manifest.v]).toEqual([2, 1]);
    expect(a.changes.map((c) => c.t)).toEqual([plain, marked]);
  });
});

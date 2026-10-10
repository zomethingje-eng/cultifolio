/**
 * Round sixty-seven, triage-66 R6: adopted from the self-review's probe (rev66c-old-backup-parks), which failed on the
 * round-sixty-six base (the plant read bench-OLD) and passes with the fix: an older build's list is read as parks.
 * Review 66 (C): a round-sixty-one backup (format 1, app "cultifolio 3") lists the parks its device stored, and since
 * round sixty-two a restore reads none of them (`fileParks`). A change parked by its batch's arrival on every device (a
 * phone three days fast) is in the past by the time the file is restored, so nothing parks it again: it folds, and its
 * fast stamp outranks the edits the grower made after it.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

const stamp = (wall: number, count = 0, device = 'bbbbbbbbbbbb') => hlcEncode({ wall, count, device });
async function boot() {
  vi.resetModules();
  const vault = await import('$lib/db/vault');
  const store = await import('$lib/db/collection.svelte');
  const io = await import('$lib/backup/io');
  const backup = await import('$lib/backup/backup');
  return { vault, collection: store.collection, io, backup };
}
beforeEach(async () => {
  const { vault } = await boot();
  await vault.wipeVault();
  await wipeMeta(vault);
  await vault.setMeta('device', 'cccccccccccc');
});

describe('a round-sixty-one backup restored on this build', () => {
  it('a change every device parked by arrival stays parked: the edit made after it shows', async () => {
    const DAY = 86_400_000;
    const R = Date.now() - 30 * DAY; // a month ago
    const log: Change[] = [
      { t: stamp(R - DAY, 0, 'aaaaaaaaaaaa'), kind: 'accession', id: 'p1', field: 'taxonName', value: 'Lithops lesliei' },
      { t: stamp(R - DAY, 1, 'aaaaaaaaaaaa'), kind: 'accession', id: 'p1', field: 'status', value: 'growing' },
      { t: stamp(R - DAY, 2, 'aaaaaaaaaaaa'), kind: 'accession', id: 'p1', field: 'acc', value: '2026-0001' },
      // The phone three days fast, a month ago: parked by its batch's arrival on every device.
      { t: stamp(R + 3 * DAY, 0, 'fastfastfast'), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench-OLD' },
      // The grower moved the plant the next day, on a right clock: this is where it is.
      { t: stamp(R + DAY, 0, 'aaaaaaaaaaaa'), kind: 'accession', id: 'p1', field: 'locationId', value: 'bench-NOW' }
    ];
    const a = await boot();
    // The file as a round-sixty-one build wrote it: format 1, its app name, the stored park listed.
    const built = await a.backup.buildBackup({ changes: log, app: 'cultifolio 3', parked: [log[3].t], readPhoto: async () => null });
    await a.collection.load();
    const opened = await a.io.openBackup(new File([built.bytes as BlobPart], 'old.cultifolio.zip'));
    expect(opened.file.manifest.v).toBe(1);
    expect(opened.file.manifest.parked).toEqual([log[3].t]);
    await a.io.restoreBackup(opened, 'merge');
    // On the device that wrote the file, and on every synced device, the plant is on bench-NOW.
    expect(a.collection.accession('p1')?.locationId).toBe('bench-NOW');
  });
});

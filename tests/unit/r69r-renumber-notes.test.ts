/**
 * Round sixty-nine, agent R: Renumber's notes after a hand change (triage-68 R6; the self-review's D5). Two devices
 * repaired one plant offline, from 2026-0007 to 0009 and to 0008; the number the record shows is the repair that won,
 * and its note alone is shown (round sixty-seven, R8). Once the grower changed the number by hand (TOTORAL-1), neither
 * note's "to" was the number now, and the history showed no repair at all. Real vault over fake IndexedDB.
 */
import 'fake-indexeddb/auto';
import { wipeMeta } from './helpers/isolate';
import { it, expect, beforeEach, vi } from 'vitest';
import { hlcEncode } from '$core/hlc';
import type { Change } from '$core/log';

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
const rec = (id: string, no: string, wall: number): Change[] => [
  { t: stamp(wall, 0), kind: 'accession', id, field: 'taxonName', value: 'Lithops ' + id },
  { t: stamp(wall, 1), kind: 'accession', id, field: 'status', value: 'growing' },
  { t: stamp(wall, 2), kind: 'accession', id, field: 'acc', value: no }
];
/** A repair as `repairNumbers` writes it: the number change, then its note, under one writer and wall. */
const repair = (eid: string, to: string, wall: number, dev: string): Change[] => [
  { t: stamp(wall, 0, dev), kind: 'accession', id: 'Y', field: 'acc', value: to },
  { t: stamp(wall, 1, dev), kind: 'event', id: eid, field: 'acc', value: 'Y' },
  { t: stamp(wall, 2, dev), kind: 'event', id: eid, field: 'd', value: '2026-10-01' },
  { t: stamp(wall, 3, dev), kind: 'event', id: eid, field: 't', value: 'note' },
  { t: stamp(wall, 4, dev), kind: 'event', id: eid, field: 'note', value: `Renumbered from 2026-0007 to ${to}: another plant, recorded first, had been given 2026-0007 (on another device, or in a file merged in).` }
];
const notes = (c: { events(acc: string): Array<{ note?: string | null }> }) => c.events('Y').map((e) => e.note?.slice(0, 40)).filter((n) => n?.startsWith('Renumbered'));

it('base: after a hand change of the number, the note of the repair that won is still shown', async () => {
  const T = Date.now() - 10 * DAY;
  const { vault, collection } = await boot();
  await vault.appendChanges([...rec('Y', '2026-0007', T), ...repair('e_a', '2026-0009', T + 5000, 'zzaaaaaaaaaaaaaa'), ...repair('e_b', '2026-0008', T + 6000, 'zzbbbbbbbbbbbbbb')], true);
  await collection.load();
  expect(collection.accession('Y')?.acc).toBe('2026-0008');
  expect(notes(collection)).toEqual(['Renumbered from 2026-0007 to 2026-0008: ']);
  await collection.put('accession', 'Y', { acc: 'TOTORAL-1' });
  expect(notes(collection)).toEqual(['Renumbered from 2026-0007 to 2026-0008: ']); // base: []
});

/**
 * Round-five probes of the backup round trip through the real vault wiring
 * (io.ts) with an in-memory vault: export, wipe, import, and what comes back.
 *   QA_PROBES=1 npx vitest run tests/qa/round5-backup.probe.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import type { Change } from '$core/log';
import { buildBackup, readBackup, previewMerge } from '$lib/backup/backup';

const mem = { changes: new Map<string, Change>(), outbox: new Set<string>(), meta: new Map<string, unknown>(), photos: new Map<string, { id: string; blob: Blob; thumb: Blob }>() };
vi.mock('$lib/db/vault', () => ({
  allChanges: async () => [...mem.changes.values()],
  appendChanges: async (cs: Change[], fromServer = false) => {
    for (const c of cs) {
      mem.changes.set(c.t, c);
      if (!fromServer) mem.outbox.add(c.t);
    }
  },
  outboxKeys: async () => [...mem.outbox],
  outboxAck: async () => {},
  outboxFill: async () => 0,
  outboxClear: async () => mem.outbox.clear(),
  changesByKeys: async () => [],
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'testdevice',
  requestPersistence: async () => true,
  putPhotoBlobs: async (p: { id: string; blob: Blob; thumb: Blob }) => void mem.photos.set(p.id, p),
  getPhotoBlobs: async (id: string) => mem.photos.get(id),
  deletePhotoBlobs: async (id: string) => void mem.photos.delete(id),
  photoBlobIds: async () => [...mem.photos.keys()],
  wipeVault: async () => {
    mem.changes.clear();
    mem.outbox.clear();
    mem.photos.clear();
  }
}));

const { collection } = await import('$lib/db/collection.svelte');
const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, ...new Array(n).fill(n)]);

describe('export → wipe → import', () => {
  it('plants, events, places, sowings, followed species, species notes, the numbering scheme and photographs all come back; the restored log is queued for sync', async () => {
    await collection.load();
    await collection.setScheme({ mode: 'prefix', prefix: 'GH', width: 3 });
    const room = await collection.addLocation({ name: 'Glasshouse', parentId: null, lat: 51.5, lon: -0.1 });
    const a = await collection.addAccession({ taxonName: 'Copiapoa cinerea', acquired: '2026-03-01', locationId: room.id, notes: 'from the show' });
    await collection.addEvent({ acc: a.id, d: '2026-04-01', t: 'water' });
    const s = await collection.addSowing({ taxonName: 'Lithops', method: 'seed', sown: '2026-02-01', count: 10 });
    await collection.follow('ariocarpus-retusus', 'Ariocarpus retusus', 5, true);
    await collection.put('taxon', 'copiapoa-cinerea', { name: 'Copiapoa cinerea', gbifKey: 7, myNotes: 'keep dry in winter' });
    const p = await collection.addPhoto({ acc: a.id, d: '2026-04-02', w: 10, h: 10, bytes: 13, blob: new Blob([jpeg(10)]), thumb: new Blob([jpeg(3)]) });
    const before = { changes: mem.changes.size, photos: mem.photos.size };
    const zip = await buildBackup({ changes: [...mem.changes.values()], scheme: collection.scheme, readPhoto: async (id) => (mem.photos.has(id) ? { id, full: jpeg(10), thumb: jpeg(3) } : null) });
    // Wipe (a private window) and read the file back.
    mem.changes.clear();
    mem.photos.clear();
    mem.outbox.clear();
    const file = await readBackup(zip);
    expect(file.manifest?.scheme).toEqual({ mode: 'prefix', prefix: 'GH', width: 3 });
    expect(file.photoIds).toEqual([p.id]);
    const merge = previewMerge([], file.changes);
    expect(merge.fresh).toHaveLength(before.changes);
    // A fresh collection folds it: the same store instance is a module singleton, so start it over.
    vi.resetModules();
    const { collection: fresh } = await import('$lib/db/collection.svelte');
    await fresh.load();
    await fresh.ingest(file.changes);
    expect(fresh.accession(a.id)?.notes).toBe('from the show');
    expect(fresh.accession(a.id)?.acc).toBe(a.acc);
    expect(fresh.events(a.id).map((e) => e.t).sort()).toEqual(['acquire', 'water']);
    expect(fresh.locationName(room.id)).toBe('Glasshouse');
    expect(fresh.conditions(room.id).lat).toBe(51.5);
    expect(fresh.sowing(s.id)?.no).toBe(s.no);
    expect(fresh.taxon('ariocarpus-retusus')?.followed).toBe(true);
    expect(fresh.taxon('copiapoa-cinerea')?.myNotes).toBe('keep dry in winter');
    expect(fresh.mySpecies.get('ariocarpus-retusus')?.followed).toBe(true);
    expect(fresh.photo(p.id)).toBeDefined();
    expect(mem.outbox.size).toBe(before.changes); // every restored change will be pushed if sync is set up
    // The scheme is in the manifest but ingest() does not set it; only restoreBackup's 'replace' path does (io.ts:300). Merge leaves the device on its old scheme.
    expect(fresh.scheme).toEqual({ mode: 'prefix', prefix: 'GH', width: 3 }); // here only because meta survived the "wipe": a real private window starts at the default
  });
  it('a photo record whose pixels never made it into the zip is restored as a record with no pixels; sync then asks the server for it on every run and takes the 404 in silence', async () => {
    const changes: Change[] = [
      { t: '1700000000000-0000-dev', kind: 'accession', id: 'r1', field: 'taxonName', value: 'Aloe' },
      { t: '1700000000000-0001-dev', kind: 'accession', id: 'r1', field: 'status', value: 'growing' },
      { t: '1700000000000-0002-dev', kind: 'photo', id: 'pmissing00001', field: 'acc', value: 'r1' },
      { t: '1700000000000-0003-dev', kind: 'photo', id: 'pmissing00001', field: 'd', value: '2026-01-01' }
    ];
    const zip = await buildBackup({ changes, readPhoto: async () => null });
    const file = await readBackup(zip);
    expect(file.photoIds).toEqual([]);
    expect(file.changes.filter((c) => c.kind === 'photo')).toHaveLength(2);
    expect(file.manifest?.counts.photos).toBe(1);
    expect(file.manifest?.counts.photoBytes).toBe(0); // the manifest knows; the import preview does not say "1 photo has no pixels"
  });
});

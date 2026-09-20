/**
 * Round-five probes of the collection store (src/lib/db) against an in-memory
 * vault. Each `it` states a claim from the code's comments or the About/formats
 * pages; a probe that passes with a "// FINDING" assertion demonstrates the
 * defect, one that fails would mean the defect is gone. Probes marked FIXED
 * assert the behaviour after the phase-two fixes. Run with
 *   QA_PROBES=1 npx vitest run tests/qa/round5-collection.probe.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Change } from '$core/log';
import { hlcEncode, hlcDecode, MAX_AHEAD_MS } from '$core/hlc';
import { accNo, NUMBERING_SETTING } from '$lib/db/types';
import { mySpeciesOf } from '$lib/db/species-list';
import { importV2 } from '$lib/import/v2';

const mem: { changes: Change[]; meta: Map<string, unknown> } = { changes: [], meta: new Map() };
vi.mock('$lib/db/vault', () => ({
  allChanges: async () => [...mem.changes],
  appendChanges: async (c: Change[]) => void mem.changes.push(...c),
  getMeta: async (k: string) => mem.meta.get(k),
  setMeta: async (k: string, v: unknown) => void mem.meta.set(k, v),
  deviceId: async () => 'testdevice',
  requestPersistence: async () => true,
  putPhotoBlobs: async () => {},
  getPhotoBlobs: async () => undefined,
  deletePhotoBlobs: async () => {}
}));

const { collection } = await import('$lib/db/collection.svelte');

/** A change as another device would have stamped it. */
const remote = (wall: number, count: number, device: string, kind: Change['kind'], id: string, field: string, value: unknown): Change => ({ t: hlcEncode({ wall, count, device }), kind, id, field, value });

beforeEach(async () => {
  await collection.load();
});

describe('HLC drift guard (hlc.ts: "a device whose wall clock is wrong cannot rewrite history")', () => {
  it('FIXED (4): a change from a peer an hour ahead is held, not applied; this device\'s own edit shows', async () => {
    const a = await collection.addAccession({ taxonName: 'Copiapoa cinerea', notes: 'mine' });
    const ahead = Date.now() + 60 * 60_000;
    expect(ahead - Date.now()).toBeGreaterThan(MAX_AHEAD_MS);
    await collection.ingest([remote(ahead, 0, 'phoneahead00', 'accession', a.id, 'notes', 'from the fast phone')], 'server');
    expect(collection.accession(a.id)?.notes).toBe('mine'); // held: stored in the log, not shown
    await collection.put('accession', a.id, { notes: 'corrected here' });
    const last = mem.changes[mem.changes.length - 1];
    expect(last.value).toBe('corrected here');
    expect(collection.accession(a.id)?.notes).toBe('corrected here');
  });
  it('FIXED (4): a change stamped years in the future is held and the grower can still edit the field', async () => {
    const a = await collection.addAccession({ taxonName: 'Ariocarpus retusus', status: 'growing' });
    const y2031 = Date.parse('2031-01-01T00:00:00Z');
    await collection.ingest([remote(y2031, 0, 'phoneahead00', 'accession', a.id, 'status', 'dead')], 'server');
    expect(collection.accession(a.id)?.status).toBe('growing');
    await collection.put('accession', a.id, { status: 'dead' });
    await collection.put('accession', a.id, { status: 'growing' });
    expect(collection.accession(a.id)?.status).toBe('growing');
  });
});

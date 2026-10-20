/**
 * Round seventy-one, the merge: the needs the agents wrote for one another, where the merge itself wrote code.
 *   - F's need of B: `fillInatIds` records a carried id it checked and kept, so the page no longer says "iNaturalist
 *     taxon: not asked" of it (S-F5); a row the build wrote is left alone, so a rerun rewrites nothing.
 *   - B's and C's slip rules made one (S-B7, S-C9, S-F13): `judgeTaxon` decides a slip by C's `slipStanding`. A name GBIF
 *     accepts is the species' slip only when it is the same name by the same author spelt otherwise; by another author it
 *     is another plant, where B's word-level rule (Kew holds no row of it and accepts this species) took it.
 */
import { describe, it, expect } from 'vitest';
import { fillInatIds } from '$dossier/corpus-fills';
import { judgeTaxon } from '$dossier/sources/inat';
import { ownNames } from '$dossier/own-names';
import { referenceOf } from '$dossier/reference';
import type { JsonFetcher } from '$dossier/fetch';

type D = { key: number; name: { scientific: string; family?: string }; ids: { gbif?: number; inat?: number }; links: Record<string, string>; photos: unknown[]; upstream: Record<string, { status: string; at?: string; detail?: string }> };

describe("F's need: a carried id checked and kept is recorded", () => {
  const f = (async (url: string) => {
    if (url.startsWith('https://api.inaturalist.org/v1/taxa/')) return { status: 'ok', data: { results: [{ id: 135254, name: 'Copiapoa cinerea', rank: 'species', is_active: true, current_synonymous_taxon_ids: null }] } };
    return { status: 'refused', detail: `no fixture: ${url}` };
  }) as unknown as JsonFetcher;
  const run = async (row: D['upstream'][string]) => {
    const docs: Record<string, D> = { '1.json': { key: 1, name: { scientific: 'Copiapoa cinerea', family: 'Cactaceae' }, ids: { gbif: 1, inat: 135254 }, links: {}, photos: [], upstream: { 'inat.taxon': row } } }; // its GBIF key, as every keyed dossier holds it: since round seventy-nine a page without one is passed by (K)
    let writes = 0;
    const store = { files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { writes++; docs[k] = d as D; } };
    const c = await fillInatIds(store, f, () => '2026-10-15T00:00:00Z');
    expect(c.failed).toBeUndefined();
    return { row: docs['1.json'].upstream['inat.taxon'], writes };
  };
  it('a row that said "not asked" now says the id was checked, and when', async () => {
    const { row, writes } = await run({ status: 'skipped', at: 'x', detail: 'not asked' });
    expect(writes).toBe(1);
    expect(row).toEqual({ status: 'ok', at: '2026-10-15T00:00:00Z', detail: "iNaturalist's taxon 135254 (Copiapoa cinerea), kept from an earlier build, checked 2026-10-15: active and this species' own" });
  });
  it('a row the build wrote is left as it is (guard: a rerun writes nothing)', async () => {
    const was = { status: 'ok', at: 'x', detail: "iNaturalist's taxon 135254 (Copiapoa cinerea) is active" };
    const { row, writes } = await run(was);
    expect(writes).toBe(0);
    expect(row).toEqual(was);
  });
});

describe('the slip rule, one rule: a name GBIF accepts is a slip only by the same author', () => {
  const reference = referenceOf([{ key: 4252157, name: 'Othonna cakilefolia', family: 'Asteraceae' }]);
  const gbifSays = (author: string) => (async (url: string) => {
    if (url.includes('/species/match')) return { status: 'ok', data: { usageKey: 3094424, speciesKey: 3094424, scientificName: `Othonna cakilifolia ${author}`, canonicalName: 'Othonna cakilifolia', species: 'Othonna cakilifolia', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT' } };
    if (url.includes('name=Othonna%20cakilifolia')) return { status: 'ok', data: { results: [] } }; // Kew holds no row of the slip
    if (url.includes('name=Othonna%20cakilefolia')) return { status: 'ok', data: { results: [{ canonicalName: 'Othonna cakilefolia', scientificName: 'Othonna cakilefolia DC.', taxonomicStatus: 'ACCEPTED', rank: 'SPECIES' }] } };
    return { status: 'refused', detail: `no fixture: ${url}` };
  }) as unknown as JsonFetcher;
  const judge = (author: string) => judgeTaxon(gbifSays(author), 'Othonna cakilifolia', { key: 4252157, scientific: 'Othonna cakilefolia', authorship: 'DC.', family: 'Asteraceae', own: ownNames({ scientific: 'Othonna cakilefolia' }), heldElsewhere: () => false, reference });
  it("GBIF's same name by the species' own author is the species' (Othonna cakilifolia DC.)", async () => {
    const r = await judge('DC.');
    expect(r.status === 'ok' && r.data).toMatchObject({ take: true, why: expect.stringMatching(/spelt one letter otherwise$/) });
  });
  it('by another author it is another plant, not a slip (B\'s word-level rule took it)', async () => {
    const r = await judge('Harv.');
    expect(r.status === 'ok' && r.data).toMatchObject({ take: false, why: expect.stringMatching(/^GBIF holds Othonna cakilifolia Harv\. as a species: not taken$/) });
  });
});

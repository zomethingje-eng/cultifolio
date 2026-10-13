/**
 * Round seventy, triage-69 B1 (S-B1) and S-B7: an inactive iNaturalist id was followed to the one current taxon iNaturalist
 * names with no check of what that taxon is, in the build and in `--fill inat-ids`. Pinguicula chilensis (5667820) took
 * Pinguicula antarctica's 33 photographs, which this reference holds as a species of its own; Mammillaria karwinskiana
 * (7279748) was given Mammillaria geminata, a lump on another type; Tricyrtis formosana (2752120) a variety's taxon. A
 * follow is now taken only on `taxonByOlderNames`' rule. The iNaturalist and GBIF answers are those of 2026-10-12, in part.
 * Each case FAILED on the base (526ecaf) unless it says "guard"; the failure is noted on the line.
 */
import { describe, it, expect } from 'vitest';
import { buildDossier, CARRY_DAYS } from '$dossier/build';
import { checkIds, taxon, judgeTaxon } from '$dossier/sources/inat';
import { referenceOf } from '$dossier/reference';
import { ownNames } from '$dossier/own-names';
import { sameTypeNames } from '$dossier/sources/gbif';
import { fillInatIds, inatTaxonRow } from '$dossier/corpus-fills';
import { readFileSync } from 'node:fs';
import type { JsonFetcher } from '$dossier/fetch';

const INAT = 'https://api.inaturalist.org/v1';
const GBIF = 'https://api.gbif.org/v1';
const W = 'https://www.wikidata.org/w/api.php';

/** iNaturalist's taxa, as `/v1/taxa/<ids>` gave them on 2026-10-12. */
const TAXA: Record<number, { id: number; name: string; rank: string; is_active: boolean; current_synonymous_taxon_ids: number[] | null }> = {
  506182: { id: 506182, name: 'Pinguicula chilensis', rank: 'species', is_active: false, current_synonymous_taxon_ids: [816267] },
  816267: { id: 816267, name: 'Pinguicula antarctica', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  207131: { id: 207131, name: 'Mammillaria karwinskiana', rank: 'species', is_active: false, current_synonymous_taxon_ids: [1555516] },
  1555516: { id: 1555516, name: 'Mammillaria geminata', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  452312: { id: 452312, name: 'Tricyrtis formosana grandiflora', rank: 'variety', is_active: false, current_synonymous_taxon_ids: [452310] },
  452310: { id: 452310, name: 'Tricyrtis formosana formosana', rank: 'variety', is_active: true, current_synonymous_taxon_ids: null },
  452309: { id: 452309, name: 'Tricyrtis formosana', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  133599: { id: 133599, name: 'Dypsis lutescens', rank: 'species', is_active: false, current_synonymous_taxon_ids: [276548] },
  276548: { id: 276548, name: 'Chrysalidocarpus lutescens', rank: 'species', is_active: true, current_synonymous_taxon_ids: null }
};
/** iNaturalist's name search (plants, species and below), as it answered on 2026-10-12, in part. */
const SEARCH: Record<string, unknown[]> = {
  'Pinguicula chilensis': [{ id: 816267, name: 'Pinguicula antarctica', rank: 'species', matched_term: 'Pinguicula chilensis' }],
  'Mammillaria karwinskiana': [{ id: 1555516, name: 'Mammillaria geminata', rank: 'species', matched_term: 'Mammillaria karwinskiana' }, { id: 1556176, name: 'Mammillaria geminata geminata', rank: 'subspecies', matched_term: 'Mammillaria karwinskiana karwinskiana' }],
  'Tricyrtis formosana': [{ id: 452309, name: 'Tricyrtis formosana', rank: 'species', matched_term: 'Tricyrtis formosana' }, { id: 452310, name: 'Tricyrtis formosana formosana', rank: 'variety', matched_term: 'Tricyrtis formosana formosana' }]
};
/** GBIF's records and synonyms of the four species (2026-10-12, in part). */
const SPECIES: Record<number, { name: string; authorship: string; basionymKey?: number; synonyms: Array<{ key: number; canonicalName: string; scientificName: string; rank: string; basionymKey?: number }> }> = {
  5667820: { name: 'Pinguicula chilensis', authorship: 'Clos', synonyms: [{ key: 7983133, canonicalName: 'Pinguicula antarctica', scientificName: 'Pinguicula antarctica Donat', rank: 'SPECIES' }] },
  7279748: { name: 'Mammillaria karwinskiana', authorship: 'Mart.', synonyms: [{ key: 5619454, canonicalName: 'Mammillaria karwinskii', scientificName: 'Mammillaria karwinskii Lawr.', rank: 'SPECIES' }] },
  2752120: { name: 'Tricyrtis formosana', authorship: 'Baker', synonyms: [{ key: 2752121, canonicalName: 'Compsoa formosana', scientificName: 'Compsoa formosana (Baker) Kuntze', rank: 'SPECIES', basionymKey: 2752120 }] },
  2735935: { name: 'Dypsis lutescens', authorship: '(H.Wendl.) Beentje & J.Dransf.', basionymKey: 2735936, synonyms: [{ key: 2735936, canonicalName: 'Chrysalidocarpus lutescens', scientificName: 'Chrysalidocarpus lutescens H.Wendl.', rank: 'SPECIES' }, { key: 2735938, canonicalName: 'Areca flavescens', scientificName: 'Areca flavescens Voss', rank: 'SPECIES' }] }
};
/** The reference's species by name: Pinguicula antarctica (5667863) is one of its own. */
const REFERENCE = new Map([['pinguicula antarctica', 5667863], ...Object.entries(SPECIES).map(([k, s]) => [s.name.toLowerCase(), Number(k)] as [string, number])]);
const heldElsewhere = (key: number) => (name: string) => { const k = REFERENCE.get(name.toLowerCase()); return k != null && k !== key; };
const reference = referenceOf([...REFERENCE].map(([name, key]) => ({ key, name: name[0].toUpperCase() + name.slice(1) })));
/** GBIF's backbone match (verbose) of iNaturalist's names, 2026-10-13: Mammillaria geminata is its synonym of M. karwinskiana. */
const MATCH: Record<string, unknown> = {
  'Mammillaria geminata': { usageKey: 5620205, matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', speciesKey: 7279748, species: 'Mammillaria karwinskiana' }
};

/** The world of these species: GBIF, Wikidata giving `inat` as the item's iNaturalist id, iNaturalist. Every URL asked is kept. */
function world(key: number, inat: number, asked: string[] = [], refuse?: RegExp): JsonFetcher {
  const sp = SPECIES[key];
  return (async (url: string) => {
    asked.push(url);
    if (refuse?.test(url)) return { status: 'refused', detail: 'api.inaturalist.org 429' };
    const ok = (data: unknown) => ({ status: 'ok', data });
    let m: RegExpExecArray | null;
    if ((m = /\/v1\/taxa\/([\d,]+)/.exec(url))) return ok({ results: m[1].split(',').map(Number).flatMap((id) => (TAXA[id] ? [TAXA[id]] : [])) });
    if ((m = /\/v1\/taxa\?q=([^&]+)/.exec(url))) return ok({ results: SEARCH[decodeURIComponent(m[1])] ?? [] });
    if (url.startsWith(`${INAT}/observations`)) return ok({ results: [] });
    if ((m = /\/v1\/species\/match\?[^]*?name=([^&]+)/.exec(url))) return ok(MATCH[decodeURIComponent(m[1])] ?? { matchType: 'NONE' });
    if ((m = /\/v1\/species\/(\d+)\/synonyms/.exec(url))) return ok({ results: SPECIES[Number(m[1])]?.synonyms ?? [], endOfRecords: true });
    if ((m = /\/v1\/species\/(\d+)$/.exec(url))) { const s = SPECIES[Number(m[1])]; return s ? ok({ key: Number(m[1]), scientificName: `${s.name} ${s.authorship}`, canonicalName: s.name, authorship: s.authorship, rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae', basionymKey: s.basionymKey }) : { status: 'none' }; }
    if (url.startsWith(`${GBIF}/species/`) || url.startsWith(`${GBIF}/occurrence/`)) return ok({ results: [], endOfRecords: true });
    if (url.includes('srsearch=haswbstatement%3AP846%3D' + key)) return ok({ query: { search: [{ title: 'Q1' }] } });
    if (url.startsWith(`${W}?action=wbgetentities`)) return ok({ entities: { Q1: { claims: { P3151: [{ mainsnak: { datavalue: { value: String(inat) } } }] } } } });
    return { status: 'none' };
  }) as unknown as JsonFetcher;
}
const build = (key: number, inat: number, asked?: string[], extra: Record<string, unknown> = {}) =>
  buildDossier(key, { fetcher: world(key, inat, asked, extra.refuse as RegExp | undefined), builtBy: 'node', now: () => new Date('2026-10-12T12:00:00Z'), skip: ['commons', 'openalex', 'wikipedia'], heldElsewhere: heldElsewhere(key), reference, ...extra });

describe('the build follows an inactive id only to this species', () => {
  it('Pinguicula chilensis is not given Pinguicula antarctica, another species of this reference', async () => {
    const asked: string[] = [];
    const r = await build(5667820, 506182, asked);
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBeUndefined(); // base: 816267
    expect(asked.some((u) => u.includes('observations?taxon_id=816267'))).toBe(false);
    expect(r.dossier.upstream['inat.taxon']).toMatchObject({ status: 'none', detail: "iNaturalist's taxon 506182 (Pinguicula chilensis) is inactive; its current taxon 816267 (Pinguicula antarctica) is not this species: Pinguicula antarctica is another species of this reference; asked by name; not taken: iNaturalist files Pinguicula chilensis as Pinguicula antarctica, another species of this reference" }); // round seventy, the owner's run: the reason given
  });
  it('Mammillaria karwinskiana keeps Mammillaria geminata, which GBIF holds as its synonym (round seventy, the owner\'s run)', async () => {
    const r = await build(7279748, 207131);
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBe(1555516); // m70: none, "not one of this species' names"
    expect(r.dossier.upstream['inat.taxon'].detail).toBe("iNaturalist's taxon 207131 (Mammillaria karwinskiana) is inactive; followed to its current taxon 1555516 (Mammillaria geminata): GBIF holds Mammillaria geminata as this species");
  });
  it('with no reference to read GBIF against, a name not the species\' own is not taken (guard)', async () => {
    const r = await build(7279748, 207131, [], { reference: undefined });
    expect(r.ok && r.dossier.ids.inat).toBeUndefined();
  });
  it('Tricyrtis formosana is not given a variety\'s taxon, and finds its own by name', async () => {
    const r = await build(2752120, 452312);
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBe(452309); // base: 452310
  });
  it('Dypsis lutescens follows its id to Chrysalidocarpus lutescens, its basionym (guard)', async () => {
    const r = await build(2735935, 133599);
    expect(r.ok && r.dossier.ids.inat).toBe(276548);
  });
  it('the record names the taxon followed to', async () => {
    const r = await build(2735935, 133599);
    expect(r.ok && r.dossier.upstream['inat.taxon'].detail).toBe("iNaturalist's taxon 133599 (Dypsis lutescens) is inactive; followed to its current taxon 276548 (Chrysalidocarpus lutescens)"); // base: "… current taxon 276548", the taxon unnamed
  });
  it('an active id is recorded as checked (S-B7)', async () => {
    const r = await build(2752120, 452309);
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.upstream['inat.taxon']).toMatchObject({ status: 'ok', detail: "iNaturalist's taxon 452309 (Tricyrtis formosana), as Wikidata gives it, is active" }); // base: no row
  });
  it('a check iNaturalist refuses keeps the id and says it was not checked (guard; mutation B1)', async () => {
    const r = await build(2752120, 452309, [], { refuse: /\/v1\/taxa\/452309/ });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBe(452309);
    expect(r.dossier.upstream['inat.taxon']).toMatchObject({ status: 'refused', detail: 'iNaturalist taxon 452309 not checked: api.inaturalist.org 429' });
  });
});

describe('the rule and its parts', () => {
  it('a taxon is refused when the reference holds it as another species, and taken when GBIF holds it as this one', async () => {
    const own = ownNames({ scientific: 'Mammillaria karwinskiana', synonyms: [] });
    const f = world(7279748, 0);
    expect(await judgeTaxon(f, 'Pinguicula antarctica', { key: 5667820, scientific: 'Pinguicula chilensis', own: ownNames({ scientific: 'Pinguicula chilensis' }), heldElsewhere: heldElsewhere(5667820), reference })).toEqual({ status: 'ok', data: { take: false, why: 'Pinguicula antarctica is another species of this reference' } });
    expect(await judgeTaxon(f, 'Mammillaria geminata', { key: 7279748, scientific: 'Mammillaria karwinskiana', own, reference })).toEqual({ status: 'ok', data: { take: true, why: 'GBIF holds Mammillaria geminata as this species' } }); // m70: no judgeTaxon; refused
  });
  it('an id answered with no is_active is active, and a batch iNaturalist does not serve is inactive with no successor (guard; mutations I2, I8)', async () => {
    const one = (async () => ({ status: 'ok', data: { results: [{ id: 5, name: 'Aus bus' }] } })) as unknown as JsonFetcher;
    const r = await checkIds(one, [5]);
    expect(r.status === 'ok' && r.data.get(5)).toEqual({ active: true, name: 'Aus bus' });
    const gone = (async () => ({ status: 'none' })) as unknown as JsonFetcher;
    const g = await checkIds(gone, [6, 7]);
    expect(g.status === 'ok' && [...g.data.values()]).toEqual([{ active: false }, { active: false }]);
  });
  it('the name search does not take a taxon the reference holds as another species (guard; mutation I4)', async () => {
    const r = await taxon(world(5667820, 0), 'Pinguicula chilensis', heldElsewhere(5667820));
    expect(r).toMatchObject({ status: 'none', detail: 'not taken: iNaturalist files Pinguicula chilensis as Pinguicula antarctica, another species of this reference' });
  });
  it('a name below species published on the type is not a same-type name (guard; mutation G1)', () => {
    expect(sameTypeNames({ key: 1 }, [{ key: 2, name: 'Aus bus var. cus', rank: 'VARIETY', basionymKey: 1 }, { key: 3, name: 'Bus aus', rank: 'SPECIES', basionymKey: 1 }]).map((r) => r.name)).toEqual(['Bus aus']);
  });
  it(`identifiers read exactly ${CARRY_DAYS} days ago are still kept (guard; mutation B2)`, async () => {
    const lagged = (async (url: string) => (url.startsWith(W) ? { status: 'ok', data: { error: { code: 'maxlag', info: '5 seconds lagged' } } } : world(2752120, 452309)(url))) as unknown as JsonFetcher;
    const r = await buildDossier(2752120, { fetcher: lagged, builtBy: 'node', now: () => new Date('2026-10-12T00:00:00Z'), skip: ['commons', 'openalex', 'wikipedia', 'inat'], prevIds: { gbif: 2752120, wikidata: 'Q1' }, prevIdsOn: '2026-07-14' });
    expect(r.ok && r.dossier.ids.wikidata).toBe('Q1');
  });
  it('an inactive id with no successor and nothing found by name leaves no id (guard; mutation B6)', async () => {
    const f = world(2752120, 999999);
    const quiet = (async (url: string) => (/taxa\?q=/.test(url) ? { status: 'ok', data: { results: [] } } : f(url))) as unknown as JsonFetcher;
    const r = await buildDossier(2752120, { fetcher: quiet, builtBy: 'node', now: () => new Date('2026-10-12T12:00:00Z'), skip: ['commons', 'openalex', 'wikipedia'] });
    expect(r.ok && r.dossier.ids.inat).toBeUndefined();
  });
});

describe('--fill inat-ids reads the follows of earlier runs again', () => {
  const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });
  const inatPhotos = (n: number) => Array.from({ length: n }, (_, i) => ({ src: 'inat', id: String(i), url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${i}/large.jpg`, thumb: '', licence: 'by', attribution: 'a' }));
  /** A dossier as the live corpus holds it after the earlier follow (Pinguicula chilensis: 33 photographs, all P. antarctica's). */
  const followed = (key: number, from: number, fromName: string, to: number, photos = 0) => ({
    key, name: { scientific: SPECIES[key]?.name ?? 'Pinguicula antarctica' }, ids: { gbif: key, inat: to }, links: { gbif: 'x', inat: `https://www.inaturalist.org/taxa/${to}` },
    photos: [...inatPhotos(photos), { src: 'gbif', id: '9:0', url: 'https://example.org/a.jpg', thumb: '', licence: 'by', attribution: 'b, iNaturalist via GBIF' }],
    upstream: { 'inat.taxon': { status: 'ok', at: 'x', detail: `iNaturalist's taxon ${from} (${fromName}) is inactive; followed to its current taxon ${to}` }, 'inat.photos.wild': { status: 'ok', at: 'x', detail: 'filled 2026-10-12' }, 'inat.photos.cultivated': { status: 'none', at: 'x' } }
  });
  type D = ReturnType<typeof followed>;
  /** The whole fill's world: every species' GBIF answers, iNaturalist's taxa and search. */
  const all = (asked: string[] = [], refuse?: RegExp): JsonFetcher => world(0, 0, asked, refuse);
  it('drops the wrong follow, keeps the right ones, gives Tricyrtis formosana its own taxon, and reports each', async () => {
    const docs: Record<string, unknown> = {
      '5667820.json': followed(5667820, 506182, 'Pinguicula chilensis', 816267, 33),
      '7279748.json': followed(7279748, 207131, 'Mammillaria karwinskiana', 1555516, 2),
      '2752120.json': followed(2752120, 452312, 'Tricyrtis formosana grandiflora', 452310, 4),
      '2735935.json': followed(2735935, 133599, 'Dypsis lutescens', 276548, 5),
      // Pinguicula antarctica's own page holds 816267 by its own name: left alone.
      '5667863.json': { key: 5667863, name: { scientific: 'Pinguicula antarctica' }, ids: { gbif: 5667863, inat: 816267 }, links: { inat: 'https://www.inaturalist.org/taxa/816267' }, photos: inatPhotos(33), upstream: {} }
    };
    const c = await fillInatIds(store(docs), all(), () => '2026-10-13T00:00:00Z');
    expect(c).toMatchObject({ checked: 5, refused: 1, kept: 2, followed: 1, dropped: 0 }); // m70: refused 3 (Mammillaria geminata and the variety too), kept 1
    const ping = docs['5667820.json'] as D;
    expect(ping.ids.inat).toBeUndefined();
    expect(ping.links.inat).toBeUndefined();
    expect(ping.photos.map((p) => p.src)).toEqual(['gbif']); // the 33 of P. antarctica gone, GBIF's own kept
    expect(ping.upstream['inat.photos.wild']).toMatchObject({ status: 'none' }); // settled, so --fill inat does not search again
    expect(ping.upstream['inat.taxon'].detail).toBe("iNaturalist's taxon 506182 (Pinguicula chilensis) is inactive; followed to its current taxon 816267; read again 2026-10-13: 816267 (Pinguicula antarctica) is not this species: Pinguicula antarctica is another species of this reference: not taken, and its 33 photographs removed (2026-10-13); asked by name: not taken: iNaturalist files Pinguicula chilensis as Pinguicula antarctica, another species of this reference");
    const mam = docs['7279748.json'] as D;
    expect(mam.ids.inat).toBe(1555516); // m70: none; GBIF holds Mammillaria geminata as a synonym of M. karwinskiana
    expect(mam.photos).toHaveLength(3);
    expect(mam.upstream['inat.taxon'].detail).toBe("iNaturalist's taxon 207131 (Mammillaria karwinskiana) is inactive; followed to its current taxon 1555516 (Mammillaria geminata); read again 2026-10-13: GBIF holds Mammillaria geminata as this species");
    const tri = docs['2752120.json'] as D;
    expect(tri.ids.inat).toBe(452309);
    expect(tri.links.inat).toBe('https://www.inaturalist.org/taxa/452309');
    expect(tri.photos.map((p) => p.src)).toEqual(['gbif']); // the variety's four go; the species' are asked for
    expect(tri.upstream['inat.photos.wild'].status).toBe('skipped'); // opened for --fill inat
    const dyp = docs['2735935.json'] as D;
    expect(dyp.ids.inat).toBe(276548);
    expect(dyp.photos).toHaveLength(6);
    expect(dyp.upstream['inat.taxon'].detail).toBe("iNaturalist's taxon 133599 (Dypsis lutescens) is inactive; followed to its current taxon 276548 (Chrysalidocarpus lutescens); read again 2026-10-13: Chrysalidocarpus lutescens is one of this species' names");
    expect((docs['5667863.json'] as D).ids.inat).toBe(816267);
    expect(c.lines).toEqual([
      'Pinguicula chilensis [5667820]: an earlier follow to 816267 (Pinguicula antarctica) refused, Pinguicula antarctica is another species of this reference; 33 iNaturalist photographs removed; by name: none',
      "Tricyrtis formosana [2752120]: an earlier follow to 452310 (Tricyrtis formosana formosana) taken as 452309 (Tricyrtis formosana): Tricyrtis formosana formosana is Tricyrtis formosana itself, at a lower rank; iNaturalist's own taxon of the species, 452309, taken for its variety's"
    ]);
  });
  it('a newly inactive id is followed only by the rule', async () => {
    const fresh = (key: number, id: number) => ({ key, name: { scientific: SPECIES[key].name }, ids: { gbif: key, inat: id }, links: { inat: `https://www.inaturalist.org/taxa/${id}` }, photos: [], upstream: {} });
    const docs: Record<string, unknown> = { a: fresh(5667820, 506182), b: fresh(2735935, 133599), c: { key: 5667863, name: { scientific: 'Pinguicula antarctica' }, ids: {}, links: {}, photos: [], upstream: {} } };
    const c = await fillInatIds(store(docs), all(), () => '2026-10-13T00:00:00Z');
    expect(c).toMatchObject({ followed: 1, refused: 1 });
    expect((docs.a as D).ids.inat).toBeUndefined(); // base: 816267
    expect((docs.b as D).ids.inat).toBe(276548);
  });
  it('an id dropped with no successor loses its link too (guard; mutation C2)', async () => {
    const docs: Record<string, unknown> = { a: { key: 1, name: { scientific: 'Aus bus' }, ids: { inat: 999999 }, links: { inat: 'https://www.inaturalist.org/taxa/999999' }, photos: [], upstream: {} } };
    await fillInatIds(store(docs), all(), () => '2026-10-13T00:00:00Z');
    expect((docs.a as D).links.inat).toBeUndefined();
  });
  it('a refusal stops the fill and leaves the dossier as it was (fails safe)', async () => {
    const docs: Record<string, unknown> = { '5667820.json': followed(5667820, 506182, 'Pinguicula chilensis', 816267, 33), '5667863.json': { key: 5667863, name: { scientific: 'Pinguicula antarctica' }, ids: {}, links: {}, photos: [], upstream: {} } };
    const before = structuredClone(docs);
    const c = await fillInatIds(store(docs), all([], /taxa\?q=/), () => '2026-10-13T00:00:00Z');
    expect(c.failed).toBe('api.inaturalist.org 429'); // base: no failure, nothing read again
    expect(docs).toEqual(before);
  });
});

describe('--fill inat keeps what --fill inat-ids said of a dropped id (S-B7)', () => {
  it('Nepenthes putaiguneung: the inactive id stays in the record, before the name search\'s answer', () => {
    const was = { status: 'skipped', detail: "iNaturalist's taxon 1129213 (Nepenthes putaiguneung) is inactive, with no single current taxon; to be asked by name (--fill inat)" };
    expect(inatTaxonRow(was, { status: 'none' }, '2026-10-13T00:00:00Z')).toEqual({ status: 'none', at: '2026-10-13T00:00:00Z', detail: "iNaturalist's taxon 1129213 (Nepenthes putaiguneung) is inactive, with no single current taxon; asked by name: no iNaturalist taxon of this name" }); // base: no inatTaxonRow; the row was "none" with no detail
    expect(inatTaxonRow(undefined, { status: 'none', detail: 'x' }, 't')).toEqual({ status: 'none', at: 't', detail: 'x' }); // a row with no such history is the answer alone
  });
  it('the script writes the row by it', () => {
    expect(readFileSync('scripts/build-dossiers.ts', 'utf8')).toMatch(/d\.upstream\['inat\.taxon'\] = inatTaxonRow\(d\.upstream\['inat\.taxon'\], t, /);
  });
});

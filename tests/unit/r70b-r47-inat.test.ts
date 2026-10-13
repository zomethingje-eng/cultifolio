/**
 * Round seventy, second pass: R47-1 and R47-8, decided as triage-69 B5 and B7. Seven live pages showed another species'
 * photographs through iNaturalist: three by a followed id, two by an id carried from an earlier build, one "filed by
 * iNaturalist as" another name, one by a variety's id. An iNaturalist taxon whose name is not one of this species' own is
 * now matched to GBIF and dropped when GBIF holds it as another species of this reference, or, in a genus the reference
 * does not hold, when the one species of the family with its epithet is another. And Ceropegia pulvinata and C. mixta,
 * which iNaturalist files under the names Bruyns replaced (Stapelia hirsuta, Orbea variegata), have their photographs
 * again. The live dossiers, iNaturalist's taxa and GBIF's matches are of 2026-10-12. Each case FAILED on the base unless
 * it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { fillInatIds } from '$dossier/corpus-fills';
import { buildDossier } from '$dossier/build';
import type { JsonFetcher } from '$dossier/fetch';

const W = 'https://www.wikidata.org/w/api.php';
/** The reference's species these cases touch, with their families (the live index, 2026-10-12). */
const INDEX: Array<{ key: number; name: string; family: string }> = [
  { key: 2776776, name: 'Drimia filifolia', family: 'Asparagaceae' }, { key: 2776850, name: 'Drimia exuviata', family: 'Asparagaceae' },
  { key: 5667820, name: 'Pinguicula chilensis', family: 'Lentibulariaceae' }, { key: 5667863, name: 'Pinguicula antarctica', family: 'Lentibulariaceae' },
  { key: 3702127, name: 'Nepenthes angasanensis', family: 'Nepenthaceae' }, { key: 3702160, name: 'Nepenthes mikei', family: 'Nepenthaceae' },
  { key: 3941409, name: 'Stenocactus boedekerianus', family: 'Cactaceae' }, { key: 3960841, name: 'Stenocactus ochoterenanus', family: 'Cactaceae' },
  { key: 7588224, name: 'Ceropegia monteiroae', family: 'Apocynaceae' }, { key: 7837855, name: 'Ceropegia sandersonii', family: 'Apocynaceae' },
  { key: 6316774, name: 'Drimia oliverorum', family: 'Asparagaceae' }, { key: 2773846, name: 'Fusifilum physodes', family: 'Asparagaceae' },
  { key: 5689714, name: 'Cotyledon flanaganii', family: 'Crassulaceae' }, { key: 5361969, name: 'Cotyledon orbiculata', family: 'Crassulaceae' },
  { key: 9462513, name: 'Ceropegia pulvinata', family: 'Apocynaceae' }, { key: 9534856, name: 'Ceropegia mixta', family: 'Apocynaceae' }
];
/** iNaturalist's taxa (`/v1/taxa/<ids>`). */
const TAXA: Record<number, { id: number; name: string; rank: string; is_active: boolean; current_synonymous_taxon_ids: number[] | null }> = {
  584148: { id: 584148, name: 'Drimia filifolia', rank: 'species', is_active: false, current_synonymous_taxon_ids: [566079] },
  566079: { id: 566079, name: 'Drimia exuviata', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  506182: { id: 506182, name: 'Pinguicula chilensis', rank: 'species', is_active: false, current_synonymous_taxon_ids: [816267] },
  816267: { id: 816267, name: 'Pinguicula antarctica', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  348349: { id: 348349, name: 'Nepenthes angasanensis', rank: 'species', is_active: false, current_synonymous_taxon_ids: [348366] },
  348366: { id: 348366, name: 'Nepenthes mikei', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  870796: { id: 870796, name: 'Echinofossulocactus ochoterenanus', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  430812: { id: 430812, name: 'Ceropegia sandersonii', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  584173: { id: 584173, name: 'Drimia oliverorum', rank: 'species', is_active: false, current_synonymous_taxon_ids: [868336] },
  868336: { id: 868336, name: 'Drimia physodes', rank: 'species', is_active: true, current_synonymous_taxon_ids: null },
  598425: { id: 598425, name: 'Cotyledon orbiculata orbiculata', rank: 'variety', is_active: true, current_synonymous_taxon_ids: null }
};
/** GBIF's backbone match of iNaturalist's names (strict, plants). */
const MATCH: Record<string, unknown> = {
  'Drimia exuviata': { usageKey: 2776850, matchType: 'EXACT', rank: 'SPECIES', speciesKey: 2776850, species: 'Drimia exuviata' },
  'Pinguicula antarctica': { usageKey: 7983133, matchType: 'EXACT', rank: 'SPECIES', speciesKey: 5667863, species: 'Pinguicula antarctica' },
  'Nepenthes mikei': { usageKey: 3702160, matchType: 'EXACT', rank: 'SPECIES', speciesKey: 3702160, species: 'Nepenthes mikei' },
  'Echinofossulocactus ochoterenanus': { usageKey: 8281657, matchType: 'EXACT', rank: 'SPECIES', status: 'DOUBTFUL', speciesKey: 8281657, species: 'Echinofossulocactus ochoterenanus' },
  'Ceropegia sandersonii': { usageKey: 7837855, matchType: 'EXACT', rank: 'SPECIES', speciesKey: 7837855, species: 'Ceropegia sandersonii' },
  'Drimia physodes': { usageKey: 2773852, matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', speciesKey: 2773846, species: 'Fusifilum physodes' },
  'Cotyledon orbiculata orbiculata': { usageKey: 7219274, matchType: 'EXACT', rank: 'VARIETY', speciesKey: 5361969, species: 'Cotyledon orbiculata' }
};
/** iNaturalist's name search (plants), as it answered. */
const SEARCH: Record<string, unknown[]> = {
  'Stenocactus boedekerianus': [{ id: 870796, name: 'Echinofossulocactus ochoterenanus', rank: 'species', matched_term: 'Stenocactus boedekerianus' }],
  'Stapelia pulvinata': [{ id: 601234, name: 'Stapelia hirsuta hirsuta', rank: 'variety', matched_term: 'Stapelia pulvinata' }],
  'Stapelia hirsuta': [{ id: 366290, name: 'Stapelia hirsuta', rank: 'species', matched_term: 'Stapelia hirsuta' }, { id: 601234, name: 'Stapelia hirsuta hirsuta', rank: 'variety', matched_term: 'Stapelia hirsuta hirsuta' }],
  'Orbea mixta': [{ id: 431387, name: 'Orbea variegata', rank: 'species', matched_term: 'Orbea mixta' }],
  'Stapelia mixta': [{ id: 431387, name: 'Orbea variegata', rank: 'species', matched_term: 'Stapelia mixta' }]
};
/** GBIF's records and synonyms of Ceropegia pulvinata and C. mixta (in part: the rows that decide). */
const SPECIES: Record<number, { name: string; family: string; basionymKey?: number; synonyms: unknown[] }> = {
  9462513: { name: 'Ceropegia pulvinata', family: 'Apocynaceae', basionymKey: 7312028, synonyms: [
    { key: 7312028, canonicalName: 'Stapelia pulvinata', scientificName: 'Stapelia pulvinata Masson', rank: 'SPECIES' },
    { key: 7784245, canonicalName: 'Stisseria pulvinata', scientificName: 'Stisseria pulvinata (Masson) Kuntze', rank: 'SPECIES', basionymKey: 7312028 },
    { key: 7150839, canonicalName: 'Stapelia hirsuta', scientificName: 'Stapelia hirsuta L.', rank: 'SPECIES' }] },
  9534856: { name: 'Ceropegia mixta', family: 'Apocynaceae', basionymKey: 3575506, synonyms: [
    { key: 3575506, canonicalName: 'Stapelia mixta', scientificName: 'Stapelia mixta Masson', rank: 'SPECIES' },
    { key: 3574995, canonicalName: 'Orbea mixta', scientificName: 'Orbea mixta (Masson) Haw.', rank: 'SPECIES', basionymKey: 3575506 },
    { key: 3574727, canonicalName: 'Orbea variegata', scientificName: 'Orbea variegata (L.) Haw.', rank: 'SPECIES', basionymKey: 3574263 }] }
};

function world(o: { wikidataInat?: number; key?: number; refuse?: RegExp } = {}, asked: string[] = []): JsonFetcher {
  return (async (url: string) => {
    asked.push(url);
    const ok = (data: unknown) => ({ status: 'ok', data });
    if (o.refuse?.test(url)) return { status: 'refused', detail: 'api.gbif.org 429' };
    let m: RegExpExecArray | null;
    if ((m = /\/v1\/taxa\/([\d,]+)/.exec(url))) return ok({ results: m[1].split(',').map(Number).flatMap((id) => (TAXA[id] ? [TAXA[id]] : [])) });
    if ((m = /\/v1\/taxa\?q=([^&]+)/.exec(url))) return ok({ results: SEARCH[decodeURIComponent(m[1])] ?? [] });
    if (url.includes('api.inaturalist.org')) return ok({ results: [] });
    if ((m = /\/species\/match\?strict=true&kingdom=Plantae&name=([^&]+)/.exec(url))) return ok(MATCH[decodeURIComponent(m[1])] ?? { matchType: 'NONE' });
    if ((m = /\/v1\/species\/(\d+)\/synonyms/.exec(url))) return ok({ results: SPECIES[Number(m[1])]?.synonyms ?? [], endOfRecords: true });
    if ((m = /\/v1\/species\/(\d+)$/.exec(url))) { const k = Number(m[1]); const s = SPECIES[k]; const e = INDEX.find((x) => x.key === k); return ok({ key: k, canonicalName: s?.name ?? e?.name, scientificName: s?.name ?? e?.name, rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae', family: s?.family ?? e?.family, basionymKey: s?.basionymKey }); }
    if (url.includes('api.gbif.org')) return ok({ results: [], endOfRecords: true });
    if (o.key && url.includes(`srsearch=haswbstatement%3AP846%3D${o.key}`)) return ok({ query: { search: [{ title: 'Q1' }] } });
    if (url.startsWith(`${W}?action=wbgetentities`)) return ok({ entities: { Q1: { claims: o.wikidataInat ? { P3151: [{ mainsnak: { datavalue: { value: String(o.wikidataInat) } } }] } : {} } } });
    return { status: 'none' };
  }) as unknown as JsonFetcher;
}
const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });
/** A live dossier as R47 read it: its iNaturalist id, the record of how it came, and its iNaturalist photographs. */
const dossier = (key: number, inat: number, detail: string, photos: number) => {
  const e = INDEX.find((x) => x.key === key)!;
  return { key, name: { scientific: e.name, family: e.family }, ids: { gbif: key, inat }, links: { inat: `https://www.inaturalist.org/taxa/${inat}` }, photos: Array.from({ length: photos }, (_, i) => ({ src: 'inat', id: String(i), url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${i}/large.jpg`, thumb: '', licence: 'by', attribution: 'a' })), upstream: { 'inat.taxon': { status: 'ok', at: 'x', detail }, 'inat.photos.wild': { status: 'ok', at: 'x' } } };
};
type D = ReturnType<typeof dossier>;

describe('--fill inat-ids drops R47-1\'s seven taxa, however each id came', () => {
  it('each page loses another species\' id and photographs, and the report says which', async () => {
    const docs: Record<string, unknown> = Object.fromEntries(INDEX.map((e) => [`${e.key}.json`, { key: e.key, name: { scientific: e.name, family: e.family }, ids: {}, links: {}, photos: [], upstream: {} }]));
    Object.assign(docs, {
      '2776776.json': dossier(2776776, 566079, "iNaturalist's taxon 584148 (Drimia filifolia) is inactive; followed to its current taxon 566079", 77),
      '5667820.json': dossier(5667820, 816267, "iNaturalist's taxon 506182 (Pinguicula chilensis) is inactive; followed to its current taxon 816267", 33),
      '3702127.json': dossier(3702127, 348366, "iNaturalist's taxon 348349 (Nepenthes angasanensis) is inactive; followed to its current taxon 348366", 3),
      '3941409.json': dossier(3941409, 870796, 'filed by iNaturalist as Echinofossulocactus ochoterenanus', 39),
      '7588224.json': dossier(7588224, 430812, 'carried from build of 2026-09-20 (rederive)', 1),
      '6316774.json': dossier(6316774, 868336, "iNaturalist's taxon 584173 (Drimia oliverorum) is inactive; followed to its current taxon 868336", 54),
      '5689714.json': dossier(5689714, 598425, 'carried from build of 2026-09-20 (rederive)', 50)
    });
    const c = await fillInatIds(store(docs), world(), () => '2026-10-13T00:00:00Z');
    expect(c.refused).toBe(7); // base: 0
    for (const k of [2776776, 5667820, 3702127, 3941409, 7588224, 6316774, 5689714]) {
      const d = docs[`${k}.json`] as D;
      expect(d.ids.inat, String(k)).toBeUndefined();
      expect(d.photos, String(k)).toEqual([]);
    }
    expect(c.lines.find((l) => l.startsWith('Stenocactus boedekerianus'))).toBe("Stenocactus boedekerianus [3941409]: 870796 (Echinofossulocactus ochoterenanus), carried, refused, iNaturalist's Echinofossulocactus ochoterenanus, in a genus this reference does not hold, is Stenocactus ochoterenanus, another species of this reference; 39 iNaturalist photographs removed; by name: none");
    expect(c.lines.find((l) => l.startsWith('Cotyledon flanaganii'))).toBe("Cotyledon flanaganii [5689714]: 598425 (Cotyledon orbiculata orbiculata), carried, refused, GBIF holds iNaturalist's Cotyledon orbiculata orbiculata as Cotyledon orbiculata, another species of this reference; 50 iNaturalist photographs removed; by name: none");
    expect(c.lines.find((l) => l.startsWith('Ceropegia monteiroae'))).toMatch(/GBIF holds iNaturalist's Ceropegia sandersonii as Ceropegia sandersonii, another species of this reference/);
  });
  it('a taxon of the species\' own name asks GBIF nothing (guard)', async () => {
    const asked: string[] = [];
    const docs: Record<string, unknown> = { a: { key: 9534856, name: { scientific: 'Ceropegia mixta', family: 'Apocynaceae', synonyms: ['Orbea variegata (L.) Haw.'] }, ids: { inat: 431387 }, links: {}, photos: [], upstream: {} } };
    const w = world({}, asked);
    const f = (async (url: string) => (/\/taxa\/431387/.test(url) ? { status: 'ok', data: { results: [{ id: 431387, name: 'Orbea variegata', rank: 'species', is_active: true }] } } : w(url))) as unknown as JsonFetcher;
    await fillInatIds(store(docs), f, () => '2026-10-13T00:00:00Z');
    expect(asked.some((u) => u.includes('api.gbif.org'))).toBe(false);
    expect((docs.a as D).ids.inat).toBe(431387);
  });
  it('GBIF refusing stops the fill and leaves the dossier as it was (fails safe)', async () => {
    const docs: Record<string, unknown> = { '7588224.json': dossier(7588224, 430812, 'carried', 1), '7837855.json': { key: 7837855, name: { scientific: 'Ceropegia sandersonii', family: 'Apocynaceae' }, ids: {}, links: {}, photos: [], upstream: {} } };
    const before = structuredClone(docs);
    const c = await fillInatIds(store(docs), world({ refuse: /species\/match/ }), () => '2026-10-13T00:00:00Z');
    expect(c.failed).toBe('api.gbif.org 429'); // base: no failure, nothing asked
    expect(docs).toEqual(before);
  });
});

const build = (key: number, extra: { wikidataInat?: number } = {}, asked: string[] = []) => {
  const ref = INDEX;
  const byName = new Map(ref.map((e) => [e.name.toLowerCase(), e.key]));
  return buildDossier(key, {
    fetcher: world({ ...extra, key }, asked), builtBy: 'node', now: () => new Date('2026-10-13T12:00:00Z'), skip: ['commons', 'openalex', 'wikipedia'],
    heldElsewhere: (n) => { const k = byName.get(n.toLowerCase()); return k != null && k !== key; },
    reference: { keyOf: (n) => byName.get(n.toLowerCase()), isSpecies: (k) => ref.some((e) => e.key === k), hasGenus: (g) => ref.some((e) => e.name.split(' ')[0] === g), byEpithet: (ep, fam) => ref.filter((e) => e.name.split(' ')[1] === ep && (!fam || e.family === fam)) }
  });
};

describe('the build reads the same rule', () => {
  it('Ceropegia monteiroae: the id Wikidata gives, Ceropegia sandersonii, is another species of this reference', async () => {
    const r = await build(7588224, { wikidataInat: 430812 });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBeUndefined(); // base: 430812
    expect(r.dossier.upstream['inat.taxon'].detail).toMatch(/^iNaturalist's taxon 430812 \(Ceropegia sandersonii\), as Wikidata gives it, is not this species: GBIF holds iNaturalist's Ceropegia sandersonii as Ceropegia sandersonii, another species of this reference; asked by name/);
  });
  it('Stenocactus boedekerianus: "filed by iNaturalist as" Echinofossulocactus ochoterenanus, which is Stenocactus ochoterenanus', async () => {
    const r = await build(3941409);
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBeUndefined(); // base: 870796
  });
  it('Ceropegia pulvinata: iNaturalist files its basionym under a variety of Stapelia hirsuta, the name Bruyns replaced; the species is taken', async () => {
    const r = await build(9462513);
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBe(366290); // base: none, "neither this species' name nor one of its same-type names"
    expect(r.dossier.upstream['inat.taxon'].detail).toBe('found under Stapelia pulvinata, an older name with the same type; filed by iNaturalist as Stapelia hirsuta, a name GBIF holds under this species');
  });
  it('Ceropegia mixta: iNaturalist files it as Orbea variegata, which GBIF holds under it', async () => {
    const r = await build(9534856);
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.inat).toBe(431387); // base: none
  });
  it('a synonym this reference holds as a species of its own is never the species\' own: Pinguicula antarctica', async () => {
    const r = await build(5667820, { wikidataInat: 506182 });
    expect(r.ok && r.dossier.ids.inat).toBeUndefined(); // base: 816267, followed
  });
});

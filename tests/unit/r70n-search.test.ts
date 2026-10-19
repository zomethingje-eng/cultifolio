/**
 * Round seventy, triage-69 N2 (S-F2, S-F6): the search. An older name typed exactly puts first a species that holds it
 * exactly, and "shows the name" counts only the name itself shown, never a variety of it; a family is matched from its
 * start only by a word that is neither a genus of the reference nor a word of the entry's own name, and the server's
 * answer through the postings reads the whole index's genera. The entries are the live index's (cultifolio.com,
 * /api/index, 12 October 2026), cut to the fields the search reads. Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { prepare, search, searchGenera } from '$core/search';
import { buildProducts } from '$dossier/products';
import { manifestPath, productPath } from '$dossier/manifest';
import { searchAnswer, _forgetIndex, type IndexEntry, type Loaded } from '$lib/server/dossiers';

type E = Partial<IndexEntry> & { key: number; name: string };
const at = (e: E): IndexEntry => ({ slug: e.name.toLowerCase().replace(/ /g, '-'), photos: 0, open: 0, climate: 'ok', ...e }) as IndexEntry;
const idx: IndexEntry[] = [
  at({ key: 3955786, name: 'Airampoa corrugata', family: 'Cactaceae', syn: ['Cactus corrugatus', 'Echinocactus corrugatus', 'Opuntia albisaetacens', 'Opuntia albisaetacens var. robustior', 'Opuntia armata', 'Opuntia aulacothele'], older: ['Opuntia corrugata', 'Opuntia longispina'], photos: 31 }),
  at({ key: 7282605, name: 'Cylindropuntia leptocaulis', family: 'Cactaceae', common: 'Christmas cactus', syn: ['Grusonia leptocaulis', 'Opuntia brittonii', 'Opuntia fragilis var. frutescens', 'Opuntia frutescens', 'Opuntia frutescens var. brevispina', 'Opuntia frutescens var. longispina'], older: ['Opuntia leptocaulis'], photos: 16 }),
  at({ key: 5625689, name: 'Opuntia orbiculata', family: 'Cactaceae', common: 'Western prickly-pear', syn: ['Opuntia crinifera', 'Opuntia crinifera var. lanigera', 'Opuntia dillei', 'Opuntia lanigera', 'Opuntia longispina', 'Opuntia metternichii'], older: ['Opuntia pintadera', 'Opuntia senilis'], photos: 51 }),
  at({ key: 3082263, name: 'Cornus mas', family: 'Cornaceae', common: 'Cornelian cherry', syn: ['Eukrania mascula', 'Macrocarpium mas', 'Cornus erythrocarpa', 'Cornus flava', 'Cornus homerica', 'Cornus mas f. alba'], older: ['Cornus mascula', 'Cornus nudiflora'], photos: 35 }),
  at({ key: 7161076, name: 'Cornus officinalis', family: 'Cornaceae', common: 'Asiatic dogwood', syn: ['Macrocarpium officinale', 'Cornus mascula var. japonica', 'Cornus officinalis var. koreana'], photos: 26 }),
  at({ key: 8252683, name: 'Crataegus laevigata', family: 'Rosaceae', common: 'Midland hawthorn', syn: ['Mespilus oxyacantha', 'Crataegus oxyacantha f. aurea', 'Crataegus oxyacantha f. auriculata', 'Crataegus oxyacantha f. gireoudii', 'Crataegus oxyacantha f. glabrata', 'Crataegus oxyacantha f. laevigata'], photos: 49 }),
  at({ key: 9220780, name: 'Crataegus monogyna', family: 'Rosaceae', common: 'Hawthorn', syn: ['Mespilus apiifolia', 'Mespilus azarolus subsp. glabra', 'Mespilus brevispina', 'Mespilus caucasica', 'Mespilus constantinopolitana', 'Mespilus crataegus'], older: ['Crataegus elegans', 'Crataegus oxyacantha'], photos: 71 }),
  at({ key: 9438135, name: 'Ceropegia quinta', family: 'Apocynaceae', syn: ['Huernia quinta', 'Huernia scabra var. quinta'] }),
  at({ key: 9620421, name: 'Ceropegia thuretii', family: 'Apocynaceae', syn: ['Huernia bayeri', 'Huernia brevirostris', 'Huernia brevirostris subsp. baviaana', 'Huernia brevirostris subsp. intermedia', 'Huernia brevirostris var. ecornuta', 'Huernia brevirostris var. histrionica'], older: ['Huernia scabra', 'Huernia thuretii'], photos: 17 }),
  // Crassulaceae, and the genera that begin their family's name.
  at({ key: 4197474, name: 'Aeonium undulatum', family: 'Crassulaceae', common: 'Giant Aeonium', commons: ['Saucer-plant'], syn: ['Sempervivum undulatum'], photos: 56 }),
  at({ key: 9000001, name: 'Crassula acinaciformis', family: 'Crassulaceae', common: 'Giant Crassula', photos: 20 }),
  at({ key: 7334236, name: 'Crassula elegans', family: 'Crassulaceae', syn: ['Crassula alstonii', 'Crassula mesembryanthoides'], photos: 67 }),
  at({ key: 5362063, name: 'Crassula ovata', family: 'Crassulaceae', common: 'Jade plant', photos: 54 }),
  at({ key: 4199328, name: 'Dudleya brittonii', family: 'Crassulaceae', common: "Britton's Dudleya", commons: ['Giant chalk dudleya'], syn: ['Dudleya candida subsp. brittonii', 'Dudleya viridis'], photos: 39 }),
  at({ key: 8315197, name: 'Echeveria elegans', family: 'Crassulaceae', common: 'Mexican snowball', syn: ['Echeveria albicans', 'Echeveria perelegans'], photos: 19 }),
  at({ key: 7334545, name: 'Echeveria harmsii', family: 'Crassulaceae', common: 'Red echeveria', syn: ['Cotyledon elegans', 'Oliveranthus elegans', 'Oliverella elegans', 'Echeveria elegans'], photos: 12 }),
  at({ key: 4198257, name: 'Echeveria simulans', family: 'Crassulaceae', syn: ['Echeveria elegans var. simulans'], photos: 53 }),
  at({ key: 5362007, name: 'Sedum acre', family: 'Crassulaceae', common: 'Biting stonecrop', syn: ['Sedum acre var. elegans'], photos: 39 }),
  at({ key: 9000002, name: 'Bursera simaruba', family: 'Burseraceae', common: 'Gumbo-limbo', photos: 40 }),
  at({ key: 8330171, name: 'Boswellia sacra', family: 'Burseraceae', common: 'Frankincense', photos: 75 }),
  at({ key: 9000003, name: 'Tetragonia tetragonoides', family: 'Aizoaceae', common: 'New Zealand spinach', photos: 30 })
];
const P = prepare(idx);
const names = (q: string, n = 6) => search(P, q, n).map((e) => e.name);

describe('N2 (S-F2): an older name typed exactly, its holder first', () => {
  it('"Cornus mascula" is Cornus mas, which holds it, before Cornus officinalis, which shows a variety of it', () => {
    expect(names('Cornus mascula')).toEqual(['Cornus mas', 'Cornus officinalis']); // base: Cornus officinalis first
  });
  it('"Opuntia longispina": the two that hold it (the one that shows it first), then the one that shows a variety of it', () => {
    expect(names('Opuntia longispina')).toEqual(['Opuntia orbiculata', 'Airampoa corrugata', 'Cylindropuntia leptocaulis']); // base: Cylindropuntia second
  });
  it('"Crataegus oxyacantha" is Crataegus monogyna before C. laevigata, which shows only forms of it', () => {
    expect(names('Crataegus oxyacantha')[0]).toBe('Crataegus monogyna');
  });
  it('"Huernia scabra" is Ceropegia thuretii before C. quinta, which shows a variety of it', () => {
    expect(names('Huernia scabra')[0]).toBe('Ceropegia thuretii');
  });
  it('a name still being typed: a species that shows the name of the typed length, never a variety of it, counts as showing it', () => {
    expect(names('Opuntia longisp')[0]).toBe('Opuntia orbiculata'); // base: Cylindropuntia leptocaulis, for its "Opuntia frutescens var. longispina"
    // guard: the holder is still found while typing
    expect(names('Cornus masc')).toContain('Cornus mas');
  });
});

describe('N2 (S-F6): a family from its start, never by a genus of the reference', () => {
  it('"Crassula elegans" is Crassula elegans alone, not the Echeveria and the Sedum of its family', () => {
    expect(names('Crassula elegans')).toEqual(['Crassula elegans']); // base: Echeveria elegans, E. harmsii, E. simulans, Sedum acre after it
  });
  it('"Bursera" is the Bursera, not the Boswellia of Burseraceae', () => {
    expect(names('Bursera')).toEqual(['Bursera simaruba']); // base: Boswellia sacra too
  });
  it('"Giant Crassula" is Crassula acinaciformis alone, not Aeonium undulatum and Dudleya brittonii', () => {
    expect(names('Giant Crassula')).toEqual(['Crassula acinaciformis']);
  });
  it('guard: a family typed in part, and whole, still finds it', () => {
    expect(names('aizoac')).toEqual(['Tetragonia tetragonoides']);
    expect(names('crassulaceae', 20)).toHaveLength(9);
    expect(names('burserac', 20)).toEqual(['Boswellia sacra', 'Bursera simaruba']);
  });
  it('the genera are the reference\'s, not only the entries prepared: a word that is a genus elsewhere is no family start', () => {
    const two = idx.filter((e) => e.name === 'Echeveria harmsii' || e.name === 'Sedum acre');
    expect(search(prepare(two), 'Crassula harmsii', 5).map((e) => e.name)).toEqual(['Echeveria harmsii']); // guard: alone, nothing says Crassula is a genus
    expect(search(prepare(two, searchGenera(idx)), 'Crassula harmsii', 5)).toEqual([]);
  });
  it('the server\'s answer through the postings reads the whole index\'s genera', async () => {
    // "crassula harmsii": the postings' candidates are Echeveria harmsii alone (no Crassula has a word in "har"), so
    // genera read from the candidates would not know Crassula; the whole index's do.
    const text = JSON.stringify(idx);
    const { manifest, files, stored } = buildProducts(idx, text, () => new Map());
    const byPath = new Map<string, string>([['s/v2/index.json', text], [manifestPath(), JSON.stringify(manifest)]]);
    for (const [name, body] of files) byPath.set(productPath(manifest.files[name]), body);
    // Round seventy-seven: the build's search key files are stored under their hash and named by the search's directories, not the manifest; the bucket holds them as it holds every file the build writes.
    for (const [h, body] of stored) byPath.set(productPath(h), body);
    const fetchStatic = (async (u: string | URL) => { const b = byPath.get(String(u).replace(/^https?:\/\/[^/]+/, '').replace(/^\//, '')); return b != null ? new Response(b) : new Response('', { status: 404 }); }) as typeof fetch;
    _forgetIndex();
    const held = { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: manifest.id, etag: null, fromStore: false, manifest, buckets: manifest.buckets } as unknown as Loaded;
    const a = await searchAnswer(undefined, fetchStatic, 'crassula harmsii', 5, async () => null, held);
    expect('hits' in a && a.hits.map((e) => e.name)).toEqual([]);
    const b = await searchAnswer(undefined, fetchStatic, 'Crassula elegans', 5, async () => null, held);
    expect('hits' in b && b.hits.map((e) => e.name)).toEqual(['Crassula elegans']);
  });
});

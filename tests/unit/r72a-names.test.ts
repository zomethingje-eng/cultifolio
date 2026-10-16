/**
 * Round 72, A (the deep review): names and identifiers read over the whole live corpus (4c784c5dc7ca2448) against
 * Kew's WCVP. This file: the offline Kew fill, `--fill kew-names` (new in round 72; every case fails on r72base, where the module does not exist).
 *   - 227 pages cited an author who is not the author of the name they link (Ixora coccinea "Comm. ex Lam." beside
 *     Kew's 753844-1, Ixora coccinea L.), and 12 a backbone citation cut off after its parenthesis.
 *   - Echinocereus marksianus linked https://www.ipni.org/n/2782687-4, Kew's own number for a name IPNI does not hold.
 *   - Cochemiea matehualensis lost its POWO link, and its record said Kew's "(Backeb.) M.H.J.van der Meer" was another
 *     name: GBIF cites the basionym "(Backeb. ex Spine)".
 *   - 138 pages Kew holds by their name and author linked no POWO or IPNI, because their item carried none.
 */
import { describe, it, expect } from 'vitest';
import { kewCitation, fillKewNames, KewNamesIndex, kewSynonyms, kewAcceptedElsewhere, type KewRow } from '$dossier/kew-names';
import { NameBlock } from '$dossier/schema';
import { parse } from 'valibot';

// Kew's rows as wcvp_names.csv holds them (2026-06-04 file), cut to the fields the fill reads.
const K = (id: string, name: string, authors: string, status: string, accepted: string, powo: string, rank = 'Species', parent = ''): KewRow => ({ id, name, authors, status, rank, accepted, parent, powo });
const IDX = new KewNamesIndex();
for (const r of [
  K('103356', 'Ixora coccinea', 'L.', 'Accepted', '103356', '753844-1'),
  K('103355', 'Ixora coccinea', 'Comm. ex Lam.', 'Invalid', '2788267', '753843-1'),
  K('2788267', 'Embothrium coccineum', 'J.R.Forst. & G.Forst.', 'Accepted', '2788267', '1-1'),
  K('2975095', 'Fragaria virginiana', 'Mill.', 'Accepted', '2975095', '318974-2'),
  K('2363350', 'Mesembryanthemum pallens', 'Aiton', 'Accepted', '2363350', '363236-1'),
  K('2808156', 'Ferocactus glaucescens', '(DC.) Britton & Rose', 'Accepted', '2808156', '103632-2'),
  K('2808157', 'Echinocactus glaucescens', 'DC.', 'Synonym', '2808156', '103633-2'),
  K('2799913', 'Eucalyptus camaldulensis', 'Dehnh.', 'Accepted', '2799913', '592777-1'),
  K('2414100', 'Parodia × erubescens', '(Osten) D.R.Hunt', 'Accepted', '2414100', '1001459-1'),
  // Allium ampeloprasum: Kew accepts Allium porrum L. apart; Allium porrum var. x is the leek's own variety here only.
  K('2856', 'Allium ampeloprasum', 'L.', 'Accepted', '2856', '527900-1'),
  K('2857', 'Allium porrum', 'L.', 'Accepted', '2857', '528000-1'),
  K('2858', 'Allium holmense', 'Mill.', 'Synonym', '2856', '527950-1'),
  K('2859', 'Allium ampeloprasum var. babingtonii', '(Borrer) Syme', 'Accepted', '2859', '527910-1', 'Variety', '2856'),
  K('2860', 'Allium babingtonii', 'Borrer', 'Synonym', '2859', '527960-1'),
  K('2861', 'Allium scorodoprasum', 'L.', 'Misapplied', '2856', '527970-1'),
  K('2746245', 'Babiana odorata', 'L.Bolus', 'Accepted', '2746245', '436000-1'),
  K('502821', 'Ceropegia macrocarpa', 'J.N.Haage & E.Schmidt', 'Unplaced', '', '77238679-1')
]) IDX.add(r);
const rowOf = (n: string) => IDX.byPowo.get(n);
const page = (key: number, scientific: string, authorship: string, n?: string, extra: Record<string, unknown> = {}) => ({ key, name: { scientific, authorship, synonyms: [] as string[], vernacular: [] as Array<{ name: string; lang?: string }>, ...extra }, ids: n ? { powo: `urn:lsid:ipni.org:names:${n}`, ipni: n } : {}, upstream: { 'gbif.species': { status: 'ok', at: 'x' }, 'gbif.vernacular': { status: 'ok', at: 'x' } } as Record<string, { status: string; at: string; detail?: string }> });
const memStore = (docs: Record<string, any>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });

describe('a page cites the name it links (A1)', () => {
  it.each([
    [8793122, 'Ixora coccinea', 'Comm. ex Lam.', '753844-1', 'L.', '103356'],
    [7950792, 'Fragaria virginiana', 'Duchesne', '318974-2', 'Mill.', '2975095'],
    [7329498, 'Mesembryanthemum pallens', '(Sol.) ', '363236-1', 'Aiton', '2363350'],
    [11869920, 'Eucalyptus camaldulensis', 'Denham', '592777-1', 'Dehnh.', '2799913']
  ])('%s %s %s: Kew\'s %s is %s', (key, scientific, authorship, n, kew, id) => {
    expect(kewCitation(page(key, scientific, authorship, n), rowOf)).toEqual({ authorship: kew, cited: { gbif: authorship.trim(), kew: id } });
  });
  it('a citation that agrees changes nothing (guard)', () => {
    expect(kewCitation(page(1, 'Ixora coccinea', 'L.', '753844-1'), rowOf)).toBeNull();
  });
  it('a linked number of other words is not cited on this name (guard: Bisnaga glaucescens links Ferocactus glaucescens)', () => {
    expect(kewCitation(page(11098779, 'Bisnaga glaucescens', '(DC.) Orcutt', '103632-2'), rowOf)).toBeNull();
  });
  it('a hybrid sign does not make the words another name', () => {
    expect(kewCitation(page(3950131, 'Parodia erubescens', '(Osten) Hunt', '1001459-1'), rowOf)?.authorship).toBe('(Osten) D.R.Hunt');
  });
  it('a number Kew does not hold changes nothing (guard)', () => {
    expect(kewCitation(page(1, 'Ixora coccinea', 'Comm. ex Lam.', '9-9'), rowOf)).toBeNull();
  });
});

describe('--fill kew-names (A1, A2, A5, A8)', () => {
  const docs: Record<string, any> = {
    ixora: page(8793122, 'Ixora coccinea', 'Comm. ex Lam.', '753844-1'),
    leek: page(2856037, 'Allium ampeloprasum', 'L.', '527900-1', { synonyms: ['Allium porrum L.', 'Allium holmense Mill.', 'Allium porrum var. sectivum Lueder', 'Allium babingtonii Borrer'] }),
    bisnaga: page(11098779, 'Bisnaga glaucescens', '(DC.) Orcutt', '103632-2'),
    babiana: page(2746217, 'Babiana villosula', '(J.F.Gmel.) Ker Gawl. ex Steud.', undefined, { vernacular: [{ name: 'Babiana odorata', lang: 'cat', source: 'Catalogue of Life' }, { name: 'Purple babiana', lang: 'eng' }] }),
    macrocarpa: { ...page(9263110, 'Ceropegia macrocarpa', '(Sprenger) Bruyns'), upstream: { wikidata: { status: 'ok', at: 'x', detail: "IPNI and POWO linked by Kew's number, none (the item's: IPNI none, POWO 77238679-1)" } } },
    unread: page(1, 'Nusquamia ignota', 'Anon.')
  };
  const store = memStore(docs);
  const c = fillKewNames(store, IDX, '2026-06-04', new Set(['babiana villosula', 'babiana odorata']));
  it('cites Kew\'s author, keeps the backbone\'s, and says so', () => {
    expect(docs.ixora.name.authorship).toBe('L.'); // r72base: no fill; the page cited "Comm. ex Lam."
    expect(docs.ixora.name.cited).toEqual({ gbif: 'Comm. ex Lam.', kew: '103356' });
    expect(docs.ixora.upstream['gbif.species'].detail).toBe("GBIF's key 8793122 is Ixora coccinea Comm. ex Lam.; the page links Kew's Ixora coccinea L., and the name is cited as Kew cites it");
  });
  it('name.kew: the entry, Kew\'s other names for it (its varieties\' too, misapplied names never), and the older names Kew accepts apart', () => {
    expect(docs.ixora.name.kew).toEqual({ entry: '103356', synonyms: [], acceptedElsewhere: [], file: '2026-06-04' });
    expect(docs.leek.name.kew).toEqual({ entry: '2856', synonyms: ['Allium babingtonii', 'Allium holmense'], acceptedElsewhere: ['Allium porrum L.'], file: '2026-06-04' });
    expect(docs.bisnaga.name.kew).toMatchObject({ entry: '2808156', synonyms: ['Echinocactus glaucescens', 'Ferocactus glaucescens'] });
    expect(docs.unread.name.kew).toEqual({ entry: '', synonyms: [], acceptedElsewhere: [], file: '2026-06-04' });
  });
  it('drops a common name that is a binomial the reference or Kew holds, and says so', () => {
    expect(docs.babiana.name.vernacular.map((v: { name: string }) => v.name)).toEqual(['Purple babiana']);
    expect(docs.babiana.upstream['gbif.vernacular'].detail).toBe('"Babiana odorata" not shown: a scientific name Kew or this reference holds');
  });
  it('Ceropegia macrocarpa: the record says Kew holds the name only under another author, and no POWO link', () => {
    expect(docs.macrocarpa.upstream.wikidata.detail).toBe("Kew holds this name only under another author (Ceropegia macrocarpa J.N.Haage & E.Schmidt); no POWO link (the item's: IPNI none, POWO 77238679-1)");
  });
  it('counts, and a second run changes nothing', () => {
    expect(c).toMatchObject({ read: 6, changed: 6, cited: 1, elsewhere: 1, vernacularDropped: 1 });
    const again = fillKewNames(store, IDX, '2026-06-04', new Set(['babiana villosula', 'babiana odorata']));
    expect(again).toMatchObject({ read: 6, changed: 0, cited: 1 });
  });
  it('a homonym key cited by `kewName` gets its fields from its record', () => {
    const d = { ...page(7872219, 'Rubus parviflorus', 'Nutt.', '298093-2'), upstream: { 'gbif.species': { status: 'ok', at: 'x', detail: "GBIF's key 7872219 is Rubus parviflorus Kük.; Kew accepts Rubus parviflorus Nutt., and the name is cited as Kew accepts it; its synonyms …" } } };
    const i2 = new KewNamesIndex(); i2.add(K('2985176', 'Rubus parviflorus', 'Nutt.', 'Accepted', '2985176', '298093-2'));
    const ds: Record<string, any> = { r: d };
    fillKewNames(memStore(ds), i2, '2026-06-04');
    expect(ds.r.name.cited).toEqual({ gbif: 'Kük.', kew: '2985176' });
  });
  it('the readers: absent is "not read", never none', () => {
    expect(kewSynonyms(docs.leek.name)).toEqual(['Allium babingtonii', 'Allium holmense']);
    expect(kewSynonyms({})).toBeUndefined();
    expect(kewAcceptedElsewhere(docs.leek.name)).toEqual(['Allium porrum L.']);
  });
  it('the schema keeps both fields (a dossier filled is served with them)', () => {
    const v = { ...docs.ixora.name, status: 'accepted' };
    expect(parse(NameBlock, v)).toMatchObject({ cited: { gbif: 'Comm. ex Lam.', kew: '103356' }, kew: { entry: '103356' } });
  });
});


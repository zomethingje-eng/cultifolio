/**
 * Round sixty-nine, triage-68 N1 (S-F1, R46-3): an older name of two species. The species route's redirect takes the
 * species that shows the name first; a name two species show, or that two species hold only for the search, answers
 * no one species (rule 3), and `ambiguousSynonym` names every holder for the 404. The search puts the species that
 * keeps the older name's epithet first, then one that shows it. The four live cases, as the live index holds them.
 * Each case FAILED on the base unless it says "guard".
 *
 * Round seventy (triage-69 F1, S-F1): a name two species hold never redirects, whichever of them shows it, so the first
 * block's shared names are now 404s that name both, and `ambiguousSynonym` gives the holders in the search's order (the
 * species that keeps the epithet first, then one that shows it). The cases are changed so, and say what round
 * sixty-nine expected.
 */
import { describe, it, expect } from 'vitest';
import { indexMaps, ambiguousSynonym, type IndexEntry, type Loaded } from '$lib/server/dossiers';
import { synonymInIndex } from '$lib/server/synonyms';
import { prepare, search } from '$core/search';

const six = (g: string) => ['a', 'b', 'c', 'd', 'e'].map((x) => `${g} ${x}x`);
const entry = (key: number, name: string, syn: string[] = [], older: string[] = []): IndexEntry => ({ key, slug: name.toLowerCase().replace(/ /g, '-'), name, photos: 0, open: 0, climate: 'ok', ...(syn.length ? { syn } : {}), ...(older.length ? { older } : {}) });
// In the index's order, the alphabet: on the base the first holder took every name.
const idx: IndexEntry[] = [
  entry(1, 'Acanthocereus tetragonus', six('Cereus'), ['Cereus undulatus']),
  entry(2, 'Adromischus filicaulis', ['Cotyledon mammillaris']),
  entry(3, 'Adromischus mammillaris', ['Cotyledon mammillaris']),
  entry(4, 'Aglaia odorata', ['Murraya exotica']),
  entry(5, 'Aloe vera', six('Aloe'), ['Aloe variegata']),
  entry(6, 'Ariocarpus kotschoubeyanus', six('Mammillaria'), ['Mammillaria sulcata']),
  entry(7, 'Coryphantha sulcata', six('Echinocactus'), ['Mammillaria sulcata']),
  entry(8, 'Gonialoe variegata', ['Aloe variegata']),
  entry(9, 'Murraya paniculata', six('Chalcas'), ['Murraya exotica']),
  entry(10, 'Selenicereus undatus', ['Cereus undulatus']),
  entry(11, 'Bisnaga glaucescens', six('Echinocactus'), ['Ferocactus glaucescens']),
  entry(12, 'Cephalocereus senilis', six('Cereus'), ['Euporteria senilis']),
  entry(13, 'Eriosyce senilis', ['Euporteria senilis'])
];
const held = { idx } as unknown as Loaded;
const at = (slug: string) => synonymInIndex(undefined, fetch, slug, held);

describe('N1: an address under an older name of one species goes there; of two, to neither (round seventy, F1)', () => {
  // Round sixty-nine sent each of these to the species that shows it; round seventy names both holders instead.
  it('Aloe variegata, shown by Gonialoe variegata and held for the search by Aloe vera, answers neither', async () => {
    expect(await at('aloe-variegata')).toBeNull();
    expect(ambiguousSynonym(idx, 'Aloe variegata')?.map((e) => e.name)).toEqual(['Gonialoe variegata', 'Aloe vera']);
  });
  it('Cereus undulatus answers neither Selenicereus undatus nor Acanthocereus tetragonus', async () => {
    expect(await at('cereus-undulatus')).toBeNull();
    expect(ambiguousSynonym(idx, 'Cereus undulatus')?.map((e) => e.name)).toEqual(['Selenicereus undatus', 'Acanthocereus tetragonus']);
  });
  it('Murraya exotica answers neither Aglaia odorata, which shows it, nor Murraya paniculata', async () => {
    expect(await at('murraya-exotica')).toBeNull();
  });
  it('guard: a name one species holds for the search alone still redirects', async () => {
    expect((await at('ferocactus-glaucescens'))?.slug).toBe('bisnaga-glaucescens');
  });
});

describe('N1: a name two species show, or two hold only for the search, does not redirect', () => {
  it('Cotyledon mammillaris, shown by two Adromischus, answers neither, and names both', async () => {
    expect(await at('cotyledon-mammillaris')).toBeNull();
    // The search's order (round seventy): the species that keeps the epithet first.
    expect(ambiguousSynonym(idx, 'Cotyledon mammillaris')?.map((e) => e.name)).toEqual(['Adromischus mammillaris', 'Adromischus filicaulis']);
    expect(indexMaps(idx).bySynonym.has('cotyledon mammillaris')).toBe(false);
  });
  it('Mammillaria sulcata, held by two for the search alone, answers neither, and names both', async () => {
    expect(await at('mammillaria-sulcata')).toBeNull();
    expect(ambiguousSynonym(idx, 'mammillaria  sulcata')?.map((e) => e.name)).toEqual(['Coryphantha sulcata', 'Ariocarpus kotschoubeyanus']);
  });
  it('names the species that show it first, then those that hold it for the search', () => {
    const three = [entry(1, 'Aa one', [], ['Xx yy']), entry(2, 'Bb two', ['Xx yy']), entry(3, 'Cc three', ['Xx yy'])];
    expect(ambiguousSynonym(three, 'Xx yy')?.map((e) => e.key)).toEqual([2, 3, 1]);
  });
});

describe('N1: the search puts the species that keeps the older name first', () => {
  const P = prepare(idx);
  const first = (q: string) => search(P, q, 5).map((e) => e.name);
  it('"Aloe variegata" is Gonialoe variegata before Aloe vera', () => {
    expect(first('Aloe variegata')).toEqual(['Gonialoe variegata', 'Aloe vera']);
  });
  it('"Mammillaria sulcata" is Coryphantha sulcata before Ariocarpus kotschoubeyanus', () => {
    expect(first('Mammillaria sulcata')[0]).toBe('Coryphantha sulcata');
  });
  it('"Cotyledon mammillaris" is Adromischus mammillaris before A. filicaulis', () => {
    expect(first('Cotyledon mammillaris')[0]).toBe('Adromischus mammillaris');
  });
  it('both keeping the epithet, the one that shows it: "Euporteria senilis" is Eriosyce senilis before Cephalocereus senilis', () => {
    expect(first('Euporteria senilis')).toEqual(['Eriosyce senilis', 'Cephalocereus senilis']);
  });
  it('then the species that shows it: "Cereus undulatus" is Selenicereus undatus first, "Murraya exotica" Aglaia odorata', () => {
    expect(first('Cereus undulatus')[0]).toBe('Selenicereus undatus');
    expect(first('Murraya exotica')[0]).toBe('Aglaia odorata');
  });
});

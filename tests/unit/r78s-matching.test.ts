/**
 * Round seventy-eight, agent S: the match of a source's name to a species Kew accepts (rule 3, and iNaturalist's POWO
 * framework, decision 5), on recorded rows: Kew's own rows (wcvp_names.csv of 2026-06-04), GBIF's backbone export and
 * iNaturalist's species counts of 2026-10-17. Every refusal says why. None of this existed before the round: on the base
 * the module is missing and every test fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  loadKew, speciesOf, matchStrict, matchInat, deviationsOf, backboneLine, gbifKeyFor, collectorSpecies, select, referenceSpecies, words, REFUSALS,
  type BackboneName, type InatTaxon, type FrameworkRelationship
} from '../../scripts/select-species-lib';

const fx = (f: string) => readFileSync(`tests/unit/fixtures/r78s/${f}`, 'utf8');
const kew = loadKew(fx('wcvp-sample.csv').split('\n'));
const inat = JSON.parse(fx('inat-sample.json')) as Array<{ count: number; taxon: InatTaxon }>;
const taxon = (name: string) => inat.find((r) => r.taxon.name === name)!.taxon;

describe("Kew's rows lead to one accepted species", () => {
  it('an accepted species is itself; a synonym leads to its accepted species; an accepted variety to its parent species', () => {
    expect(speciesOf(kew, '298116')).toBe('298116'); // Aloe vera (L.) Burm.f.
    expect(speciesOf(kew, '277224')).toBe('490814'); // Haworthia limifolia Marloth → Haworthiopsis limifolia
    expect(speciesOf(kew, '3263245')).toBe('2742101'); // Crassula sarmentosa var. sarmentosa → Crassula sarmentosa
  });
  it('an artificial hybrid is marked, never taken as a species; misapplied and unplaced rows lead nowhere', () => {
    expect(speciesOf(kew, '2411253')).toBe('hybrid:2411253');
    expect(speciesOf(kew, '518217')).toBeNull();
    expect(speciesOf(kew, '518500')).toBeNull();
  });
});

describe('the strict rule', () => {
  it('takes a name whose every row leads to one species', () => {
    expect(matchStrict(kew, 'Haworthia limifolia')).toEqual({ id: '490814', how: 'strict' });
    expect(matchStrict(kew, 'Hibiscus rosa-sinensis')).toEqual({ id: '2850448', how: 'strict' }); // the hybrid sign set aside
  });
  it('refuses a name whose rows lead to two species, and says so', () => {
    // Aloe vera Mill. is an illegitimate homonym filed under Aloe succotrina: two species.
    expect(matchStrict(kew, 'Aloe vera')).toEqual({ id: null, refused: REFUSALS.two });
    expect(matchStrict(kew, 'Acer palmatum')).toEqual({ id: null, refused: REFUSALS.two });
    expect(matchStrict(kew, 'Crassula ovata')).toEqual({ id: null, refused: REFUSALS.two });
  });
  it('with an author (GBIF), the rows of the same author decide', () => {
    expect(matchStrict(kew, 'Aloe vera', '(L.) Burm.f.')).toEqual({ id: '298116', how: 'author' });
    expect(matchStrict(kew, 'Aloe vera', 'Mill.')).toEqual({ id: '298036', how: 'author' });
    // An author Kew does not hold falls back to the strict rule.
    expect(matchStrict(kew, 'Acer palmatum', 'Thunb. ex Murr.')).toEqual({ id: null, refused: REFUSALS.two });
  });
  it('refuses a name Kew does not hold, an artificial hybrid, and rows only unplaced', () => {
    expect(matchStrict(kew, 'Plantus unknownii')).toEqual({ id: null, refused: REFUSALS.noRow });
    expect(matchStrict(kew, '× Pachyveria sobrina')).toEqual({ id: null, refused: REFUSALS.hybrid });
    expect(matchStrict(kew, 'Utricularia longifolia')).toEqual({ id: null, refused: REFUSALS.nowhere });
  });
});

describe("iNaturalist's names: the strict rule, then its POWO framework", () => {
  it('takes the one species Kew accepts of the words where the strict rule found two (the framework)', () => {
    expect(matchInat(kew, taxon('Aloe vera'), null)).toEqual({ id: '298116', how: 'framework' });
    expect(matchInat(kew, taxon('Acer palmatum'), null)).toEqual({ id: '2616153', how: 'framework' });
    expect(matchInat(kew, taxon('Crassula ovata'), null)).toEqual({ id: '2741970', how: 'framework' });
    expect(matchInat(kew, taxon('Hibiscus × rosa-sinensis'), null)).toEqual({ id: '2850448', how: 'strict' });
  });
  it('refuses ranks above species, and does not apply the framework outside vascular plants', () => {
    expect(matchInat(kew, taxon('Hemigraphis'), null)).toEqual({ id: null, refused: REFUSALS.notSpecies });
    const moss = taxon('Marchantia polymorpha');
    expect(moss.ancestor_ids).not.toContain(211194);
    expect(matchInat(kew, moss, null)).toEqual({ id: null, refused: REFUSALS.noRow });
    // A name outside vascular plants whose rows lead to two species is not taken by the framework.
    const fake = { ...taxon('Aloe vera'), name: 'Acer palmatum', ancestor_ids: [] };
    expect(matchInat(kew, fake, null)).toEqual({ id: null, refused: REFUSALS.two });
    // An inactive iNaturalist taxon is an older name: the strict rule alone, never the framework.
    expect(matchInat(kew, { ...taxon('Aloe vera'), is_active: false }, null)).toEqual({ id: null, refused: REFUSALS.two });
    expect(matchInat(kew, { ...taxon('Aloe vera'), name: 'Haworthia limifolia', is_active: false }, null)).toEqual({ id: '490814', how: 'strict' });
  });
  it('a listed deviation decides first: one-to-one and many-to-one map to the POWO taxon; the rest are refused', () => {
    const rels: FrameworkRelationship[] = [
      { relationship: 'one_to_one', taxa: [{ id: 126882, name: 'Aloe vera', rank: 'species' }], external_taxa: [{ name: 'Aloe succotrina', url: 'http://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:530010-1' }] },
      { relationship: 'many_to_one', taxa: [{ id: 63512, name: 'Acer palmatum', rank: 'species' }, { id: 1, name: 'Acer x', rank: 'species' }], external_taxa: [{ name: 'Acer macrophyllum', url: null }] },
      { relationship: 'one_to_many', taxa: [{ id: 76465, name: 'Crassula ovata', rank: 'species' }], external_taxa: [{ name: 'Crassula ovata' }, { name: 'Crassula portulacea' }] },
      { relationship: 'match', taxa: [{ id: 186099, name: 'Lithops aucampiae', rank: 'species' }], external_taxa: [{ name: 'Lithops aucampiae' }] },
      { relationship: 'not_external', taxa: [{ id: 1628098, name: 'Hibiscus × rosa-sinensis', rank: 'hybrid' }], external_taxa: [] }
    ];
    const dev = deviationsOf(rels);
    expect(dev.size).toBe(5);
    expect(dev.has(186099)).toBe(false);
    // POWO's number not in this sample: matched by the external name, strictly (Aloe succotrina is one species).
    expect(matchInat(kew, taxon('Aloe vera'), dev)).toEqual({ id: '298036', how: 'deviation' });
    expect(matchInat(kew, taxon('Acer palmatum'), dev)).toEqual({ id: '2615900', how: 'deviation' });
    expect(matchInat(kew, taxon('Crassula ovata'), dev)).toEqual({ id: null, refused: `${REFUSALS.deviation} (one_to_many)` });
    expect(matchInat(kew, taxon('Hibiscus × rosa-sinensis'), dev)).toEqual({ id: null, refused: `${REFUSALS.deviation} (not_external)` });
    // POWO's number, when given and held, decides.
    const viaPowo = deviationsOf([{ relationship: 'one_to_one', taxa: [{ id: 126882, name: 'Aloe vera', rank: 'species' }], external_taxa: [{ name: 'Aloe x', url: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:536105-1' }] }]);
    expect(matchInat(kew, taxon('Aloe vera'), viaPowo)).toEqual({ id: '490814', how: 'deviation' });
  });
});

describe("GBIF's backbone", () => {
  const bb = fx('backbone-sample.txt').split('\n').map(backboneLine).filter((b): b is BackboneName => !!b);
  it('reads a species line: the key, the canonical name, the author less the year, the status', () => {
    // Round eighty (A): with the usage's family and order keys too (`familyRefuses`).
    expect(bb.find((b) => b.key === '2777724')).toMatchObject({ key: '2777724', name: 'Aloe vera', author: '(L.) Burm.f.', status: 'ACCEPTED' });
    expect(bb.find((b) => b.key === '7473344')?.author).toBe('L.');
    expect(backboneLine('9995154\t7763\t\\N\tf\tDOUBTFUL\tGENUS\t{}\tx\tSOURCE\t1\t8')).toBeNull();
  });
  it("gives Kew's species one GBIF key only where it is unambiguous", () => {
    const byWords = new Map<string, BackboneName[]>();
    for (const b of bb) byWords.set(words(b.name), [...(byWords.get(words(b.name)) ?? []), b]);
    expect(gbifKeyFor(kew.rows.get('298116')!, byWords)).toBe('2777724'); // one accepted, one doubtful: the accepted
    expect(gbifKeyFor(kew.rows.get('2616153')!, byWords)).toBe('3189882'); // Acer palmatum Thunb.
    expect(gbifKeyFor(kew.rows.get('2741970')!, byWords)).toBe('5362063'); // one accepted; the synonyms do not count
    expect(gbifKeyFor(kew.rows.get('490814')!, byWords)).toBe('9509404');
    expect(gbifKeyFor(kew.rows.get('298036')!, byWords)).toBeNull(); // Aloe succotrina: not in this sample
    // Two accepted keys and neither of Kew's author: none.
    const two = new Map([['aloe vera', [{ key: '1', name: 'Aloe vera', author: 'A.', status: 'ACCEPTED' }, { key: '2', name: 'Aloe vera', author: 'B.', status: 'ACCEPTED' }]]]);
    expect(gbifKeyFor(kew.rows.get('298116')!, two)).toBeNull();
    // Of two accepted, Kew's author; with none accepted, the one doubtful.
    two.get('aloe vera')!.push({ key: '3', name: 'Aloe vera', author: '(L.) Burm.f.', status: 'ACCEPTED' });
    expect(gbifKeyFor(kew.rows.get('298116')!, two)).toBe('3');
    const doubtful = new Map([['aloe vera', [{ key: '4', name: 'Aloe vera', author: 'L.', status: 'DOUBTFUL' }, { key: '5', name: 'Aloe vera', author: 'Mill.', status: 'SYNONYM' }]]]);
    expect(gbifKeyFor(kew.rows.get('298116')!, doubtful)).toBe('4');
  });
});

describe('the selection', () => {
  it('takes three records or more, iNaturalist and GBIF together, and every accepted species of a collector genus, hybrids aside', () => {
    const inatBy = new Map([['298116', 2], ['2616153', 1], ['2741970', 3], ['2850448', 63288]]);
    const gbifBy = new Map([['298116', 1], ['2616153', 1], ['490814', 2]]);
    const collector = collectorSpecies(kew, new Set(['Haworthiopsis', 'Pachyveria']));
    expect(collector.sort()).toEqual(['490814', '490875']); // the artificial hybrids of × Pachyveria are not accepted species
    const list = select(kew, inatBy, gbifBy, collector, (r) => (r.id === '298116' ? '2777724' : null));
    expect(list.every((s) => !s.byReference)).toBe(true);
    expect(list.map((s) => [s.name, s.byCounts, s.byGenus, s.gbifKey])).toEqual([
      ['Aloe vera', true, false, '2777724'], // 2 + 1
      ['Crassula ovata', true, false, null], // 3 + 0
      ['Haworthiopsis koelmaniorum', false, true, null], // no record, kept by its genus
      ['Haworthiopsis limifolia', false, true, null], // 0 + 2, kept by its genus
      ['Hibiscus × rosa-sinensis', true, false, null] // an accepted nothospecies counts
    ]); // Acer palmatum, 1 + 1, is out
  });
  it('keeps every species already in the reference, and a page Kew cannot place by its own GBIF key', () => {
    const pages = [
      { key: 3189882, name: 'Acer palmatum', author: 'Thunb.', family: 'Sapindaceae', kewEntry: '2616153' }, // by the entry it cites
      { key: 5362063, name: 'Crassula ovata', author: '(Mill.) Druce', family: 'Crassulaceae', kewEntry: null }, // strict: two species, so not by name
      { key: 9509404, name: 'Haworthia limifolia', author: 'Marloth', family: 'Asphodelaceae', kewEntry: null }, // a synonym, strictly
      { key: 7876017, name: 'Tylecodon cacaliodes', author: '(L.fil.) Toelken', family: 'Crassulaceae', kewEntry: null } // no Kew row
    ];
    const ref = referenceSpecies(kew, pages);
    expect([...ref.byKew.keys()].sort()).toEqual(['2616153', '490814']);
    expect(ref.unmatched.map((p) => p.name)).toEqual(['Crassula ovata', 'Tylecodon cacaliodes']);
    const list = select(kew, new Map([['2616153', 1]]), new Map(), [], () => null, 3, ref);
    expect(list.map((s) => [s.id, s.name, s.byCounts, s.byReference, s.gbifKey])).toEqual([
      ['2616153', 'Acer palmatum', false, true, '3189882'], // one page: that page's own GBIF key
      [null, 'Crassula ovata', false, true, '5362063'],
      ['490814', 'Haworthiopsis limifolia', false, true, '9509404'],
      [null, 'Tylecodon cacaliodes', false, true, '7876017']
    ]);
  });
});

/**
 * Round ninety-three: two of the kinds of page round ninety-two's first flowering run found sharply apart (its record, 15
 * November 2026), matched by rule where they were left out:
 *
 *   1. GBIF holds a species Kew accepts, with a page here and no GBIF key, as a synonym of another page's species, and
 *      iNaturalist files its observations under that synonym, the species' own name and author. Round eighty-six's rule
 *      (D6) gave such a page the varieties GBIF files under the other page, "never a species", so the page read a few
 *      records and the other page kept the rest: Oxalis smalliana read GBIF's Oxalis oregana var. smalliana and f.
 *      smalliana, while its 7,996 observations annotated flowering, under GBIF's Oxalis smalliana R.Knuth (3626515, a
 *      synonym of Oxalis oregana, 8017574), were counted on Oxalis oregana. `speciesFromHolder` takes the species too, by
 *      the same type rule; the other page leaves its records out (`givenAway`), as it does a variety's.
 *   2. GBIF spells a name with its epithet in another gender than Kew does, by the same author: "Rhus copallina L." (GBIF's
 *      3190557, 32,285 observations) for Kew's Rhus copallinum L., a page with no GBIF key, which read none of them. An
 *      adjectival epithet agrees with its genus, and the other gender's spelling is the same name (ICN Art. 23.5, 32.2):
 *      `genderForms` gives the other spellings, and `kewReading` reads one back to Kew's row by its author, never by the
 *      words alone.
 *
 * The rows: Kew's wcvp_names.csv of 2026-06-04 (2394318 Oxalis smalliana R.Knuth; 2401802 Oxalis oregana var. smalliana,
 * homotypic, filed under it; 2422860 Rhus copallinum L.); Oxalis oregana's row an id made here (90000010). GBIF's keys as
 * GBIF's species API answered on 16 November 2026 (3626515, 3627692, 8017574, 3190557).
 *
 * On f382389 these FAILED: `genderForms` and `kewPlantWords` did not exist; `extraKeysFor` took no `speciesFromHolder` and
 * refused 3626515 ("GBIF files it under key 8017574, another page of this reference"); and Rhus copallinum read no key
 * (GBIF's words "rhus copallina" were never asked of the backbone, and Kew holds no row of them). The `it`s marked guard,
 * and the flowering one (round ninety-two's `countUnder`, which needs no change: it reads the keys the lists give), pass
 * on both.
 */
import { describe, it, expect } from 'vitest';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, genderForms, kewReading, kewPlantWords, extraWhy, type Usage, type Backbone } from '$dossier/extra-keys';
import { countUnder, parseFloweringRows } from '$dossier/flowering-gbif';

const K = (id: string, name: string, authors: string, status: string, accepted: string, rank = 'Species', homotypic = false): KewRow => ({ id, name, authors, status, rank, accepted, parent: '', powo: '', ...(homotypic ? { homotypic } : {}) });
const U = (key: number, label: string, canonical: string, author: string, status: string, parent?: number, rank = 'SPECIES'): Usage => ({ key, parent, status, rank, canonical, author, label });
const MARK: Record<string, string> = { VARIETY: 'var.', FORM: 'f.', SUBSPECIES: 'subsp.' };
const kewWords = (u: Usage) => { const w = u.canonical.toLowerCase().split(' '); return u.rank === 'SPECIES' ? w.join(' ') : `${w[0]} ${w[1]} ${MARK[u.rank]} ${w[2]}`; };
const backbone = (usages: Usage[]): Backbone => {
  const byKey = new Map(usages.map((u) => [u.key, u]));
  return {
    usagesOf: (w) => usages.filter((u) => kewWords(u) === w),
    usage: (k) => byKey.get(k),
    lineage: (k) => { const out = [k]; let u = byKey.get(k); while (u?.parent && byKey.has(u.parent)) { out.push(u.parent); u = byKey.get(u.parent); } return out; },
    under: (k) => usages.filter((u) => u.parent === k)
  };
};

describe('genderForms: the same words with the epithet in each other gender', () => {
  it('-us, -a, -um; -is, -e; -er, -ra, -rum and -er, -era, -erum; never the words themselves', () => {
    expect(genderForms('rhus copallinum')).toEqual(['rhus copallina', 'rhus copallinus']);
    expect(genderForms('salvia officinalis')).toEqual(['salvia officinale']);
    expect(genderForms('acer rubrum')).toEqual(expect.arrayContaining(['acer ruber', 'acer rubra']));
    expect(genderForms('carex aspera')).toEqual(expect.arrayContaining(['carex asper', 'carex asperum']));
    expect(genderForms('oxalis oregana var. smalliana')).toEqual(['oxalis oregana var. smallianum', 'oxalis oregana var. smallianus']);
    expect(genderForms('rhus copallinum')).not.toContain('rhus copallinum');
  });
  it('a stem under three letters, a genus alone and an epithet that is no Latin ending give none (guard)', () => {
    expect(genderForms('poa ana')).toEqual([]);
    expect(genderForms('rhus')).toEqual([]);
    expect(genderForms('ficus benjamina')).not.toContain('ficus benjamin');
    expect(genderForms('aloe vossii')).toEqual([]);
  });
});

describe('2. a GBIF name spelt in another gender is read back to Kew\'s row by its author', () => {
  const idx = new KewNamesIndex();
  idx.add(K('2422860', 'Rhus copallinum', 'L.', 'Accepted', '2422860'));
  const copallina = U(3190557, 'Rhus copallina L.', 'Rhus copallina', 'L.', 'ACCEPTED');
  it('Rhus copallina L. is Kew\'s Rhus copallinum L.; by another author, or with none, it is not', () => {
    expect(kewReading(copallina, idx)).toMatchObject({ how: 'gender', rows: [{ id: '2422860' }] });
    expect(kewReading({ ...copallina, author: 'Mill.', label: 'Rhus copallina Mill.' }, idx)).toEqual({ rows: [], why: 'Kew holds no row of these words' });
    expect(kewReading({ ...copallina, author: '' }, idx)).toEqual({ rows: [], why: 'Kew holds no row of these words' });
  });
  it('where Kew holds a row of GBIF\'s own words, that row decides, not another gender (guard)', () => {
    const both = new KewNamesIndex();
    both.add(K('2422860', 'Rhus copallinum', 'L.', 'Accepted', '2422860'));
    both.add(K('90000020', 'Rhus copallina', 'Small', 'Accepted', '90000020'));
    expect(kewReading(copallina, both)).toEqual({ rows: [], why: 'Kew holds these words only by another author (Small)' });
  });
  it('the page without a GBIF key reads GBIF\'s key, said as the same name in another gender', () => {
    const bb = backbone([copallina]);
    const r = extraKeysFor({ key: null, entry: '2422860', id: 'k2422860' }, idx, bb, new Set([3190000]), new Map());
    expect(r.keys).toHaveLength(1);
    expect(r.keys[0]).toMatchObject({ pageId: 'k2422860', key: 3190557, how: 'gender', kew: '2422860', kewLabel: 'Rhus copallinum L. (accepted)' });
    expect(extraWhy(r.keys[0])).toBe("Kew's file holds it as Rhus copallinum L. (accepted), the same name with its epithet spelt in another gender");
  });
});

describe('1. a species GBIF holds as a synonym of another page\'s species is the page\'s own, where Kew accepts it', () => {
  const idx = new KewNamesIndex();
  for (const r of [
    K('2394318', 'Oxalis smalliana', 'R.Knuth', 'Accepted', '2394318'),
    K('2401802', 'Oxalis oregana var. smalliana', '(R.Knuth) M.Peck', 'Synonym', '2394318', 'Variety', true),
    K('90000011', 'Oxalis smallii', 'R.Knuth', 'Synonym', '2394318'),
    K('90000010', 'Oxalis oregana', 'Nutt. ex Torr. & A.Gray', 'Accepted', '90000010')
  ]) idx.add(r);
  const bb = backbone([
    U(8017574, 'Oxalis oregana Nutt. ex Torr. & A.Gray', 'Oxalis oregana', 'Nutt. ex Torr. & A.Gray', 'ACCEPTED'),
    U(3626515, 'Oxalis smalliana R.Knuth', 'Oxalis smalliana', 'R.Knuth', 'SYNONYM', 8017574),
    U(3627692, 'Oxalis oregana var. smalliana (R.Knuth) M.Peck', 'Oxalis oregana smalliana', '(R.Knuth) M.Peck', 'SYNONYM', 8017574, 'VARIETY'),
    U(90000012, 'Oxalis smallii R.Knuth', 'Oxalis smallii', 'R.Knuth', 'SYNONYM', 8017574)
  ]);
  const reference = new Set([8017574]);
  const page = { key: null, entry: '2394318', id: 'k2394318' };
  it('round eighty-six\'s rule takes the variety alone; with `speciesFromHolder` the species is taken too, from Oxalis oregana', () => {
    const d6 = extraKeysFor(page, idx, bb, reference, new Map(), new Map(), new Map(), { infraFromHolder: true });
    expect(d6.keys.map((k) => k.key)).toEqual([3627692]);
    expect(d6.refused.find((x) => x.key === 3626515)?.why).toBe('GBIF files it under key 8017574, another page of this reference');
    const on = extraKeysFor(page, idx, bb, reference, new Map(), new Map(), new Map(), { infraFromHolder: true, speciesFromHolder: true });
    expect(on.keys.map((k) => k.key)).toEqual([3626515, 3627692]);
    expect(on.keys.find((k) => k.key === 3626515)).toMatchObject({ from: 8017574, how: 'entry', kewLabel: 'Oxalis smalliana R.Knuth (accepted)' });
  });
  it('the type rule holds: a heterotypic synonym of the species stays the other page\'s (guard)', () => {
    const on = extraKeysFor(page, idx, bb, reference, new Map(), new Map(), new Map(), { infraFromHolder: true, speciesFromHolder: true });
    expect(on.keys.map((k) => k.key)).not.toContain(90000012);
    expect(on.refused.find((x) => x.key === 90000012)?.why).toMatch(/^heterotypic: the owner's decision/);
  });
  it('the other page\'s species is never taken, and a species GBIF accepts is no other page\'s to give (guard)', () => {
    expect(extraKeysFor({ key: null, entry: '90000010', id: 'k90000010' }, idx, bb, reference, new Map(), new Map(), new Map(), { infraFromHolder: true, speciesFromHolder: true }).keys).toEqual([]);
  });
  it('the words of the page that leaves them out name the plant, accepted or a name filed under one', () => {
    expect(kewPlantWords('Oxalis smalliana R.Knuth (accepted)')).toBe('Oxalis smalliana R.Knuth');
    expect(kewPlantWords('Trichocereus macrogonus var. pachanoi (Britton & Rose) Albesiano & R.Kiesling (synonym under Echinopsis pachanoi (Britton & Rose) H.Friedrich & G.D.Rowley)')).toBe('Echinopsis pachanoi (Britton & Rose) H.Friedrich & G.D.Rowley');
    expect(kewPlantWords('Eugenia cordata (Hochst. ex C.Krauss) G.Lawson (illegitimate under Syzygium cordatum Hochst. ex C.Krauss)')).toBe('Syzygium cordatum Hochst. ex C.Krauss');
  });
  it('flowering: the observations under the species\' key are counted on its page, and left off Oxalis oregana\'s', () => {
    const t = parseFloweringRows(['taxonkey\tacceptedtaxonkey\tspecieskey\tmonth\treproductivecondition\tn', '3626515\t8017574\t8017574\t4\tflowers\t60', '8017574\t8017574\t8017574\t4\tflowers\t30', '3627692\t8017574\t8017574\t5\tflowers\t2']);
    const smalliana = countUnder(t, { extra: [{ key: 3626515 }, { key: 3627692 }] });
    const oregana = countUnder(t, { own: 8017574, givenAway: new Set([3626515, 3627692]), extra: [] });
    expect(smalliana.months[3] + smalliana.months[4]).toBe(62);
    expect(oregana.months[3]).toBe(30);
    expect(oregana.months[4]).toBe(0);
  });
});

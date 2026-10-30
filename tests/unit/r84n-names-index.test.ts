/**
 * Round eighty-four (N): two rules of the reference's names.
 *
 * 1. D9 (review-d): a one-word English name several species of one genus hold heads only the one whose sources give it
 *    most often, and none where two give it equally often (`sharedHeadlines`); the others do not show it, and it stays
 *    searchable (`pooledSpellings`). Ficus tinctoria, whose one name is "Fig" (one source), shows no English name, and Ficus
 *    carica keeps "Fig" (six sources); "Bamboo", given once each to two Phyllostachys, heads neither. The species page reads
 *    the same answer from the dossier (`name.shared`, which `--index` writes), so page and index agree.
 * 2. A6b (outside review A): a page whose basionym Kew's file holds apart from the entry its older names lead to is two of
 *    Kew's records, and takes no range (`viaOlderNames` with the page's own name). Monsonia lheritieri (Sweet) Steud. took
 *    Sarcocaulon spinosum's range (Cape Provinces and Namibia) through Geranium spinosum, while Kew holds its basionym
 *    Sarcocaulon lheritieri Sweet as a record of its own, unplaced, in the Cape Provinces alone. Kew's rows are the file of
 *    2026-06-04's; GBIF's older names are the live dossier g8005942's.
 *
 * FAILS on r84base: `sharedHeadlines` and `oneWordNames` do not exist, `englishNames` reads no `shared`, and
 * `viaOlderNames` gives Monsonia lheritieri Sarcocaulon spinosum's range.
 */
import { describe, it, expect } from 'vitest';
import { englishNames, indexNames, oneWordNames, sharedHeadlines, pooledSpellings, type VernacularName } from '$dossier/index-entry';
import { WcvpIndex, type WcvpName, type WcvpDist } from '$dossier/bulk';

const v = (name: string, sources = 1, source?: string): VernacularName => ({ name, lang: 'eng', ...(source ? { source } : {}), ...(sources > 1 ? { sources } : {}) });

describe('a one-word name a genus shares heads one species at most (D9)', () => {
  const carica = [v('Fig', 6), v('Common fig', 2), v('Edible fig')];
  const tinctoria = [v('Fig')];
  const prolixa = [v('Fig'), v('Banyan')];
  const bambooA = [v('Bamboo')];
  const bambooB = [v('Bamboo'), v('Black bamboo')];
  const pages = [
    { key: 'k1', genus: 'Ficus', names: oneWordNames(carica) },
    { key: 'k2', genus: 'Ficus', names: oneWordNames(tinctoria) },
    { key: 'k3', genus: 'Ficus', names: oneWordNames(prolixa) },
    { key: 'k4', genus: 'Phyllostachys', names: oneWordNames(bambooA) },
    { key: 'k5', genus: 'Phyllostachys', names: oneWordNames(bambooB) },
    // Another genus's "Fig" is not compared (the search sets such a nickname back).
    { key: 'k6', genus: 'Opuntia', names: oneWordNames([v('Fig', 9)]) }
  ];
  const lost = sharedHeadlines(pages);
  it('the species its sources call so most often keeps it; on a tie, none does', () => {
    expect(lost.get('k1')).toBeUndefined();
    expect(lost.get('k2')).toEqual(['fig']);
    expect(lost.get('k3')).toEqual(['fig']);
    expect(lost.get('k4')).toEqual(['bamboo']);
    expect(lost.get('k5')).toEqual(['bamboo']);
    expect(lost.get('k6')).toBeUndefined();
  });
  it('what each shows, and the lost name is still searched', () => {
    expect(englishNames(carica, { genus: 'Ficus carica', shared: lost.get('k1') }).common).toBe('Fig');
    expect(englishNames(tinctoria, { genus: 'Ficus tinctoria', shared: lost.get('k2') })).toEqual({});
    expect(englishNames(prolixa, { genus: 'Ficus prolixa', shared: lost.get('k3') })).toEqual({ common: 'Banyan' });
    expect(englishNames(bambooB, { genus: 'Phyllostachys nigra', shared: lost.get('k5') })).toEqual({ common: 'Black bamboo' });
    expect(pooledSpellings(tinctoria, [])).toEqual(['Fig']);
    // Without the index's answer (a dossier written before), as before (guard).
    expect(englishNames(tinctoria, { genus: 'Ficus tinctoria' }).common).toBe('Fig');
    expect(indexNames(prolixa, { genus: 'Ficus prolixa' }).common).toBe('Fig');
  });
  it('generic nouns and longer names are not compared', () => {
    expect([...oneWordNames([v('Cactus'), v('Fig'), v('Weeping fig')]).keys()]).toEqual(['fig']);
  });
});

describe("a page whose basionym Kew holds apart takes no range (A6b)", () => {
  const nm = (id: string, name: string, status: string, acceptedId: string, authors: string, rank = 'Species'): WcvpName => ({ id, name, status, acceptedId, rank, authors });
  const ds = (id: string, l3: string, area: string): WcvpDist => ({ id, l3, area, introduced: false, extinct: false, doubtful: false });
  const kew = () => {
    const k = new WcvpIndex();
    for (const r of [
      nm('2588843', 'Sarcocaulon spinosum', 'Accepted', '2588843', '(Burm.f.) Kuntze'),
      nm('2824083', 'Geranium spinosum', 'Synonym', '2588843', 'Burm.f.'),
      nm('2588865', 'Sarcocaulon lheritieri', 'Unplaced', '', 'Sweet'),
      nm('2371982', 'Monsonia lheritieri', 'Illegitimate', '2588865', 'DC.')
    ]) k.addName(r, () => true);
    for (const d of [ds('2588843', 'CPP', 'Cape Provinces'), ds('2588843', 'NAM', 'Namibia'), ds('2588865', 'CPP', 'Cape Provinces')]) k.addDist(d);
    return k;
  };
  // GBIF's older names of g8005942, as the live dossier stores them, with their authors.
  const older = [
    { name: 'Geranium spinosum', authorship: 'Burm.fil.' },
    { name: 'Sarcocaulon lheritieri', authorship: '(DC.) Sweet' },
    { name: 'Sarcocaulon spinosum', authorship: '(Burm.fil.) Kuntze' },
    { name: 'Monsonia heritieri', authorship: 'Steud.' }
  ];
  it('Monsonia lheritieri: ambiguous, the record naming both', () => {
    const got = kew().viaOlderNames(older, { name: 'Monsonia lheritieri', authorship: '(Sweet) Steud.' });
    expect(got).toMatchObject({ ambiguous: expect.stringMatching(/Sarcocaulon spinosum.*basionym Sarcocaulon lheritieri \(DC\.\) Sweet is Kew's Sarcocaulon lheritieri Sweet, unplaced/) });
  });
  it('without the page\'s name, or with no basionym among the older names, as before (guards)', () => {
    expect(kew().viaOlderNames(older)).toMatchObject({ entry: { id: '2588843' } });
    expect(kew().viaOlderNames(older.filter((o) => !o.name.includes('lheritieri')), { name: 'Monsonia lheritieri', authorship: '(Sweet) Steud.' })).toMatchObject({ entry: { id: '2588843' } });
    // A basionym Kew files under the same entry is that entry: no ambiguity.
    const k = kew();
    k.addName(nm('9', 'Sarcocaulon burmanni', 'Synonym', '2588843', 'Sweet'), () => true);
    expect(k.viaOlderNames([{ name: 'Geranium spinosum', authorship: 'Burm.fil.' }, { name: 'Sarcocaulon burmanni', authorship: '(DC.) Sweet' }], { name: 'Monsonia burmanni', authorship: '(Sweet) Steud.' })).toMatchObject({ entry: { id: '2588843' } });
  });
});

describe('the names GBIF files under a species\' own varieties reach the search (A8, San Pedro)', async () => {
  const { InfraNames, backboneRow } = await import('$dossier/infra-names');
  const { prepare, search } = await import('$core/search');
  const { kewOlderOf } = await import('$dossier/index-entry');
  // GBIF's backbone as its API gave it on 30 October 2026: Trichocereus macrogonus (3952140), its two varieties, and the
  // names of species rank filed under var. pachanoi (11093098), each a synonym whose accepted usage is the variety.
  const line = (key: number, parent: number, syn: boolean, rank: string, canonical: string) => [key, parent, '\\N', syn ? 't' : 'f', syn ? 'SYNONYM' : 'ACCEPTED', rank, '', '', '', '', '6', '', '', '', '', '', '', '', `${canonical} X`, canonical].join('\t');
  const rows = [
    line(3952140, 7266, false, 'SPECIES', 'Trichocereus macrogonus'),
    line(12219216, 3952140, false, 'VARIETY', 'Trichocereus macrogonus macrogonus'),
    line(11093098, 3952140, false, 'VARIETY', 'Trichocereus macrogonus pachanoi'),
    ...[[5622543, 'Cereus pachanoi'], [5622352, 'Echinopsis pachanoi'], [7282455, 'Trichocereus pachanoi'], [3951775, 'Trichocereus santaensis'], [3952807, 'Trichocereus chalaensis']].map(([k, n]) => line(k as number, 11093098, true, 'SPECIES', n as string)),
    // A variety's own synonym below species, and an animal's row: not names of the species.
    line(99, 11093098, true, 'VARIETY', 'Trichocereus pachanoi peruvianus'),
    line(98, 3952140, false, 'VARIETY', 'Trichocereus macrogonus zoo').replace('\t6\t', '\t1\t')
  ];
  const infra = new InfraNames(new Set([3952140]));
  for (const l of rows) { const r = backboneRow(l); if (r) infra.first(r); }
  for (const l of rows) { const r = backboneRow(l); if (r) infra.second(r); }
  const names = infra.of(3952140, { scientific: 'Trichocereus macrogonus', synonyms: ['Cereus macrogonus Salm-Dyck', 'Echinopsis macrogona (Salm-Dyck) H.Friedrich & G.D.Rowley'] });
  it('the second pass reads the names under the varieties, of species rank, sorted', () => {
    expect(infra.usages).toBe(2);
    expect(names).toEqual(['Cereus pachanoi', 'Echinopsis pachanoi', 'Trichocereus chalaensis', 'Trichocereus pachanoi', 'Trichocereus santaensis']);
  });
  it('"Trichocereus pachanoi" and "Echinopsis pachanoi" find the page, headed by Kew\'s Echinopsis macrogona; a word alone does not', () => {
    const kew = kewOlderOf('Echinopsis macrogona', ['Trichocereus macrogonus', 'Cereus macrogonus'], names);
    const P = prepare([
      { name: 'Echinopsis macrogona', common: 'Sacred Column Cactus', syn: ['Trichocereus macrogonus', 'Cereus macrogonus'], kew },
      { name: 'Echinopsis pachycarpa' },
      { name: 'Trichocereus terscheckii' }
    ]);
    expect(search(P, 'Trichocereus pachanoi').map((h) => h.name)).toEqual(['Echinopsis macrogona']);
    expect(search(P, 'echinopsis pachanoi')[0].name).toBe('Echinopsis macrogona');
    expect(search(P, 'pachanoi').map((h) => h.name)).toEqual([]);
  });
});

describe('an English name is read in the Latin alphabet (S12)', async () => {
  const { latinName } = await import('$dossier/index-entry');
  it('a stray letter of another script at the end is taken off; a name in another script is no English name', () => {
    expect(latinName('Asian Indian mallow ا')).toBe('Asian Indian mallow');
    expect(latinName('Hairy phloxا')).toBe('Hairy phlox');
    for (const n of ['アマミナキリスゲ（Amami-nakirisuge）', 'Китайски лептопус', 'قهوة سنا', '玉蕊 / 穗花棋盤腳', 'אבוקדו']) expect(latinName(n), n).toBeNull();
    for (const n of ['Northern rātā', 'ʻŌhiʻa lehua', 'Chinese Incense‒cedar', "Kaapsehoop Cycad – includes Dedekind's Cycad", 'Ætihvönn']) expect(latinName(n), n).toBe(n);
  });
  it('the names shown', () => {
    const vs = [{ name: 'Asian Indian mallow ا', lang: 'eng' }, { name: 'قهوة سنا', lang: 'eng' }, { name: 'Indian mallow', lang: 'eng' }];
    expect(englishNames(vs)).toEqual({ common: 'Asian Indian mallow', commons: ['Indian mallow'] });
  });
});

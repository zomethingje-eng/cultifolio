/**
 * Round 73, K: records and photographs from more than a page's own GBIF key, and the two pairs of pages merged (the owner's
 * decisions on round 72's triage, A7 and the homonym keys). Kew's rows and GBIF's usages below are the real ones, from
 * Kew's file of 2026-06-04 and GBIF's backbone export (2023-08-28, the backbone the API serves), cut to what the rule
 * reads. Every case FAILS on r73base, where `extra-keys.ts` does not exist, the build reads one key, the schema keeps no
 * `occurrences.keys`, the products answer no old address, and `--prune-followed` knows no merge; "guard" marks a case
 * that holds a line the rule must not cross.
 */
import { describe, it, expect } from 'vitest';
import { parse } from 'valibot';
import { KewNamesIndex, type KewRow } from '$dossier/kew-names';
import { extraKeysFor, kewReading, abbreviates, plantOf, formatExtraKeys, parseExtraKeys, parseMerges, mergedToPrune, extraRebuild, extraWhy, type Usage, type Backbone, type ExtraKey } from '$dossier/extra-keys';
import { buildDossier, extraOccurrences, extraMedia } from '$dossier/build';
import { Occurrences } from '$dossier/schema';
import { buildProducts, aliasesOf } from '$dossier/products';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';
import type { IndexEntry } from '$dossier/index-entry';
import { gbifPage } from '../../src/lib/core/page-id';

const K = (id: string, name: string, authors: string, status: string, accepted: string, rank = 'Species', parent = '', homotypic = false): KewRow => ({ id, name, authors, status, rank, accepted, parent, powo: '', ...(homotypic ? { homotypic } : {}) });
/** A synonym Kew marks homotypic (`homotypic_synonym` T in Kew's file). */
const H = (id: string, name: string, authors: string, accepted: string): KewRow => K(id, name, authors, 'Synonym', accepted, 'Species', '', true);
const idx = new KewNamesIndex();
for (const r of [
  // Myrica cerifera L. (Kew accepts it; the page's key is GBIF's "Myrica cerifera Bigelow"); Morella cerifera filed under it.
  K('2500717', 'Myrica cerifera', 'L.', 'Accepted', '2500717'),
  H('2501792', 'Morella cerifera', '(L.) Small', '2500717'),
  K('2500718', 'Myrica pusilla', 'Raf.', 'Accepted', '2500718'),
  // Ixora coccinea L. accepted; "Comm. ex Lam." Kew's invalid name under Embothrium.
  K('103356', 'Ixora coccinea', 'L.', 'Accepted', '103356'),
  K('103355', 'Ixora coccinea', 'Comm. ex Lam.', 'Invalid', '2788267'),
  K('2788267', 'Embothrium coccineum', 'J.R.Forst. & G.Forst.', 'Accepted', '2788267'),
  // Eucalyptus camaldulensis Dehnh., Kew's one row of the words.
  K('2799913', 'Eucalyptus camaldulensis', 'Dehnh.', 'Accepted', '2799913'),
  // Ranunculus ficaria L. and Ficaria verna Huds., its synonym; Ficaria verna subsp. ficariiformis is another species's.
  K('2523483', 'Ranunculus ficaria', 'L.', 'Accepted', '2523483'),
  H('2809356', 'Ficaria verna', 'Huds.', '2523483'),
  K('2605337', 'Ranunculus ficariiformis', 'Rouy & Foucaud', 'Accepted', '2605337'),
  K('2607130', 'Ficaria verna subsp. ficariiformis', '(Rouy & Foucaud) Maire', 'Synonym', '2605337', 'Subspecies'),
  // Adenia gummifera (Harv.) Harms accepted; GBIF files Harms's name under Adenia cissampeloides, another page.
  K('2600001', 'Adenia gummifera', '(Harv.) Harms', 'Accepted', '2600001'),
  K('2600002', 'Adenia cissampeloides', '(Planch. ex Hook.) Harms', 'Accepted', '2600002'),
  // The two merges: Coryphantha macromeris and Rebutia fidana, Kew's synonyms of the kept pages' entries.
  K('3294939', 'Pelecyphora macromeris', '(Engelm.) D.Aquino & Dan.Sánchez', 'Accepted', '3294939'),
  H('2739666', 'Coryphantha macromeris', '(Engelm.) Britton & Rose', '3294939'),
  K('2465732', 'Weingartia fidana', '(Backeb.) Werderm.', 'Accepted', '2465732'),
  H('2417022', 'Rebutia fidana', '(Backeb.) D.R.Hunt', '2465732'),
  // Lonicera ligustrina: Kew files Lonicera pileata Oliv. (homotypic) under its var. pileata, another type than the species';
  // and a heterotypic synonym under the entry itself.
  K('2339860', 'Lonicera ligustrina', 'Wall.', 'Accepted', '2339860'),
  K('2877553', 'Lonicera ligustrina var. pileata', '(Oliv.) Franch.', 'Accepted', '2877553', 'Variety', '2339860'),
  H('2340552', 'Lonicera pileata', 'Oliv.', '2877553'),
  K('2340600', 'Lonicera yunnanensis', 'Franch.', 'Synonym', '2339860')
]) idx.add(r);

const U = (key: number, label: string, canonical: string, author: string, status: string, parent?: number, rank = 'SPECIES'): Usage => ({ key, parent, status, rank, canonical, author, label });
const usages = [
  U(8038589, 'Myrica cerifera Bigelow', 'Myrica cerifera', 'Bigelow', 'ACCEPTED', 5938218),
  U(5414216, 'Myrica cerifera L.', 'Myrica cerifera', 'L.', 'SYNONYM', 3168995),
  U(3168995, 'Morella cerifera (L.) Small', 'Morella cerifera', '(L.) Small', 'ACCEPTED', 7780807),
  U(8793122, 'Ixora coccinea Comm. ex Lam.', 'Ixora coccinea', 'Comm. ex Lam.', 'ACCEPTED', 2905224),
  U(2905493, 'Ixora coccinea L.', 'Ixora coccinea', 'L.', 'DOUBTFUL', 2905224),
  U(11869920, 'Eucalyptus camaldulensis Denham', 'Eucalyptus camaldulensis', 'Denham', 'ACCEPTED', 7493935),
  U(3176197, 'Eucalyptus camaldulensis Dehn.', 'Eucalyptus camaldulensis', 'Dehn.', 'DOUBTFUL', 7493935),
  U(8397184, 'Ranunculus ficaria Walter, 1788', 'Ranunculus ficaria', 'Walter', 'ACCEPTED', 3234342),
  U(3033351, 'Ranunculus ficaria L.', 'Ranunculus ficaria', 'L.', 'SYNONYM', 7277276),
  U(9094061, 'Ficaria verna Huds.', 'Ficaria verna', 'Huds.', 'ACCEPTED', 3234342),
  U(7277276, 'Ficaria verna subsp. verna', 'Ficaria verna verna', '', 'ACCEPTED', 9094061, 'SUBSPECIES'),
  U(7277277, 'Ficaria verna subsp. ficariiformis (Rouy & Foucaud) Maire', 'Ficaria verna ficariiformis', '(Rouy & Foucaud) Maire', 'ACCEPTED', 9094061, 'SUBSPECIES'),
  U(8357296, 'Adenia gummifera BurttDavy', 'Adenia gummifera', 'BurttDavy', 'ACCEPTED', 1),
  U(7313476, 'Adenia gummifera (Harv.) Harms', 'Adenia gummifera', '(Harv.) Harms', 'SYNONYM', 5527841),
  U(5527841, 'Adenia cissampeloides (Planch. ex Hook.) Harms', 'Adenia cissampeloides', '(Planch. ex Hook.) Harms', 'ACCEPTED', 1),
  U(11798439, 'Pelecyphora macromeris (Engelm.) D.Aquino & Dan.Sanchez', 'Pelecyphora macromeris', '(Engelm.) D.Aquino & Dan.Sanchez', 'ACCEPTED', 3231951),
  U(3084426, 'Coryphantha macromeris (Engelm.) Lem.', 'Coryphantha macromeris', '(Engelm.) Lem.', 'ACCEPTED', 3084422),
  U(7281301, 'Weingartia fidaiana (Backeb.) Werderm.', 'Weingartia fidaiana', '(Backeb.) Werderm.', 'ACCEPTED', 7280329),
  U(7906297, 'Rebutia fidana (Backeb.) D.R.Hunt', 'Rebutia fidana', '(Backeb.) D.R.Hunt', 'ACCEPTED', 7280933),
  U(7272588, 'Lonicera ligustrina Wall.', 'Lonicera ligustrina', 'Wall.', 'ACCEPTED', 2888794),
  U(5598915, 'Lonicera pileata Oliv.', 'Lonicera pileata', 'Oliv.', 'ACCEPTED', 2888794),
  U(7272584, 'Lonicera yunnanensis Franch.', 'Lonicera yunnanensis', 'Franch.', 'ACCEPTED', 2888794)
];
const byKey = new Map(usages.map((u) => [u.key, u]));
const kewWords = (u: Usage) => (u.rank === 'SPECIES' ? u.canonical : `${u.canonical.split(' ').slice(0, 2).join(' ')} subsp. ${u.canonical.split(' ')[2]}`).toLowerCase();
const underOf = new Map<number, Usage[]>([[9094061, [byKey.get(7277276)!, byKey.get(7277277)!]], [7277276, [byKey.get(3033351)!]], [3168995, [byKey.get(5414216)!]]]);
const bb: Backbone = {
  usagesOf: (w) => usages.filter((u) => kewWords(u) === w),
  usage: (k) => byKey.get(k),
  lineage: (k) => { const u = byKey.get(k); const out = [k]; if (u && /SYNONYM/.test(u.status) && u.parent) out.push(u.parent); const last = byKey.get(out[out.length - 1]); if (last && last.rank !== 'SPECIES' && last.parent) out.push(last.parent); return out; },
  under: (k) => underOf.get(k) ?? []
};
const reference = new Set([8038589, 8793122, 11869920, 8397184, 8357296, 5527841, 11798439, 7281301, 3084426, 7906297, 7272588]);
const holders = new Map<number, number[]>();
const run = (page: number, entry: string, ref = reference, merged = new Map<number, string>()) => extraKeysFor({ key: page, entry }, idx, bb, ref, holders, merged);

describe('the extra keys of a page, by the rule (rule 3)', () => {
  it('Myrica cerifera: GBIF files Linnaeus\'s name under Morella cerifera (L.) Small, which Kew holds as a synonym of Myrica cerifera L.; one key is read, not both', () => {
    const r = run(8038589, '2500717');
    expect(r.keys.map((k) => k.key)).toEqual([3168995]);
    expect(r.keys[0]).toMatchObject({ label: 'Morella cerifera (L.) Small', kew: '2501792', how: 'filed' });
    expect(extraWhy(r.keys[0])).toBe("Kew's file holds it as Morella cerifera (L.) Small (synonym under Myrica cerifera L.)");
  });
  it('Ixora coccinea: GBIF\'s "Ixora coccinea L." (2,651 records) is Kew\'s entry itself', () => {
    expect(run(8793122, '103356').keys).toEqual([expect.objectContaining({ key: 2905493, how: 'entry', kewLabel: 'Ixora coccinea L. (accepted)' })]);
  });
  it('Eucalyptus camaldulensis: "Dehn." is read as a shorter abbreviation of Kew\'s one row, "Dehnh."', () => {
    expect(abbreviates('Dehn.', 'Dehnh.')).toBe(true);
    expect(run(11869920, '2799913').keys).toEqual([expect.objectContaining({ key: 3176197, how: 'abbreviation' })]);
  });
  it('an abbreviation is read only as an abbreviation: not of two authors, not shorter than four letters, not without its full stop (guard)', () => {
    expect(abbreviates('L.', 'Lindl.')).toBe(false);
    expect(abbreviates('Dehn', 'Dehnh.')).toBe(false);
    expect(abbreviates('Dehn.', 'Dehnh. & Otto')).toBe(false);
    expect(abbreviates('(Engelm.) Brit.', '(Hook.) Britton')).toBe(false);
  });
  it('Ranunculus ficaria: Ficaria verna Huds. is read, all but the subspecies GBIF files under it that Kew holds as another species (and its synonyms); the autonym is inside it', () => {
    const r = run(8397184, '2523483');
    expect(r.keys).toEqual([expect.objectContaining({ key: 9094061, how: 'filed', except: [7277277] })]);
  });
  it('the autonym alone, where its species is not read: Ficaria verna subsp. verna is its species\' name\'s (the same type)', () => {
    const solo: Backbone = { ...bb, usagesOf: (w) => bb.usagesOf(w).filter((u) => u.key !== 9094061) };
    const r = extraKeysFor({ key: 8397184, entry: '2523483' }, idx, solo, reference, holders);
    expect(r.keys).toEqual([expect.objectContaining({ key: 7277276, how: 'autonym' })]);
  });
  it('a pro parte synonym is no one plant\'s, and is not read (guard)', () => {
    const pp: Backbone = { ...bb, usagesOf: (w) => (w === 'ixora coccinea' ? [...bb.usagesOf(w), U(4242, 'Ixora coccinea L.', 'Ixora coccinea', 'L.', 'PROPARTE_SYNONYM', 99)] : bb.usagesOf(w)) };
    const r = extraKeysFor({ key: 8793122, entry: '103356' }, idx, pp, reference, holders);
    expect(r.keys.map((k) => k.key)).toEqual([2905493]);
    expect(r.refused).toEqual([expect.objectContaining({ key: 4242, why: expect.stringMatching(/pro parte synonym/) })]);
  });
  it('Adenia gummifera: Harms\'s name is GBIF\'s synonym of Adenia cissampeloides, another page, and is not read (guard)', () => {
    const r = run(8357296, '2600001');
    expect(r.keys).toEqual([]);
    expect(r.refused).toEqual([expect.objectContaining({ key: 7313476, why: 'GBIF files it under key 5527841, another page of this reference' })]);
  });
  it('the two pairs to merge: while both pages are in the reference, neither key is read on the other (guard)', () => {
    expect(run(11798439, '3294939').keys).toEqual([]);
    expect(run(11798439, '3294939').refused).toEqual([expect.objectContaining({ key: 3084426, why: 'it is another page of this reference' })]);
  });
  it('merged: Coryphantha macromeris (Engelm.) Lem. into Pelecyphora macromeris, and Rebutia fidana into Weingartia fidaiana, each by the rule once its page leaves', () => {
    const ref = new Set([...reference].filter((k) => k !== 3084426 && k !== 7906297));
    const merged = new Map([[3084426, 'coryphantha-macromeris'], [7906297, 'rebutia-fidana']]);
    expect(run(11798439, '3294939', ref, merged).keys).toEqual([expect.objectContaining({ key: 3084426, merged: 'coryphantha-macromeris', kew: '2739666' })]);
    expect(run(7281301, '2465732', ref, merged).keys).toEqual([expect.objectContaining({ key: 7906297, merged: 'rebutia-fidana', kew: '2417022' })]);
  });
  it('the narrower rule: Lonicera pileata reads no Lonicera ligustrina (another type below the entry), nor a heterotypic synonym; each is refused with the owner\'s decision', () => {
    const r = run(7272588, '2339860');
    expect(r.keys).toEqual([]);
    expect(r.refused).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 5598915, why: "another type below the entry: the owner's decision (Kew holds Lonicera pileata Oliv. under Lonicera ligustrina var. pileata (Oliv.) Franch., a taxon it accepts below Lonicera ligustrina Wall.)" }),
      expect.objectContaining({ key: 7272584, why: "heterotypic: the owner's decision (Kew holds Lonicera yunnanensis Franch. as a heterotypic synonym of Lonicera ligustrina Wall.)" })
    ]));
  });
  it('the narrower rule keeps the same type: Myrica cerifera, Ixora coccinea, Eucalyptus camaldulensis, Ranunculus ficaria (Ficaria verna, homotypic) and both merges still read theirs', () => {
    const ref = new Set([...reference].filter((k) => k !== 3084426 && k !== 7906297));
    const merged = new Map([[3084426, 'coryphantha-macromeris'], [7906297, 'rebutia-fidana']]);
    const got = (page: number, entry: string) => extraKeysFor({ key: page, entry }, idx, bb, ref, holders, merged).keys.map((k) => k.key);
    expect([got(8038589, '2500717'), got(8793122, '103356'), got(11869920, '2799913'), got(8397184, '2523483'), got(11798439, '3294939'), got(7281301, '2465732')]).toEqual([[3168995], [2905493], [3176197], [9094061], [3084426], [7906297]]);
  });
  it('a heterotypic name GBIF files under a key that is read is left out of its records (guard)', () => {
    const extraU = U(7272600, 'Lonicera yunnanensis Franch.', 'Lonicera yunnanensis', 'Franch.', 'SYNONYM', 3168995);
    const i2 = new KewNamesIndex();
    for (const r of [...idx.byId.values()]) i2.add(r);
    i2.add(K('2600900', 'Lonicera yunnanensis', 'Franch.', 'Synonym', '2500717'));
    const b2: Backbone = { ...bb, under: (k) => (k === 3168995 ? [...(underOf.get(k) ?? []), extraU] : bb.under!(k)) };
    expect(extraKeysFor({ key: 8038589, entry: '2500717' }, i2, b2, reference, holders).keys[0].except).toEqual([7272600]);
  });
  it('a key whose name Kew does not hold by its author is nothing to say (guard)', () => {
    expect(kewReading(U(1, 'Myrica cerifera Bigelow', 'Myrica cerifera', 'Bigelow', 'ACCEPTED'), idx)).toMatchObject({ rows: [], why: expect.stringMatching(/only by another author/) });
  });
  it('the plant is the entry and the taxa Kew accepts under it', () => {
    const i2 = new KewNamesIndex();
    i2.add(K('1', 'Agave americana', 'L.', 'Accepted', '1'));
    i2.add(K('2', 'Agave americana var. expansa', '(Jacobi) Gentry', 'Accepted', '2', 'Variety', '1'));
    expect([...plantOf('1', i2)].sort()).toEqual(['1', '2']);
  });
});

describe('the list files', () => {
  const x: ExtraKey = { page: 8038589, key: 3168995, label: 'Morella cerifera (L.) Small', status: 'ACCEPTED', kew: '2460000', kewLabel: 'Morella cerifera (L.) Small (synonym under Myrica cerifera L.)', how: 'filed' };
  it('extra-keys.txt reads back what it wrote', () => {
    expect(parseExtraKeys(formatExtraKeys([x, { ...x, page: 11798439, key: 3084426, merged: 'coryphantha-macromeris' }], ['head']))).toEqual([x, { ...x, page: 11798439, key: 3084426, merged: 'coryphantha-macromeris' }]);
  });
  it('merged-pages.txt, and which merged dossiers may be deleted: only once the kept page records the key with its old address', () => {
    const m = parseMerges('# c\n3084426\t11798439\tCoryphantha macromeris\n7906297\t7281301\tRebutia fidana\n');
    expect(m).toEqual([{ from: 3084426, into: 11798439, name: 'Coryphantha macromeris' }, { from: 7906297, into: 7281301, name: 'Rebutia fidana' }]);
    const all = [{ key: 3084426 }, { key: 11798439, occurrences: { keys: [{ key: 3084426, slug: 'coryphantha-macromeris' }] } }, { key: 7906297 }, { key: 7281301, occurrences: {} }];
    expect(mergedToPrune(all, m)).toEqual({ prune: [3084426], waiting: ['Rebutia fidana [7906297] into 7281301'] });
  });
  it('rebuild-extra.txt: the pages whose stored records do not come from their listed keys, never a page merged away', () => {
    const pages = [{ key: 8038589, name: { scientific: 'Myrica cerifera' } }, { key: 8793122, name: { scientific: 'Ixora coccinea' }, occurrences: { keys: [{ key: 2905493 }] } }, { key: 3084426, name: { scientific: 'Coryphantha macromeris' } }];
    const list = [x, { ...x, page: 8793122, key: 2905493 }, { ...x, page: 3084426, key: 1 }];
    expect(extraRebuild(pages, list, [{ from: 3084426, into: 11798439, name: 'Coryphantha macromeris' }])).toEqual(['8038589 Myrica cerifera']);
  });
});

describe('the build reads the other keys\' records and photographs, and says so (rule 1)', () => {
  const GBIF = 'https://api.gbif.org/v1';
  const rec = (key: number, lat: number, lon: number) => ({ key, decimalLatitude: lat, decimalLongitude: lon, basisOfRecord: 'HUMAN_OBSERVATION', license: 'http://creativecommons.org/licenses/by/4.0/legalcode', datasetKey: 'd', coordinateUncertaintyInMeters: 100, year: 2020, countryCode: 'CL' });
  const extra: ExtraKey = { page: 5384013, key: 777001, label: 'Copiapoa cinerea Kük.', status: 'DOUBTFUL', kew: '1', kewLabel: 'Copiapoa cinerea (Phil.) Britton & Rose (accepted)', how: 'entry' };
  function world(more: Record<string, unknown> = {}): JsonFetcher {
    const t = copiapoa() as Record<string, unknown>;
    t['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    return fixtureFetcher({
      [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=777001&hasCoordinate`]: { count: 3, endOfRecords: true, results: [rec(9001, -24.9, -70.4), rec(9002, -25.0, -70.45), rec(9003, -25.1, -70.5)] },
      [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=777001&mediaType`]: { count: 1, endOfRecords: true, results: [{ key: 9001, basisOfRecord: 'HUMAN_OBSERVATION', media: [{ type: 'StillImage', identifier: 'https://example.org/a.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'A. Grower' }] }] },
      ...more,
      ...t
    });
  }
  it('Copiapoa cinerea with another key: the records join, the record names the key and Kew\'s reading, and occurrences.keys holds it', async () => {
    const base = await buildDossier('Copiapoa cinerea', { fetcher: world(), builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'] });
    const r = await buildDossier('Copiapoa cinerea', { fetcher: world(), builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'], extraKeys: [extra], mediaFirst: true });
    expect(base.ok && r.ok).toBe(true);
    if (!base.ok || !r.ok) return;
    expect(r.dossier.occurrences.nOpenInRange).toBe(base.dossier.occurrences.nOpenInRange + 3);
    expect(r.dossier.occurrences.keys).toEqual([{ key: 777001, name: 'Copiapoa cinerea Kük.', kew: "Kew's file holds it as Copiapoa cinerea (Phil.) Britton & Rose (accepted)", n: 3, from: 'api' }]);
    expect(r.dossier.upstream['gbif.occurrences'].detail).toBe("GBIF occurrence search API; 3 records of GBIF's key 777001, Copiapoa cinerea Kük. (Kew's file holds it as Copiapoa cinerea (Phil.) Britton & Rose (accepted)): GBIF occurrence search API");
    expect(r.dossier.photos.some((p) => p.src === 'gbif' && p.url === 'https://example.org/a.jpg')).toBe(true);
    // Its own name is the page's words: no older name is added for it.
    expect(r.dossier.name.synonyms).toEqual(base.dossier.name.synonyms);
  });
  it('a page merged here: its name, synonyms and common names join the kept page\'s, said in the record', async () => {
    const f = world({
      [`${GBIF}/species/777001/vernacularNames`]: { results: [{ vernacularName: 'Grey copiapoa', language: 'eng', source: 'X' }] },
      [`${GBIF}/species/777001/synonyms`]: { results: [{ key: 777002, scientificName: 'Echinocactus griseus Phil.', canonicalName: 'Echinocactus griseus', rank: 'SPECIES' }] }
    });
    const r = await buildDossier('Copiapoa cinerea', { fetcher: f, builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'], extraKeys: [{ ...extra, label: 'Copiapoa grisea Ritter', merged: 'copiapoa-grisea' }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.name.synonyms).toEqual(expect.arrayContaining(['Copiapoa grisea Ritter', 'Echinocactus griseus Phil.']));
    expect(r.dossier.name.vernacular.map((v) => v.name)).toContain('Grey copiapoa');
    expect(r.dossier.upstream['gbif.synonyms'].detail).toMatch(/2 read from GBIF's key 777001 \(Copiapoa grisea Ritter\), a page merged here/);
    expect(r.dossier.occurrences.keys?.[0].slug).toBe('copiapoa-grisea');
  });
  it('a key listed for another page is not read (guard)', async () => {
    const r = await buildDossier('Copiapoa cinerea', { fetcher: world(), builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'], extraKeys: [{ ...extra, page: 1 }] });
    expect(r.ok && r.dossier.occurrences.keys).toBeFalsy();
  });
  it('another key not answering is the record source not answering: nothing partial is published (rule 2)', async () => {
    const f = world({ [`re:${GBIF.replace(/\./g, '\\.')}/occurrence/search\\?taxonKey=777001&hasCoordinate`]: { __status: 'refused', status: 'refused', detail: 'api.gbif.org 429' } });
    const r = await buildDossier('Copiapoa cinerea', { fetcher: f, builtBy: 'node', skip: ['commons', 'openalex', 'wikipedia'], extraKeys: [extra] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dossier.upstream['gbif.occurrences']).toMatchObject({ status: 'refused', detail: expect.stringMatching(/^GBIF's key 777001 \(Copiapoa cinerea Kük\.\), whose records this page reads too: api\.gbif\.org 429/) });
    expect(r.dossier.climate.status).toBe('refused');
  });
  it('a key\'s exceptions: a record GBIF identifies as a name Kew holds as another plant is not read, nor one whose name is not given', async () => {
    const f = fixtureFetcher({ 're:occurrence/search\\?taxonKey=5&hasCoordinate': { endOfRecords: true, results: [{ ...rec(1, 1, 1), taxonKey: 5 }, { ...rec(2, 1, 1), taxonKey: 6 }, rec(3, 1, 1)] } });
    const r = await extraOccurrences(f, { status: 'none' }, [{ ...extra, key: 5, except: [6] }]);
    expect(r.occ.status === 'ok' && r.occ.data.map((x) => x.key)).toEqual([1]);
  });
  it('a record GBIF files under two of the keys is counted once', async () => {
    const own = { status: 'ok' as const, data: [rec(9001, -24.9, -70.4)] };
    const f = fixtureFetcher({ 're:occurrence/search\\?taxonKey=5&hasCoordinate': { endOfRecords: true, results: [rec(9001, -24.9, -70.4), rec(9002, 1, 1)] } });
    const r = await extraOccurrences(f, own, [{ ...extra, key: 5 }]);
    expect(r.occ.status === 'ok' && r.occ.data.map((x) => x.key)).toEqual([9001, 9002]);
    expect(r.keys[0].n).toBe(1);
  });
  it('photographs: the page key\'s first, then the other keys\', one photograph once', async () => {
    const m = (url: string) => ({ id: url, url, licence: 'by' as const, creator: 'x' });
    const f = fixtureFetcher({ 're:occurrence/search\\?taxonKey=5&mediaType': { endOfRecords: true, results: [{ key: 1, basisOfRecord: 'HUMAN_OBSERVATION', media: [{ identifier: 'u1', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'x' }, { identifier: 'u2', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'y' }] }] } });
    const r = await extraMedia(f, { status: 'ok', data: [m('u1')] }, [{ ...extra, key: 5 }]);
    expect(r.status === 'ok' && r.data.map((x) => x.url)).toEqual(['u1', 'u2']);
  });
  it('the schema keeps occurrences.keys (it was stripped on the base)', () => {
    const o = { open: [], nOpenInRange: 0, nRestrictedInRange: 0, nOutsideRange: 0, restrictedShiftKm: null, thin: true, datasets: [], keys: [{ key: 3084426, name: 'Coryphantha macromeris (Engelm.) Lem.', kew: 'k', n: 3, from: 'api', slug: 'coryphantha-macromeris' }] };
    expect(parse(Occurrences, o).keys).toEqual(o.keys);
  });
});

describe('a page merged away keeps its old address for the device (rule 6: nothing a grower recorded is lost)', () => {
  const e = (key: number, name: string, slug: string): IndexEntry => ({ key: gbifPage(key), gbif: key, slug, name, photos: 0, open: 0, climate: 'ok' });
  const index = [e(11798439, 'Pelecyphora macromeris', 'pelecyphora-macromeris'), e(7281301, 'Weingartia fidaiana', 'weingartia-fidaiana')];
  it('the old slug answers in the entries\' buckets with the kept page, under the old slug; the index does not list it', () => {
    const p = buildProducts(index, JSON.stringify(index), () => new Map(), '2026-10-16T00:00:00Z', [{ slug: 'coryphantha-macromeris', key: gbifPage(11798439) }]);
    const all = [...p.files.entries()].filter(([n]) => n.startsWith('entries/')).flatMap(([, b]) => JSON.parse(b) as IndexEntry[]);
    expect(all.filter((x) => x.gbif === 11798439).map((x) => x.slug).sort()).toEqual(['coryphantha-macromeris', 'pelecyphora-macromeris']);
    expect(JSON.parse(p.files.get('index.json')!).map((x: IndexEntry) => x.slug)).toEqual(['pelecyphora-macromeris', 'weingartia-fidaiana']);
  });
  it('an old slug a page of the index holds, or whose kept page is gone, answers nothing new (guard)', () => {
    expect(aliasesOf(index, [{ slug: 'weingartia-fidaiana', key: gbifPage(11798439) }, { slug: 'x', key: gbifPage(1) }])).toEqual([]);
  });
});

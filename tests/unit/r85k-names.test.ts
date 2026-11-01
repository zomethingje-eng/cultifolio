/**
 * Round eighty-five (K): the plants' names and numbers, each rule by what it gives.
 *
 * - S7 (review-s): „…“, ‚…‘, «…» and ‹…› are a cultivar's quotes; a relaxed reading of a misspelt epithet is offered; a
 *   row found by a common name is not "under another genus".
 * - W2, A11 (review-w, outside review A): a name whose variety or form a page holds as an older name is said so, in the
 *   import's check and the plant page's lookup.
 * - A10 (outside review A): a plant number is at most 32 characters and 15 digits in a row; the numbering never hangs.
 * - W10 (review-w): a second paste's lines the grower says are new plants get keys of their own.
 * - C4, S2 (review-c, review-s): GBIF's name for a page's key is an alias of the page for the sheets alone, marked.
 *
 * FAILS on r85base: the quotes parse as no cultivar; `offeredReading`, `byCommonName`, `isPlantNumber`, `freshKeys` and
 * `gbifAliasOf` do not exist; `readSearch` answers "missing" for Trichocereus pachanoi; `nextAccession` with a number of
 * 309 digits never returns (here it is run with a guard, and the base hangs past it).
 */
import { describe, it, expect } from 'vitest';
import { parseName } from '$core/names';
import { requestName, cultivarRest } from '$lib/ui/picked-name';
import { offeredReading, byCommonName, localRow } from '$lib/ui/picker-rows';
import { readSearch } from '$lib/import/check';
import { parsePaste } from '$lib/import/paste';
import { rowsFromPaste } from '$lib/import/rows';
import { freshKeys, planNumbers } from '$lib/import/plan';
import { isPlantNumber, plantNumberProblem, nextAccession, DEFAULT_SCHEME } from '$core/accession';
import { gbifAliasOf } from '$lib/dossier/gbif-alias';
import { aliasesOf } from '$lib/dossier/products';
import type { IndexEntry } from '$lib/dossier/index-entry';

describe('S7: every quote a keyboard writes opens a cultivar', () => {
  it.each([
    ["Crassula ovata „Gollum“", 'Gollum'],
    ["Crassula ovata «Gollum»", 'Gollum'],
    ["Crassula ovata ‚Gollum‘", 'Gollum'],
    ["Crassula ovata ‹Gollum›", 'Gollum'],
    ["Crassula ovata 'Gollum'", 'Gollum'],
    ['Crassula ovata cv. «Gollum»', 'Gollum']
  ])('%s', (typed, cv) => {
    const p = parseName(typed);
    expect(p.scientific).toBe('Crassula ovata'); // base: "Crassula ovata „Gollum“" for the first four
    expect(p.cultivar).toBe(cv);
    expect(p.kind).toBe('cultivar');
    expect(requestName(typed)).toBe('Crassula ovata');
  });
  it('a quoted genus and cultivar is not read as capitalised words', () => {
    expect(cultivarRest('Echeveria «Lola»')).toBeNull();
    expect(parseName('Echeveria «Lola»').cultivar).toBe('Lola');
  });
  it('a paste\'s cultivar column in angle quotes', () => {
    expect(parsePaste('Crassula ovata; «Gollum»')[0].cultivar).toBe('Gollum');
  });
});

describe('S7: what the picker offers and says', () => {
  it('the server\'s reading of a misspelt epithet, the genus and its start, is offered', () => {
    expect(offeredReading('lithops lesle', 'lithops lesleyi')).toBe(true); // base: not offered
    expect(offeredReading('Lithops lesliei subsp. lesliei', 'Lithops lesliei (N.E.Br.) N.E.Br. subsp. lesliei var. lesliei C001')).toBe(true);
    expect(offeredReading(undefined, 'anything')).toBe(true);
    expect(offeredReading('lithops', 'lithops lesleyi')).toBe(false); // the genus alone is the genus row's
    expect(offeredReading('conophytum lesle', 'lithops lesleyi')).toBe(false);
    expect(offeredReading('lithops le', 'lithops lesleyi')).toBe(false); // two letters are not an epithet's start
  });
  it('a row found by a common name is not "under another genus"', () => {
    const jade = { name: 'Crassula ovata', family: 'Crassulaceae', gbif: 5362063, common: 'Jade plant', commons: ['Baby jade'] };
    expect(byCommonName('jade plant', jade)).toBe(true);
    expect(localRow('jade plant', jade, false).far).toBe(false); // base: far, "has a species page, under another genus"
    expect(localRow('Crassula ovat', jade, false).far).toBe(false);
    expect(localRow('Lithops ovata', jade, false).far).toBe(true); // a scientific name of another genus still is
  });
});

describe('W2, A11: a name whose variety or form a page holds as an older name', () => {
  const macrogona = { slug: 'echinopsis-macrogona', name: 'Echinopsis macrogona', gbif: 3952140, syn: ['Cereus macrogonus', 'Trichocereus pachanoi f. peruvianus'], kew: ['Echinopsis pachanoi'] };
  it('is offered, with the name below it that the page holds', () => {
    expect(readSearch('Trichocereus pachanoi', true, [macrogona])).toEqual({ s: 'near', suggestion: 'Echinopsis macrogona', key: 3952140, why: 'infra', slug: 'echinopsis-macrogona', via: 'Trichocereus pachanoi f. peruvianus' }); // base: missing
  });
  it('an exact older name comes first, and an exact page before both', () => {
    expect(readSearch('Echinopsis pachanoi', true, [macrogona])).toMatchObject({ s: 'near', why: 'older name' });
    expect(readSearch('Echinopsis macrogona', true, [macrogona])).toMatchObject({ s: 'found' });
    expect(readSearch('Trichocereus peruvianus', true, [macrogona])).toEqual({ s: 'missing' });
  });
});

describe('A10: a plant number is a short text', () => {
  it('isPlantNumber', () => {
    expect(isPlantNumber('2026-0001')).toBe(true);
    expect(isPlantNumber('KK-1462/b')).toBe(true);
    expect(isPlantNumber('1'.repeat(15))).toBe(true); // a nursery's thirteen-digit barcode fits
    expect(isPlantNumber('1'.repeat(16))).toBe(false); // past what is counted exactly
    expect(isPlantNumber('9'.repeat(309))).toBe(false);
    expect(isPlantNumber('x'.repeat(33))).toBe(false);
    expect(isPlantNumber('')).toBe(false);
    expect(isPlantNumber('20\n26')).toBe(false);
    expect(plantNumberProblem(`2026-${'9'.repeat(309)}`)).toBe('it is longer than 32 characters');
    expect(plantNumberProblem('2026-9999999999999999')).toBe('it has more than 15 digits in a row');
  });
  it('the next number after a held number of 309 digits is found, at once', () => {
    const t0 = Date.now();
    expect(nextAccession(['2026-0001', `2026-${'9'.repeat(309)}`, '2026-0002'], DEFAULT_SCHEME, 2026)).toBe('2026-0003'); // base: 2026-Infinity, then for ever
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it('a paste\'s number that is no plant number is said, kept in the notes, and the next free one given', () => {
    const [r] = rowsFromPaste(parsePaste(`Copiapoa cinerea; ; ${'9'.repeat(40)}`), { placeId: null, acquired: null, source: null });
    expect(r.number).toBeNull();
    expect(r.problems.join(' ')).toMatch(/its number was not kept, since it is longer than 32 characters/);
    expect(r.notes).toMatch(/^Number: 9{40}$/);
    const plan = planNumbers([r], [], DEFAULT_SCHEME, 2026);
    expect(plan.byRow.get(r.key)?.numbers).toEqual(['2026-0001']);
  });
});

describe('W10: a second paste\'s lines, added as new plants', () => {
  it('each takes the first number of its line\'s key that no plant here holds', () => {
    const here = new Set(['ih1#1', 'ih1#2', 'ih2#1']);
    expect(freshKeys([{ importKeys: ['ih1#1'] }, { importKeys: ['ih1#2'] }, { importKeys: ['ih2#1'] }, { importKeys: ['ih3#1'] }], (k) => here.has(k))).toEqual([['ih1#3'], ['ih1#4'], ['ih2#2'], ['ih3#1']]);
  });
});

describe('C4, S2: GBIF\'s name for a page\'s key answers for its sheet', () => {
  it('gbifAliasOf', () => {
    expect(gbifAliasOf({ key: 'k506502', slug: 'hoodia-alstonii', name: { scientific: 'Hoodia alstonii', gbif: { scientific: 'Ceropegia alstonii' } } })).toEqual({ slug: 'ceropegia-alstonii', key: 'k506502', via: 'gbif' });
    expect(gbifAliasOf({ key: 'k1', slug: 'aloe-vera', name: { scientific: 'Aloe vera' } })).toBeNull();
    expect(gbifAliasOf({ key: 'k1', slug: 'aloe-vera', name: { scientific: 'Aloe vera', gbif: { scientific: 'Aloe vera' } } })).toBeNull();
    // A name below the species answers by its species' address, as a plant's page asks.
    expect(gbifAliasOf({ key: 'k2', slug: 'echinopsis-macrogona', name: { scientific: 'Echinopsis macrogona', gbif: { scientific: 'Trichocereus macrogonus var. pachanoi' } } })?.slug).toBe('trichocereus-macrogonus');
  });
  it('a merged page\'s old address wins its address; a page\'s own address is never an alias', () => {
    const e = (key: string, slug: string) => ({ key, slug, name: slug, open: 0 }) as unknown as IndexEntry;
    const index = [e('k1', 'hoodia-alstonii'), e('k2', 'aloe-vera'), e('k3', 'other')];
    const got = aliasesOf(index, [{ slug: 'ceropegia-alstonii', key: 'k1', via: 'gbif' }, { slug: 'ceropegia-alstonii', key: 'k3' }, { slug: 'aloe-vera', key: 'k3', via: 'gbif' }]);
    expect(got.map((a) => [a.slug, a.entry.key, a.via ?? 'merged'])).toEqual([['ceropegia-alstonii', 'k3', 'merged']]);
  });
});

/**
 * Round sixty-one, decision 7: the common name shown for a species, by a rule with no hand-picked names
 * (`englishNames` in src/lib/dossier/index-entry.ts), and the GBIF fields it reads.
 *
 * Adopted from docs/review-60/tests/corpus--common-name-rule.test.ts. Its reproduction ("englishNames shows a name that
 * names another genus …") FAILED on the base and PASSES now. Its proposed rule (`displayCommon`) is now the code's, so
 * its cases call `englishNames` with the corpus's genera; two expectations change with the decision, which lowers every
 * capital straight after a hyphen and not only a little word's: "String-Of-Beads" is "String-of-beads" (the review had
 * "String-of-Beads"), and "Queen-Victoria Agave" is "Queen-victoria Agave".
 *
 * The audit runs only with INDEX=<path to a built index.json>; the same audit is scripts/audit-common-names.ts, for the
 * live index: INDEX=static/s/v2/index.json npx vitest run tests/unit/r61q-common-name-rule.test.ts
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { englishNames, generaOf, type VernacularName } from '$dossier/index-entry';
import { vernacular } from '$dossier/sources/gbif';
import { Vernacular, NameBlock } from '$dossier/schema';
import * as v from 'valibot';
import { auditCommonNames } from '../../scripts/audit-common-names';
import { synthIndex, reseed } from './helpers/corpus-synth';

const GENERA = generaOf(['Curio', 'Senecio', 'Ceropegia', 'Aloe', 'Gonialoe', 'Kalanchoe', 'Bryophyllum', 'Echeveria', 'Agave', 'Sansevieria', 'Dracaena', 'Crassula', 'Welwitschia', 'Iris', 'Moraea']);
const shown = (vs: VernacularName[], genus: string) => englishNames(vs, { genus, genera: GENERA }).common;

// Curio rowleyanus as the review brief describes the live dossier: GBIF's first English name is "String-Of-Beads Senecio",
// and "String-of-Pearls" is among the others (the rest of the list is illustrative, of the kind GBIF returns).
const CURIO: VernacularName[] = [
  { name: 'String-Of-Beads Senecio', lang: 'eng', source: 'ITIS' },
  { name: 'String-of-Pearls', lang: 'eng', source: 'USDA PLANTS' },
  { name: 'String of pearls', lang: 'eng', source: 'Wikipedia' },
  { name: 'string of beads', lang: 'eng', source: 'Catalogue of Life' },
  { name: 'Erwtjies', lang: 'afr', source: 'x' }
];

describe('the common name shown (corpus 9, review B)', () => {
  it('a name that names another genus, in mechanical title case, is not shown over the species\' commoner name', () => {
    // Base: "String-Of-Beads Senecio".
    expect(englishNames(CURIO, { genus: 'Curio', genera: GENERA }).common).not.toMatch(/Senecio/);
  });
  it('Curio rowleyanus shows "String of pearls"; every other name stays, in the rule\'s order, one spelling each', () => {
    expect(englishNames(CURIO, { genus: 'Curio rowleyanus', genera: GENERA })).toEqual({ common: 'String of pearls', commons: ['string of beads', 'String-of-beads Senecio'] });
  });
  it('a name naming the species\' own genus is not set back ("Tiger Aloe" for an Aloe); a capital after a hyphen is lowered', () => {
    expect(shown([{ name: 'Tiger Aloe', lang: 'eng' }], 'Aloe')).toBe('Tiger Aloe');
    expect(shown([{ name: 'Queen-Victoria Agave', lang: 'eng' }, { name: 'Royal agave', lang: 'eng' }], 'Agave')).toBe('Queen-victoria Agave');
  });
  it('the old genus in a name sets it back only when another English name exists', () => {
    expect(shown([{ name: 'Tiger Aloe', lang: 'eng' }], 'Gonialoe')).toBe('Tiger Aloe');
    expect(shown([{ name: 'Tiger Aloe', lang: 'eng' }, { name: 'Partridge-breast', lang: 'eng' }], 'Gonialoe')).toBe('Partridge-breast');
  });
  it('a comma list of several names and a string shaped like a binomial go last too, and are not split', () => {
    expect(englishNames([{ name: 'Living stones, pebble plants', lang: 'eng' }, { name: 'Split rock', lang: 'eng' }], { genus: 'Lithops', genera: GENERA })).toEqual({ common: 'Split rock', commons: ['Living stones, pebble plants'] });
    expect(shown([{ name: 'Aloe vera', lang: 'eng' }, { name: 'Barbados aloe', lang: 'eng' }], 'Aloe')).toBe('Barbados aloe');
    expect(shown([{ name: 'Senecio rowleyanus', lang: 'eng' }, { name: 'String of pearls', lang: 'eng' }], 'Curio')).toBe('String of pearls');
    expect(shown([{ name: 'Aloe vera', lang: 'eng' }], 'Aloe')).toBe('Aloe vera'); // the only English name is still shown
  });
  it('a name GBIF marks preferred goes first; then the one more sources give; then GBIF\'s order', () => {
    expect(shown([{ name: 'Snake plant', lang: 'eng', source: 'a' }, { name: "Mother-in-law's tongue", lang: 'eng', source: 'b', preferred: true }], 'Dracaena')).toBe("Mother-in-law's tongue");
    expect(shown([{ name: 'Jade', lang: 'eng', source: 'a' }, { name: 'Money plant', lang: 'eng', source: 'b' }, { name: 'money-plant', lang: 'eng', source: 'c' }], 'Crassula')).toBe('Money plant');
    expect(shown([{ name: 'Jade', lang: 'eng' }, { name: 'Money plant', lang: 'eng', sources: 3 }], 'Crassula')).toBe('Money plant');
    expect(shown([{ name: 'Jade', lang: 'eng' }, { name: 'Money plant', lang: 'eng' }], 'Crassula')).toBe('Jade');
  });
  it('preferred outranks sources, and the set-back outranks preferred', () => {
    expect(shown([{ name: 'Jade', lang: 'eng', sources: 5 }, { name: 'Money plant', lang: 'eng', preferred: true }], 'Crassula')).toBe('Money plant');
    expect(shown([{ name: 'Jade', lang: 'eng' }, { name: 'Money aloe', lang: 'eng', preferred: true }], 'Crassula')).toBe('Jade');
  });
  it('the spelling shown does not depend on the order the sources were read in', () => {
    const a = [{ name: 'String-of-Pearls', lang: 'eng' }, { name: 'String of pearls', lang: 'eng' }];
    expect(shown(a, 'Curio')).toBe('String of pearls');
    expect(shown([...a].reverse(), 'Curio')).toBe('String of pearls');
  });
  it('mechanical title case is undone on the letter after a hyphen only', () => {
    expect(shown([{ name: 'String-Of-Beads', lang: 'eng' }], 'Curio')).toBe('String-of-beads');
    expect(shown([{ name: 'Christmas Cactus', lang: 'eng' }], 'Schlumbergera')).toBe('Christmas Cactus');
  });
  it('no English name: none; an untagged name is not English', () => {
    expect(shown([{ name: 'tweeblaarkanniedood', lang: 'afr' }], 'Welwitschia')).toBeUndefined();
    expect(shown([{ name: 'Tumboa' }], 'Welwitschia')).toBeUndefined();
  });
  it('without the corpus\'s genera (a caller with no index), comma lists are still set back and nothing else is guessed', () => {
    expect(englishNames(CURIO)).toEqual({ common: 'String of pearls', commons: ['String-of-beads Senecio', 'string of beads'] });
    expect(englishNames([{ name: 'Iris, flag', lang: 'eng' }, { name: 'Butterfly iris', lang: 'eng' }])).toEqual({ common: 'Butterfly iris', commons: ['Iris, flag'] });
  });
  it('a stored dossier built before (no preferred, no sources) reads as not preferred, one source', () => {
    const old = [{ name: 'Tree tumbo', lang: 'eng' }, { name: 'Tumboa', lang: 'eng' }];
    expect(englishNames(old, { genus: 'Welwitschia', genera: GENERA })).toEqual({ common: 'Tree tumbo', commons: ['Tumboa'] });
    expect(v.safeParse(NameBlock, { scientific: 'Welwitschia mirabilis', status: 'accepted', synonyms: [], vernacular: old }).success).toBe(true);
    expect(v.safeParse(Vernacular, { name: 'Tree tumbo', lang: 'eng', preferred: true, sources: 2 }).success).toBe(true);
  });
});

describe('gbif.vernacular keeps GBIF\'s preferred flag and counts its sources', () => {
  const answer = (results: object[]) => (async () => ({ status: 'ok', data: { results } })) as never;
  it('a name given by three sources (in two cases) is one row with sources 3; one preferred row marks it preferred', async () => {
    const r = await vernacular(answer([
      { vernacularName: 'String of pearls', language: 'eng', source: 'A' },
      { vernacularName: 'String Of Pearls', language: 'eng', source: 'B', preferred: true },
      { vernacularName: 'string of pearls', language: 'eng', source: 'C' },
      { vernacularName: 'String of pearls', language: 'eng', source: 'A' }, // the same source again: not a second source
      { vernacularName: 'Erwtjies', language: 'afr' }
    ]), 1);
    expect(r).toEqual({ status: 'ok', data: [
      { name: 'String of pearls', lang: 'eng', source: 'A', preferred: true, sources: 3 },
      { name: 'Erwtjies', lang: 'afr', source: undefined }
    ] });
  });
  it('rows with no source each count as one; a name from one source carries neither field', async () => {
    const r = await vernacular(answer([{ vernacularName: 'Jade', language: 'eng' }, { vernacularName: 'jade', language: 'eng' }, { vernacularName: 'Money plant', language: 'eng', source: 'X' }]), 1);
    expect(r).toEqual({ status: 'ok', data: [{ name: 'Jade', lang: 'eng', source: undefined, sources: 2 }, { name: 'Money plant', lang: 'eng', source: 'X' }] });
  });
});

describe('the audit (scripts/audit-common-names.ts)', () => {
  it('on the fixture corpus: one species with a common name, unchanged', () => {
    const idx = JSON.parse(readFileSync('fixtures/dossiers/index.json', 'utf8'));
    expect(auditCommonNames(idx)).toMatchObject({ species: 4, withCommon: 1, changed: 0 });
  });
  it('counts and samples the changes, and says why', () => {
    const a = auditCommonNames([
      { name: 'Curio rowleyanus', common: 'String-Of-Beads Senecio', commons: ['String-of-Pearls', 'String of pearls'] },
      { name: 'Senecio vulgaris', common: 'Groundsel' },
      { name: 'Crassula ovata', common: 'Jade', commons: ['Money-Plant', 'Money plant'] },
      { name: 'Aloe vera', common: 'Barbados aloe' },
      { name: 'Agave americana', common: 'Century-Plant' }
    ], 40);
    expect(a).toMatchObject({ species: 5, withCommon: 5, changed: 3, setBack: 1, spellingOnly: 1, bySources: 1 });
    expect(a.sample).toEqual(['Curio rowleyanus: "String-Of-Beads Senecio" -> "String of pearls"', 'Crassula ovata: "Jade" -> "Money plant"', 'Agave americana: "Century-Plant" -> "Century-plant"']);
  });
  it('on the synthetic 9,000-species corpus it runs and its sample is at most the size asked', () => {
    reseed(7);
    const { idx } = synthIndex(9000);
    const a = auditCommonNames(idx as never, 40);
    expect(a.species).toBe(9000);
    expect(a.sample.length).toBeLessThanOrEqual(40);
    expect(a.changed).toBeLessThanOrEqual(a.withCommon);
  });
  it.skipIf(!process.env.INDEX)('audit: how many species of a built index the rule shows differently, and why', () => {
    const a = auditCommonNames(JSON.parse(readFileSync(process.env.INDEX!, 'utf8')), 40);
    process.stdout.write(JSON.stringify(a, null, 1) + '\n');
  });
});

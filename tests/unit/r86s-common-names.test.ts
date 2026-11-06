/**
 * Round eighty-six, the sources agent: the common names of review S's S2 and S12 (peyote, dragon fruit, false roselle,
 * loquat, moth orchid).
 *
 * - Peyote and dragon fruit: Lophophora williamsii's record holds "peyote" and S. undatus's "dragon fruit" only from NCBI's
 *   taxonomy, whose rows GBIF gives with no language, and the index read none of them. Decided on the evidence of the 788
 *   pages reviews D and S read: of NCBI's 121 such rows, 114 are English and 7 are not ("acibar", "babosa", "chatas",
 *   "chula", "maranga"); Catalogue of Life's 465 are in every language ("Cekuh", "Hingstkastanje", "Horse-chestnut (EN)"),
 *   GRIN's 194 nearly none English ("bai mu"). So NCBI's rows with no language are searched (`spellings`), never shown,
 *   and no other source's are read. "peyote" now puts L. williamsii first, "dragon fruit" S. undatus.
 * - False roselle: "false roselle" was read from fewer letters as "false rose" and answered Selaginella lepidophylla (and
 *   the picker asked "Did you mean …?"); a phrase whose first word is no genus here is not read so. The page itself, whose
 *   GBIF key gives no English name, gets one only from Wikidata (`--fill wikidata-names --keyed`, off by the owner's
 *   decision): its `--dry-run` now says what it would give, writing nothing.
 * - Loquat and moth orchid: Eriobotrya japonica's key (10786206) and Phalaenopsis amabilis's give no English name at GBIF;
 *   the same `--keyed` run is the way, the owner's to decide (see the report).
 *
 * Records: the live index of 2026-11-05 (`inputs/index.json`) cut to ten entries, and the two dossiers' rows
 * (`S-s/dos/`), in `fixtures/r86s/`.
 *
 * On r86base (9cf3077) every `it` FAILED: no spelling was read from a row with no language ("peyote" answered
 * L. diffusa first, "dragon fruit" nothing), `shorterReadings` read "false roselle" as "false rose", and
 * `fillWikidataNames` wrote with `dry`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { prepare, search, shorterReadings } from '$core/search';
import { indexNames, englishNames } from '$dossier/index-entry';
import { fillWikidataNames } from '$dossier/wikidata-names';

const fx = (f: string) => JSON.parse(readFileSync(`tests/unit/fixtures/r86s/${f}`, 'utf8'));
const lw = fx('k2337299-names.json'), su = fx('k3016262-names.json');

describe('S2: NCBI\'s names with no language are searched, never shown', () => {
  it('peyote and dragon fruit are spellings of their pages; the names shown are as before', () => {
    const l = indexNames(lw.name.vernacular, { genus: lw.name.scientific });
    expect(l.common).toBe('Indian-dope');
    expect(l.spellings).toContain('peyote');
    expect([l.common, ...(l.commons ?? [])].map((x) => x?.toLowerCase())).not.toContain('peyote');
    const s = indexNames(su.name.vernacular, { genus: su.name.scientific });
    expect(s).toEqual({ common: 'Nightblooming Cactus', spellings: ['dragon fruit'] });
    // Catalogue of Life's rows with no language are not read: "Hikuri", "Peyotl", "xosdíszhot'é" (guard).
    expect(l.spellings).not.toContain('Hikuri');
    expect(englishNames([{ name: 'babosa', lang: '', source: 'NCBI Taxonomy' }] as never)).toEqual({});
  });

  it('"peyote" puts Lophophora williamsii first, and "dragon fruit" finds Selenicereus undatus', () => {
    const idx = fx('names-index.json') as Array<Record<string, unknown>>;
    for (const [d, n] of [[lw, indexNames(lw.name.vernacular, { genus: lw.name.scientific })], [su, indexNames(su.name.vernacular, { genus: su.name.scientific })]] as const) Object.assign(idx.find((e) => e.key === d.key)!, n);
    const p = prepare(idx as never);
    expect((search(p, 'peyote', 5) as Array<{ name: string }>)[0].name).toBe('Lophophora williamsii');
    expect((search(p, 'dragon fruit', 5) as Array<{ name: string }>).map((e) => e.name)).toEqual(['Selenicereus undatus']);
  });
});

describe('S2: "false roselle" is never read as "false rose"', () => {
  it('a phrase whose first word is no genus here is not read from fewer letters; a name being typed still is', () => {
    const genera = new Set(['lithops', 'selaginella', 'sabdariffa']);
    const isGenus = (w: string) => genera.has(w);
    expect(shorterReadings('false roselle', isGenus)).toEqual([]);
    expect(shorterReadings('lithops lesleyi', isGenus)).toEqual(['lithops lesley', 'lithops lesle', 'lithops lesl']);
    expect(shorterReadings('sansiveria', isGenus)).toEqual(['sansiveri', 'sansiver', 'sansive', 'sans']); // one word: a genus being typed
  });
});

describe('S2: --fill wikidata-names --keyed --dry-run says what it would give, and writes nothing', () => {
  it('Sabdariffa acetosella (GBIF 7802717, no English name at GBIF): its item\'s English name is said, not written', async () => {
    const page = { key: 'k3330712', ids: { gbif: 7802717, wikidata: 'Q5750828' }, name: { scientific: 'Sabdariffa acetosella', vernacular: [] as unknown[] }, upstream: {} };
    const writes: string[] = [];
    const store = { files: () => ['k3330712.json'], read: <T,>() => structuredClone(page) as T, write: (f: string) => { writes.push(f); } };
    const answer = { results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q5750828' }, st: { value: 'http://www.wikidata.org/entity/statement/Q5750828-1' }, name: { value: 'false roselle', 'xml:lang': 'en' }, rank: { value: 'http://wikiba.se/ontology#NormalRank' } }] } };
    const f = (async () => ({ status: 'ok', data: answer })) as never;
    const c = await fillWikidataNames(store, f, { keyed: true, dry: true, now: () => '2026-11-07T00:00:00.000Z' });
    expect(c).toMatchObject({ keyed: 1, taken: 1, shown: 1, written: 1 });
    expect(c.lines[0]).toBe('Sabdariffa acetosella [k3330712]: False roselle (Q5750828: false roselle)');
    expect(writes).toEqual([]);
    const c2 = await fillWikidataNames(store, f, { keyed: true, now: () => '2026-11-07T00:00:00.000Z' });
    expect(c2.written).toBe(1);
    expect(writes).toEqual(['k3330712.json']); // without --dry-run it writes (guard)
  });
});

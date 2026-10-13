/**
 * Round seventy, triage-69 section 6, step 4: the Wikidata items the corpus took without the species' own GBIF key are
 * proved again by the round-seventy rule (`--fill wikidata`). An item that stands keeps its place and its record says
 * how it was proved; one the rule refuses, replaces or newly finds is left as it is and listed for `--keys`, since the
 * item also gives the iNaturalist id, the Commons category and the Wikipedia title a build derives with it. The items,
 * records and Kew rows are those of 2026-10-12 (see r70b-wikidata-ipni.test.ts). Every case FAILED on the base (526ecaf):
 * it has no `fillWikidata`.
 */
import { describe, it, expect } from 'vitest';
import { fillWikidata, REPROVED, rebuildList } from '$dossier/corpus-fills';
import { WCVP_DATASET } from '$dossier/sources/gbif';
import type { JsonFetcher } from '$dossier/fetch';
import { readFileSync } from 'node:fs';

const claim = (v: unknown) => [{ mainsnak: { datavalue: { value: v } } }];
const item = (name: string, keys: string[] = [], ipni: string[] = []) => ({ claims: { P225: claim(name), ...(keys.length ? { P846: keys.flatMap(claim) } : {}), ...(ipni.length ? { P961: ipni.flatMap(claim) } : {}), P31: claim({ id: 'Q16521' }) } });
const ITEMS: Record<string, unknown> = {
  Q5168360: item('Copiapoa cinerea', ['5384013']),
  Q146400: item('Solanum nigrum', ['2932865'], ['30048260-2']),
  Q391952: item('Agave variegata', ['2767037'], ['62332-1']),
  Q15523250: item('Manfreda variegata', ['2771707']),
  Q159204: item('Catalpa speciosa', ['317261'], ['77117561-1'])
};
const LABELS: Record<string, string[]> = { 'Solanum nigrum': ['Q146400'], 'Agave variegata': ['Q391952'], 'Catalpa speciosa': ['Q159204'] };
const KEW: Record<string, Array<[string, string, string, string]>> = {
  'Solanum nigrum': [['Solanum nigrum L.', 'L.', 'ACCEPTED', '30048260-2']],
  'Agave variegata': [['Agave variegata Jacobi', 'Jacobi', 'SYNONYM', '62333-1'], ['Agave variegata Steud.', 'Steud.', 'SYNONYM', '62332-1']],
  'Catalpa speciosa': [['Catalpa speciosa Warder ex Teas', 'Warder ex Teas', 'ACCEPTED', '77117561-1']]
};
const SYN: Record<number, unknown[]> = { 7720070: [{ key: 2771707, canonicalName: 'Manfreda variegata', rank: 'SPECIES', basionymKey: 7720070 }] };

/** Wikidata, GBIF and GBIF's copy of WCVP as they answered; `refuse` turns a GBIF request into a refusal. */
function world(asked: string[] = [], refuse?: RegExp): JsonFetcher {
  return (async (url: string) => {
    asked.push(url);
    const ok = (data: unknown) => ({ status: 'ok', data });
    if (refuse?.test(url)) return { status: 'refused', detail: 'api.gbif.org 429' };
    let m: RegExpExecArray | null;
    if ((m = /wbgetentities&format=json&ids=([^&]+)&/.exec(url))) return ok({ entities: Object.fromEntries(m[1].split('|').map((q) => [q, ITEMS[q] ?? { missing: '' }])) });
    if ((m = /wbsearchentities.*&search=([^&]+)/.exec(url))) { const n = decodeURIComponent(m[1]); return ok({ search: (LABELS[n] ?? []).map((id) => ({ id, label: n })) }); }
    if (/srsearch=haswbstatement%3AP846%3D2771707/.test(url)) return ok({ query: { search: [{ title: 'Q15523250' }] } });
    if (/srsearch=haswbstatement/.test(url)) return ok({ query: { search: [] } });
    if ((m = new RegExp(`datasetKey=${WCVP_DATASET}&name=([^&]+)`).exec(url))) { const n = decodeURIComponent(m[1]); return ok({ results: (KEW[n] ?? []).map(([sci, a, taxonomicStatus, ipni]) => ({ scientificName: sci, canonicalName: n, authorship: a, taxonomicStatus, references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${ipni}` })) }); }
    if ((m = /\/species\/(\d+)\/synonyms/.exec(url))) return ok({ results: SYN[Number(m[1])] ?? [], endOfRecords: true });
    if (/\/species\/317261$/.test(url)) return { status: 'none' };
    if ((m = /\/species\/(\d+)$/.exec(url))) return ok({ key: Number(m[1]) });
    return { status: 'none' };
  }) as unknown as JsonFetcher;
}
const carried = { status: 'ok', at: '2026-09-19T00:00:00Z', detail: 'carried from build of 2026-09-19 (rederive)' };
const corpus = (): Record<string, unknown> => ({
  '5384013.json': { key: 5384013, name: { scientific: 'Copiapoa cinerea', authorship: '(Phil.) Britton & Rose' }, ids: { gbif: 5384013, wikidata: 'Q5168360' }, links: {}, upstream: { wikidata: carried } },
  '9150405.json': { key: 9150405, name: { scientific: 'Solanum nigrum', authorship: 'L.' }, ids: { gbif: 9150405, wikidata: 'Q146400', ipni: '30048260-2', inat: 79141 }, links: { ipni: 'https://www.ipni.org/n/30048260-2' }, upstream: { wikidata: carried } },
  '7720070.json': { key: 7720070, name: { scientific: 'Agave variegata', authorship: 'Jacobi' }, ids: { gbif: 7720070, wikidata: 'Q391952', ipni: '62332-1' }, links: { ipni: 'https://www.ipni.org/n/62332-1' }, upstream: { wikidata: { status: 'ok', at: '2026-10-10T00:00:00Z', detail: "found by its label; its GBIF key 2767037 is GBIF's record of Agave variegata Steud., the same name" } } },
  '3172612.json': { key: 3172612, name: { scientific: 'Catalpa speciosa', authorship: '(Warder ex Barney) Warder ex Engelm.' }, ids: { gbif: 3172612 }, links: {}, upstream: { wikidata: { status: 'none', at: '2026-10-10T00:00:00Z', detail: "not taken: the item labelled Catalpa speciosa, Q159204, carries GBIF key 317261, GBIF's record of another name" } } }
});
const store = (docs: Record<string, unknown>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d; } });
type D = { ids: Record<string, unknown>; links: Record<string, string>; upstream: Record<string, { status: string; detail?: string }> };

describe('--fill wikidata', () => {
  it('reads every item for its GBIF key, proves again those without it, and lists what the rule changes', async () => {
    const docs = corpus();
    const before = structuredClone(docs);
    const asked: string[] = [];
    const c = await fillWikidata(store(docs), world(asked), () => '2026-10-13T00:00:00Z');
    expect(c).toMatchObject({ read: 3, byKey: 1, stands: 1, changed: 2, before: 0 });
    expect(asked.filter((u) => /wbgetentities.*ids=Q5168360\|Q146400\|Q391952&props=claims&/.test(u))).toHaveLength(1); // fifty items a request
    expect(docs['5384013.json']).toEqual(before['5384013.json']); // found by its own key: left alone
    const sol = docs['9150405.json'] as D;
    expect(sol.upstream.wikidata).toEqual({ status: 'ok', at: '2026-10-13T00:00:00Z', detail: `found by its label; its IPNI identifier 30048260-2 is Kew's for Solanum nigrum L.; ${REPROVED} 2026-10-13` });
    expect(sol.ids.inat).toBe(79141); // what --fill inat-ids checks is left to it
    expect(docs['7720070.json']).toEqual(before['7720070.json']); // changed: left as it is until rebuilt
    expect(docs['3172612.json']).toEqual(before['3172612.json']);
    expect(c.lines).toEqual([
      "Catalpa speciosa [3172612]: no item → Q159204 (found by its label; its IPNI identifier 77117561-1 is Kew's for Catalpa speciosa Warder ex Teas)",
      'Agave variegata [7720070]: Q391952 → Q15523250 (found by the GBIF record of Manfreda variegata, an older name with the same type)'
    ]);
    expect(c.rebuild).toEqual(['3172612 Catalpa speciosa\tWikidata item none → Q159204', '7720070 Agave variegata\tWikidata item Q391952 → Q15523250']);
  });
  it('a refusal stops the fill; what was proved stands, and the next run passes by it (fails safe)', async () => {
    const docs = corpus();
    const first = await fillWikidata(store(docs), world([], /\/species\/7720070\/synonyms/), () => '2026-10-13T00:00:00Z');
    expect(first.failed).toBe('GBIF: api.gbif.org 429');
    expect((docs['9150405.json'] as D).upstream.wikidata.detail).toContain(REPROVED);
    expect(docs['7720070.json']).toEqual(corpus()['7720070.json']);
    const again = await fillWikidata(store(docs), world(), () => '2026-10-13T00:00:00Z');
    expect(again).toMatchObject({ before: 1, stands: 0, changed: 2 });
  });
  it('a GBIF refusal while an item is checked is said as GBIF\'s', async () => {
    const c = await fillWikidata(store(corpus()), world([], /datasetKey=/), () => '2026-10-13T00:00:00Z');
    expect(c.failed).toBe('GBIF, checking an item: api.gbif.org 429');
  });
  it('the script runs it as --fill wikidata and writes rebuild-wd.txt', () => {
    const script = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(script).toMatch(/if \(fill === 'wikidata'\) return fillWikidataStep\(\);/);
    expect(script).toMatch(/const c = await fillWikidata\(diskStore\(\), makeFetcher\(\)\);/);
    expect(script).toMatch(/writeFileSync\('rebuild-wd\.txt', c\.rebuild\.join/);
  });
});

describe('--list-rebuild lists identifiers kept from a build the record does not name (S-B7)', () => {
  it('Mammillaria gigantea\'s "the previous build\'s identifiers are kept" is listed; a dated keep is not', () => {
    const docs: Record<string, unknown> = {
      '7383055.json': { key: 7383055, name: { scientific: 'Mammillaria gigantea' }, upstream: { wikidata: { status: 'error', detail: "wikidata maxlag: 5 seconds lagged; the previous build's identifiers are kept" } } },
      '1.json': { key: 1, name: { scientific: 'Aus bus' }, upstream: { wikidata: { status: 'error', detail: 'wikidata maxlag; the identifiers of the build of 2026-10-01 are kept' } } }
    };
    expect(rebuildList(store(docs))).toEqual(['7383055 Mammillaria gigantea\tidentifiers kept from a build the record does not name']); // base: []
  });
});

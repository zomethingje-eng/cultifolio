/**
 * Round seventy-two (reviewer D): what the dry runs of round seventy-one's corpus step on the real corpus found in the
 * fills (D-work/out-*.log). Each case FAILED on r72base unless it says "guard".
 *   - `--fill wikidata` wrote an item's own IPNI and POWO over Kew's numbers that `--fill kew-links` had set (Ceropegia
 *     penduliflora 77357237-1 back to the item's 77211853-1, on the subset's second run);
 *   - `--fill kew-links` kept what it had read only when GBIF refused: a run cut off by Ctrl-C asked every dossier again
 *     (8,795 requests on the corpus);
 *   - `--fill gbif-open` asked again, on every run, a species whose openly licensed GBIF photographs all lack the author
 *     their licence requires (8 of the 85 it asked), and its count left them out.
 */
import { describe, it, expect } from 'vitest';
import { fillWikidata, fillKewLinks, REPROVED } from '$dossier/corpus-fills';
import { fillOpenGbifAll } from '$dossier/corpus-run';
import { askedOpen } from '$dossier/open-gbif-fill';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';

const WCVP = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';
const claim = (v: unknown) => [{ mainsnak: { datavalue: { value: v } } }];
type Doc = { key: number; name: { scientific: string; authorship?: string; family?: string }; ids: Record<string, unknown>; links: Record<string, string>; photos?: unknown[]; upstream: Record<string, { status: string; at?: string; detail?: string }> };
const store = (docs: Record<string, Doc>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d as Doc; } });

describe('--fill wikidata links a re-proved item by Kew\'s numbers, as a build does', () => {
  // Aus bus L. (key 1), whose basionym is Xus bus (key 2): Kew's number for Aus bus L. is 2-2. Its item Q7, found by the
  // basionym's GBIF record as Ceropegia penduliflora's was by Boucerosia penduliflora's, carries the basionym's IPNI and
  // POWO, 1-1. --fill kew-links had set 2-2 on the page, and the build would have.
  const world = () => fixtureFetcher({
    're:srsearch=haswbstatement%3AP846%3D1(&|$)': { query: { search: [] } },
    'https://www.wikidata.org/w/api.php?action=wbsearchentities': { search: [] },
    're:srsearch=haswbstatement%3AP961': { query: { search: [] } },
    're:srsearch=haswbstatement%3AP846%3D2(&|$)': { query: { search: [{ title: 'Q7' }] } },
    're:wbgetentities&format=json&ids=Q7&': { entities: { Q7: { claims: { P31: claim({ id: 'Q16521' }), P225: claim('Xus bus'), P846: claim('2'), P961: claim('1-1'), P5037: claim('urn:lsid:ipni.org:names:1-1') } } } },
    [`re:datasetKey=${WCVP}`]: { results: [{ key: 206000000, scientificName: 'Aus bus (Mill.) L.', canonicalName: 'Aus bus', authorship: '(Mill.) L.', taxonomicStatus: 'ACCEPTED', rank: 'SPECIES', references: 'urn:lsid:ipni.org:names:2-2' }] },
    'https://api.gbif.org/v1/species/1/synonyms': { results: [{ key: 2, scientificName: 'Xus bus Mill.', canonicalName: 'Xus bus', rank: 'SPECIES', taxonomicStatus: 'HOMOTYPIC_SYNONYM' }], endOfRecords: true },
    'https://api.gbif.org/v1/species/1': { key: 1, scientificName: 'Aus bus (Mill.) L.', canonicalName: 'Aus bus', authorship: '(Mill.) L.', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae', basionymKey: 2 },
    're:www\\.ipni\\.org': null
  });
  const doc = (): Doc => ({ key: 1, name: { scientific: 'Aus bus', authorship: '(Mill.) L.', family: 'Apocynaceae' }, ids: { gbif: 1, wikidata: 'Q7', ipni: '2-2', powo: 'urn:lsid:ipni.org:names:2-2' }, links: { ipni: 'https://www.ipni.org/n/2-2', powo: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:2-2' }, upstream: { wikidata: { status: 'ok', at: 'x', detail: "found by the GBIF record of Xus bus, an older name with the same type; IPNI and POWO linked by Kew's number for Aus bus (Mill.) L. (the item's: IPNI 1-1, POWO 1-1; 2026-10-15)" } } });

  it('the page keeps Kew\'s 2-2, and the record still says the item\'s numbers were not taken', async () => {
    const docs = { 'a.json': doc() };
    const c = await fillWikidata(store(docs), world(), () => '2026-10-16T00:00:00Z');
    expect(c).toMatchObject({ read: 1, stands: 1, changed: 0 });
    expect(docs['a.json'].ids).toMatchObject({ wikidata: 'Q7', ipni: '2-2', powo: 'urn:lsid:ipni.org:names:2-2' }); // r72base: the item's 1-1
    expect(docs['a.json'].links.ipni).toBe('https://www.ipni.org/n/2-2');
    expect(docs['a.json'].upstream.wikidata.detail).toBe(`found by the GBIF record of Xus bus, an older name with the same type; ${REPROVED} 2026-10-16; IPNI and POWO linked by Kew's number for Aus bus (Mill.) L. (the item's: IPNI 1-1, POWO 1-1)`);
  });
});

describe('--fill kew-links keeps what it read as it goes', () => {
  const docs = () => Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`${i + 1}.json`, { key: i + 1, name: { scientific: `Aus bus${i + 1}`, authorship: 'L.' }, ids: { gbif: i + 1, ipni: `${i + 1}-1` }, links: {}, upstream: {} } as Doc]));
  const kew = (u: string) => { const n = /name=Aus%20bus(\d+)/.exec(u)![1]; return { status: 'ok', data: { results: [{ key: 1, scientificName: `Aus bus${n} L.`, canonicalName: `Aus bus${n}`, authorship: 'L.', taxonomicStatus: 'ACCEPTED', references: `urn:lsid:ipni.org:names:${n}-1` }] } }; };

  it('a run cut off after 75 dossiers has saved the first 50, and the next run passes them by', async () => {
    const d = docs();
    let saved: string[] = [];
    let calls = 0;
    const dies = (async (u: string) => { if (++calls > 75) throw new Error('Ctrl-C'); return kew(u); }) as unknown as JsonFetcher;
    await expect(fillKewLinks(store(d), dies, undefined, { read: [], save: (r) => { saved = r; }, clear: () => { saved = []; } })).rejects.toThrow('Ctrl-C');
    expect(saved).toHaveLength(50); // r72base: nothing saved
    let asked = 0;
    const c = await fillKewLinks(store(d), (async (u: string) => { asked++; return kew(u); }) as unknown as JsonFetcher, undefined, { read: saved, save: () => {}, clear: () => {} });
    expect(c.before).toBe(50);
    expect(asked).toBe(70);
  });
});

describe('--fill gbif-open settles a species whose open photographs name no author', () => {
  const media = { results: [{ key: 9, datasetKey: 'd', media: [{ type: 'StillImage', identifier: 'https://example.org/a.jpg', license: 'http://creativecommons.org/licenses/by/4.0/' }] }] };
  it('recorded as none, counted, and not asked again', async () => {
    const docs: Record<string, Doc> = { 'a.json': { key: 5, name: { scientific: 'Aus bus' }, ids: {}, links: {}, photos: [], upstream: {} } };
    let asked = 0;
    const f = (async () => { asked++; return { status: 'ok', data: media }; }) as unknown as JsonFetcher;
    const c = await fillOpenGbifAll(store(docs), f);
    expect(c).toMatchObject({ asked: 1, filled: 0, none: 1 }); // r72base: none 0, the species in no count
    expect(docs['a.json'].upstream['gbif.media']).toMatchObject({ status: 'none' });
    expect(askedOpen(docs['a.json'] as never)).toBe(true);
    const again = await fillOpenGbifAll(store(docs), f);
    expect(again).toMatchObject({ asked: 0, before: 1 });
    expect(asked).toBe(1); // r72base: 2
  });
});

describe('--fill wikidata asks again what Wikidata did not answer', () => {
  // The species of rebuild-wd.txt were rebuilt while Wikidata lagged; their rows say "not answered", and no fill asked them again.
  const lagRow = { status: 'error', at: '2026-10-15T15:30:00Z', detail: 'wikidata maxlag: Waiting for wdqs1016: 8.3 seconds lagged.; the identifiers of the build of 2026-10-14 are kept' };
  const world = (hasItem: boolean) => fixtureFetcher({
    're:srsearch=haswbstatement%3AP846%3D3(&|$)': { query: { search: hasItem ? [{ title: 'Q9' }] : [] } },
    're:wbgetentities&format=json&ids=Q9&': { entities: { Q9: { claims: { P31: claim({ id: 'Q16521' }), P225: claim('Cus dus'), P846: claim('3') } } } },
    'https://www.wikidata.org/w/api.php?action=wbsearchentities': { search: [] },
    're:srsearch=haswbstatement%3AP961': { query: { search: [] } },
    [`re:datasetKey=${WCVP}`]: { results: [] },
    'https://api.gbif.org/v1/species/3/synonyms': { results: [], endOfRecords: true },
    'https://api.gbif.org/v1/species/3': { key: 3, scientificName: 'Cus dus Redouté', canonicalName: 'Cus dus', authorship: 'Redouté', rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae' }
  });
  const doc = (): Doc => ({ key: 3, name: { scientific: 'Cus dus', authorship: 'Redouté' }, ids: { gbif: 3, inat: 79459 }, links: {}, upstream: { wikidata: { ...lagRow } } });

  it('an item found now is listed for a rebuild, as Tulipa clusiana\'s should have been', async () => {
    const docs = { 'a.json': doc() };
    const c = await fillWikidata(store(docs), world(true), () => '2026-10-16T00:00:00Z');
    expect(c.rebuild).toEqual(['3 Cus dus\tWikidata item none → Q9']); // r72base: [] (not asked)
    expect(docs['a.json'].upstream.wikidata).toEqual(lagRow); // left for the rebuild
  });
  it('no item now: the record says Wikidata answered none, and nothing else changes', async () => {
    const docs = { 'a.json': doc() };
    const c = await fillWikidata(store(docs), world(false), () => '2026-10-16T00:00:00Z');
    expect(c.rebuild).toEqual([]);
    expect(docs['a.json'].upstream.wikidata).toMatchObject({ status: 'none', detail: expect.stringContaining(REPROVED) }); // r72base: still "not answered"
    expect(docs['a.json'].ids).toEqual({ gbif: 3, inat: 79459 });
  });
});

describe('--fill wikidata asks the same batches on every run of a day', () => {
  const item = (key: number, q: string, reproved: boolean): Doc => ({ key, name: { scientific: `Aus bus${key}` }, ids: { gbif: key, wikidata: q }, links: {}, upstream: { wikidata: { status: 'ok', at: 'x', detail: `found by its GBIF key${reproved ? `; ${REPROVED} 2026-10-15` : ''}` } } });
  const answer = (qs: string[], keyOf: (q: string) => number) => ({ status: 'ok', data: { entities: Object.fromEntries(qs.map((q) => [q, { claims: { P846: claim(String(keyOf(q))) } }])) } });
  it('an item re-proved by an earlier run stays in its batch, so the batch is the request the day\'s answers hold', async () => {
    const docs = { 'a.json': item(1, 'Q1', true), 'b.json': item(2, 'Q2', false) };
    const asked: string[] = [];
    const f = (async (u: string) => { asked.push(u); return answer(['Q1', 'Q2'], (q) => Number(q.slice(1))); }) as unknown as JsonFetcher;
    const c = await fillWikidata(store(docs), f, () => '2026-10-16T00:00:00Z');
    expect(c).toMatchObject({ read: 1, byKey: 1, before: 1 });
    expect(asked).toEqual(['https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q1|Q2&props=claims']); // r72base: ids=Q2 alone
  });
  it('a batch holding nothing to ask is not sent', async () => {
    const docs = { 'a.json': item(1, 'Q1', true) };
    const asked: string[] = [];
    await fillWikidata(store(docs), (async (u: string) => { asked.push(u); return { status: 'refused', detail: 'x' }; }) as unknown as JsonFetcher);
    expect(asked).toEqual([]);
  });
});

/**
 * Round eighty-six, final review S2 (D11, `crossIds`): on a page Kew's name heads whose GBIF key's one item is GBIF's
 * name's, a refusal or failure while Kew's identifiers are read (GBIF's `kewIpni`) or searched for (Wikidata's
 * `haswbstatement:P961=`) fell through to the GBIF key's item as `ok`, with no detail: the reviewer's stubbed 429 gave
 * `ok Q42559868 detail=undefined` for Huernia hallii, the very item D11 replaces. Asked and not answered is now the
 * step's answer (not checked), and the build keeps the previous dossier's identifiers and says the source did not answer.
 * Kew holding no identifier for the name, or a search finding none or two, still leaves the key's item, as before.
 *
 * On r85m (r86f-data's base): the 429 cases FAILED (`ok`, Q42559868).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { crossIds, mwWait } from '$dossier/sources/wikimedia';
import { buildDossier } from '$dossier/build';
import { fixtureFetcher, type JsonFetcher, type FetchResult } from '$dossier/fetch';
import { copiapoa } from '../../fixtures/upstream';

const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
type Item = { P225: string[]; gbif: string[]; ipni: string[] };
const ITEMS: Record<string, Item> = {
  Q42559868: { P225: ['Ceropegia hallii'], gbif: ['9382949'], ipni: ['77166429-1'] },
  Q5397594: { P225: ['Huernia hallii'], gbif: [], ipni: ['98770-1'] }
};
function world(items: Record<string, Item>, refuse?: (u: string) => FetchResult<never> | undefined): JsonFetcher {
  const ok = <T,>(data: unknown): FetchResult<T> => ({ status: 'ok', data: data as T });
  return (async (url: string) => {
    const u = decodeURIComponent(url);
    const no = refuse?.(u);
    if (no) return no;
    let m: RegExpExecArray | null;
    if ((m = /srsearch=haswbstatement:(\S+)/.exec(u))) {
      const hits = Object.entries(items).filter(([, i]) => m![1].split('|').some((t) => { const [p, v] = t.split('='); return (p === 'P846' && i.gbif.includes(v)) || (p === 'P961' && i.ipni.includes(v)) || (p === 'P5037' && i.ipni.some((x) => v.endsWith(`:${x}`))); }));
      return ok({ query: { search: hits.map(([title]) => ({ title })) } });
    }
    if ((m = /wbgetentities.*[&?]ids=([^&]+)/.exec(u))) return ok({ entities: Object.fromEntries(m[1].split('|').flatMap((q) => (items[q] ? [[q, { claims: { P31: [claim({ id: 'Q16521' })], P225: items[q].P225.map(claim), P846: items[q].gbif.map(claim), P961: items[q].ipni.map(claim) } }]] : []))) });
    if (u.includes('wbsearchentities')) throw new Error(`the label was read: ${u}`);
    return { status: 'none' } as FetchResult<never>;
  }) as unknown as JsonFetcher;
}
const KEW = { r: { status: 'ok' as const, data: { ids: ['98770-1'], label: 'Huernia hallii E.Lamb & B.M.Lamb' } } };
const opts = (kew?: unknown) => ({ authorship: 'E.Lamb & B.M.Lamb', family: 'Apocynaceae', kewPage: true, ...(kew ? { kew: structuredClone(kew) as typeof KEW } : { kew: {} }) });
const refused = (detail: string) => ({ status: 'refused', detail }) as FetchResult<never>;

describe("a renamed page's item, when Kew's identifiers are not answered (S2)", () => {
  it("a 429 on the search by Kew's identifier is Wikidata's refusal, not the GBIF key's item", async () => {
    const r = await crossIds(world(ITEMS, (u) => (u.includes('P961') ? refused('HTTP 429') : undefined)), 'Huernia hallii', 9382949, [], opts(KEW));
    expect(r.status).toBe('refused'); // r85m: ok, Q42559868, no detail
    expect(r.by).toBeUndefined();
    expect(r.detail).toBe('HTTP 429');
  });
  it("a 429 from GBIF reading Kew's identifiers is GBIF's refusal", async () => {
    const r = await crossIds(world(ITEMS, (u) => (u.includes('/species?datasetKey=') ? refused('HTTP 429') : undefined)), 'Huernia hallii', 9382949, [], opts());
    expect(r.status).toBe('refused'); // r85m: ok, Q42559868
    expect(r.by).toBe('gbif');
  });
  it("an error reading the item Kew's identifier found is the step's error", async () => {
    let n = 0;
    const r = await crossIds(world(ITEMS, (u) => (u.includes('wbgetentities') && u.includes('Q5397594') && ++n ? ({ status: 'error', detail: 'timeout' } as FetchResult<never>) : undefined)), 'Huernia hallii', 9382949, [], opts(KEW));
    expect(r.status).toBe('error');
  });
  it("guard: Kew holding no identifier, or the search finding none or two, leaves the GBIF key's item", async () => {
    const none = await crossIds(world(ITEMS), 'Huernia hallii', 9382949, [], opts({ r: { status: 'ok', data: { ids: [] } } }));
    expect((none as { data: { wikidata?: string } }).data.wikidata).toBe('Q42559868');
    const noItem = await crossIds(world({ Q42559868: ITEMS.Q42559868 }), 'Huernia hallii', 9382949, [], opts(KEW));
    expect((noItem as { data: { wikidata?: string } }).data.wikidata).toBe('Q42559868');
    const two = { ...ITEMS, Q2: { P225: ['Huernia hallii'], gbif: [], ipni: ['98770-1'] } };
    const amb = await crossIds(world(two), 'Huernia hallii', 9382949, [], opts(KEW));
    expect((amb as { data: { wikidata?: string } }).data.wikidata).toBe('Q42559868');
    const kewNone = await crossIds(world(ITEMS, (u) => (u.includes('/species?datasetKey=') ? ({ status: 'none' } as FetchResult<never>) : undefined)), 'Huernia hallii', 9382949, [], opts());
    expect((kewNone as { data: { wikidata?: string } }).data.wikidata).toBe('Q42559868');
  });
  it('guard: answered, Kew\'s name\'s item is taken as D11 takes it', async () => {
    const r = await crossIds(world(ITEMS), 'Huernia hallii', 9382949, [], opts(KEW));
    expect((r as { data: { wikidata?: string } }).data.wikidata).toBe('Q5397594');
  });
});

describe('the build, when the item is not checked', () => {
  const prevIds = { gbif: 5384013, wikidata: 'Q5168360', inat: 135254, powo: 'urn:lsid:ipni.org:names:1', ipni: '1', wfo: 'wfo-1', wikipedia: 'Copiapoa cinerea' };
  // Copiapoa cinerea's fixture item carries its GBIF key and no taxon name: as a page Kew heads, Kew's identifiers are asked.
  function fetcher(): JsonFetcher {
    const t = copiapoa() as Record<string, unknown>;
    t['https://api.inaturalist.org/v1/taxa?q='] = { results: [] };
    const base = fixtureFetcher(t);
    return (async (url: string) => (decodeURIComponent(url).includes('/species?datasetKey=') ? refused('HTTP 429') : base(url))) as unknown as JsonFetcher;
  }
  const before = { sleep: mwWait.sleep, tries: mwWait.tries, patient: mwWait.patient };
  beforeEach(() => { mwWait.sleep = async () => {}; mwWait.tries = 1; });
  afterEach(() => Object.assign(mwWait, before));
  it("keeps the previous dossier's identifiers and says GBIF refused, never blanks them", async () => {
    const r = await buildDossier('Copiapoa cinerea', { fetcher: fetcher(), builtBy: 'node', now: () => new Date('2026-11-07T12:00:00Z'), skip: ['commons', 'openalex', 'wikipedia'], kewEntryOf: () => '123', prevIds, prevIdsOn: '2026-11-01' });
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.upstream.wikidata.status).toBe('refused');
    expect(r.dossier.upstream.wikidata.detail).toMatch(/GBIF, asked to check the item it gave, refused the request \(HTTP 429\)/);
    expect(r.dossier.ids.wikidata).toBe('Q5168360');
    expect(r.dossier.ids.wfo).toBe('wfo-1');
  });
});

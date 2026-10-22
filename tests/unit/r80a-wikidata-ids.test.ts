/**
 * Round eighty, agent A: Datura innoxia (k2757799, GBIF 2928755) lost its Wikidata item, IPNI, POWO and WFO identifiers
 * to its label: no one item carried its GBIF key, two items were labelled with its name (Q17464343, Q1519478), and the
 * record said "not taken: two items answered to the label". Now a page with a GBIF key and a Kew id is matched by those
 * identifiers alone (its GBIF key, then Kew's IPNI or POWO identifier for its name and author), never by its label, and
 * its IPNI and POWO links are Kew's whatever Wikidata answered. FAILED on r80f: the label was read, and the answer was
 * "ambiguous".
 */
import { describe, it, expect } from 'vitest';
import { crossIds, NO_ITEM_BY_IDS } from '../../src/lib/dossier/sources/wikimedia';
import { KewRows, kewRowsFetcher } from '../../src/lib/dossier/kew-rows';
import type { JsonFetcher } from '../../src/lib/dossier/fetch';

const kew = new KewRows(['Datura']);
kew.add({ id: '2757799', name: 'Datura innoxia', authors: 'Mill.', status: 'Accepted', rank: 'Species', family: 'Solanaceae', acceptedId: '2757799', parentId: '', powoId: '815726-1' });
const item = (ipni?: string, wfo = 'wfo-1') => ({ claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }], P225: [{ mainsnak: { datavalue: { value: 'Datura innoxia' } } }], ...(ipni ? { P961: [{ mainsnak: { datavalue: { value: ipni } } }] } : {}), P7715: [{ mainsnak: { datavalue: { value: wfo } } }] } });
function wikidata(p846: string[], byKew: string[], asked: string[]): JsonFetcher {
  const base = (async (url: string) => {
    asked.push(url);
    const u = decodeURIComponent(url);
    if (u.includes('wbsearchentities')) throw new Error('the label was read');
    if (u.includes('haswbstatement:P846=2928755')) return { status: 'ok', data: { query: { search: p846.map((title) => ({ title })) } } };
    if (u.includes('haswbstatement:P961=815726-1|P5037=urn:lsid:ipni.org:names:815726-1')) return { status: 'ok', data: { query: { search: byKew.map((title) => ({ title })) } } };
    const m = /ids=(Q\d+)/.exec(u);
    if (m) return { status: 'ok', data: { entities: { [m[1]]: m[1] === 'Q1519478' ? item('815726-1', 'wfo-0000000') : item() } } };
    return { status: 'none' };
  }) as unknown as JsonFetcher;
  return kewRowsFetcher(base, kew);
}

describe('a page with a GBIF key and a Kew id is matched by its identifiers, never by its label', () => {
  it('of two items carrying the GBIF key, the one carrying Kew\'s identifier', async () => {
    const asked: string[] = [];
    const r = await crossIds(wikidata(['Q17464343', 'Q1519478'], [], asked), 'Datura innoxia', 2928755, [], { authorship: 'Mill.', family: 'Solanaceae', kewPage: true });
    expect(r.status).toBe('ok');
    expect(r.status === 'ok' && r.data.wikidata).toBe('Q1519478');
  });
  it('with no item carrying the key, the one item carrying Kew\'s IPNI or POWO identifier; the label is never read', async () => {
    const asked: string[] = [];
    const r = await crossIds(wikidata([], ['Q1519478'], asked), 'Datura innoxia', 2928755, [], { authorship: 'Mill.', family: 'Solanaceae', kewPage: true });
    expect(r.status === 'ok' && r.data).toMatchObject({ wikidata: 'Q1519478', ipni: '815726-1', wfo: 'wfo-0000000' });
    expect(asked.some((u) => u.includes('wbsearchentities'))).toBe(false);
  });
  it('none found is said as what was looked for, not as an absence of items', async () => {
    const r = await crossIds(wikidata([], [], []), 'Datura innoxia', 2928755, [], { authorship: 'Mill.', family: 'Solanaceae', kewPage: true });
    expect(r).toMatchObject({ status: 'none', detail: NO_ITEM_BY_IDS });
  });
});

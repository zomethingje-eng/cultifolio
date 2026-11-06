/**
 * Round eighty-six, names (review-d D11): a page Kew's name heads links Kew's name's own Wikidata item where one taxon
 * item carries Kew's IPNI or POWO identifier for it, not the item of GBIF's name that carries the page's GBIF key. 86 of
 * 87 renamed pages review D sampled linked GBIF's name's item: Huernia hallii linked Q42559868 (Ceropegia hallii, IPNI
 * 77166429-1, GBIF 9382949) while quoting the article of Q5397594 (Huernia hallii). Kew's number for Huernia hallii
 * E.Lamb & B.M.Lamb is 98770-1 (the live dossier k507336, 2026-11-02). The items here are cut to the claims the rule reads.
 *
 * Takes effect when the renamed pages are built again (`--keys` over them, on the PC): the item also gives the page its
 * iNaturalist id, Commons category and Wikipedia title.
 *
 * On r86base: FAILED (Q42559868, the GBIF key's item, was taken).
 */
import { describe, it, expect } from 'vitest';
import { crossIds } from '$dossier/sources/wikimedia';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';

const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
type Item = { P225: string[]; gbif: string[]; ipni: string[] };
const ITEMS: Record<string, Item> = {
  Q42559868: { P225: ['Ceropegia hallii'], gbif: ['9382949'], ipni: ['77166429-1'] },
  Q5397594: { P225: ['Huernia hallii'], gbif: [], ipni: ['98770-1'] }
};
function world(items: Record<string, Item>, asked: string[]): JsonFetcher {
  const ok = <T,>(data: unknown): FetchResult<T> => ({ status: 'ok', data: data as T });
  return (async (url: string) => {
    asked.push(url);
    const u = decodeURIComponent(url);
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

describe("a renamed page's Wikidata item (D11)", () => {
  it("Huernia hallii takes Q5397594, Kew's name's item, not Q42559868, which carries its GBIF key under Ceropegia hallii", async () => {
    const r = await crossIds(world(ITEMS, []), 'Huernia hallii', 9382949, [], { authorship: 'E.Lamb & B.M.Lamb', family: 'Apocynaceae', kew: structuredClone(KEW), kewPage: true });
    expect(r.status).toBe('ok');
    expect((r as { data: { wikidata?: string } }).data.wikidata).toBe('Q5397594');
    expect(r.detail).toContain('not Q42559868');
  });
  it('guard: with no item of Kew\'s name, or on a page not Kew\'s, the GBIF key\'s item stands', async () => {
    const one = { Q42559868: ITEMS.Q42559868 };
    const a = await crossIds(world(one, []), 'Huernia hallii', 9382949, [], { kew: structuredClone(KEW), kewPage: true });
    expect((a as { data: { wikidata?: string } }).data.wikidata).toBe('Q42559868');
    const b = await crossIds(world(ITEMS, []), 'Huernia hallii', 9382949, [], { kew: structuredClone(KEW) });
    expect((b as { data: { wikidata?: string } }).data.wikidata).toBe('Q42559868');
    // The key's item is the heading's own (its taxon name is Kew's): taken at once, nothing more asked.
    const asked: string[] = [];
    const own = { Q1: { P225: ['Huernia hallii'], gbif: ['9382949'], ipni: [] }, Q5397594: ITEMS.Q5397594 };
    const c = await crossIds(world(own, asked), 'Huernia hallii', 9382949, [], { kew: structuredClone(KEW), kewPage: true });
    expect((c as { data: { wikidata?: string } }).data.wikidata).toBe('Q1');
    expect(asked.filter((u) => u.includes('P961'))).toEqual([]);
  });
});

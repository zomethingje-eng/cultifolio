/**
 * Round eighty-six, the final review's U2: an address under a name Kew's older names hold leads to that page only when its
 * rank word is the one Kew writes (rule 3).
 *
 * 1. Kew's holders compare the rank word, normalised (ssp. and subspecies as subsp., v. and variety as var., fo. and forma
 *    as f.), and only the hybrid sign is left out: a variety, a form and a name with no rank word are not Kew's subspecies.
 * 2. The page's load: /species/anacampseros-quinaria-subsp-alstonii is Anacampseros dinteri's, where Kew's names for it
 *    hold Anacampseros quinaria subsp. alstonii; -var-alstonii, -f-alstonii and -alstonii are not, and GBIF is asked.
 * 3. The landing line keeps the rank word: `?was=` of the subspecies is Kew's name; of the variety, nothing is said.
 *
 * On the round's code before (bac6183): 1 FAILED (the variety, the form and the bare name each answered the holder);
 * 2 FAILED (each 302 to anacampseros-dinteri, cached a day); 3 FAILED (`?was=` of the variety and of the form shown on
 * the page, as an older name of it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { load } from '../../src/routes/species/[slug]/+page.server';
import { wasLine, type Part } from '$lib/ui/ref/was-words';
import { buildSearchFiles, kewHoldersFromFiles, kewHoldersOfIndex, type SearchReader } from '$core/search-files';
import { prepare } from '$core/search';
import { rankOfWord, ranksClash } from '$core/names';
import type { IndexEntry, Loaded } from '$lib/server/dossiers';
import type { PageId } from '$core/page-id';

const SUB = 'Anacampseros quinaria subsp. alstonii';

describe("1. Kew's holders compare the rank word", () => {
  const idx: IndexEntry[] = [
    { key: 'k1' as PageId, slug: 'aloe-p', name: 'Aloe p', photos: 0, open: 0, climate: 'ok', kew: ['Aloe bus subsp. cus'] },
    { key: 'k2' as PageId, slug: 'aloe-q', name: 'Aloe q', photos: 0, open: 0, climate: 'ok', kew: ['Aloe dus var. eus', 'Aloe × gus'] },
    { key: 'k3' as PageId, slug: 'aloe-r', name: 'Aloe r', photos: 0, open: 0, climate: 'ok', kew: ['Aloe hus'] }
  ];
  const stored = new Map<string, string>();
  let n = 0;
  const b = buildSearchFiles(idx, prepare(idx), () => `h${n++}`, (h, body) => stored.set(h, body));
  const named = (x: string) => JSON.parse(b.named.get(x)!);
  const blocks = named('search/blocks.json');
  const r: SearchReader<IndexEntry> = {
    dirs: [...b.named.keys()].filter((k) => /^search\/\d+\.json$/.test(k)).length,
    dir: async (x) => named(`search/${x}.json`), node: async (h) => stored.get(h)!, answers: async (h) => JSON.parse(stored.get(h)!),
    genera: async () => new Set(named('search/genera.json')), tables: async () => named('search/tables.json'),
    photos: async (k) => JSON.parse(stored.get(blocks.photos[k])!), show: async (k) => JSON.parse(stored.get(blocks.show[k])!)
  };
  const cases: Array<[string, string[]]> = [
    ['Aloe bus subsp. cus', ['k1']], ['Aloe bus ssp. cus', ['k1']], ['Aloe bus subspecies cus', ['k1']], ['aloe bus subsp cus', ['k1']],
    ['Aloe bus var. cus', []], ['Aloe bus f. cus', []], ['Aloe bus cus', []], ['Aloe bus', []],
    ['Aloe dus var. eus', ['k2']], ['Aloe dus v. eus', ['k2']], ['Aloe dus variety eus', ['k2']], ['Aloe dus subsp. eus', []], ['Aloe dus eus', []],
    ['Aloe x gus', ['k2']], ['Aloe gus', ['k2']], ['Aloe × gus', ['k2']],
    ['Aloe hus', ['k3']], ['Aloe hus var.', []], ['Aloe var. hus', []]
  ];
  it('the index held whole and the key files answer alike', async () => {
    for (const [q, want] of cases) {
      expect(kewHoldersOfIndex(idx, q).map((e) => e.key), q).toEqual(want);
      expect((await kewHoldersFromFiles(r, q)).map((e) => e.key), q).toEqual(want);
    }
  });
  it("the rank words are canonicalSynonym's, with the growers' spellings", () => {
    expect(['ssp', 'subspecies', 'v', 'variety', 'fo', 'forma', 'f', 'nothosubsp', 'prol', 'subvar'].map(rankOfWord)).toEqual(['subsp.', 'subsp.', 'var.', 'var.', 'f.', 'f.', 'f.', 'nothosubsp.', 'proles', 'subvar.']);
    expect(rankOfWord('cus')).toBeUndefined();
    expect(ranksClash('Aloe bus var. cus', 'Aloe bus subsp. cus')).toBe(true);
    expect(ranksClash('Aloe bus ssp. cus', 'Aloe bus subsp. cus')).toBe(false);
    expect(ranksClash('Aloe bus cus', 'Aloe bus subsp. cus')).toBe(false); // GBIF's canonical form writes no rank (round thirty-four)
  });
});

// The page's load, over the r86n fixtures (Anacampseros dinteri's index entry and record, review D's live dossiers).
const F = 'tests/unit/fixtures/r86n';
const json = (f: string) => JSON.parse(readFileSync(`${F}/${f}`, 'utf8'));
type Dos = { key: string; slug: string; ids: Record<string, unknown>; name: Record<string, unknown> & { scientific: string; kew?: Record<string, unknown> } };
const ALBISSIMA = json('k500252.json') as Dos;
const DINTERI: Dos = { ...ALBISSIMA, key: 'k500298', slug: 'anacampseros-dinteri', ids: { ...ALBISSIMA.ids, gbif: 5646651 }, name: { ...ALBISSIMA.name, scientific: 'Anacampseros dinteri', authorship: 'Schönland', synonyms: ['Anacampseros dinteri Schönland', 'Avonia dinteri (Schönland) G.D.Rowley'], kew: { entry: '500298', synonyms: ['Anacampseros schmidtii', 'Avonia dinteri', SUB], acceptedElsewhere: [], file: '2026-06-04' }, gbif: undefined } };
const entry = (d: Dos, extra: Partial<IndexEntry> = {}): IndexEntry => ({ key: d.key as PageId, gbif: d.ids.gbif as number, slug: d.slug, name: d.name.scientific, photos: 0, open: 0, climate: 'ok', ...extra });
const corpus = () => {
  const idx: IndexEntry[] = [entry(ALBISSIMA, { syn: ['Avonia albissima'] }), entry(DINTERI, { syn: ['Avonia dinteri'], kew: ['Anacampseros schmidtii', SUB] })];
  return { at: Date.now(), idx, bySlug: new Map(idx.map((e) => [e.slug, e.key])), corpus: 'r86f', etag: null, fromStore: true, manifest: null, buckets: 32 } as unknown as Loaded;
};
const STORE = { get: async (path: string) => { const d = [ALBISSIMA, DINTERI].find((x) => path.endsWith(`/${x.key}.json`)); return d ? { json: async () => structuredClone(d) } : null; } };
let asked: string[] = [];
const gbif = (async (u: string | URL) => { asked.push(new URL(String(u)).searchParams.get('name') ?? ''); return new Response('{"matchType":"NONE"}', { headers: { 'content-type': 'application/json' } }); }) as typeof fetch;
let ip = 10;
function event(slug: string, search = '') {
  const url = new URL(`http://x/species/${slug}${search}`);
  const headers: Record<string, string> = {};
  const addr = `198.51.100.${ip++}`;
  const ev = { params: { slug }, platform: { env: { STORE } }, fetch: gbif, setHeaders: (h: Record<string, string>) => Object.assign(headers, h), cookies: { get: () => undefined }, request: new Request(url), url, getClientAddress: () => addr, locals: { corpus: corpus() }, isDataRequest: true } as never;
  return { ev, headers };
}
const outcome = async (p: unknown) => { try { return { data: await p }; } catch (e) { return e as { status: number; location?: string }; } };
const text = (ps: Part[]) => ps.map((p) => p.t).join('');

describe('2. the address', () => {
  it('the subspecies, in either spelling, is the page whose Kew names hold it, and GBIF is not asked', async () => {
    for (const slug of ['anacampseros-quinaria-subsp-alstonii', 'anacampseros-quinaria-ssp-alstonii']) {
      asked = [];
      const { ev, headers } = event(slug);
      const r = (await outcome(load(ev))) as { status: number; location: string };
      expect(r.status, slug).toBe(302);
      expect(r.location, slug).toMatch(/^\/species\/anacampseros-dinteri\?was=Anacampseros%20quinaria%20(subsp|ssp)\.%20alstonii$/);
      expect(headers['cache-control']).toBe('public, max-age=86400');
      expect(asked).toEqual([]);
    }
  });
  it('a variety, a form and the name with no rank word are not, and GBIF is asked', async () => {
    for (const slug of ['anacampseros-quinaria-var-alstonii', 'anacampseros-quinaria-f-alstonii', 'anacampseros-quinaria-alstonii']) {
      asked = [];
      const r = (await outcome(load(event(slug).ev))) as { status: number; location?: string };
      expect(r.location ?? '', slug).not.toContain('anacampseros-dinteri');
      expect(r.status, slug).toBe(404);
      expect(asked.length, slug).toBe(1);
    }
  });
});

describe('3. the landing line keeps the rank word', () => {
  const lineOf = async (was: string) => {
    const data = (await load(event('anacampseros-dinteri', `?was=${encodeURIComponent(was)}`).ev)) as { was: string | null; wasBelow: boolean; d: Dos & { name: Dos['name'] & { synonyms: string[] } } };
    const kew = data.d.name.kew as { synonyms?: string[] };
    return { was: data.was, line: data.was ? text(wasLine({ was: data.was, heading: data.d.name.scientific, gbifName: null, gbifSynonyms: data.d.name.synonyms, kewSynonyms: kew.synonyms ?? null, below: data.wasBelow })) : '' };
  };
  it("the subspecies: Kew's name for this plant", async () => {
    const { was, line } = await lineOf(SUB);
    expect(was).toBe(SUB);
    expect(line).toContain("Kew's World Checklist holds it as a synonym of Anacampseros dinteri");
  });
  it('the variety: nothing is said', async () => {
    expect((await lineOf('Anacampseros quinaria var. alstonii')).was).toBeNull();
    expect((await lineOf('Anacampseros quinaria f. alstonii')).was).toBeNull();
  });
});

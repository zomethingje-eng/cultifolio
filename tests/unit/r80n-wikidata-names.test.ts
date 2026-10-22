/**
 * Round eighty (N): English common names from Wikidata for the pages without a GBIF key (the owner's decision). The
 * rule over an item's P1843 statements (`wikidata-names.ts`), the same whether read from the item's entity (the build)
 * or from a query (the fill); the builder's record of them; `--fill wikidata-names`, batched, with `--keyed` off by
 * default; the index, cards and the search carrying them as they carry GBIF's; the page's line saying whose they are;
 * and the query service paced as one with Wikimedia's other sites. FAILED on r80base: `wikidata-names.ts` did not
 * exist, a page without a GBIF key had no names, `namesSource` and `alsoPacedAs` did not exist.
 */
import { describe, it, expect } from 'vitest';
import type { FetchResult, JsonFetcher } from '../../src/lib/dossier/fetch';
import { makeFetcher, alsoPacedAs, paceKey, resetPacing } from '../../src/lib/dossier/fetch';
import {
  statementsOfEntity, statementsOfAnswer, wikidataNames, wdNamesRecord, wdNamesNoItem, fillWikidataNames, wdNamesUrl, wdNamesQuery,
  WD_NAMES, WD_NAMES_ITEMS, refKey, type WdNameStatement
} from '../../src/lib/dossier/wikidata-names';
import { buildKewDossier, type KewSpecies } from '../../src/lib/dossier/build-kew';
import { kewItemUrl, entityUrl } from '../../src/lib/dossier/batch';
import { englishNames, indexNames, type IndexEntry } from '../../src/lib/dossier/index-entry';
import { buildCardFiles } from '../../src/lib/dossier/lookups';
import { prepare, search } from '../../src/lib/core/search';
import { namesSource, UPSTREAM_NAME } from '../../src/lib/ui/ref/upstream';
import type { Dossier } from '../../src/lib/dossier/schema';

/** One P1843 claim as Wikidata's entity JSON gives it. */
const claim = (text: string, language: string, o: { rank?: string; refs?: Array<Record<string, unknown[]>> } = {}) => ({
  mainsnak: { snaktype: 'value', property: 'P1843', datavalue: { value: { text, language }, type: 'monolingualtext' } },
  type: 'statement',
  rank: o.rank ?? 'normal',
  ...(o.refs ? { references: o.refs.map((snaks) => ({ hash: 'x', snaks: Object.fromEntries(Object.entries(snaks).map(([p, vs]) => [p, vs.map((value) => ({ snaktype: 'value', property: p, datavalue: { value } }))])) })) } : {})
});
const USDA = { P248: [{ id: 'Q19636200' }] };
const IUCN = { P248: [{ id: 'Q32059' }] };
const ENWIKI = { P143: [{ id: 'Q328' }] };

describe("the rule over an item's English names", () => {
  it('reads en and every regional English, with rank and the references that name a source', () => {
    const s = statementsOfEntity({ claims: { P1843: [
      claim('pinesap', 'en-us', { refs: [USDA] }),
      claim("Yellow Bird's-nest", 'en', { rank: 'preferred', refs: [{ P248: [{ id: 'Q894631' }] }] }),
      claim('Monotrope sucepin', 'fr'),
      claim('Scots name', 'sco'),
      claim('from Wikipedia', 'en', { refs: [ENWIKI] }),
      claim('at a site', 'en', { refs: [{ P854: ['https://www.rhs.org.uk/plants/123'] }, { P854: ['https://en.wikipedia.org/wiki/X'] }] })
    ] } });
    expect(s).toEqual([
      { name: 'pinesap', lang: 'en-us', rank: 'normal', refs: ['stated in Q19636200'] },
      { name: "Yellow Bird's-nest", lang: 'en', rank: 'preferred', refs: ['stated in Q894631'] },
      // Imported from English Wikipedia names no source; a URL on Wikipedia neither.
      { name: 'from Wikipedia', lang: 'en', rank: 'normal', refs: [] },
      { name: 'at a site', lang: 'en', rank: 'normal', refs: ['at rhs.org.uk'] }
    ]);
    expect(refKey({ url: 'https://species.wikimedia.org/wiki/X' })).toBeUndefined();
  });

  it('refuses a deprecated statement, another script, the scientific name, a genus alone and another species\' name, and says why', () => {
    const st = (name: string, rank: WdNameStatement['rank'] = 'normal'): WdNameStatement => ({ name, lang: 'en', rank, refs: [] });
    const r = wikidataNames([st('Old name', 'deprecated'), st('Мексиканский кипарис'), st('Hesperocyparis lusitanica'), st('cupressus lusitanica'), st('Hesperocyparis'), st('cupressus'), st('Aloe'), st('Babiana odorata'), st('Mexican cypress')], {
      scientific: 'Hesperocyparis lusitanica',
      synonyms: ['Cupressus lusitanica Mill.'],
      genera: new Set(['cupressus']),
      heldElsewhere: (n) => n.toLowerCase() === 'babiana odorata'
    });
    expect(r.rows).toEqual([{ name: 'Mexican cypress', lang: 'eng', source: 'Wikidata' }]);
    expect(r.refused).toEqual([
      { name: 'Old name', why: 'ranked deprecated in Wikidata' },
      { name: 'Мексиканский кипарис', why: 'not in the Latin script' },
      { name: 'Hesperocyparis lusitanica', why: 'the scientific name' },
      { name: 'cupressus lusitanica', why: 'the scientific name' },
      { name: 'Hesperocyparis', why: 'a genus named alone' },
      { name: 'cupressus', why: 'a genus named alone' },
      { name: 'Aloe', why: 'a genus named alone' },
      { name: 'Babiana odorata', why: 'a scientific name this reference holds as another species' }
    ]);
    const rec = wdNamesRecord('Q50843040', r, '2026-10-21T00:00:00.000Z');
    expect(rec).toEqual({ status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: expect.stringContaining("Wikidata's item Q50843040; 1 English name taken: \"Mexican cypress\"; refused: \"Old name\" (ranked deprecated in Wikidata)") });
    expect(wdNamesRecord('Q1', wikidataNames([st('Aloe')], { scientific: 'Aloe vera' }), 'x').status).toBe('none');
  });

  it('heads with the name more references give, then the preferred rank, then the alphabet; en and en-gb are one name', () => {
    const scope = { scientific: 'Monotropa hypopitys' };
    const names = (s: WdNameStatement[]) => englishNames(wikidataNames(s, scope).rows, { genus: scope.scientific });
    // Two references beat one, whatever the rank or the alphabet.
    expect(names([
      { name: 'Alpha name', lang: 'en', rank: 'preferred', refs: ['stated in Q1'] },
      { name: 'Zulu name', lang: 'en', rank: 'normal', refs: ['stated in Q1', 'stated in Q2'] }
    ]).common).toBe('Zulu name');
    // A tie: the preferred rank.
    expect(names([
      { name: 'pinesap', lang: 'en-us', rank: 'normal', refs: ['stated in Q19636200'] },
      { name: "Yellow Bird's-nest", lang: 'en', rank: 'preferred', refs: ['stated in Q894631'] }
    ])).toEqual({ common: "Yellow Bird's-nest", commons: ['Pinesap'] });
    // A tie again: the alphabet; a name stated in en and in en-gb is one name with both references.
    const r = wikidataNames([
      { name: 'Hard fern', lang: 'en-gb', rank: 'normal', refs: ['stated in Q64007131'] },
      { name: 'Deer fern', lang: 'en', rank: 'normal', refs: ['stated in Q19636200'] },
      { name: 'Hard fern', lang: 'en', rank: 'normal', refs: [] }
    ], { scientific: 'Blechnum spicant' });
    expect(r.rows).toEqual([
      { name: 'Deer fern', lang: 'eng', source: 'Wikidata', alsoFrom: ['stated in Q19636200'] },
      { name: 'Hard fern', lang: 'eng', source: 'Wikidata', alsoFrom: ['stated in Q64007131'] }
    ]);
    expect(englishNames(r.rows, { genus: 'Blechnum spicant' })).toEqual({ common: 'Deer fern', commons: ['Hard fern'] });
    // A generic noun is never the headline, as for GBIF's (ARKive's "Cactus" for twenty cacti).
    expect(names([{ name: 'Cactus', lang: 'en', rank: 'normal', refs: ['stated in Q433276'] }])).toEqual({});
  });

  it('reads a query\'s answer as the build reads the entity: the same statements, so the build and the fill agree', () => {
    const ent = { claims: { P1843: [claim('Deer fern', 'en', { refs: [USDA, ENWIKI] }), claim('hard fern', 'en', { refs: [{ P248: [{ id: 'Q64007131' }] }] }), claim('Old', 'en', { rank: 'deprecated' })] } };
    const b = (st: string, name: string, rank: string, ref?: { in?: string; url?: string }) => ({
      item: { value: 'http://www.wikidata.org/entity/Q925696' }, st: { value: `http://www.wikidata.org/entity/statement/${st}` }, name: { value: name, 'xml:lang': 'en' }, rank: { value: `http://wikiba.se/ontology#${rank}` },
      ...(ref ? { ref: { value: 'http://www.wikidata.org/reference/x' } } : {}), ...(ref?.in ? { in: { value: `http://www.wikidata.org/entity/${ref.in}` } } : {}), ...(ref?.url ? { url: { value: ref.url } } : {})
    });
    const fromQuery = statementsOfAnswer(['Q925696', 'Q1'], [b('s1', 'Deer fern', 'NormalRank', { in: 'Q19636200' }), b('s1', 'Deer fern', 'NormalRank', {}), b('s2', 'hard fern', 'NormalRank', { in: 'Q64007131' }), b('s3', 'Old', 'DeprecatedRank')]);
    expect(fromQuery.get('Q1')).toEqual([]);
    const scope = { scientific: 'Blechnum spicant' };
    expect(wikidataNames(fromQuery.get('Q925696')!, scope)).toEqual(wikidataNames(statementsOfEntity(ent), scope));
    // The query asks English only, any rank, with each reference's "stated in" and URL.
    expect(wdNamesQuery(['Q1', 'Q2'])).toContain('VALUES ?item { wd:Q1 wd:Q2 }');
    expect(wdNamesQuery(['Q1'])).toContain('FILTER(LANG(?name) = "en" || STRSTARTS(LANG(?name), "en-"))');
    expect(wdNamesQuery(['Q1'])).toContain('wikibase:rank ?rank');
    expect(wdNamesQuery(['Q1'])).toContain('pr:P248 ?in');
  });
});

/** Two species of Kew's file, as the builder is given them; their items as recorded. */
const kew = (id: string, name: string, ipni: string): KewSpecies => ({ id, name, authors: 'L.', family: 'Plantaceae', genus: name.split(' ')[0], ipni, powo: ipni, synonyms: [], range: [], file: '2026-06-04' });
const sparql = (pairs: Array<[string, string]>) => ({ head: { vars: ['v', 'u', 'item'] }, results: { bindings: pairs.map(([v, q]) => ({ v: { value: v }, u: { value: `urn:lsid:ipni.org:names:${v}` }, item: { value: `http://www.wikidata.org/entity/${q}` } })) } });
function recorded(table: Record<string, unknown>): JsonFetcher & { asked: string[] } {
  const asked: string[] = [];
  const f = (async <T,>(url: string): Promise<FetchResult<T>> => {
    asked.push(url);
    if (url in table) return table[url] === null ? { status: 'none' } : { status: 'ok', data: table[url] as T };
    if (url.startsWith('https://query.wikidata.org/') && 'SPARQL-FAIL' in table) return { status: 'error', detail: 'HTTP 503' };
    return { status: 'refused', detail: `not recorded: ${url}` };
  }) as JsonFetcher & { asked: string[] };
  f.asked = asked;
  return f;
}
const SKIP = { skip: ['wikipedia', 'inat', 'commons'] as Array<'wikipedia' | 'inat' | 'commons'> };

describe('the builder of a page without a GBIF key', () => {
  const leek = kew('536786', 'Allium porrum', '87195-1');
  it('takes its names from the item it reads, says them as Wikidata\'s, and asks nothing more for them', async () => {
    const f = recorded({
      [kewItemUrl({ ipni: '87195-1', powo: '87195-1' })]: sparql([['87195-1', 'Q21870138']]),
      [entityUrl('Q21870138')]: { entities: { Q21870138: { id: 'Q21870138', claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }], P1843: [claim('garden leek', 'en', { refs: [USDA] }), claim('Allium porrum', 'en'), claim('Lauch', 'de')] } } } }
    });
    const r = await buildKewDossier(leek, { fetcher: f, builtBy: 'node', now: () => new Date('2026-10-21T00:00:00Z'), ...SKIP });
    const d = (r as { ok: true; dossier: Dossier }).dossier;
    expect(d.name.vernacular).toEqual([{ name: 'garden leek', lang: 'eng', source: 'Wikidata', alsoFrom: ['stated in Q19636200'] }]);
    expect(d.upstream[WD_NAMES]).toEqual({ status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: 'Wikidata\'s item Q21870138; 1 English name taken: "garden leek"; refused: "Allium porrum" (the scientific name)' });
    // GBIF's names are still not asked.
    expect(d.upstream['gbif.vernacular'].status).toBe('skipped');
    expect(f.asked.filter((u) => /gbif\.org|P1843/.test(u))).toEqual([]);
    expect(englishNames(d.name.vernacular, { genus: d.name.scientific }).common).toBe('Garden leek');
    expect(indexNames(d.name.vernacular, { genus: 'Allium' })).toEqual({ common: 'Garden leek' });
  });
  it('says none where no item carries Kew\'s identifiers, and not checked where Wikidata did not answer or two items did', async () => {
    const build = async (table: Record<string, unknown>) => ((await buildKewDossier(leek, { fetcher: recorded(table), builtBy: 'node', ...SKIP })) as { ok: true; dossier: Dossier }).dossier;
    const url = kewItemUrl({ ipni: '87195-1', powo: '87195-1' });
    const none = await build({ [url]: sparql([]) });
    expect(none.upstream[WD_NAMES]).toMatchObject({ status: 'none', detail: expect.stringContaining('no Wikidata item taken for this species') });
    const two = await build({ [url]: sparql([['87195-1', 'Q1'], ['87195-1', 'Q2']]) });
    expect(two.upstream[WD_NAMES]).toMatchObject({ status: 'skipped', detail: expect.stringMatching(/^not asked: two items carry .*, so no item was taken$/) });
    const silent = await build({});
    expect(silent.upstream[WD_NAMES].status).toBe('refused');
    expect(silent.upstream[WD_NAMES].detail).toMatch(/^not checked: Wikidata refused the request for the item/);
    const notAsked = ((await buildKewDossier(leek, { fetcher: recorded({}), builtBy: 'node', skip: ['wikidata', 'wikipedia', 'inat', 'commons'] })) as { ok: true; dossier: Dossier }).dossier;
    expect(notAsked.upstream[WD_NAMES]).toMatchObject({ status: 'skipped', detail: "not asked: Wikidata was not asked for this species' item" });
    for (const d of [none, two, silent, notAsked]) expect(d.name.vernacular).toEqual([]);
  });
});

/** A store of pages in memory, as `DossierStore` reads and writes the files. */
function memStore(pages: Array<Record<string, unknown>>) {
  const m = new Map(pages.map((p) => [`${p.key}.json`, JSON.stringify(p)]));
  const writes: string[] = [];
  return { m, writes, files: () => [...m.keys()], read: <T,>(f: string) => JSON.parse(m.get(f)!) as T, write: (f: string, d: unknown) => { writes.push(f); m.set(f, JSON.stringify(d)); } };
}
const page = (key: string, scientific: string, o: { gbif?: number; wikidata?: string; vernacular?: unknown[]; wd?: { status: string; detail?: string } } = {}) => ({
  key, ids: { ...(o.gbif != null ? { gbif: o.gbif } : {}), ...(o.wikidata ? { wikidata: o.wikidata } : {}) },
  name: { scientific, synonyms: [], vernacular: o.vernacular ?? [] },
  upstream: { wikidata: { status: o.wd?.status ?? (o.wikidata ? 'ok' : 'none'), at: 'x', ...(o.wd?.detail ? { detail: o.wd.detail } : {}) } }
});
const binding = (q: string, st: string, name: string, inQ?: string) => ({ item: { value: `http://www.wikidata.org/entity/${q}` }, st: { value: st }, name: { value: name, 'xml:lang': 'en' }, rank: { value: 'http://wikiba.se/ontology#NormalRank' }, ...(inQ ? { ref: { value: 'r' }, in: { value: `http://www.wikidata.org/entity/${inQ}` } } : {}) });

describe('--fill wikidata-names', () => {
  const pages = () => [
    page('k536786', 'Allium porrum', { wikidata: 'Q21870138' }),
    page('k1', 'Boswellia oropedionis'),
    page('k2', 'Duo ambigua', { wd: { status: 'ambiguous', detail: "not taken: two items carry Kew's IPNI identifier 1-1, POWO 1-1 (Q1, Q2)" } }),
    page('k3', 'Copiapoa esmeraldana', { wikidata: 'Q1131170' }),
    // Keyed: one with no English name from GBIF, one with one.
    page('g10', 'Nepenthes rajah', { gbif: 10, wikidata: 'Q132973', vernacular: [{ name: 'Rajah-Kannenpflanze', lang: 'deu' }] }),
    page('g11', 'Aloe vera', { gbif: 11, wikidata: 'Q80079', vernacular: [{ name: 'Barbados aloe', lang: 'eng' }] })
  ];
  const answer = (items: string[]) => ({ head: {}, results: { bindings: [binding('Q21870138', 's1', 'garden leek', 'Q19636200'), binding('Q1131170', 's2', 'Cactus', 'Q433276'), binding('Q132973', 's3', 'Giant Pitcher Plant', 'Q433276'), binding('Q80079', 's4', 'Medicinal aloe')].filter((b) => items.some((q) => b.item.value.endsWith(`/${q}`))) } });
  const fetcherFor = (keyed: boolean) => {
    const items = keyed ? ['Q21870138', 'Q1131170', 'Q132973'] : ['Q21870138', 'Q1131170'];
    return recorded({ [wdNamesUrl(items)]: answer(items) });
  };

  it('gives the pages without a GBIF key their item\'s names in one query, says why where no item was taken, and leaves keyed pages alone', async () => {
    const s = memStore(pages());
    const f = fetcherFor(false);
    const c = await fillWikidataNames(s, f, { now: () => '2026-10-21T00:00:00.000Z' });
    expect(f.asked).toHaveLength(1);
    expect(c).toMatchObject({ read: 6, keyless: 4, keyed: 0, items: 2, queries: 1, taken: 2, shown: 1, none: 0, noItem: 2, unchecked: 0, written: 4 });
    const leek = s.read<Dossier>('k536786.json');
    expect(leek.name.vernacular).toEqual([{ name: 'garden leek', lang: 'eng', source: 'Wikidata', alsoFrom: ['stated in Q19636200'] }]);
    expect(leek.upstream[WD_NAMES].status).toBe('ok');
    expect(s.read<Dossier>('k1.json').upstream[WD_NAMES]).toMatchObject({ status: 'none' });
    expect(s.read<Dossier>('k2.json').upstream[WD_NAMES]).toMatchObject({ status: 'skipped', detail: expect.stringContaining('two items carry') });
    // Taken, but a generic noun: searched, never shown.
    expect(englishNames(s.read<Dossier>('k3.json').name.vernacular, { genus: 'Copiapoa esmeraldana' })).toEqual({});
    expect(s.writes.some((w) => w.startsWith('g'))).toBe(false);
    // A second run writes nothing.
    const again = await fillWikidataNames(s, fetcherFor(false), { now: () => '2026-10-22T00:00:00.000Z' });
    expect(again.written).toBe(0);
  });

  it('with --keyed, also asks for the keyed pages GBIF gives no English name, and keeps their GBIF rows', async () => {
    const s = memStore(pages());
    const c = await fillWikidataNames(s, fetcherFor(true), { keyed: true, now: () => 'x' });
    expect(c).toMatchObject({ keyless: 4, keyed: 1, items: 3, queries: 1 });
    const rajah = s.read<Dossier>('g10.json');
    expect(rajah.name.vernacular).toEqual([{ name: 'Rajah-Kannenpflanze', lang: 'deu' }, { name: 'Giant Pitcher Plant', lang: 'eng', source: 'Wikidata', alsoFrom: ['stated in Q433276'] }]);
    expect(s.read<Dossier>('g11.json').upstream[WD_NAMES]).toBeUndefined();
    // Once GBIF gives it an English name, a later --keyed run takes Wikidata's away.
    rajah.name.vernacular.push({ name: 'Rajah pitcher plant', lang: 'eng' });
    s.write('g10.json', rajah);
    await fillWikidataNames(s, fetcherFor(true), { keyed: true, now: () => 'x' });
    const after = s.read<Dossier>('g10.json');
    expect(after.name.vernacular.map((v) => v.name)).toEqual(['Rajah-Kannenpflanze', 'Rajah pitcher plant']);
    expect(after.upstream[WD_NAMES]).toBeUndefined();
  });

  it('leaves a page as it was when its query did not answer, and counts it (rule 2)', async () => {
    const s = memStore(pages());
    const before = s.m.get('k536786.json');
    const c = await fillWikidataNames(s, recorded({ 'SPARQL-FAIL': true }), { now: () => 'x' });
    expect(c.unchecked).toBe(2);
    expect(c.failed).toMatch(/^error/);
    expect(s.m.get('k536786.json')).toBe(before);
  });

  it('asks two hundred items a query', async () => {
    const many = Array.from({ length: 450 }, (_, i) => page(`k${i + 100}`, `Genus sp${i}`, { wikidata: `Q${i + 1000}` }));
    const s = memStore(many);
    const asked: string[] = [];
    const f = (async (url: string) => { asked.push(url); return { status: 'ok', data: { results: { bindings: [] } } }; }) as unknown as JsonFetcher;
    const c = await fillWikidataNames(s, f, { now: () => 'x' });
    expect(WD_NAMES_ITEMS).toBe(200);
    expect(c.queries).toBe(3);
    expect(asked.map((u) => (decodeURIComponent(u).match(/wd:Q/g) ?? []).length)).toEqual([200, 200, 50]);
    expect(Math.max(...asked.map((u) => u.length))).toBeLessThan(5000);
    expect(c.none).toBe(450);
  });
});

describe('the index, the cards and the search carry the names as they carry GBIF\'s', () => {
  it('finds the page without a GBIF key by its name from Wikidata', () => {
    const vern = wikidataNames([{ name: 'Mexican cypress', lang: 'en', rank: 'normal', refs: ['stated in Q19636200'] }, { name: 'Cedar of Goa', lang: 'en', rank: 'normal', refs: [] }], { scientific: 'Hesperocyparis lusitanica' }).rows;
    const entry: IndexEntry = { key: 'k457911', slug: 'hesperocyparis-lusitanica', name: 'Hesperocyparis lusitanica', family: 'Cupressaceae', ...indexNames(vern, { genus: 'Hesperocyparis' }), photos: 3, open: 0, climate: 'pending' };
    expect(entry.common).toBe('Mexican cypress');
    expect(entry.commons).toEqual(['Cedar of Goa']);
    const other: IndexEntry = { key: 'k1', gbif: 1, slug: 'cupressus-sempervirens', name: 'Cupressus sempervirens', common: 'Italian cypress', photos: 1, open: 0, climate: 'ok' };
    const prepared = prepare([other, entry]);
    expect(search(prepared, 'mexican cypress')[0]?.key).toBe('k457911');
    expect(search(prepared, 'cedar of goa')[0]?.key).toBe('k457911');
    const cards = [...buildCardFiles([other, entry]).values()].flatMap((f) => Object.values(f as Record<string, { key: string; common?: string; gbif?: number }>));
    const card = cards.find((x) => x.key === 'k457911');
    expect(card?.common).toBe('Mexican cypress');
    expect(card?.gbif).toBeUndefined();
  });
});

describe("the page's line under the name", () => {
  const d = (o: { gbif?: number; rec?: { status: string; at?: string; detail?: string }; wd?: boolean }) => ({ ids: { ...(o.gbif ? { gbif: o.gbif } : {}), wikidata: 'Q50843040' }, name: { vernacular: o.wd ? [{ name: 'Mexican cypress', source: 'Wikidata' }] : [] }, upstream: o.rec ? { [WD_NAMES]: o.rec } : {} });
  it('names Wikidata\'s item and the day, or says why the names were not checked, never none', () => {
    expect(namesSource(d({ rec: { status: 'ok', at: '2026-10-21T00:00:00.000Z', detail: "Wikidata's item Q50843040; 1 English name taken" }, wd: true }))).toEqual({ item: 'Q50843040', day: '2026-10-21' });
    expect(namesSource(d({ rec: { status: 'none', at: 'x' } }))).toBeNull();
    expect(namesSource(d({}))).toEqual({ unchecked: "Wikidata's common names were not read for this page" });
    expect(namesSource(d({ rec: wdNamesNoItem({ status: 'error', detail: 'HTTP 503' }, 'x') }))).toEqual({ unchecked: 'Wikidata did not answer for the item (HTTP 503)' });
    expect(namesSource(d({ rec: wdNamesNoItem({ status: 'ambiguous', detail: "not taken: two items carry Kew's IPNI identifier 1-1, POWO 1-1 (Q1, Q2)" }, 'x') }))).toEqual({ unchecked: "two items carry Kew's IPNI identifier 1-1, POWO 1-1 (Q1, Q2), so no item was taken" });
    // A page with a GBIF key says nothing of Wikidata unless names were taken from it.
    expect(namesSource(d({ gbif: 5 }))).toBeNull();
    expect(UPSTREAM_NAME[WD_NAMES]).toBe('Wikidata common names');
  });
});

describe("Wikidata's query service, paced with Wikimedia's other sites", () => {
  it('counts a query in the shared allowance as well as its own', async () => {
    expect(paceKey('query.wikidata.org')).toBe('query.wikidata.org');
    expect(alsoPacedAs('query.wikidata.org')).toEqual(['wikimedia']);
    expect(alsoPacedAs('www.wikidata.org')).toEqual([]);
    resetPacing();
    const at: Array<[string, number]> = [];
    const impl = (async (url: string) => { at.push([new URL(url).host, Date.now()]); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); }) as unknown as typeof fetch;
    const f = makeFetcher(impl);
    await f('https://query.wikidata.org/sparql?query=x');
    await f('https://en.wikipedia.org/w/api.php?x');
    // The Wikipedia request waits its slot after the query: 350 ms, where before it went at once.
    expect(at[1][1] - at[0][1]).toBeGreaterThanOrEqual(330);
    resetPacing();
  });
});

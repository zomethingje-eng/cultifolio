/**
 * Round eighty-five, H: the renamed pages asked again by Kew's name (decision 6, D3) lost what they had held under
 * GBIF's name, on the owner's run of 2 November 2026 (drops.txt): about 508 pages headed by Kew's accepted name were
 * matched on Wikidata only by their GBIF key or Kew's IPNI or POWO identifier for that accepted name, so an item filed
 * under an older combination of the same plant was lost (Sabdariffa acetosella's Q5750828, Hibiscus acetosella; Ceropegia
 * dodomaensis's Q88970625, Brachystelma tanzaniensis), and the summary and the iNaturalist taxon such an item gave with it.
 *
 * The rule, "same type, by Kew's file": the names Kew's file holds with the same type as the page's entry (its basionym,
 * or the name a replacement name replaced; the names moved from that basionym or from the entry; the synonyms Kew marks
 * homotypic), each filed under the entry. With no item by the GBIF key or Kew's identifiers for the entry's own name, the
 * item that carries Kew's IPNI or POWO identifier for one of them (the basionym's of two); a Wikipedia article whose item
 * is the page's, or carries one of them; the iNaturalist taxon such an item gives. Never a name's words, never a synonym
 * on another type. And a page that is Kew's entry links Kew's IPNI record of its name or none: never another name's.
 *
 * Real data: Kew's rows (WCVP, RBG Kew, CC BY 4.0: wcvp_names.csv of 2026-06-04, trimmed to the columns read) for the
 * affected entries, every row filed under them and their basionyms, and Wikidata's items (CC0) and en.wikipedia's page
 * props read on 2 November 2026, in fixtures/r85h. The Wikipedia leads are
 * fixture text. FAILS on 91896bb (each test checked by running this file there): no item by a same-type name, no article
 * by a same-type item or by GBIF's name after Kew's, no iNaturalist taxon by a same-type item, and the item's IPNI kept
 * beside Kew's own POWO number.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildDossier } from '$dossier/build';
import { buildKewDossier } from '$dossier/build-kew';
import { crossIds } from '$dossier/sources/wikimedia';
import { kewRowsFetcher, KewRows, type SameTypeName } from '$dossier/kew-rows';
import { checkSummaries } from '$dossier/summary-fill';
import { fillWikidata } from '$dossier/corpus-fills';
import { dropsBetween, ipniPowoDisagree } from '$dossier/drops';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import { loadKewRows } from '../../scripts/kew-rows-load';

const DIR = 'tests/unit/fixtures/r85h';
type Item = { label: string; P31: string[]; P225: string[]; gbif: string[]; ipni: string[]; powo: string[]; inat: string[]; wfo: string[]; enwiki: string | null };
const WD = JSON.parse(readFileSync(`${DIR}/wikidata.json`, 'utf8')) as { items: Record<string, Item>; byIpni: Record<string, string[]>; enwiki: { titles: Record<string, string | null>; redirects: Record<string, string> } };

/** The pages: GBIF's key and name for it (the backbone's), and Kew's entry, whose accepted name heads the page. */
const PAGES = {
  sabdariffa: { key: 7802717, gbif: 'Hibiscus acetosella', authorship: 'Welw. ex Ficalho', family: 'Malvaceae', entry: '3330712', kew: { scientific: 'Sabdariffa acetosella', authorship: '(Welw. ex Hiern) M.M.Hanes & R.L.Barrett', family: 'Malvaceae' } },
  pseudofumaria: { key: 2888513, gbif: 'Pseudofumaria lutea', authorship: '(L.) Borkh.', family: 'Papaveraceae', entry: '2561323', kew: { scientific: 'Pseudo-fumaria lutea', authorship: '(L.) Borkh.', family: 'Papaveraceae' } },
  artemisia: { key: 7970844, gbif: 'Crossostephium chinense', authorship: '(L.) Makino', family: 'Asteraceae', entry: '3109316', kew: { scientific: 'Artemisia chinensis', authorship: 'L.', family: 'Asteraceae' } },
  dodomaensis: { key: 11309917, gbif: 'Ceropegia tanzaniensis', authorship: '(Peckover) ', family: 'Apocynaceae', entry: '3313620', kew: { scientific: 'Ceropegia dodomaensis', authorship: 'Heiduk & D.Styles', family: 'Apocynaceae' } },
  hoodia: { key: 9505601, gbif: 'Ceropegia triebneri', authorship: '(Nel) Bruyns', family: 'Apocynaceae', entry: '506553', kew: { scientific: 'Hoodia triebneri', authorship: 'Schuldt', family: 'Apocynaceae' } },
  drimia: { key: 10859638, gbif: 'Austronea densiflora', authorship: 'Mart.-Azorín, M.B.Crespo & A.P.Dold', family: 'Asparagaceae', entry: '3311202', kew: { scientific: 'Drimia densiflora', authorship: '(Mart.-Azorín, M.B.Crespo & A.P.Dold) J.C.Manning & Goldblatt', family: 'Asparagaceae' } },
  berberis: { key: 7828251, gbif: 'Mahonia japonica', authorship: '(Thunb.) DC.', family: 'Berberidaceae', entry: '2673980', kew: { scientific: 'Berberis japonica', authorship: '(Thunb.) Spreng.', family: 'Berberidaceae' } }
} as const;
type Page = (typeof PAGES)[keyof typeof PAGES];

/** iNaturalist as it answered (2 November 2026): the ids the items give, and the name searches the pages make. */
const INAT_TAXA: Record<number, { name: string; active: boolean; current?: number }> = {
  163756: { name: 'Hibiscus acetosella', active: false, current: 1686223 },
  1686223: { name: 'Sabdariffa acetosella', active: true },
  130800: { name: 'Pseudofumaria lutea', active: false, current: 1686778 },
  1686778: { name: 'Pseudo-fumaria lutea', active: true },
  355020: { name: 'Crossostephium chinense', active: true },
  1028740: { name: 'Austronea densiflora', active: false, current: 1641948 },
  1641948: { name: 'Drimia densiflora', active: true },
  193399: { name: 'Hoodia triebneri', active: true },
  342886: { name: 'Mahonia japonica', active: false, current: 857208 },
  857208: { name: 'Berberis japonica', active: true }
};
const INAT_SEARCH: Record<string, Array<{ id: number; name: string; matched_term: string }>> = {
  // drops.txt: "not taken: two taxa answered to Artemisia chinensis (Artemisia stelleriana, 158724; Crossostephium chinense, 355020; Artemisia lagocephala, 789271)"
  'Artemisia chinensis': [{ id: 158724, name: 'Artemisia stelleriana', matched_term: 'Artemisia chinensis' }, { id: 355020, name: 'Crossostephium chinense', matched_term: 'Artemisia chinensis' }, { id: 789271, name: 'Artemisia lagocephala', matched_term: 'Artemisia chinensis' }],
  'Hoodia triebneri': [{ id: 193399, name: 'Hoodia triebneri', matched_term: 'Hoodia triebneri' }]
};

let kew: KewRows;
beforeAll(async () => {
  const genera = [...new Set(readFileSync(`${DIR}/wcvp_names.csv`, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split('|')[5].split(' ')[0]))];
  kew = (await loadKewRows(DIR, genera, Object.values(PAGES).map((p) => p.entry)))!;
});

const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
function entity(q: string): Record<string, unknown> | undefined {
  const i = WD.items[q];
  if (!i) return undefined;
  return {
    claims: { P31: i.P31.map((id) => claim({ id })), P225: i.P225.map(claim), P846: i.gbif.map(claim), P961: i.ipni.map(claim), P5037: i.powo.map(claim), P3151: i.inat.map(claim), P7715: i.wfo.map(claim) },
    ...(i.enwiki ? { sitelinks: { enwiki: { title: i.enwiki } } } : {})
  };
}

/** Wikidata's search by statement: the items carrying any of the terms, as `haswbstatement` answers. */
function search(terms: string[], drop: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  for (const t of terms) {
    const [p, v] = t.split('=');
    for (const [q, i] of Object.entries(WD.items)) {
      if (drop.has(q)) continue;
      if ((p === 'P846' && i.gbif.includes(v)) || (p === 'P961' && i.ipni.includes(v)) || (p === 'P5037' && i.powo.includes(v))) out.add(q);
    }
  }
  return [...out];
}

/** The upstreams the build reads, answered from the fixtures; Kew's names from Kew's file (`kewRowsFetcher`). `asked` logs every URL. */
function world(page: Page, asked: string[], o: { drop?: string[] } = {}): JsonFetcher {
  const drop = new Set(o.drop ?? []);
  const ok = <T,>(data: unknown): FetchResult<T> => ({ status: 'ok', data: data as T });
  const base = (async (url: string) => {
    asked.push(url);
    const u = decodeURIComponent(url);
    let m: RegExpExecArray | null;
    if ((m = /^https:\/\/api\.gbif\.org\/v1\/species\/(\d+)$/.exec(u)) && Number(m[1]) === page.key)
      return ok({ key: page.key, scientificName: `${page.gbif} ${page.authorship}`.trim(), canonicalName: page.gbif, authorship: page.authorship, rank: 'SPECIES', taxonomicStatus: 'ACCEPTED', kingdom: 'Plantae', family: page.family, genus: page.gbif.split(' ')[0] });
    if (/\/species\/\d+\/(synonyms|vernacularNames|distributions)/.test(u)) return ok({ results: [], endOfRecords: true });
    if (u.includes('/occurrence/search')) return ok({ count: 0, endOfRecords: true, results: [] });
    if (u.includes('/species/match?')) return ok({ matchType: 'NONE' });
    if (u.includes('wbsearchentities')) throw new Error(`the label was read: ${u}`);
    if ((m = /srsearch=haswbstatement:(\S+)/.exec(u))) return ok({ query: { search: search(m[1].split('|'), drop).map((title) => ({ title })) } });
    if ((m = /wbgetentities.*[&?]ids=([^&]+)/.exec(u))) return ok({ entities: Object.fromEntries(m[1].split('|').flatMap((q) => { const e = drop.has(q) ? undefined : entity(q); return e ? [[q, e]] : []; })) });
    if ((m = /wbgetentities.*[&?]titles=([^&]+)/.exec(u))) {
      const entities: Record<string, unknown> = {};
      for (const t of m[1].split('|')) {
        const q = WD.enwiki.titles[t] ?? Object.entries(WD.items).find(([, i]) => i.enwiki === t)?.[0];
        if (q && !drop.has(q)) entities[q] = entity(q) ?? { sitelinks: { enwiki: { title: t } } };
      }
      return ok({ entities });
    }
    if ((m = /^https:\/\/en\.wikipedia\.org\/api\/rest_v1\/page\/summary\/(.+)$/.exec(u))) {
      const asked = m[1].replace(/_/g, ' ');
      const title = WD.enwiki.redirects[asked] ?? asked;
      const exists = title in WD.enwiki.titles ? !!WD.enwiki.titles[title] : Object.values(WD.items).some((i) => i.enwiki === title);
      if (!exists) return ok({ type: 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found' });
      return ok({ title, type: 'standard', extract: `${title} is a plant. (Fixture text.)`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${title.replace(/ /g, '_')}` } }, revision: '1' });
    }
    if ((m = /^https:\/\/api\.inaturalist\.org\/v1\/taxa\/([\d,]+)$/.exec(u))) return ok({ results: m[1].split(',').map(Number).flatMap((id) => (INAT_TAXA[id] ? [{ id, name: INAT_TAXA[id].name, rank: 'species', is_active: INAT_TAXA[id].active, current_synonymous_taxon_ids: INAT_TAXA[id].current ? [INAT_TAXA[id].current] : null }] : [])) });
    if ((m = /^https:\/\/api\.inaturalist\.org\/v1\/taxa\?q=([^&]+)/.exec(u))) return ok({ results: (INAT_SEARCH[m[1]] ?? []).map((t) => ({ ...t, rank: 'species', is_active: true })) });
    if (u.startsWith('https://api.inaturalist.org/v1/observations')) return ok({ results: [], total_results: 0 });
    return { status: 'none' } as FetchResult<never>;
  }) as unknown as JsonFetcher;
  return kewRowsFetcher(base, kew);
}

/** The page built online as `--keys rebuild-renamed.txt --grid climate --bulk bulk` builds it: Kew's name heading it, Kew's file read. */
async function build(page: Page, o: { drop?: string[]; noKewFile?: boolean } = {}) {
  const asked: string[] = [];
  const sameTypeOf = (kew as unknown as { sameTypeOf?: (e: string) => SameTypeName[] | undefined }).sameTypeOf?.bind(kew);
  const r = await buildDossier(page.key, {
    fetcher: world(page, asked, o),
    builtBy: 'node',
    skip: ['commons', 'openalex', 'gbif.media'],
    kewHeading: page.kew,
    pageIdOf: () => `k${page.entry}`,
    ...(o.noKewFile ? {} : { kewSameType: sameTypeOf })
  } as Parameters<typeof buildDossier>[1]);
  if (!r.ok) throw new Error(`no dossier: ${r.reason}`);
  return { d: r.dossier, asked };
}

describe("Kew's same-type names, by Kew's file alone", () => {
  const of = (entry: string) => (kew as unknown as { sameTypeOf?: (e: string) => SameTypeName[] | undefined }).sameTypeOf?.(entry)?.map((n) => `${n.why} ${n.name} ${n.ipni ?? n.powo}`);
  it("the basionym, the names moved from it, the synonyms Kew marks homotypic; never a synonym on another type", () => {
    // Sabdariffa acetosella: its basionym; Hibiscus eetveldeanus, filed under it without Kew's mark, is a lump.
    expect(of('3330712')).toEqual(['basionym Hibiscus acetosella 559896-1']);
    // Pseudo-fumaria lutea: Fumaria lutea L. and every combination of it; Capnoides albida, Fumaria tetragona and the others are not.
    expect(of('2561323')).toEqual(['basionym Fumaria lutea 673000-1', 'homotypic Neckeria lutea 673369-1', 'homotypic Borckhausenia lutea 671773-1', 'homotypic Capnoides lutea 671934-1', 'homotypic Corydalis lutea 672345-1', 'homotypic Corydalis capnoides var. lutea 2927645-4']);
    // Artemisia chinensis L. is itself the basionym: the names moved from it.
    expect(of('3109316')).toEqual(['homotypic Absinthium chinense 173658-1', 'homotypic Tanacetum chinense 252272-1', 'homotypic Crossostephium chinense 200598-1']);
    // A replacement name (replaced_synonym_author Peckover): the name it replaced, which WCVP gives as its basionym.
    expect(of('3313620')).toEqual(['replaced Brachystelma tanzaniensis 77196898-1']);
    // Hoodia triebneri Schuldt has no basionym and no synonym Kew marks homotypic: Trichocaulon triebneri Nel and its
    // combinations (Ceropegia triebneri (Nel) Bruyns, the illegitimate Hoodia triebneri (Nel) Bruyns) are another type.
    expect(of('506553')).toEqual([]);
    // Not read for an entry the build did not ask for: not "none".
    expect(of('1')).toBeUndefined();
  });
});

describe('case 1: Sabdariffa acetosella [k3330712], GBIF Hibiscus acetosella 7802717', () => {
  it("recovers Q5750828 by Kew's identifier for its basionym, and the summary of that item's article; the IPNI link stays Kew's own", async () => {
    const { d, asked } = await build(PAGES.sabdariffa);
    expect(d.ids.wikidata).toBe('Q5750828'); // 91896bb: none
    expect(d.upstream.wikidata.status).toBe('ok');
    expect(d.upstream.wikidata.detail).toMatch(/^found by Kew's identifier 559896-1 for Hibiscus acetosella Welw\. ex Hiern, which Kew holds as this species' basionym \(same type\)/);
    // The page links Kew's number for Sabdariffa acetosella, never the basionym's record.
    expect(d.ids.ipni).toBe('77361045-1');
    expect(d.ids.wfo).toBe('wfo-0000722244');
    expect(d.summary?.title).toBe('Hibiscus acetosella'); // 91896bb: no summary
    expect(d.upstream.wikipedia.detail).toMatch(/^Wikipedia's article Hibiscus acetosella, the English article of this species' Wikidata item \(Q5750828\)/);
    // The item's iNaturalist taxon, followed to its current one.
    expect(d.ids.inat).toBe(1686223);
    // Hibiscus eetveldeanus (560199-1, Q50842668) is never searched for.
    expect(asked.some((u) => decodeURIComponent(u).includes('560199-1'))).toBe(false);
    expect(d.ids.wikidata).not.toBe('Q50842668');
  });

  it("a heterotypic synonym's item is never taken: with the basionym's item gone, no item", async () => {
    const { d } = await build(PAGES.sabdariffa, { drop: ['Q5750828'] });
    expect(d.ids.wikidata).toBeUndefined();
    expect(d.upstream.wikidata.status).toBe('none');
    expect(d.upstream.wikidata.detail).toMatch(/nor Kew's for the name Kew holds with its type \(Hibiscus acetosella Welw\. ex Hiern\)/);
  });

  it("without Kew's file (no --bulk) the rule is not applied, and the record does not claim it was", async () => {
    const { d } = await build(PAGES.sabdariffa, { noKewFile: true });
    expect(d.ids.wikidata).toBeUndefined();
    expect(d.upstream.wikidata.detail).not.toMatch(/same type/);
  });
});

describe('case 2: Pseudo-fumaria lutea [k2561323], GBIF Pseudofumaria lutea 2888513', () => {
  it("keeps its own item Q15334159, and recovers the article of Q159014, which carries Kew's 672345-1 for Corydalis lutea", async () => {
    const { d } = await build(PAGES.pseudofumaria);
    expect(d.ids.wikidata).toBe('Q15334159');
    expect(d.summary?.title).toBe('Pseudofumaria lutea'); // 91896bb: no summary
    expect(d.upstream.wikipedia.status).toBe('ok');
    expect(d.upstream.wikipedia.detail).toMatch(/^Wikipedia's article Pseudofumaria lutea, whose Wikidata item \(Q159014\) carries Kew's identifier 672345-1 for Corydalis lutea \(L\.\) DC\., a name of this species with the same type by Kew's file/);
    expect(d.upstream.wikipedia.detail).toMatch(/asked by Kew's name Pseudo-fumaria lutea first, then by GBIF's Pseudofumaria lutea/);
  });
  it('the fill reads the proof back from the record, and keeps the summary when asked again', async () => {
    const { d } = await build(PAGES.pseudofumaria);
    // As the page stands once headed: Kew's name heads it, GBIF's is an older name.
    const stored = { ...d, name: { ...d.name, scientific: 'Pseudo-fumaria lutea', synonyms: [] as string[] } };
    const files = new Map([['k2561323.json', JSON.parse(JSON.stringify(stored))]]);
    const store = { files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f: string, x: unknown) => void files.set(f, JSON.parse(JSON.stringify(x))) };
    const c = await checkSummaries(store as never, world(PAGES.pseudofumaria, []), undefined, { again: true });
    expect(c.dropped).toBe(0);
    expect(files.get('k2561323.json').summary?.title).toBe('Pseudofumaria lutea');
  });
});

describe('case 3: Artemisia chinensis [k3109316], GBIF Crossostephium chinense 7970844', () => {
  it("its own item (Kew's 179341-1) wins over the homotypic one; iNaturalist's 355020 from Q15231395, never the ambiguous name search", async () => {
    const { d, asked } = await build(PAGES.artemisia);
    expect(d.ids.wikidata).toBe('Q21871160');
    expect(d.ids.inat).toBe(355020); // 91896bb: none (the name search's three taxa)
    expect(d.upstream['inat.taxon'].status).toBe('ok');
    expect(d.upstream['inat.taxon'].detail).toMatch(/iNaturalist's taxon 355020 \(Crossostephium chinense\), as Wikidata gives it on Q15231395, the item of Crossostephium chinense \(L\.\) Makino, which Kew holds as a homotypic synonym of this species \(same type\), is active/);
    expect(asked.some((u) => u.includes('taxa?q='))).toBe(false);
    // Wikipedia redirects Artemisia chinensis to Artemisia stelleriana: still refused, and so is GBIF's name's redirect to the genus.
    expect(d.summary).toBeUndefined();
    expect(d.upstream.wikipedia.detail).toMatch(/^Wikipedia redirects Artemisia chinensis to Artemisia stelleriana; Wikipedia redirects Crossostephium chinense to Crossostephium/);
  });
});

describe('case 4: Ceropegia dodomaensis [k3313620], a replacement name for Brachystelma tanzaniensis', () => {
  it("recovers Q88970625 by Kew's identifier for the name it replaced", async () => {
    const { d } = await build(PAGES.dodomaensis);
    expect(d.ids.wikidata).toBe('Q88970625'); // 91896bb: none
    expect(d.upstream.wikidata.detail).toMatch(/^found by Kew's identifier 77196898-1 for Brachystelma tanzaniensis Peckover, which Kew holds as the name this species' name replaced \(same type\)/);
    expect(d.ids.ipni).toBe('77334149-1');
  });
});

describe('a page without a GBIF key (built from Kew\'s file, as the new pages of decision 6 are) takes a same-type item too', () => {
  it('Ceropegia dodomaensis as Kew\'s file gives it: Q88970625, and Kew\'s own numbers linked', async () => {
    const sameTypeOf = (kew as unknown as { sameTypeOf?: (e: string) => SameTypeName[] | undefined }).sameTypeOf?.bind(kew);
    const r = await buildKewDossier(
      { id: '3313620', name: 'Ceropegia dodomaensis', authors: 'Heiduk & D.Styles', family: 'Apocynaceae', genus: 'Ceropegia', ipni: '77334149-1', powo: '77334149-1', synonyms: [{ name: 'Brachystelma tanzaniensis', authors: 'Peckover', status: 'Synonym', homotypic: true }], range: [] },
      { fetcher: world(PAGES.dodomaensis, []), builtBy: 'node', skip: ['commons', 'openalex', 'inat'], kewSameType: sameTypeOf?.('3313620') } as Parameters<typeof buildKewDossier>[1]
    );
    if (!r.ok) throw new Error('no dossier');
    expect(r.dossier.ids.wikidata).toBe('Q88970625'); // 91896bb: none
    expect(r.dossier.upstream.wikidata.detail).toBe("found by Kew's identifier 77196898-1 for Brachystelma tanzaniensis Peckover, which Kew holds as the name this species' name replaced (same type)");
    expect(r.dossier.ids.ipni).toBe('77334149-1');
  });
});

describe('case 5: Hoodia triebneri [k506553], GBIF Ceropegia triebneri 9505601', () => {
  it('stays without an item: Q10768351 shares only its label, Q42560587 is another type; its summary by its name stays', async () => {
    const { d } = await build(PAGES.hoodia);
    expect(d.ids.wikidata).toBeUndefined();
    expect(d.upstream.wikidata.status).toBe('none');
    expect(d.upstream.wikidata.detail).toMatch(/Kew's file holds no other name with its type/);
    expect(d.summary?.title).toBe('Hoodia triebneri');
  });
});

describe("case 6: a Kew entry links Kew's IPNI record of its name or none (Drimia densiflora [k3311202])", () => {
  it('the item found by the GBIF key stays; its IPNI, the basionym\'s record, is not linked beside Kew\'s own POWO number', async () => {
    const { d } = await build(PAGES.drimia);
    expect(d.ids.wikidata).toBe('Q95984205');
    expect(d.ids.powo).toBe('urn:lsid:ipni.org:names:3311202-4');
    expect(d.ids.ipni).toBeUndefined(); // 91896bb: 77188032-1, Austronea densiflora's
    expect(d.links.ipni).toBeUndefined();
    expect(d.upstream.wikidata.detail).toMatch(/IPNI and POWO linked by Kew's number for Drimia densiflora .*, none \(the item's: IPNI 77188032-1, POWO 77188032-1\)/);
  });
  it('the drops audit names such an IPNI as another name\'s, and its going is no loss', () => {
    const before = { ids: { powo: 'urn:lsid:ipni.org:names:3311202-4', ipni: '77188032-1', wikidata: 'Q95984205' } };
    const after = { ids: { powo: 'urn:lsid:ipni.org:names:3311202-4', wikidata: 'Q95984205' } };
    expect(ipniPowoDisagree(before.ids)).toBe("IPNI 77188032-1 is not POWO's 3311202-4, Kew's own number for a name IPNI does not hold: another name's record");
    expect(dropsBetween(before, after)).toEqual([]);
    // Any other IPNI lost is still a loss.
    expect(dropsBetween({ ids: { powo: 'urn:lsid:ipni.org:names:710426-1', ipni: '710426-1' } }, { ids: { powo: 'urn:lsid:ipni.org:names:710426-1' } })).toEqual(['identifier ipni lost (710426-1 before)']);
  });
});

describe("an item found by the entry's own identifier wins over a same-type name's", () => {
  it("Berberis japonica's Q104247825 (Kew's 106792-1), not Mahonia japonica's Q159322", async () => {
    const { d } = await build(PAGES.berberis);
    expect(d.ids.wikidata).toBe('Q104247825');
    expect(d.upstream.wikidata.detail).toMatch(/^found by Kew's identifier for Berberis japonica/);
    expect(d.summary?.title).toBe('Berberis japonica');
    // Its item gives no iNaturalist taxon; Mahonia japonica's item, a homotypic synonym's, does, and the record says so.
    expect(d.ids.inat).toBe(857208);
    expect(d.upstream['inat.taxon'].detail).toMatch(/^iNaturalist's taxon 342886 \(Mahonia japonica\), as Wikidata gives it on Q159322, the item of Mahonia japonica \(Thunb\.\) DC\., which Kew holds as a homotypic synonym of this species \(same type\), is inactive; followed to its current taxon 857208/);
  });
  it('crossIds alone: two same-type items and no basionym\'s among them is no item', async () => {
    const names: SameTypeName[] = [
      { id: '1', name: 'Capnoides lutea', authors: '(L.) Gaertn.', ipni: '671934-1', why: 'homotypic' },
      { id: '2', name: 'Corydalis lutea', authors: '(L.) DC.', ipni: '672345-1', why: 'homotypic' }
    ];
    const r = await crossIds(world(PAGES.pseudofumaria, [], { drop: ['Q15334159'] }), 'Pseudofumaria lutea', 2888513, [], { authorship: '(L.) Borkh.', family: 'Papaveraceae', kewPage: true, kew: { r: { status: 'ok', data: { ids: ['673928-1'], label: 'Pseudo-fumaria lutea (L.) Borkh.' } } }, kewSameType: { names } } as Parameters<typeof crossIds>[4]);
    expect(r.status).toBe('ambiguous');
    expect(r.detail).toMatch(/not taken: 2 items carry Kew's identifiers for names Kew holds with this species' type/);
  });
});

describe('--fill wikidata proves such an item again by the identifier its record names', () => {
  it('Q5750828, which carries no GBIF key of the page, stands', async () => {
    const { d } = await build(PAGES.sabdariffa);
    const files = new Map([['k3330712.json', JSON.parse(JSON.stringify(d))]]);
    const store = { files: () => [...files.keys()], read: <T,>(f: string) => JSON.parse(JSON.stringify(files.get(f))) as T, write: (f: string, x: unknown) => void files.set(f, JSON.parse(JSON.stringify(x))) };
    const c = await fillWikidata(store as never, world(PAGES.sabdariffa, []));
    expect(c.changed).toBe(0);
    expect((c as { sameType?: number }).sameType).toBe(1);
  });
});

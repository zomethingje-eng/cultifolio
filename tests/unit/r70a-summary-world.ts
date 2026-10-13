/**
 * A small world of Wikipedia, Wikidata and GBIF answers for the summary tests (round seventy, A1). Each item is written
 * as the facts the rule reads (enwiki sitelink, P171, P566, P1672, P1582, P225, P105) and served in the shape
 * `wbgetentities` gives, by ids or by enwiki titles; GBIF answers for Kew's WCVP (dataset f382f0ce…) with a genus' row
 * and its count of accepted species. The facts in the tests are Wikidata's and GBIF's as they stood on 2026-10-12.
 */
import type { JsonFetcher } from '$dossier/fetch';

export type Item = { sitelink?: string; P171?: string[]; P566?: string[]; P1672?: string[]; P1582?: string[]; P225?: string[]; P105?: string[] };
export type World = {
  /** Wikipedia's REST summary: the title asked → the title it lands on, and the lead. */
  wiki?: Record<string, { title: string; extract?: string }>;
  items?: Record<string, Item>;
  /** Kew's WCVP through GBIF: a genus → its accepted species, named or counted (absent: Kew holds no accepted genus of the name). */
  genera?: Record<string, number | string[]>;
  /** GBIF's backbone, `species/match`: a binomial → the species it is held under, as synonym or accepted, and the name below species it is held under, if any. */
  gbif?: Record<string, { species: string; status: 'ACCEPTED' | 'SYNONYM'; below?: string }>;
  /** Kew's WCVP through GBIF: a species' name → its rows. */
  kew?: Record<string, Array<{ authorship: string; taxonomicStatus: string; accepted?: string }>>;
  /** A URL matching this is refused, as a 429 is after the fetch layer's retries. */
  refuse?: RegExp;
};

const claim = (v: unknown) => ({ mainsnak: { datavalue: { value: v } } });
function entity(id: string, it: Item) {
  const claims: Record<string, unknown[]> = {};
  for (const p of ['P171', 'P566', 'P1672', 'P1582', 'P105'] as const) if (it[p]?.length) claims[p] = it[p]!.map((q) => claim({ 'entity-type': 'item', id: q }));
  if (it.P225?.length) claims.P225 = it.P225.map((n) => claim(n));
  return { type: 'item', id, claims, sitelinks: it.sitelink ? { enwiki: { site: 'enwiki', title: it.sitelink } } : {} };
}

export const GENUS = 'Q34740';
export const SPECIES = 'Q7432';

export function world(w: World): { f: JsonFetcher; asked: string[] } {
  const asked: string[] = [];
  const f = (async (url: string) => {
    asked.push(url);
    if (w.refuse?.test(url)) return { status: 'refused', detail: 'HTTP 429' };
    if (url.includes('/page/summary/')) {
      const t = decodeURIComponent(url.split('/page/summary/')[1] ?? '').replace(/_/g, ' ');
      const a = w.wiki?.[t];
      if (!a) return { status: 'none' };
      return { status: 'ok', data: { type: 'standard', title: a.title, extract: a.extract ?? `${a.title}: the lead.`, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/${a.title.replace(/ /g, '_')}` } } } };
    }
    if (url.includes('action=wbgetentities')) {
      const u = new URL(url);
      const entities: Record<string, unknown> = {};
      const ids = u.searchParams.get('ids');
      if (ids) for (const q of ids.split('|')) entities[q] = w.items?.[q] ? entity(q, w.items[q]) : { id: q, missing: '' };
      else {
        let n = -1;
        for (const t of (u.searchParams.get('titles') ?? '').split('|')) {
          const hit = Object.entries(w.items ?? {}).find(([, it]) => it.sitelink === t);
          if (hit) entities[hit[0]] = entity(hit[0], hit[1]);
          else entities[String(n--)] = { site: 'enwiki', title: t, missing: '' };
        }
      }
      return { status: 'ok', data: { entities } };
    }
    const match = /api\.gbif\.org\/v1\/species\/match\?strict=true&kingdom=Plantae&name=(.+)$/.exec(url);
    if (match) {
      const g = w.gbif?.[decodeURIComponent(match[1])];
      if (!g) return { status: 'ok', data: { matchType: 'NONE' } };
      return { status: 'ok', data: { usageKey: 1, matchType: 'EXACT', status: g.status, species: g.species, speciesKey: 2, acceptedUsageKey: g.status === 'SYNONYM' ? (g.below ? 3 : 2) : undefined, ...(g.status === 'ACCEPTED' ? { usageKey: g.below ? 3 : 2 } : {}) } };
    }
    // The usage below species a synonym is held under (key 3), named by `below`.
    if (/api\.gbif\.org\/v1\/species\/3$/.test(url)) {
      const g = Object.values(w.gbif ?? {}).find((x) => x.below);
      return g ? { status: 'ok', data: { canonicalName: g.below } } : { status: 'none' };
    }
    const names = Object.keys(w.genera ?? {});
    const row = /api\.gbif\.org\/v1\/species\?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&name=([^&]+)/.exec(url);
    if (row && w.kew?.[decodeURIComponent(row[1])]) {
      const n = decodeURIComponent(row[1]);
      return { status: 'ok', data: { results: w.kew[n].map((r) => ({ canonicalName: n, rank: 'SPECIES', ...r })) } };
    }
    if (row) {
      const g = decodeURIComponent(row[1]);
      return { status: 'ok', data: { results: g in (w.genera ?? {}) ? [{ key: 900000 + names.indexOf(g), canonicalName: g, rank: 'GENUS', taxonomicStatus: 'ACCEPTED' }] : [] } };
    }
    const count = /species\/search\?datasetKey=f382f0ce-323a-4091-bb9f-add557f3a9a2&highertaxonKey=(\d+)/.exec(url);
    if (count) {
      const g = w.genera![names[Number(count[1]) - 900000]];
      return { status: 'ok', data: { count: typeof g === 'number' ? g : g.length, results: typeof g === 'number' ? [] : g.slice(0, 2).map((canonicalName) => ({ canonicalName })) } };
    }
    return { status: 'none' };
  }) as unknown as JsonFetcher;
  return { f, asked };
}

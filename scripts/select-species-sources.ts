/**
 * The sources of the species selection (round seventy-eight), asked politely and kept: every answer is saved under the
 * cache folder before it is read, so a second run asks nothing, and `--offline` asks nothing at all and says what is
 * missing. scripts/select-species.ts reads what this fetches; the rule is in scripts/select-species-lib.ts.
 *
 * Pace: one request a second to api.gbif.org, one every two seconds to iNaturalist (round seventy-eight's brief), each
 * waited for in turn; 429, 5xx and dropped connections are tried again five times with a growing pause. The request
 * header is the project's own USER_AGENT, never a person's address.
 *
 * What is kept, under <cache>/:
 *   gbif/living-datasets.json          occurrence/search?kingdomKey=6&basisOfRecord=LIVING_SPECIMEN&facet=datasetKey
 *   gbif/dataset/<key>.json            dataset/<key>: title, description, type, keywords, publisher's key
 *   gbif/organization/<key>.json       organization/<key>: the publisher's name
 *   gbif/species/<key>-<offset>.json   the living-specimen records of plants in that dataset, by GBIF species key
 *   inat/page-<nnn>.json               observations/species_counts?captive=true&iconic_taxa=Plantae, 500 a page
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { USER_AGENT } from '../src/lib/dossier/fetch';
import { writeAtomic } from './write-atomic';

export const GBIF = 'https://api.gbif.org/v1';
export const INAT = 'https://api.inaturalist.org/v1';
export const LIVING = 'kingdomKey=6&basisOfRecord=LIVING_SPECIMEN';
export const FACET_LIMIT = 100000;
/** The pace a host is asked at, in milliseconds between the end of one request and the start of the next. */
export const GAP_MS: Record<string, number> = { 'api.gbif.org': 1000, 'api.inaturalist.org': 2000 };

export const datasetFacetUrl = () => `${GBIF}/occurrence/search?${LIVING}&limit=0&facet=datasetKey&facetLimit=${FACET_LIMIT}`;
export const datasetUrl = (key: string) => `${GBIF}/dataset/${key}`;
export const organizationUrl = (key: string) => `${GBIF}/organization/${key}`;
export const speciesFacetUrl = (key: string, offset: number) =>
  `${GBIF}/occurrence/search?${LIVING}&datasetKey=${key}&limit=0&facet=speciesKey&facetLimit=${FACET_LIMIT}&facetOffset=${offset}`;
export const inatPageUrl = (page: number) => `${INAT}/observations/species_counts?captive=true&iconic_taxa=Plantae&per_page=500&page=${page}`;

const lastAt = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One paced GET, tried again on 429, 5xx and a dropped connection; the body, or an error naming the last answer. */
async function paced(url: string): Promise<string> {
  const host = new URL(url).host;
  const gap = GAP_MS[host] ?? 1000;
  let last = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = (lastAt.get(host) ?? 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' }, signal: AbortSignal.timeout(300_000) });
      const body = await res.text();
      lastAt.set(host, Date.now());
      if (res.ok) return body;
      last = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 15_000 * (attempt + 1));
    } catch (e) {
      lastAt.set(host, Date.now());
      last = e instanceof Error ? e.message : String(e);
      await sleep(5_000 * (attempt + 1));
    }
  }
  throw new Error(`${url}: ${last}`);
}

export interface Cache {
  dir: string;
  offline: boolean;
  /** Requests made by this run, by host. */
  asked: Record<string, number>;
  /** Files the run needed and did not have (offline only). */
  missing: string[];
}

/** The parsed JSON at <dir>/<rel>, fetched from `url` first when it is not there (and the run is not offline). */
export async function cached<T>(c: Cache, rel: string, url: string): Promise<T | null> {
  const path = `${c.dir}/${rel}`;
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')) as T;
  if (c.offline) {
    c.missing.push(rel);
    return null;
  }
  const body = await paced(url);
  JSON.parse(body); // never keep a body that is not JSON
  mkdirSync(dirname(path), { recursive: true });
  writeAtomic(path, body);
  const host = new URL(url).host;
  c.asked[host] = (c.asked[host] ?? 0) + 1;
  return JSON.parse(body) as T;
}

interface Facet { count: number; facets: Array<{ field: string; counts: Array<{ name: string; count: number }> }> }

export interface GbifDatasetMeta {
  key: string;
  title?: string;
  description?: string;
  type?: string;
  publishingOrganizationKey?: string;
  keywordCollections?: Array<{ thesaurus?: string; keywords?: string[] }>;
}

export interface LivingDataset {
  key: string;
  /** Living-specimen records of plants in the dataset, from the facet. */
  records: number;
  meta: GbifDatasetMeta | null;
  publisher: string | null;
  /** GBIF species key → records; null when not fetched. */
  species: Map<string, number> | null;
}

/** Every GBIF dataset holding living-specimen records of plants, with its metadata, publisher and records by species. */
export async function gbifLiving(c: Cache, log: (s: string) => void): Promise<{ total: number; datasets: LivingDataset[] }> {
  const facet = await cached<Facet>(c, 'gbif/living-datasets.json', datasetFacetUrl());
  if (!facet) return { total: 0, datasets: [] };
  const counts = facet.facets[0]?.counts ?? [];
  const out: LivingDataset[] = [];
  let i = 0;
  for (const { name: key, count } of counts) {
    if (++i % 25 === 0) log(`  GBIF datasets: ${i}/${counts.length}`);
    const meta = await cached<GbifDatasetMeta>(c, `gbif/dataset/${key}.json`, datasetUrl(key));
    let publisher: string | null = null;
    if (meta?.publishingOrganizationKey) {
      const org = await cached<{ title?: string }>(c, `gbif/organization/${meta.publishingOrganizationKey}.json`, organizationUrl(meta.publishingOrganizationKey));
      publisher = org?.title ?? null;
    }
    let species: Map<string, number> | null = new Map();
    for (let offset = 0; ; offset += FACET_LIMIT) {
      const page = await cached<Facet>(c, `gbif/species/${key}-${offset}.json`, speciesFacetUrl(key, offset));
      if (!page) { species = null; break; }
      const rows = page.facets[0]?.counts ?? [];
      for (const r of rows) species.set(r.name, (species.get(r.name) ?? 0) + r.count);
      if (rows.length < FACET_LIMIT) break;
    }
    out.push({ key, records: count, meta, publisher, species });
  }
  return { total: facet.count, datasets: out };
}

export interface InatTaxonCount {
  count: number;
  taxon: { id: number; name: string; rank: string; ancestor_ids?: number[]; is_active?: boolean };
}

/** iNaturalist's species counts of plants marked captive or cultivated, every page (the API does not cap this paging). */
export async function inatCaptive(c: Cache, log: (s: string) => void): Promise<{ total: number | null; rows: InatTaxonCount[]; pages: number }> {
  const rows: InatTaxonCount[] = [];
  let total: number | null = null;
  let page = 1;
  for (; ; page++) {
    const p = await cached<{ total_results: number; results: InatTaxonCount[] }>(c, `inat/page-${String(page).padStart(3, '0')}.json`, inatPageUrl(page));
    if (!p) break;
    total = p.total_results;
    for (const r of p.results) rows.push({ count: r.count, taxon: { id: r.taxon.id, name: r.taxon.name, rank: r.taxon.rank, ancestor_ids: r.taxon.ancestor_ids, is_active: r.taxon.is_active } });
    if (page % 20 === 0) log(`  iNaturalist: page ${page}, ${rows.length} taxa`);
    if (p.results.length < 500) break;
  }
  return { total, rows, pages: page };
}

/** The cache's files, newest and oldest day, for the list's header. */
export function cacheDays(dir: string, sub: string): { first: string; last: string } | null {
  const p = `${dir}/${sub}`;
  if (!existsSync(p)) return null;
  const days: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${d}/${e.name}`);
      else if (e.name.endsWith('.json')) days.push(new Date(statSync(`${d}/${e.name}`).mtimeMs).toISOString().slice(0, 10));
    }
  };
  walk(p);
  if (!days.length) return null;
  days.sort();
  return { first: days[0], last: days[days.length - 1] };
}

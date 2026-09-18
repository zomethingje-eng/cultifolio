import type { JsonFetcher, FetchResult } from '../fetch';
import { licenceTag, isOpen, type LicenceTag } from '$core/licence';

export const GBIF = 'https://api.gbif.org/v1';

export interface GbifMatch {
  usageKey: number;
  acceptedUsageKey?: number;
  scientificName: string;
  canonicalName?: string;
  rank?: string;
  status?: string;
  matchType?: string;
  confidence?: number;
  family?: string;
  genus?: string;
  order?: string;
  kingdom?: string;
  synonym?: boolean;
}

export async function matchName(f: JsonFetcher, name: string): Promise<FetchResult<GbifMatch>> {
  const r = await f<GbifMatch & { matchType?: string }>(`${GBIF}/species/match?strict=false&name=${encodeURIComponent(name)}`);
  if (r.status !== 'ok') return r;
  if (!r.data.usageKey || r.data.matchType === 'NONE') return { status: 'none' };
  return r;
}

export interface GbifSpecies {
  key: number;
  nubKey?: number;
  scientificName: string;
  canonicalName?: string;
  authorship?: string;
  rank?: string;
  taxonomicStatus?: string;
  acceptedKey?: number;
  accepted?: string;
  /** For an infraspecific taxon: the species it belongs to. */
  speciesKey?: number;
  species?: string;
  family?: string;
  genus?: string;
  order?: string;
  class?: string;
  phylum?: string;
  kingdom?: string;
  familyKey?: number;
  genusKey?: number;
  orderKey?: number;
  classKey?: number;
  phylumKey?: number;
  kingdomKey?: number;
}

export const species = (f: JsonFetcher, key: number) => f<GbifSpecies>(`${GBIF}/species/${key}`);

export async function synonyms(f: JsonFetcher, key: number): Promise<FetchResult<string[]>> {
  const r = await f<{ results: Array<{ scientificName: string }> }>(`${GBIF}/species/${key}/synonyms?limit=50`);
  if (r.status !== 'ok') return r;
  return { status: 'ok', data: r.data.results.map((s) => s.scientificName).filter((n): n is string => typeof n === 'string') };
}

export async function vernacular(f: JsonFetcher, key: number): Promise<FetchResult<Array<{ name: string; lang?: string; source?: string }>>> {
  const r = await f<{ results: Array<{ vernacularName: string; language?: string; source?: string }> }>(`${GBIF}/species/${key}/vernacularNames?limit=50`);
  if (r.status !== 'ok') return r;
  const seen = new Set<string>();
  const out: Array<{ name: string; lang?: string; source?: string }> = [];
  for (const x of r.data.results) {
    if (typeof x.vernacularName !== 'string') continue;
    const k = x.vernacularName.toLowerCase() + '|' + (x.language ?? '');
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name: x.vernacularName, lang: x.language ?? undefined, source: x.source ?? undefined });
  }
  return { status: 'ok', data: out };
}

export interface GbifDistribution {
  locationId?: string;
  locality?: string;
  country?: string;
  establishmentMeans?: string;
  status?: string;
  source?: string;
}

/** WCVP rows as republished through GBIF (the checklist Kew's POWO runs on). */
export async function distributions(f: JsonFetcher, key: number): Promise<FetchResult<{ rows: GbifDistribution[]; wcvp: boolean }>> {
  const r = await f<{ results: GbifDistribution[] }>(`${GBIF}/species/${key}/distributions?limit=200`);
  if (r.status !== 'ok') return r;
  const wcvp = r.data.results.filter((d) => /wcvp|world checklist|plants of the world|kew/i.test(d.source ?? ''));
  if (wcvp.length) return { status: 'ok', data: { rows: wcvp, wcvp: true } };
  // No WCVP entry: fall back to whatever national checklists GBIF holds, one row per country and status.
  const seen = new Map<string, GbifDistribution>();
  for (const d of r.data.results) {
    const k = `${d.country ?? d.locality ?? '?'}|${/introduced|naturali[sz]ed|cultivated|invasive|managed/i.test(`${d.establishmentMeans ?? ''} ${d.status ?? ''}`) ? 'i' : 'n'}`;
    if (!seen.has(k)) seen.set(k, d);
  }
  return seen.size ? { status: 'ok', data: { rows: [...seen.values()], wcvp: false } } : { status: 'none' };
}

export interface GbifOccurrence {
  key: number;
  decimalLatitude?: number;
  decimalLongitude?: number;
  year?: number;
  countryCode?: string;
  basisOfRecord?: string;
  license?: string;
  datasetKey?: string;
  datasetName?: string;
  establishmentMeans?: string;
  degreeOfEstablishment?: string;
  media?: Array<{ type?: string; identifier?: string; license?: string; rightsHolder?: string; creator?: string; references?: string }>;
}

export interface OccPage {
  results: GbifOccurrence[];
  endOfRecords: boolean;
  count: number;
}

/** Up to `pages` × 300 georeferenced records with licence and dataset on each. */
export async function occurrences(f: JsonFetcher, key: number, pages = 3): Promise<FetchResult<GbifOccurrence[]>> {
  const out: GbifOccurrence[] = [];
  for (let p = 0; p < pages; p++) {
    const url =
      `${GBIF}/occurrence/search?taxonKey=${key}&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT` +
      `&limit=300&offset=${p * 300}`;
    const r = await f<OccPage>(url);
    if (r.status !== 'ok') return out.length ? { status: 'ok', data: out } : r;
    out.push(...r.data.results);
    if (r.data.endOfRecords) break;
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

export interface OccMedia {
  id: string;
  url: string;
  licence: LicenceTag;
  creator?: string;
  rightsHolder?: string;
  page?: string;
  datasetKey?: string;
}

/** Still images attached to occurrences, already filtered to open licences. */
export async function media(f: JsonFetcher, key: number): Promise<FetchResult<OccMedia[]>> {
  const r = await f<OccPage>(`${GBIF}/occurrence/search?taxonKey=${key}&mediaType=StillImage&limit=100`);
  if (r.status !== 'ok') return r;
  const out: OccMedia[] = [];
  for (const o of r.data.results) {
    // iNaturalist images reach GBIF through a CC-BY-NC dataset; the per-photo licence is what counts, and it is on the media object.
    for (const m of o.media ?? []) {
      if (!m.identifier || (m.type && !/still/i.test(m.type))) continue;
      const tag = licenceTag(m.license ?? o.license);
      if (!isOpen(tag)) continue;
      out.push({ id: `${o.key}:${out.length}`, url: m.identifier, licence: tag!, creator: m.creator, rightsHolder: m.rightsHolder, page: m.references ?? `https://www.gbif.org/occurrence/${o.key}`, datasetKey: o.datasetKey });
    }
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

export async function suggest(f: JsonFetcher, q: string): Promise<FetchResult<Array<{ key: number; scientificName: string; rank: string; status?: string; family?: string }>>> {
  const r = await f<Array<{ key: number; scientificName: string; rank: string; status?: string; family?: string }>>(
    `${GBIF}/species/suggest?datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&rank=SPECIES&rank=SUBSPECIES&rank=VARIETY&rank=FORM&limit=12&q=${encodeURIComponent(q)}`
  );
  return r;
}

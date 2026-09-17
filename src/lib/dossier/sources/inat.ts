import type { JsonFetcher, FetchResult } from '../fetch';
import { licenceTag, isOpen } from '$core/licence';
import type { Photo } from '../schema';

export const INAT = 'https://api.inaturalist.org/v1';

export interface InatTaxon {
  id: number;
  name: string;
  rank: string;
  observations_count?: number;
  wikipedia_url?: string;
  default_photo?: { id: number; license_code?: string | null; url: string; attribution: string; original_dimensions?: { width: number; height: number } };
}

export async function taxon(f: JsonFetcher, name: string): Promise<FetchResult<InatTaxon>> {
  const r = await f<{ results: InatTaxon[] }>(`${INAT}/taxa?q=${encodeURIComponent(name)}&rank=species,subspecies,variety,form&per_page=5`);
  if (r.status !== 'ok') return r;
  // Exact name only. The first search hit for "Albuca nana" can be Albuca namaquensis; a photo of the
  // wrong species on a species page is worse than no photo. (iNat resolves accepted synonyms itself:
  // a taxon whose name differs is not a match we can verify here.)
  const exact = r.data.results.find((t) => t.name.toLowerCase() === name.toLowerCase());
  return exact ? { status: 'ok', data: exact } : { status: 'none' };
}

interface ObsPhoto {
  id: number;
  license_code?: string | null;
  url: string; // .../square.jpg
  attribution: string;
  original_dimensions?: { width: number; height: number };
}
interface Observation {
  id: number;
  observed_on?: string;
  place_guess?: string;
  captive?: boolean;
  quality_grade?: string;
  photos: ObsPhoto[];
}

/**
 * Photos are requested with the licence filter in the query, so nothing
 * non-commercial is ever downloaded, and each photo's own licence is checked
 * again on arrival. iNaturalist serves licensed photos from its AWS Open Data
 * bucket, which is the URL the API returns for them.
 */
export async function photos(f: JsonFetcher, taxonId: number, wild: boolean, perPage = 30): Promise<FetchResult<Photo[]>> {
  const url =
    `${INAT}/observations?taxon_id=${taxonId}&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research` +
    `&captive=${wild ? 'false' : 'true'}&order_by=votes&per_page=${perPage}`;
  const r = await f<{ results: Observation[] }>(url);
  if (r.status !== 'ok') return r;
  const out: Photo[] = [];
  for (const o of r.data.results) {
    for (const p of o.photos) {
      const tag = licenceTag(p.license_code);
      if (!isOpen(tag) || (tag !== 'cc0' && tag !== 'by' && tag !== 'by-sa')) continue;
      const base = p.url.replace(/\/square\.(\w+)$/, '');
      const ext = /\.(\w+)$/.exec(p.url)?.[1] ?? 'jpg';
      out.push({
        src: 'inat',
        id: String(p.id),
        url: `${base}/large.${ext}`,
        thumb: `${base}/medium.${ext}`,
        width: p.original_dimensions?.width ?? undefined,
        height: p.original_dimensions?.height ?? undefined,
        licence: tag,
        attribution: p.attribution ?? 'iNaturalist user, licence as stated',
        page: `https://www.inaturalist.org/observations/${o.id}`,
        captive: !wild,
        observedOn: o.observed_on ?? undefined,
        place: o.place_guess ?? undefined
      });
    }
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

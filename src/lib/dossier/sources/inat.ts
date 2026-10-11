import type { JsonFetcher, FetchResult, SourceResult } from '../fetch';
import { licenceTag, isOpen } from '$core/licence';
import type { Photo } from '../schema';

export const INAT = 'https://api.inaturalist.org/v1';

export interface InatTaxon {
  id: number;
  name: string;
  rank: string;
  observations_count?: number;
  /** The name the search matched: the taxon's own, or one of its synonyms. */
  matched_term?: string;
  wikipedia_url?: string;
  default_photo?: { id: number; license_code?: string | null; url: string; attribution: string; original_dimensions?: { width: number; height: number } };
}

/**
 * iNaturalist's plants (Plantae), to which every name search is limited (round sixty-nine; triage-68 M6, S-A5): "Iris
 * oratoria" answered a mantis and "Oenanthe pleschanka" a wheatear.
 */
export const PLANTAE = 47126;
/** The ids `/v1/taxa/<ids>` is asked for at a time. */
export const IDS_PER_ASK = 30;

/** Whether the reference holds a name as one of its own species other than the one being built: never a taxon to take for it. */
export type HeldElsewhere = (name: string) => boolean;

export async function taxon(f: JsonFetcher, name: string, heldElsewhere?: HeldElsewhere): Promise<SourceResult<InatTaxon>> {
  const r = await f<{ results: InatTaxon[] }>(`${INAT}/taxa?q=${encodeURIComponent(name)}&taxon_id=${PLANTAE}&rank=species,subspecies,variety,form&per_page=5`);
  if (r.status !== 'ok') return r;
  // Exact name only. The first search hit for "Albuca nana" can be Albuca namaquensis; a photo of the
  // wrong species on a species page is worse than no photo. (iNat resolves accepted synonyms itself:
  // a taxon whose name differs is not a match we can verify here.)
  const exact = r.data.results.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (exact) return { status: 'ok', data: exact };
  // A name iNaturalist files under another (Cinnamomum camphora under Camphora officinarum): only when its search says it
  // matched exactly this name, at species rank or below, so it is that name's taxon by iNaturalist's own synonymy, never a
  // neighbour the search ranked first (round sixty-eight).
  const syn = r.data.results.filter((t) => (t.matched_term ?? '').toLowerCase() === name.toLowerCase() && t.rank !== 'genus');
  // Two taxa claiming the name is two answers, said as such, never "none" (round sixty-nine; triage-68 M8).
  if (syn.length > 1) return { status: 'ambiguous', detail: `not taken: two taxa answered to ${name} (${syn.map((t) => `${t.name}, ${t.id}`).join('; ')})` };
  if (!syn.length) return { status: 'none' };
  // iNaturalist's synonymy lumps on other types (Aloe barbadensis into A. vera): a taxon the reference holds as another
  // species is that species' photographs, not this one's (round sixty-nine; triage-68 M6, R46-14).
  if (heldElsewhere?.(syn[0].name)) return { status: 'none', detail: `not taken: iNaturalist files ${name} as ${syn[0].name}, another species of this reference` };
  return { status: 'ok', data: syn[0], detail: `filed by iNaturalist as ${syn[0].name}` };
}

/**
 * iNaturalist's taxon for a species it files under an older name with the same type (Bisnaga glaucescens, filed there as
 * Ferocactus glaucescens; round sixty-eight, third part). Each name is asked as `taxon` asks the accepted one, at most
 * five, and the answer is taken only when every name that finds a taxon finds the same one. A refusal stops the asking
 * and is the answer, so a later build asks again.
 *
 * A taxon is taken only when its own name is the species' accepted name or one of its same-type names, and never when
 * the reference holds it as another species (round sixty-nine; triage-68 M6, R46-14): "Rebutia pulchra", Weingartia
 * pulchra's basionym, finds iNaturalist's Weingartia canigueralii, which has its own page here. The answer names the older
 * name it came under and the taxon iNaturalist files it as; two taxa are `ambiguous` (triage-68 M8, S-A6).
 */
export async function taxonByOlderNames(f: JsonFetcher, names: readonly string[], rule: { accepted?: string; heldElsewhere?: HeldElsewhere } = {}): Promise<SourceResult<InatTaxon>> {
  const asked = [...new Set(names)].slice(0, 5);
  const own = new Set([rule.accepted ?? '', ...names].map((n) => n.toLowerCase()).filter(Boolean));
  const found = new Map<number, { t: InatTaxon; name: string }>();
  const refusedHere: string[] = [];
  for (const name of asked) {
    const r = await taxon(f, name);
    if (r.status === 'refused' || r.status === 'error' || r.status === 'skipped') return r;
    if (r.status === 'ambiguous') return r;
    if (r.status !== 'ok') continue;
    const t = r.data;
    if (!own.has(t.name.toLowerCase())) refusedHere.push(`${name} finds ${t.name}, which is neither this species' name nor one of its same-type names`);
    else if (rule.heldElsewhere?.(t.name)) refusedHere.push(`${name} finds ${t.name}, another species of this reference`);
    else if (!found.has(t.id)) found.set(t.id, { t, name });
  }
  if (found.size > 1) return { status: 'ambiguous', detail: `not taken: two taxa answered (${[...found.values()].map(({ t, name }) => `${t.name}, ${t.id}, under ${name}`).join('; ')})` };
  if (!found.size) return refusedHere.length ? { status: 'none', detail: `not taken: ${refusedHere.join('; ')}` } : { status: 'none' };
  const [{ t, name }] = found.values();
  return { status: 'ok', data: t, detail: `found under ${name}, an older name with the same type${t.name.toLowerCase() !== name.toLowerCase() ? `; filed by iNaturalist as ${t.name}` : ''}` };
}

/** What iNaturalist says of one taxon id: active, followed to the one current taxon it names, or inactive with no single successor (or unknown). */
export type IdCheck = { active: true; name?: string } | { active: false; name?: string; current?: number };

/**
 * iNaturalist's own word on taxon ids, `IDS_PER_ASK` a request (round sixty-nine; triage-68 M5, R46-13). An id from
 * Wikidata or carried from the previous build can be one iNaturalist has since made inactive: six live dossiers asked
 * for photographs of a taxon that has none (Dypsis lutescens 133599, now Chrysalidocarpus lutescens 276548; Erythrina
 * caffra 119671, now 1588191). An inactive id is followed when `current_synonymous_taxon_ids` names one taxon; an id
 * iNaturalist does not return is unknown, and taken as inactive with no successor. A refusal of any request is the answer.
 */
export async function checkIds(f: JsonFetcher, ids: readonly number[]): Promise<FetchResult<Map<number, IdCheck>>> {
  const out = new Map<number, IdCheck>();
  const all = [...new Set(ids)];
  for (let i = 0; i < all.length; i += IDS_PER_ASK) {
    const part = all.slice(i, i + IDS_PER_ASK);
    const r = await f<{ results: Array<{ id: number; name?: string; is_active?: boolean; current_synonymous_taxon_ids?: number[] | null }> }>(`${INAT}/taxa/${part.join(',')}`);
    if (r.status === 'none') { part.forEach((id) => out.set(id, { active: false })); continue; }
    if (r.status !== 'ok') return r;
    for (const t of r.data.results ?? []) {
      const next = t.current_synonymous_taxon_ids ?? [];
      out.set(t.id, t.is_active !== false ? { active: true, name: t.name } : { active: false, name: t.name, ...(next.length === 1 ? { current: next[0] } : {}) });
    }
    for (const id of part) if (!out.has(id)) out.set(id, { active: false });
  }
  return { status: 'ok', data: out };
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
      if (!p.attribution && tag !== 'cc0') continue; // no attribution line means no author to credit, which CC BY requires (round sixteen, 3)
      out.push({
        src: 'inat',
        id: String(p.id),
        url: `${base}/large.${ext}`,
        thumb: `${base}/medium.${ext}`,
        width: p.original_dimensions?.width ?? undefined,
        height: p.original_dimensions?.height ?? undefined,
        licence: tag,
        attribution: p.attribution ?? 'author not stated, CC0',
        page: `https://www.inaturalist.org/observations/${o.id}`,
        captive: !wild,
        observedOn: o.observed_on ?? undefined,
        place: o.place_guess ?? undefined
      });
    }
  }
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

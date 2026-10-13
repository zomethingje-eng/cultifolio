import type { JsonFetcher, FetchResult, SourceResult } from '../fetch';
import { licenceTag, isOpen } from '$core/licence';
import type { Photo } from '../schema';
import type { Reference } from '../reference';

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
export async function taxonByOlderNames(f: JsonFetcher, names: readonly string[], rule: { accepted?: string; heldElsewhere?: HeldElsewhere; own?: ReadonlySet<string> } = {}): Promise<SourceResult<InatTaxon>> {
  const asked = [...new Set(names)].slice(0, 5);
  // The species' own names (`ownNames`; round seventy, second pass, triage-69 B7): with them, a taxon iNaturalist files
  // under a replaced name GBIF holds under this species is its own (Ceropegia mixta's Orbea variegata).
  const own = new Set([rule.accepted ?? '', ...names, ...(rule.own ?? [])].map((n) => n.toLowerCase()).filter(Boolean));
  const found = new Map<number, { t: InatTaxon; name: string }>();
  const refusedHere: string[] = [];
  for (const name of asked) {
    const r = await taxon(f, name);
    if (r.status === 'refused' || r.status === 'error' || r.status === 'skipped') return r;
    if (r.status === 'ambiguous') return r;
    if (r.status !== 'ok') continue;
    let t = r.data;
    // iNaturalist files the name under a variety of a species that is one of this species' own names (round seventy,
    // second pass; triage-69 B7): "Stapelia pulvinata", Ceropegia pulvinata's basionym, finds Stapelia hirsuta var.
    // hirsuta, and Stapelia hirsuta L. is the name Bruyns replaced. The species is asked for by its name and taken.
    const binomial = t.name.split(' ').slice(0, 2).join(' ');
    if (t.rank !== 'species' && !own.has(t.name.toLowerCase()) && own.has(binomial.toLowerCase())) {
      const s = await taxon(f, binomial);
      if (s.status === 'refused' || s.status === 'error' || s.status === 'skipped') return s;
      if (s.status === 'ok' && s.data.name.toLowerCase() === binomial.toLowerCase()) t = s.data;
    }
    if (!own.has(t.name.toLowerCase())) refusedHere.push(`${name} finds ${t.name}, which is neither this species' name nor one of its same-type names`);
    else if (rule.heldElsewhere?.(t.name)) refusedHere.push(`${name} finds ${t.name}, another species of this reference`);
    else if (!found.has(t.id)) found.set(t.id, { t, name });
  }
  if (found.size > 1) return { status: 'ambiguous', detail: `not taken: two taxa answered (${[...found.values()].map(({ t, name }) => `${t.name}, ${t.id}, under ${name}`).join('; ')})` };
  if (!found.size) return refusedHere.length ? { status: 'none', detail: `not taken: ${refusedHere.join('; ')}` } : { status: 'none' };
  const [{ t, name }] = found.values();
  return { status: 'ok', data: t, detail: `found under ${name}, an older name with the same type${t.name.toLowerCase() !== name.toLowerCase() ? `; filed by iNaturalist as ${t.name}${names.some((n) => n.toLowerCase() === t.name.toLowerCase()) || t.name.toLowerCase() === (rule.accepted ?? '').toLowerCase() ? '' : ', a name GBIF holds under this species'}` : ''}` };
}

/** What iNaturalist says of one taxon id: active, followed to the one current taxon it names, or inactive with no single successor (or unknown). */
export type IdCheck = { active: true; name?: string } | { active: false; name?: string; current?: number };

/**
 * iNaturalist's own word on taxon ids, `IDS_PER_ASK` a request (round sixty-nine; triage-68 M5, R46-13). An id from
 * Wikidata or carried from the previous build can be one iNaturalist has since made inactive: six live dossiers asked
 * for photographs of a taxon that has none (Dypsis lutescens 133599, now Chrysalidocarpus lutescens 276548; Erythrina
 * caffra 119671, now 1588191). An inactive id names its successor when `current_synonymous_taxon_ids` names one taxon;
 * an id iNaturalist does not return is unknown, and taken as inactive with no successor. A refusal of any request is the
 * answer. Whether the successor is taken is `successorRefused`'s to say.
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

/**
 * The species a followed taxon is judged against: its accepted name, its same-type older names, its other own names
 * (`ownNames`, round seventy's second pass: a replaced name GBIF holds under it), and the reference's other species.
 */
export type FollowRule = { accepted: string; sameType?: readonly string[]; own?: ReadonlySet<string>; heldElsewhere?: HeldElsewhere };

/**
 * Why the current taxon an inactive id names is not taken for this species, or null when it is (round seventy;
 * triage-69 B1, S-B1). It is taken only on `taxonByOlderNames`' rule: its name is the species' accepted name or one of
 * its same-type older names, and no other species of the reference holds that name. iNaturalist's 506182, Pinguicula
 * chilensis, names 816267, Pinguicula antarctica, which this reference holds as a species of its own; 207131, Mammillaria
 * karwinskiana, names Mammillaria geminata, a lump on another type; Tricyrtis formosana's variety names another variety.
 * Each brought its photographs to the wrong page. Dypsis lutescens 133599 names Chrysalidocarpus lutescens, its basionym,
 * and is followed.
 */
export function successorRefused(current: IdCheck | undefined, rule: FollowRule): string | null {
  if (!current?.name) return 'not known to iNaturalist';
  if (!current.active) return 'itself inactive';
  if (rule.heldElsewhere?.(current.name)) return 'another species of this reference';
  const own = new Set([rule.accepted, ...(rule.sameType ?? []), ...(rule.own ?? [])].map((n) => n.toLowerCase()));
  if (!own.has(current.name.toLowerCase())) return rule.own ? "not one of this species' names" : "neither this species' name nor one of its same-type names";
  return null;
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

/**
 * Whether GBIF holds iNaturalist's name for a taxon as another species of this reference (round seventy, second pass;
 * triage-69 B5, R47-1): the reason when it does, null when it does not or cannot say. Asked of every taxon whose name is
 * not one of this species' own (`ownNames`), however the id came: carried from an earlier build, given by Wikidata, or
 * "filed by iNaturalist as" another name. iNaturalist's lumps look exactly like renames, and its names are another
 * checklist's: Ceropegia monteiroae carried 430812, Ceropegia sandersonii; Cotyledon flanaganii 598425, Cotyledon
 * orbiculata var. orbiculata; Drimia oliverorum was followed to Drimia physodes, which GBIF holds as Fusifilum physodes.
 * Each of those is a page of its own here. The name is matched to GBIF's backbone (one request), and GBIF's species is read
 * through its synonymy and up from a rank below species.
 *
 * GBIF holds some of iNaturalist's genera nowhere near the reference's (Echinofossulocactus, to GBIF a synonym of
 * Echinocactus and of Ferocactus, is Stenocactus to iNaturalist and to Kew). So when GBIF's answer is not a species of
 * this reference, and the reference holds no species of iNaturalist's genus, the name is read as the one species of this
 * family that has its epithet, in any spelling or gender: Stenocactus boedekerianus was given "Echinofossulocactus
 * ochoterenanus", which is Stenocactus ochoterenanus, a page of its own. Two such species, or none, decide nothing.
 */
export async function heldAtGbifElsewhere(f: JsonFetcher, inatName: string, self: { key: number; family?: string }, ref: Reference): Promise<FetchResult<string | null>> {
  const m = await f<{ usageKey?: number; matchType?: string; rank?: string; speciesKey?: number; species?: string; scientificName?: string }>(`https://api.gbif.org/v1/species/match?strict=true&kingdom=Plantae&name=${encodeURIComponent(inatName)}`);
  if (m.status !== 'ok' && m.status !== 'none') return m;
  const d = m.status === 'ok' ? m.data : {};
  const species = d.usageKey && d.matchType !== 'NONE' && d.matchType !== 'HIGHERRANK' ? d.speciesKey : undefined;
  if (species === self.key) return { status: 'ok', data: null };
  if (species && ref.isSpecies(species)) return { status: 'ok', data: `GBIF holds iNaturalist's ${inatName} as ${d.species ?? `species ${species}`}, another species of this reference` };
  const [genus, epithet] = inatName.split(' ');
  if (!epithet || ref.hasGenus(genus)) return { status: 'ok', data: null };
  const same = ref.byEpithet(epithet, self.family);
  if (same.length === 1 && same[0].key !== self.key) return { status: 'ok', data: `iNaturalist's ${inatName}, in a genus this reference does not hold, is ${same[0].name}, another species of this reference` };
  return { status: 'ok', data: null };
}

/** A species as `taxonFor` asks iNaturalist for it. */
export interface InatAsk {
  scientific: string;
  key: number;
  family?: string;
  /** Its own names (`ownNames`): the accepted, the same-type and the replaced names. */
  own: { own: ReadonlySet<string> };
  sameType: readonly string[];
  heldElsewhere?: HeldElsewhere;
  reference?: Reference;
  /** Taxa refused already (one an inactive id named, one GBIF holds as another species): never taken by the search. */
  refused?: Set<number>;
}

/**
 * iNaturalist's taxon for a species asked by name, the one way the build, `--fill inat-ids` and `--fill inat` ask it
 * (round seventy, second pass; triage-69 B1, B5, B7): the name search (`taxon`); a taxon already refused is not taken; a
 * taxon of another name that GBIF holds as another species of this reference is not taken (`heldAtGbifElsewhere`), and
 * is added to `refused`; then the older names with the same type, five at most, each answer taken only when its name is
 * one of the species' own (`taxonByOlderNames`). A refusal is the answer.
 */
export async function taxonFor(f: JsonFetcher, a: InatAsk): Promise<SourceResult<InatTaxon>> {
  const refused = a.refused ?? new Set<number>();
  let t: SourceResult<InatTaxon> = await taxon(f, a.scientific, a.heldElsewhere);
  if (t.status === 'ok' && refused.has(t.data.id)) t = { status: 'none', detail: `not taken: iNaturalist files ${a.scientific} as ${t.data.name}, the taxon refused above` };
  if (t.status === 'ok' && a.reference && !a.own.own.has(t.data.name.toLowerCase())) {
    const g = await heldAtGbifElsewhere(f, t.data.name, { key: a.key, family: a.family }, a.reference);
    if (g.status !== 'ok') return g.status === 'none' ? { status: 'none' } : { ...g, detail: `iNaturalist files ${a.scientific} as ${t.data.name}, not checked with GBIF: ${g.detail}` };
    if (g.data) { refused.add(t.data.id); t = { status: 'none', detail: `not taken: ${g.data}` }; }
  }
  if (t.status !== 'none' || !a.sameType.length) return t;
  const o = await taxonByOlderNames(f, a.sameType, { accepted: a.scientific, heldElsewhere: a.heldElsewhere, own: a.own.own });
  if (o.status === 'ok' && refused.has(o.data.id)) return t;
  if (o.status !== 'none') return o;
  return o.detail && t.detail ? { status: 'none', detail: `${t.detail}; ${o.detail}` } : t.detail ? t : o;
}

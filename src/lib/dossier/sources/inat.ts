import type { JsonFetcher, FetchResult, SourceResult } from '../fetch';
import type { PageId } from '../../core/page-id';
import { licenceTag, isOpen } from '$core/licence';
import type { Photo } from '../schema';
import type { Reference } from '../reference';
import { isOwnName, epithetKey, type OwnNames } from '../own-names';
import { slip, slipStanding, transferTaken, placeholderPhoto, creditWithoutMail, type NameWord, type GbifNameMatch, type HeldNames } from '../photo-kind';
// The slip rule is one rule, in `photo-kind.ts`, for iNaturalist and Commons alike (REVIEW-TRIAGE-70, S-B7, S-C9, S-F13).
export { slipTaken, transferTaken, type NameWord } from '../photo-kind';

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
export async function taxonByOlderNames(f: JsonFetcher, names: readonly string[], rule: { accepted?: string; heldElsewhere?: HeldElsewhere; own?: ReadonlySet<string>; isOwn?: (name: string) => boolean } = {}): Promise<SourceResult<InatTaxon>> {
  const asked = [...new Set(names)].slice(0, 5);
  // The species' own names (`ownNames`; round seventy, second pass, triage-69 B7): with them, a taxon iNaturalist files
  // under a replaced name GBIF holds under this species is its own (Ceropegia mixta's Orbea variegata).
  const ownSet = new Set([rule.accepted ?? '', ...names, ...(rule.own ?? [])].map((n) => n.toLowerCase()).filter(Boolean));
  // In any spelling, where the caller reads the names so (`isOwnName`; round seventy, the owner's run).
  const own = { has: (n: string) => ownSet.has(n) || !!rule.isOwn?.(n) };
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
export type IdCheck = { active: true; name?: string; rank?: string } | { active: false; name?: string; rank?: string; current?: number };

/**
 * iNaturalist's own word on taxon ids, `IDS_PER_ASK` a request (round sixty-nine; triage-68 M5, R46-13). An id from
 * Wikidata or carried from the previous build can be one iNaturalist has since made inactive: six live dossiers asked
 * for photographs of a taxon that has none (Dypsis lutescens 133599, now Chrysalidocarpus lutescens 276548; Erythrina
 * caffra 119671, now 1588191). An inactive id names its successor when `current_synonymous_taxon_ids` names one taxon;
 * an id iNaturalist does not return is unknown, and taken as inactive with no successor. A refusal of any request is the
 * answer. Whether the successor is taken is `judgeIdTaxon`'s to say.
 */
export async function checkIds(f: JsonFetcher, ids: readonly number[]): Promise<FetchResult<Map<number, IdCheck>>> {
  const out = new Map<number, IdCheck>();
  const all = [...new Set(ids)];
  for (let i = 0; i < all.length; i += IDS_PER_ASK) {
    const part = all.slice(i, i + IDS_PER_ASK);
    const r = await f<{ results: Array<{ id: number; name?: string; rank?: string; is_active?: boolean; current_synonymous_taxon_ids?: number[] | null }> }>(`${INAT}/taxa/${part.join(',')}`);
    if (r.status === 'none') { part.forEach((id) => out.set(id, { active: false })); continue; }
    if (r.status !== 'ok') return r;
    for (const t of r.data.results ?? []) {
      const next = t.current_synonymous_taxon_ids ?? [];
      const rank = t.rank && t.rank !== 'species' ? { rank: t.rank } : {}; // said only below species, where it is read
      out.set(t.id, t.is_active !== false ? { active: true, name: t.name, ...rank } : { active: false, name: t.name, ...rank, ...(next.length === 1 ? { current: next[0] } : {}) });
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
  /** The observation's number, or its uuid where it came from iNaturalist's open data (`inat-open.ts`): either is its page's address. */
  id: number | string;
  /** The observation's uuid, which the API gives beside its number: a wild photograph's page is by it (round eighty), as the open data's is. */
  uuid?: string;
  observed_on?: string;
  place_guess?: string;
  captive?: boolean;
  quality_grade?: string;
  /** The observation's own taxon: the species, or a taxon below it that `taxon_id` takes in as a descendant. */
  taxon?: { id?: number; name?: string; rank?: string; ancestor_ids?: number[] };
  /** The taxon iNaturalist's identifiers agree on (the community taxon), and how many current identifications disagree with it. */
  community_taxon_id?: number | null;
  num_identification_disagreements?: number;
  /** Each identification, `current` while it is the identifier's latest for the observation. */
  identifications?: Array<{ current?: boolean; taxon?: { id?: number; ancestor_ids?: number[] }; taxon_id?: number }>;
  /** The observer: the API's and the open data's (`inat-open.ts`) both give the login, and the name where there is one. */
  user?: { login?: string | null; name?: string | null };
  photos: ObsPhoto[];
}

/**
 * The credit of a CC0 photograph, naming its observer (round eighty, agent I): iNaturalist's API writes a CC0 photograph's
 * `attribution` as "no rights reserved" alone, so 492 CC0 photographs on 58 of 109 sampled pages named no one, though
 * iNaturalist names the observer of each. The observer's name, or login where there is no name, as the API's CC BY lines
 * name them: "Alan Weakley, no rights reserved (CC0)". No "(c)": CC0 waives the copyright.
 */
export function cc0Credit(attribution: string, user: Observation['user']): string {
  const who = (user?.name ?? '').trim() || (user?.login ?? '').trim();
  return who && /^no rights reserved$/i.test(attribution.trim()) ? `${who}, no rights reserved (CC0)` : attribution;
}

/**
 * The cultivated photographs' request (round seventy-eight, the owner's rule of 2026-10-19). iNaturalist makes every
 * observation marked captive or cultivated "casual", never research grade ("isn't of a captive or cultivated organism"
 * is a condition of a verifiable observation: https://help.inaturalist.org/en/support/solutions/articles/151000169936),
 * so the request asked before, `quality_grade=research&captive=true`, found nothing: 3 such plant observations in all of
 * iNaturalist, and no cultivated photograph on any of 8,947 pages. Its filters, each as iNaturalist's API documents it
 * (https://api.inaturalist.org/v1/docs/, GET /observations; https://api.inaturalist.org/v1/swagger.json):
 *   - `captive=true`: "Captive or cultivated observations";
 *   - `taxon_id`: "Only show observations of these taxa and their descendants" (a descendant is read as the wild set's is);
 *   - `photos=true` and `photo_license=cc0,cc-by,cc-by-sa`: "Must have at least one photo with this license", each
 *     photograph's own `license_code` checked again on arrival (rule 4);
 *   - `identifications=most_agree`: "Identifications must meet these criteria", a first cut that `agreedCaptive` makes exact.
 */
export const cultivatedUrl = (taxonId: number, perPage: number) =>
  `${INAT}/observations?taxon_id=${taxonId}&photo_license=cc0,cc-by,cc-by-sa&photos=true&captive=true&identifications=most_agree&order_by=votes&per_page=${perPage}`;
/**
 * The words a cultivated-photograph record carries once asked by this rule (round seventy-eight): a record without them
 * was asked by the rule before, which could find nothing, and `--fill inat` asks it again.
 */
export const CULTIVATED_RULE = 'observations marked captive or cultivated whose identifications agree';
/** Whether a cultivated-photograph record was asked by today's rule and settled (answered, or answered with none). */
export const cultivatedSettled = (u?: { status?: string; detail?: string } | null): boolean => !!u && (u.status === 'ok' || u.status === 'none') && (u.detail ?? '').includes(CULTIVATED_RULE);
/** The wild photographs' request: research grade, not captive (unchanged). */
export const wildUrl = (taxonId: number, perPage: number) =>
  `${INAT}/observations?taxon_id=${taxonId}&photo_license=cc0,cc-by,cc-by-sa&photos=true&quality_grade=research&captive=false&order_by=votes&per_page=${perPage}`;

/**
 * Whether a captive observation's identifications agree, as the owner's rule says, read from the fields iNaturalist's
 * API gives each observation (the `Observation` and `Identification` models of its swagger): marked captive
 * (`captive`); at least two current identifications (`identifications[].current`); the community taxon is the
 * observation's taxon (`community_taxon_id` equal to `taxon.id`); and no identification disagrees, both by iNaturalist's
 * own count (`num_identification_disagreements` is 0) and by each current identification being of the observation's
 * taxon, a taxon above it (`taxon.ancestor_ids`, which holds the taxon itself) or one below it.
 */
export function agreedCaptive(o: Observation): boolean {
  const t = o.taxon?.id;
  if (o.captive !== true || t == null || o.community_taxon_id !== t || o.num_identification_disagreements !== 0) return false;
  const current = (o.identifications ?? []).filter((i) => i.current === true);
  if (current.length < 2) return false;
  const line = new Set(o.taxon?.ancestor_ids ?? [t]);
  return current.every((i) => { const id = i.taxon?.id ?? i.taxon_id; return id != null && (line.has(id) || (i.taxon?.ancestor_ids ?? []).includes(t)); });
}

/**
 * Whether an observation's taxon below species is another species of the reference (round seventy-two): iNaturalist's
 * `taxon_id` takes in every descendant, and it files taxa under a species that Kew accepts apart ("Epithelantha greggii
 * polycephala" is Kew's Epithelantha polycephala; "Crassula exilis cooperi" Kew's Crassula cooperi), so their
 * photographs reached the parent's page and led two of them. `held` is the reference's names, which hold such a name
 * whole as another species' older name (`infraHolders`); `key` is the species being built.
 */
export function observedAsAnother(taxon: Observation['taxon'], key: PageId | undefined, held?: HeldNames | null): boolean {
  const w = (taxon?.name ?? '').trim().split(/\s+/);
  if (w.length < 3 || !held?.infraHolders) return false;
  const others = held.infraHolders(w[0], w[1], w[w.length - 1]).filter((k) => k !== key);
  return others.length > 0 && !(key != null && held.infraHolders(w[0], w[1], w[w.length - 1]).includes(key));
}

/**
 * Photos are requested with the licence filter in the query, so nothing
 * non-commercial is ever downloaded, and each photo's own licence is checked
 * again on arrival. iNaturalist serves licensed photos from its AWS Open Data
 * bucket, which is the URL the API returns for them.
 */
/**
 * What `photos` reads an observation's taxon against: the species' key and the reference's names (`observedAsAnother`),
 * and Kew's placement of names below species (`kew`, from `KewInfra.placedElsewhere` bound to this page; round
 * seventy-two, C1), which names the species Kew places the taxon under, or null.
 */
/** `key` is the page's id (round seventy-eight), which the reference's names (`held`) give their holders by. */
export type PhotoOwner = { key?: PageId; held?: HeldNames | null; kew?: ((taxonName: string) => string | null) | null };

/** A photograph set's answer: as a fetch's, and a "none" that may say where it was read (round seventy-nine: the open data). */
export type PhotosResult = FetchResult<Photo[]> | { status: 'none'; detail: string };

export async function photos(f: JsonFetcher, taxonId: number, wild: boolean, perPage = 30, own?: PhotoOwner): Promise<PhotosResult> {
  const url = wild ? wildUrl(taxonId, perPage) : cultivatedUrl(taxonId, perPage);
  const r = await f<{ results: Observation[] }>(url);
  if (r.status !== 'ok') return r;
  // Where the answer was read, when not from the API itself (iNaturalist's open data; `heldWild`), for the record.
  const said = r.detail;
  const out: Photo[] = [];
  for (const o of r.data.results) {
    // A cultivated photograph only of an observation whose identifications agree (round seventy-eight; `agreedCaptive`).
    if (!wild && !agreedCaptive(o)) continue;
    if (observedAsAnother(o.taxon, own?.key, own?.held) || (o.taxon?.name && own?.kew?.(o.taxon.name))) continue;
    for (const p of o.photos) {
      const tag = licenceTag(p.license_code);
      if (!isOpen(tag) || (tag !== 'cc0' && tag !== 'by' && tag !== 'by-sa')) continue;
      // iNaturalist's stand-in for a photograph it has not yet processed is no photograph (round seventy-two, F8).
      if (placeholderPhoto(p.url)) continue;
      const base = p.url.replace(/\/square\.(\w+)$/, '');
      const ext = /\.(\w+)$/.exec(p.url)?.[1] ?? 'jpg';
      if (!p.attribution && tag !== 'cc0') continue; // no attribution line means no author to credit, which CC BY requires (round sixteen, 3)
      // A CC0 line names its observer (`cc0Credit`; round eighty). An e-mail address is never published as the author;
      // with nothing else left, a CC BY or CC BY-SA photograph is not taken (C10).
      const line = tag === 'cc0' ? cc0Credit(p.attribution ?? '', o.user) : p.attribution;
      const credit = line ? creditWithoutMail({ src: 'inat', licence: tag, attribution: line }) : null;
      if (line && !credit) continue;
      out.push({
        src: 'inat',
        id: String(p.id),
        url: `${base}/large.${ext}`,
        thumb: `${base}/medium.${ext}`,
        width: p.original_dimensions?.width ?? undefined,
        height: p.original_dimensions?.height ?? undefined,
        licence: tag,
        attribution: credit ?? 'author not stated, CC0',
        // A wild photograph's page by its observation's uuid, by either route (round eighty, agent V): the open data has no number.
        page: `https://www.inaturalist.org/observations/${wild && o.uuid ? o.uuid : o.id}`,
        captive: !wild,
        observedOn: o.observed_on ?? undefined,
        place: o.place_guess ?? undefined
      });
    }
  }
  if (said) return out.length ? { status: 'ok', data: out, detail: said } : { status: 'none', detail: said };
  return out.length ? { status: 'ok', data: out } : { status: 'none' };
}

/** The species a taxon of another name is judged for (`judgeTaxon`). */
export interface JudgeFor {
  key: number;
  scientific: string;
  /** The species' cited author: GBIF's same name by the same author spelt otherwise is this species' (`slipStanding`). */
  authorship?: string | null;
  family?: string;
  own: OwnNames;
  heldElsewhere?: HeldElsewhere;
  reference?: Reference;
}
/** A judgement of a taxon for a species: taken or not, and why, in words for the record. */
export type Verdict = { take: boolean; why: string };

export { epithetsAgree } from '../own-names';
import { epithetsAgree } from '../own-names';

type GbifMatch = { usageKey?: number; matchType?: string; rank?: string; status?: string; speciesKey?: number; species?: string; canonicalName?: string; alternatives?: GbifMatch[] };

/**
 * Whether an iNaturalist taxon whose name is not one of this species' own is this species (round seventy, the owner's
 * run; REVIEW-TRIAGE-69 B5 as revised, R47's rule). It is asked for every taxon an id was followed to, carried with, or
 * that iNaturalist's search files the name under. Round seventy's first rule took a followed taxon only under one of the
 * species' own names, and `--fill inat-ids` refused 35 right follows on the owner's corpus: this plant under iNaturalist's
 * genus (Zephyranthes formosissima for Sprekelia formosissima, Morella cerifera for Myrica cerifera) or spelling
 * (Psidium cattleyanum). Now the name is matched to GBIF's backbone (one request), and:
 *   - a name this reference holds as another species is refused;
 *   - one of the species' own names, in any spelling (`isOwnName`), is taken, and nothing is asked;
 *   - GBIF holding the name, exactly, as this species, as itself or as a synonym, takes it: Mammillaria geminata is GBIF's
 *     synonym of Mammillaria karwinskiana (a FUZZY match, GBIF's guess at a misspelling, is no answer since round
 *     eighty-two: a slip of one letter is the slip rule's below);
 *   - GBIF holding it, exactly, as another species of this reference refuses it (Pinguicula antarctica, Drimia physodes as
 *     Fusifilum physodes), and so does a name GBIF reads two ways, one of them another species here;
 *   - otherwise GBIF has no record of the name, or holds it as a species outside this reference: it is taken only as a
 *     genus transfer, its epithet this species' (`epithetsAgree`) and no other species of this family here having it
 *     (Thaumatophyllum bipinnatifidum, Echinofossulocactus ochoterenanus for Stenocactus ochoterenanus); Ficaria verna,
 *     which GBIF holds as a species of its own, is not Ranunculus ficaria's, and Echinofossulocactus ochoterenanus is not
 *     Stenocactus boedekerianus's.
 * With `lenient`, for a name the name search files the species under, only the refusals apply (a matched term is
 * iNaturalist's own synonymy, round sixty-eight's rule). With no reference, nothing can be read at GBIF, and a name not
 * the species' own is refused, as before.
 */
export async function judgeTaxon(f: JsonFetcher, name: string, s: JudgeFor, lenient = false): Promise<FetchResult<Verdict>> {
  const ok = (take: boolean, why: string): FetchResult<Verdict> => ({ status: 'ok', data: { take, why } });
  if (s.heldElsewhere?.(name)) return ok(false, `${name} is another species of this reference`);
  if (isOwnName(s.own, name)) return ok(true, `${name} is one of this species' names`);
  // The autonym below one of the species' own names is the species' type, never another species (Tricyrtis formosana
  // var. formosana).
  const w = name.split(/\s+/);
  if (w.length >= 3 && w[w.length - 1].toLowerCase() === w[1].toLowerCase() && isOwnName(s.own, binomialOf(name))) return ok(true, `${name} is ${binomialOf(name)} itself, at a lower rank`);
  if (!s.reference) return ok(lenient, lenient ? `filed by iNaturalist as ${name}` : `${name} is not one of this species' names`);
  const r = await f<GbifMatch>(`https://api.gbif.org/v1/species/match?verbose=true&kingdom=Plantae&name=${encodeURIComponent(name)}`);
  if (r.status !== 'ok' && r.status !== 'none') return r;
  const m: GbifMatch = r.status === 'ok' ? r.data : {};
  const exact = m.matchType === 'EXACT' && m.usageKey ? m.speciesKey : undefined;
  const alts = (m.alternatives ?? []).filter((a) => a.matchType === 'EXACT' && (a.canonicalName ?? '').toLowerCase() === name.toLowerCase() && a.speciesKey);
  // An EXACT match only (round eighty-two; the independent review's 5): GBIF's FUZZY match is its guess at a misspelling,
  // and /about/how's rules take a name only where GBIF holds that very name as this species. A slip of one letter is
  // decided below by the slip rule, which says so.
  if (exact === s.key) return ok(true, `GBIF holds ${name} as this species`);
  if (exact && s.reference.isSpecies(exact)) return ok(false, `GBIF holds ${name} as ${m.species ?? `species ${exact}`}, another species of this reference`);
  const elsewhere = alts.filter((a) => a.speciesKey !== s.key && s.reference!.isSpecies(a.speciesKey!));
  if (!exact && elsewhere.length) return ok(false, `GBIF reads ${name} as ${[...new Set(alts.map((a) => a.species))].join(' or ')}, ${alts.some((a) => a.speciesKey === s.key) ? 'this species or another of this reference' : 'another species of this reference'}`);
  if (!exact && alts.some((a) => a.speciesKey === s.key)) return ok(true, `GBIF holds ${name} as this species`);
  if (lenient) {
    // Round seventy's second pass: in a genus this reference does not hold, the one species of the family with the epithet.
    const [g, ep] = name.split(' ');
    const same = ep && !s.reference.hasGenus(g) ? s.reference.byEpithet(ep, s.family) : [];
    if (same.length === 1 && same[0].key !== s.key) return ok(false, `iNaturalist's ${name}, in a genus this reference does not hold, is ${same[0].name}, another species of this reference`);
    return ok(true, `filed by iNaturalist as ${name}`);
  }
  // Kew's word, where the backbone's is not this reference's (round seventy, the owner's run): Ficaria verna is Kew's
  // synonym of Ranunculus ficaria L.; Kew holds Callistemon lanceolatus and Hibiscus sabdariffa as synonyms of Melaleuca
  // citrina and Sabdariffa gossypiifolia, iNaturalist's taxa for them.
  const k = await kewSays(f, name, s);
  if (k.status !== 'ok') return k;
  if (k.data.verdict) return ok(k.data.verdict.take, k.data.verdict.why);
  // What Kew says of the name and of this species (round seventy-one; triage-70 S-B7, S-C9, S-F13): Lupinus longifolius
  // is not Acacia longifolia in another genus (`transferTaken`); Salvia aurea L. is not Salvia azurea spelt otherwise
  // (`slipStanding`, below).
  const word: NameWord = k.data.word;
  const ep = name.split(' ')[1] ?? '';
  const ours = s.scientific.split(' ')[1] ?? '';
  const where = exact ? `GBIF holds ${name} as ${m.species ?? 'a species'}, not of this reference` : `GBIF has no record of ${name}`;
  // An uploader's slip of this species' epithet (C's `slip`: one letter added, dropped, changed or moved, five letters or
  // more) is this species' too, where no species of the reference holds the name (round seventy, the owner's run:
  // Echinocereus chisosensis for E. chisoensis, Othonna cakilifolia for O. cakilefolia), and Kew and GBIF hold it as no
  // species of its own (`slipStanding`, the Commons rule; round seventy-one merge: Kew's rows and GBIF's exact match are
  // the ones read above, so nothing more is asked).
  const slipped = !epithetsAgree(ep, ours) && slip(ep, ours);
  if (slipped && (s.reference.keyOf(name) !== undefined || s.heldElsewhere?.(name))) return ok(false, `${name} is another species of this reference`);
  if (!epithetsAgree(ep, ours) && !slipped) return ok(false, `${where}, and its epithet is not this species'`);
  if (slipped) {
    const near = s.reference.byEpithet(ep, s.family).filter((e) => e.key !== s.key);
    if (near.length) return ok(false, `${where}, and ${near.map((e) => e.name).join(', ')} here ${near.length === 1 ? 'has' : 'have'} its epithet`);
    const a = slipStanding(name, { scientific: s.scientific, authorship: s.authorship, key: s.key, synonyms: [...s.own.own] }, k.data.rows, m.matchType === 'EXACT' ? (m as GbifNameMatch) : null);
    return ok(a.own, a.own ? `${where} (${a.why}): this species' epithet, spelt one letter otherwise` : `${a.why}: not taken`);
  }
  if (!transferTaken(word)) return ok(false, `Kew accepts ${name} and ${s.scientific} as two species`);
  const others = s.reference.byEpithet(ep, s.family).filter((e) => e.key !== s.key);
  if (others.length) return ok(false, `${where}, and ${others.map((e) => e.name).join(', ')} here ${others.length === 1 ? 'has' : 'have'} its epithet too`);
  return ok(true, `${where}: this species' epithet in another genus or spelling`);
}

type KewRow = { canonicalName?: string; scientificName?: string; authorship?: string; taxonomicStatus?: string; rank?: string; accepted?: string };
const WCVP = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';
const binomialOf = (n: string) => n.split(/\s+/).slice(0, 2).join(' ');

/**
 * What Kew (GBIF's copy of WCVP) says of an iNaturalist name the backbone does not place in this reference (round
 * seventy, the owner's run), or null when Kew settles nothing:
 *   - a synonym of this species, under any of its own names, is taken; a synonym of another species of this reference
 *     is refused, and so is a name Kew reads both ways;
 *   - otherwise, when Kew holds this species' name as a synonym of the name, the name is taken: Kew accepts what
 *     iNaturalist accepts.
 * Misapplied names are not read. One request, two when Kew accepts the name. With the verdict, what Kew holds of the
 * name and (when asked) of this species (`NameWord`), which the slip and genus-transfer rules read (round seventy-one).
 */
async function kewSays(f: JsonFetcher, name: string, s: JudgeFor): Promise<FetchResult<{ verdict?: Verdict; word: NameWord; rows: KewRow[] }>> {
  const rows = async (n: string) => {
    const r = await f<{ results?: KewRow[] }>(`https://api.gbif.org/v1/species?datasetKey=${WCVP}&name=${encodeURIComponent(n)}&limit=50`);
    if (r.status === 'none') return { status: 'ok' as const, data: [] as KewRow[] };
    if (r.status !== 'ok') return r;
    return { status: 'ok' as const, data: (r.data.results ?? []).filter((x) => (x.canonicalName ?? '').toLowerCase() === n.toLowerCase() && !/misapplied/i.test(x.taxonomicStatus ?? '')) };
  };
  const held = (xs: KewRow[]): NameWord['kew'] => (xs.some((x) => /^accepted$/i.test(x.taxonomicStatus ?? '')) ? 'accepted' : xs.length ? 'held' : 'none');
  const mine = await rows(name);
  if (mine.status !== 'ok') return mine;
  const under = [...new Set(mine.data.filter((x) => /synonym/i.test(x.taxonomicStatus ?? '') && x.accepted).map((x) => binomialOf(x.accepted!)))];
  const ours = under.filter((a) => isOwnName(s.own, a) || a.toLowerCase() === s.scientific.toLowerCase());
  const theirs = under.filter((a) => !ours.includes(a) && (s.heldElsewhere?.(a) || (s.reference?.keyOf(a) ?? s.key) !== s.key));
  const word: NameWord = { kew: held(mine.data) };
  if (theirs.length) return { status: 'ok', data: { word, rows: mine.data, verdict: { take: false, why: `Kew holds ${name} as a synonym of ${theirs.join(' and ')}, ${ours.length ? 'and of this species: read two ways' : 'another species of this reference'}` } } };
  if (ours.length) return { status: 'ok', data: { word, rows: mine.data, verdict: { take: true, why: `Kew holds ${name} as a synonym of ${ours[0]}` } } };
  if (word.kew !== 'accepted') return { status: 'ok', data: { word, rows: mine.data } };
  const back = await rows(s.scientific);
  if (back.status !== 'ok') return back;
  word.kewOurs = held(back.data);
  const to = back.data.find((x) => /synonym/i.test(x.taxonomicStatus ?? '') && x.accepted && binomialOf(x.accepted).toLowerCase() === binomialOf(name).toLowerCase());
  if (to) return { status: 'ok', data: { word, rows: mine.data, verdict: { take: true, why: `Kew holds ${s.scientific} as a synonym of ${to.accepted}` } } };
  return { status: 'ok', data: { word, rows: mine.data } };
}

/**
 * The taxon an id leads to, judged for a species (round seventy, the owner's run): the id itself when active (carried, or
 * given by Wikidata), or the one current taxon an inactive id names. Unknown or itself inactive, it is not taken; otherwise
 * `judgeTaxon` decides. A taxon below species that is taken, whose species is one of this species' own names, gives way
 * to the species' own taxon when iNaturalist has it by the name: Tricyrtis formosana's id followed to var. formosana
 * becomes 452309, Tricyrtis formosana.
 */
export async function judgeIdTaxon(f: JsonFetcher, to: number, check: IdCheck | undefined, s: JudgeFor): Promise<FetchResult<Verdict & { to: number; name?: string }>> {
  if (!check?.name) return { status: 'ok', data: { take: false, why: 'not known to iNaturalist', to } };
  if (!check.active) return { status: 'ok', data: { take: false, why: 'itself inactive', to, name: check.name } };
  const v = await judgeTaxon(f, check.name, s);
  if (v.status !== 'ok') return v;
  const binomial = check.name.split(' ').slice(0, 2).join(' ');
  if (v.data.take && check.rank && check.rank !== 'species' && isOwnName(s.own, binomial)) {
    const t = await taxon(f, binomial);
    if (t.status === 'refused' || t.status === 'error' || t.status === 'skipped') return t;
    if (t.status === 'ok' && t.data.name.toLowerCase() === binomial.toLowerCase() && t.data.rank === 'species') return { status: 'ok', data: { take: true, why: `${v.data.why}; iNaturalist's own taxon of the species, ${t.data.id}, taken for its ${check.rank}'s`, to: t.data.id, name: t.data.name } };
  }
  return { status: 'ok', data: { ...v.data, to, name: check.name } };
}

/** A species as `taxonFor` asks iNaturalist for it. */
export interface InatAsk {
  scientific: string;
  key: number;
  family?: string;
  /** Its own names (`ownNames`): the accepted, the same-type and the replaced names. */
  own: OwnNames;
  sameType: readonly string[];
  heldElsewhere?: HeldElsewhere;
  reference?: Reference;
  /** Taxa refused already (one an inactive id named, one GBIF holds as another species): never taken by the search. */
  refused?: Set<number>;
}

/**
 * iNaturalist's taxon for a species asked by name, the one way the build, `--fill inat-ids` and `--fill inat` ask it
 * (round seventy, second pass; triage-69 B1, B5, B7): the name search (`taxon`); a taxon already refused is not taken; a
 * taxon of another name that GBIF or Kew holds as another species of this reference is not taken (`judgeTaxon`), and
 * is added to `refused`; then the older names with the same type, five at most, each answer taken only when its name is
 * one of the species' own (`taxonByOlderNames`). A refusal is the answer.
 */
export async function taxonFor(f: JsonFetcher, a: InatAsk): Promise<SourceResult<InatTaxon>> {
  const refused = a.refused ?? new Set<number>();
  let t: SourceResult<InatTaxon> = await taxon(f, a.scientific, a.heldElsewhere);
  if (t.status === 'ok' && refused.has(t.data.id)) t = { status: 'none', detail: `not taken: iNaturalist files ${a.scientific} as ${t.data.name}, the taxon refused above` };
  if (t.status === 'ok' && a.reference && !isOwnName(a.own, t.data.name)) {
    const g = await judgeTaxon(f, t.data.name, { key: a.key, scientific: a.scientific, family: a.family, own: a.own, heldElsewhere: a.heldElsewhere, reference: a.reference }, true);
    if (g.status !== 'ok') return g.status === 'none' ? { status: 'none' } : { ...g, detail: `iNaturalist files ${a.scientific} as ${t.data.name}, not checked with GBIF: ${g.detail}` };
    if (!g.data.take) { refused.add(t.data.id); t = { status: 'none', detail: `not taken: ${g.data.why}` }; }
  }
  if (t.status !== 'none' || !a.sameType.length) return t;
  const o = await taxonByOlderNames(f, a.sameType, { accepted: a.scientific, heldElsewhere: a.heldElsewhere, own: a.own.own, isOwn: (n) => isOwnName(a.own, n) });
  if (o.status === 'ok' && refused.has(o.data.id)) return t;
  if (o.status !== 'none') return o;
  return o.detail && t.detail ? { status: 'none', detail: `${t.detail}; ${o.detail}` } : t.detail ? t : o;
}

/**
 * Whether an article Wikipedia gives under another title is this species' article (round seventy; REVIEW-TRIAGE-69 A1:
 * S-A1 to A7, S-F5, IND-2). Round sixty-nine read the lead's free text for it (`redirectIsThisSpecies`), and the reviews
 * found it taking another species' article: Persea americana for Agave americana (one epithet in another genus),
 * Drosera microphylla for D. macrophylla and Acer saccharum for A. saccharinum (one and two letters apart), the lead of "Rose" for
 * Rosa rubiginosa and of Peperomia and Mammillaria ("one of the largest genera", which the genus test did not read), and
 * Strombocactus disciformis' article, filed under the genus, for S. corregidorae. It also dropped three species' own
 * articles (Fenestraria, Bowiea, Harpephyllum: genera of one species) and the two-word common names ("Venus flytrap").
 *
 * The lead is no longer read. A title is taken only on a positive proof read from structured data, the four of
 * REVIEW-TRIAGE-69 A1, each named in the record (S-A6):
 *   - the title is this species' name or one of its older names at species rank (`name`, `older-name`), compared by
 *     `spellingKey`, never by edit distance: as written ("Ariocarpus scaphirostris"), or as the taxon name of the
 *     title's Wikidata item ("Date palm" is Phoenix dactylifera's article). Round seventy also reads as an older name a
 *     title whose item has the same type as this species' (Wikidata's basionym statements): GBIF's record of Ceropegia
 *     zebrina lists no Huernia zebrina, but Wikidata gives it as the basionym;
 *   - the title is this species' item's English article (`item`, its enwiki sitelink): "Venus flytrap";
 *   - the title's item is a product of this species (`product`, P1582 or P1672): "Apple", "Coconut";
 *   - the title's item is a genus in which Kew holds one accepted species, this species' parent (P171) or holding it
 *     by name (`monotypic-genus`): Welwitschia, Fenestraria, Bowiea, Harpephyllum.
 * Anything else is "none: Wikipedia redirects X to Y". The build (`summary`) and `--fill summaries` gather the same
 * facts with the same requests below and decide with `proofByName` and `proofByItem`, so a summary no longer flips
 * between fills (S-A5).
 *
 * Kew's count is read from WCVP as Kew publishes it through GBIF (dataset f382f0ce…, api.gbif.org), in the build and
 * the fill alike: Kew's own API (powo.science.kew.org/api) answers a script with a Cloudflare challenge (tried
 * 2026-10-12), and the WCVP files are read only by a build that has them, never by the fill. GBIF's backbone is not
 * used for it: it holds three accepted species of Strombocactus (one a misspelling), where Kew holds two.
 */
import type { JsonFetcher, SourceResult } from './fetch';
import { mwGet, mwError } from './sources/wikimedia';
import { spellingKey } from './epithet';

export type Proof = 'name' | 'older-name' | 'item' | 'product' | 'monotypic-genus';

/** The species a title is read against: its name, its stored older names, and its Wikidata item. */
export interface Who {
  name: string;
  synonyms: readonly string[];
  /** The species' Wikidata item (`ids.wikidata`). */
  item?: string;
}

/** What Wikidata says of the species' item: its English sitelink, parent taxa (P171), basionyms (P566), what it is a source of (P1672). */
export interface SpeciesItem { id: string; sitelink?: string; parents: string[]; basionyms: string[]; sourceOf: string[] }
/** What Wikidata says of the item an English title belongs to: products of (P1582), taxon names (P225), ranks (P105), basionyms (P566). */
export interface TitleItem { id: string; productOf: string[]; taxonNames: string[]; ranks: string[]; basionyms: string[] }
/** Kew's WCVP on a genus: how many accepted species it holds (0 when Kew holds no one accepted genus of the name), and the one, when one. */
export interface GenusCount { name: string; accepted: number; only?: string }

/**
 * GBIF's backbone on a binomial title (round seventy-b, A2): the species it holds the name under (its accepted species,
 * for a synonym), and whether the accepted usage is below species (a synonym of a variety). Null: GBIF holds no such name.
 */
export interface GbifName { species?: string; below: boolean; synonym: boolean }
/** Kew's WCVP on this species' name: its rows, each with its author and the accepted name it is held under. */
export interface KewRows { rows: Array<{ authorship?: string; status?: string; accepted?: string }> }

export interface Facts { species?: SpeciesItem | null; title?: TitleItem | null; genus?: GenusCount | null; gbif?: GbifName | null; kew?: KewRows | null }

/** Wikidata's item for the rank "genus". */
export const GENUS_RANK = 'Q34740';
/** Wikidata's item for the rank "species". */
export const SPECIES_RANK = 'Q7432';
/** Kew's World Checklist of Vascular Plants, as Kew publishes it through GBIF. */
export const WCVP_DATASET = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';

/** A Wikipedia title as compared: lower case, underscores read as spaces. */
export const titleKey = (t: string) => t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
/** The genus of a species' name: its first word, the hybrid sign left off. */
export const genusOf = (name: string) => name.replace(/×\s*/g, '').trim().split(/\s+/)[0];

const INFRA = /^(subsp|ssp|var|subvar|f|fo|forma|nothosubsp|nothovar)\.?$/;
/** A name as genus and epithet, the hybrid sign left off; null for anything that is not two such words and no more. */
function binomial(s: string): { genus: string; epithet: string } | null {
  const w = s.replace(/_/g, ' ').replace(/×\s*/g, '').trim().split(/\s+/);
  if (w.length !== 2 || !/^[A-Z][a-z-]+$/.test(w[0]) || !/^[a-z-]+$/.test(w[1])) return null;
  return { genus: w[0], epithet: w[1] };
}

type NameMatch = { proof: 'name' | 'older-name'; as: string; spelt: boolean };
/**
 * Whether a binomial is this species' name or one of its older names at species rank: the genus as written, the epithet
 * by `spellingKey` (another spelling or gender ending), never by edit distance. An older name below species ("Rebutia
 * canigueralii subsp. pulchra") names another species with its first two words, so it is not read.
 */
export function nameMatch(n: string, who: Pick<Who, 'name' | 'synonyms'>): NameMatch | null {
  const t = binomial(n);
  if (!t) return null;
  const same = (m: string) => {
    const b = binomial(m);
    return !!b && b.genus === t.genus && spellingKey(b.epithet) === spellingKey(t.epithet);
  };
  const exact = (m: string) => titleKey(m.replace(/×\s*/g, '')) === titleKey(n.replace(/×\s*/g, ''));
  if (same(who.name)) return { proof: 'name', as: who.name, spelt: !exact(who.name) };
  for (const s of who.synonyms) {
    const w = s.replace(/×\s*/g, '').trim().split(/\s+/);
    if (INFRA.test(w[2] ?? '')) continue;
    const two = w.slice(0, 2).join(' ');
    if (same(two)) return { proof: 'older-name', as: two, spelt: !exact(two) };
  }
  return null;
}
/** A binomial title that is neither this species' name nor an older name, by the stored names: GBIF is asked about it. */
export const binomialNotOurs = (title: string, who: Pick<Who, 'name' | 'synonyms'>): boolean => !!binomial(title) && !nameMatch(title, who);
/**
 * A title that is another species' name (round seventy, A2, R47-4; narrowed in round seventy-b): a binomial that is not
 * this species' name or an older name, which GBIF's backbone holds as another species, or under a variety or
 * subspecies of this one. Drosera montana's item (Q5308558) has "Drosera tomentosa" as its English sitelink, and GBIF
 * holds Drosera tomentosa under Drosera montana var. tomentosa: neither the sitelink nor the item's taxon name proves
 * it. A binomial GBIF does not hold at all ("Erythrina afra", the 2024 replacement of "caffra"; "Zephyranthes
 * formosissima") is not another species, and the other proofs read it; nor is a two-word common name ("Venus
 * flytrap"), which GBIF does not hold either. Round seventy's first rule refused any binomial in one of the species'
 * genera, and so took Erythrina caffra's and Rhododendron kanehirae's sitelinks from them.
 */
export function foreignBinomial(title: string, who: Pick<Who, 'name' | 'synonyms'>, gbif: GbifName | null | undefined): boolean {
  if (!binomialNotOurs(title, who) || !gbif) return false;
  return gbif.below || !gbif.species || !nameMatch(gbif.species, who);
}
const nameWords = (m: NameMatch) => (m.proof === 'name' ? (m.spelt ? "another spelling of this species' name" : "this species' name") : `${m.spelt ? 'another spelling of ' : ''}an older name of this species (${m.as})`);

/** The name proof, read offline: the title itself as this species' name or an older name ("Ariocarpus scaphirostris"). */
export function proofByName(title: string, who: Pick<Who, 'name' | 'synonyms'>): (NameMatch & { words: string }) | null {
  const m = nameMatch(title, who);
  return m ? { ...m, words: nameWords(m) } : null;
}

/**
 * The proofs read from Wikidata and Kew, on facts already gathered (`gatherFacts`), in this order. Pure, so the build
 * and the fill decide alike on the same answers (S-A5).
 *   1. `item`: the title is this species' item's English sitelink: "Venus flytrap" for Dionaea muscipula. Not when the
 *      title is another species' name (`foreignBinomial`; R47-4, "Drosera tomentosa" for Drosera montana).
 *   2. `name`, `older-name`: the title's item is the taxon (P225) of this species' name or an older name: "Date palm"
 *      (Phoenix dactylifera), "Loquat" (Eriobotrya japonica, an older name of Rhaphiolepis bibas).
 *   3. `older-name`, by type: the title's item, a species, and this species' item share a type in Wikidata's basionym
 *      statements (P566): one is the other's basionym, or both have the same one. "Huernia zebrina" is Ceropegia
 *      zebrina's basionym; "Anemonoides nemorosa" has Anemone nemorosa as its own.
 *   4. `product`: the title's item names this species' item as the taxon it is a product of (P1582), or this species'
 *      item names it as a product (P1672), and it names no taxon but this species and its parent: "Apple" names Malus
 *      domestica and Malus; "Plum" names several species, and is no one species' article.
 *   5. `monotypic-genus`: the title's item is a genus (P105), Kew's WCVP holds exactly one accepted species in it, and
 *      either this species' item names it as its parent (P171) and it is this species' genus by name ("Fenestraria"),
 *      or Kew's one species is this species' name or an older name ("Serissa", whose one species at Kew is Serissa
 *      japonica, an older name of Buchozia japonica).
 */
export function proofByItem(title: string, who: Who, facts: Facts): { proof: Proof; words: string } | null {
  const q = who.item;
  const sp = q && facts.species?.id === q ? facts.species : null;
  const ti = facts.title ?? null;
  const foreign = foreignBinomial(title, who, facts.gbif);
  if (!foreign && sp?.sitelink && titleKey(sp.sitelink) === titleKey(title)) return { proof: 'item', words: `the English article of this species' Wikidata item (${q})` };
  const g0 = facts.gbif;
  // GBIF holds the title as this species: a synonym of it, as GBIF's backbone has it now (the stored list may be older).
  if (!foreign && binomialNotOurs(title, who) && g0?.species && !g0.below && nameMatch(g0.species, who)) return { proof: 'older-name', words: `a name GBIF holds as ${g0.synonym ? 'a synonym of ' : ''}this species` };
  const kew = !foreign && binomialNotOurs(title, who) ? sameTypeAtKew(title, who, facts.kew) : null;
  if (!ti) return kew;
  // A title that is another species' name is not proved by the name its item carries (R47-4: Q5308558, titled "Drosera
  // tomentosa", carries the name Drosera montana); only a shared type can prove it.
  for (const n of foreign ? [] : ti.taxonNames) {
    const m = nameMatch(n, who);
    if (m) return { proof: m.proof, words: `whose Wikidata item (${ti.id}) is the taxon ${n}, ${nameWords(m)}` };
  }
  if (sp && ti.ranks.includes(SPECIES_RANK)) {
    const shared = sp.basionyms.includes(ti.id) ? ti.id : ti.basionyms.includes(sp.id) ? sp.id : sp.basionyms.find((b) => ti.basionyms.includes(b));
    if (shared) return { proof: 'older-name', words: `a name of this species with the same type: Wikidata gives ${shared} as the basionym of ${shared === ti.id ? sp.id : shared === sp.id ? ti.id : `${sp.id} and ${ti.id}`}` };
  }
  if (q) {
    const others = ti.productOf.filter((p) => p !== q && !sp?.parents.includes(p));
    if (!others.length && (ti.productOf.includes(q) || !!sp?.sourceOf.includes(ti.id))) return { proof: 'product', words: `whose Wikidata item (${ti.id}) is a product of this species' item (${q})` };
  }
  const g = facts.genus;
  if (g && ti.ranks.includes(GENUS_RANK) && ti.taxonNames.includes(g.name) && g.accepted === 1) {
    if (sp?.parents.includes(ti.id) && g.name === genusOf(who.name)) return { proof: 'monotypic-genus', words: `this species' genus (${ti.id}), which holds one accepted species in Kew's WCVP` };
    const m = g.only ? nameMatch(g.only, who) : null;
    if (m) return { proof: 'monotypic-genus', words: `the genus ${g.name} (${ti.id}), whose one accepted species in Kew's WCVP is ${m.proof === 'name' && !m.spelt ? 'this species' : `${g.only}, ${nameWords(m)}`}` };
  }
  return kew;
}

/** The author of a combination's basionym: the bracketed author at the head of its authorship, "(L.) Herb." → "L.". */
const basionymAuthor = (authorship: string | undefined) => /^\(([^)]+)\)/.exec((authorship ?? '').trim())?.[1]?.replace(/\s+/g, '');
/**
 * The same type by Kew's names (round seventy-b, A2): Kew's WCVP holds this species' name, in every row it has, as a
 * synonym of the title, and the two are combinations of one basionym: the same epithet (by `spellingKey`) and the same
 * bracketed author. Kew holds Sprekelia formosissima (L.) Herb. under Zephyranthes formosissima (L.) Z.H.Feng, both
 * from Amaryllis formosissima L.; Wikidata's item for the latter states no basionym, and Wikipedia's article is
 * sitelinked to the genus Sprekelia's item. A synonym by Kew alone, with another type, is a lump, and proves nothing
 * (Agave vivipara Arruda is Furcraea hexapetala at Kew).
 */
function sameTypeAtKew(title: string, who: Who, kew: KewRows | null | undefined): { proof: Proof; words: string } | null {
  const t = binomial(title);
  const own = binomial(who.name);
  if (!t || !own || !kew?.rows.length || spellingKey(t.epithet) !== spellingKey(own.epithet)) return null;
  const heads = kew.rows.map((r) => ({ r, acc: r.accepted ?? '' }));
  if (!heads.every(({ r, acc }) => r.status === 'SYNONYM' && acc.startsWith(`${title} `))) return null;
  const a = basionymAuthor(heads[0].r.authorship);
  if (!a || !heads.every(({ r, acc }) => basionymAuthor(r.authorship) === a && basionymAuthor(acc.slice(title.length + 1)) === a)) return null;
  return { proof: 'older-name', words: `a name of this species with the same type: Kew's WCVP holds ${who.name} ${heads[0].r.authorship} under ${heads[0].acc}, both from a basionym by ${a}` };
}

/** Whether a title's genus count is wanted: its item is a genus with a taxon name. */
const genusWanted = (ti: TitleItem | null | undefined): ti is TitleItem => !!ti && ti.ranks.includes(GENUS_RANK) && ti.taxonNames.length === 1;

/* ---------- The requests: the same in the build and the fill ---------- */

type Claims = Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>>;
type Entity = { id?: string; missing?: string; claims?: Claims; sitelinks?: Record<string, { title: string }> };
const itemIds = (e: Entity, p: string) => (e.claims?.[p] ?? []).map((c) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id).filter((v): v is string => typeof v === 'string');
const strs = (e: Entity, p: string) => (e.claims?.[p] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter((v): v is string => typeof v === 'string');

const WD = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json';

/** Species items, fifty a request: sitelink, P171, P566, P1672. A request Wikidata did not answer is returned as it came. */
export async function speciesItems(f: JsonFetcher, ids: readonly string[]): Promise<{ status: 'ok'; data: Map<string, SpeciesItem | null>; unanswered?: Set<string>; failure?: Unanswered }> {
  const out = new Map<string, SpeciesItem | null>();
  const all = [...new Set(ids)];
  // A batch Wikidata does not answer (after `mwGet`'s waits on maxlag and the fetch layer's on 429) leaves its own ids
  // unanswered, not the others' (round seventy-b: one lagged batch left 234 summaries of the owner's run not checked).
  const unanswered = new Set<string>();
  let failure: Unanswered | undefined;
  for (let i = 0; i < all.length; i += 50) {
    const part = all.slice(i, i + 50);
    const r = await mwGet<{ entities?: Record<string, Entity> }>(f, `${WD}&ids=${part.join('|')}&props=claims|sitelinks&sitefilter=enwiki&maxlag=5`);
    const err = r.status === 'ok' ? mwError(r.data) : r.status === 'none' ? 'no answer' : r.detail;
    if (r.status !== 'ok' || err) {
      for (const q of part) unanswered.add(q);
      failure = r.status === 'refused' ? { status: 'refused', detail: r.detail, source: 'Wikidata' } : { status: 'error', detail: `wikidata ${r.status === 'ok' ? err : r.status === 'none' ? 'no answer' : r.detail}`, source: 'Wikidata' };
      continue;
    }
    for (const q of part) {
      const e = r.data.entities?.[q];
      out.set(q, !e || 'missing' in e ? null : { id: q, sitelink: e.sitelinks?.enwiki?.title, parents: itemIds(e, 'P171'), basionyms: itemIds(e, 'P566'), sourceOf: itemIds(e, 'P1672') });
    }
  }
  return { status: 'ok', data: out, ...(unanswered.size ? { unanswered, failure } : {}) };
}

/**
 * The items English titles belong to, fifty a request (`sites=enwiki&titles=`): P1582, P225, P105, P566. An entity is taken
 * for a title only when its own enwiki sitelink is that title, so an answer never stands for a title it was not given.
 */
export async function titleItems(f: JsonFetcher, titles: readonly string[]): Promise<SourceResult<Map<string, TitleItem | null>>> {
  const out = new Map<string, TitleItem | null>();
  const all = [...new Set(titles)];
  for (let i = 0; i < all.length; i += 50) {
    const part = all.slice(i, i + 50);
    const r = await mwGet<{ entities?: Record<string, Entity> }>(f, `${WD}&sites=enwiki&titles=${part.map((t) => encodeURIComponent(t)).join('|')}&props=claims|sitelinks&sitefilter=enwiki&maxlag=5`);
    if (r.status !== 'ok') return r.status === 'none' ? { status: 'error', detail: 'wikidata: no answer' } : r;
    const err = mwError(r.data);
    if (err) return { status: 'error', detail: `wikidata ${err}` };
    const byTitle = new Map<string, TitleItem>();
    for (const [id, e] of Object.entries(r.data.entities ?? {})) {
      const t = e.sitelinks?.enwiki?.title;
      if (!t || 'missing' in e || !/^Q\d+$/.test(id)) continue;
      byTitle.set(titleKey(t), { id, productOf: itemIds(e, 'P1582'), taxonNames: strs(e, 'P225'), ranks: itemIds(e, 'P105'), basionyms: itemIds(e, 'P566') });
    }
    for (const t of part) out.set(t, byTitle.get(titleKey(t)) ?? null);
  }
  return { status: 'ok', data: out };
}

/**
 * Kew's WCVP, through GBIF: the one accepted genus of the name (`/species?name=`, exact), then its accepted species
 * counted, with the first two named. No accepted genus of the name, or two, is a count of 0: no proof.
 */
export async function genusCount(f: JsonFetcher, genus: string): Promise<SourceResult<GenusCount>> {
  const g = await f<{ results?: Array<{ key?: number; canonicalName?: string; rank?: string; taxonomicStatus?: string }> }>(`https://api.gbif.org/v1/species?datasetKey=${WCVP_DATASET}&name=${encodeURIComponent(genus)}&limit=20`);
  if (g.status !== 'ok') return g.status === 'none' ? { status: 'ok', data: { name: genus, accepted: 0 } } : g;
  const rows = (g.data.results ?? []).filter((r) => r.canonicalName === genus && r.rank === 'GENUS' && r.taxonomicStatus === 'ACCEPTED' && r.key);
  if (rows.length !== 1) return { status: 'ok', data: { name: genus, accepted: 0 } };
  const r = await f<{ count?: number; results?: Array<{ canonicalName?: string }> }>(`https://api.gbif.org/v1/species/search?datasetKey=${WCVP_DATASET}&highertaxonKey=${rows[0].key}&rank=SPECIES&status=ACCEPTED&limit=2`);
  if (r.status !== 'ok') return r.status === 'none' ? { status: 'error', detail: 'gbif: no answer' } : r;
  if (typeof r.data.count !== 'number') return { status: 'error', detail: 'gbif: no count' };
  const only = r.data.count === 1 ? r.data.results?.[0]?.canonicalName : undefined;
  return { status: 'ok', data: { name: genus, accepted: r.data.count, ...(only ? { only } : {}) } };
}

/** GBIF's backbone on a binomial (`species/match`, strict, plants): the URL B's `heldAtGbifElsewhere` asks too. */
export async function gbifName(f: JsonFetcher, name: string): Promise<SourceResult<GbifName | null>> {
  const r = await f<{ usageKey?: number; matchType?: string; status?: string; species?: string; speciesKey?: number; acceptedUsageKey?: number }>(`https://api.gbif.org/v1/species/match?strict=true&kingdom=Plantae&name=${encodeURIComponent(name)}`);
  if (r.status === 'none') return { status: 'ok', data: null };
  if (r.status !== 'ok') return r;
  const d = r.data;
  if (!d.usageKey || d.matchType === 'NONE' || d.matchType === 'HIGHERRANK') return { status: 'ok', data: null };
  const synonym = /SYNONYM/.test(d.status ?? '');
  const accepted = synonym ? d.acceptedUsageKey : d.usageKey;
  let below = !!d.speciesKey && !!accepted && accepted !== d.speciesKey;
  if (below) {
    // Under a subspecies or variety: the autonym (Ceropegia zebrina subsp. zebrina, under which GBIF holds Huernia
    // zebrina) is the species' own type, so is the species; another (Drosera montana var. tomentosa) is part of it.
    const u = await f<{ canonicalName?: string }>(`https://api.gbif.org/v1/species/${accepted}`);
    if (u.status !== 'ok' && u.status !== 'none') return u;
    const w = (u.status === 'ok' ? u.data.canonicalName ?? '' : '').split(/\s+/);
    if (w.length >= 3 && w[w.length - 1] === w[1]) below = false;
  }
  return { status: 'ok', data: { species: d.species, below, synonym } };
}

/** Kew's WCVP, through GBIF: the rows of this species' name at species rank. */
export async function kewRows(f: JsonFetcher, name: string): Promise<SourceResult<KewRows>> {
  const r = await f<{ results?: Array<{ canonicalName?: string; rank?: string; authorship?: string; taxonomicStatus?: string; accepted?: string }> }>(`https://api.gbif.org/v1/species?datasetKey=${WCVP_DATASET}&name=${encodeURIComponent(name)}&limit=20`);
  if (r.status === 'none') return { status: 'ok', data: { rows: [] } };
  if (r.status !== 'ok') return r;
  const rows = (r.data.results ?? []).filter((x) => x.canonicalName === name && (x.rank ?? 'SPECIES') === 'SPECIES').map((x) => ({ authorship: x.authorship, status: x.taxonomicStatus, accepted: x.accepted }));
  return { status: 'ok', data: { rows } };
}

/** A source that did not answer while a proof was read: which, and what it said. */
export type Unanswered = { status: 'refused' | 'error' | 'skipped'; detail: string; source: 'Wikidata' | 'GBIF' | "GBIF (Kew's WCVP)" };

/**
 * The facts for one title, asked only as far as they are needed: the species' item (unless `pre` has it), then the
 * title's item, then, for a genus, Kew's count of its species. Shared by `summary` and `--fill summaries` (S-A5).
 */
export async function gatherFacts(f: JsonFetcher, title: string, who: Who, pre: Facts = {}): Promise<{ facts: Facts } | Unanswered> {
  const facts: Facts = { ...pre };
  // A binomial that is not the species' name is asked of GBIF first: another species' name is refused whatever else holds.
  if (facts.gbif === undefined && binomialNotOurs(title, who)) {
    const g = await gbifName(f, title);
    if (g.status !== 'ok') return unanswered(g, 'GBIF');
    facts.gbif = g.data;
  }
  if (who.item && facts.species === undefined) {
    const s = await speciesItems(f, [who.item]);
    if (s.unanswered?.size) return s.failure ?? { status: 'error', detail: 'wikidata: no answer', source: 'Wikidata' };
    facts.species = s.data.get(who.item) ?? null;
  }
  if (proofByItem(title, who, { ...facts, title: null, kew: null })) return { facts };
  if (facts.title === undefined) {
    const t = await titleItems(f, [title]);
    if (t.status !== 'ok') return unanswered(t, 'Wikidata');
    facts.title = t.data.get(title) ?? null;
  }
  if (facts.genus === undefined && genusWanted(facts.title) && !proofByItem(title, who, { ...facts, genus: null })) {
    const c = await genusCount(f, facts.title.taxonNames[0]);
    if (c.status !== 'ok') return unanswered(c, "GBIF (Kew's WCVP)");
    facts.genus = c.data;
  }
  if (facts.kew === undefined && binomialNotOurs(title, who) && !foreignBinomial(title, who, facts.gbif) && !proofByItem(title, who, { ...facts, kew: null })) {
    const k = await kewRows(f, who.name);
    if (k.status !== 'ok') return unanswered(k, "GBIF (Kew's WCVP)");
    facts.kew = k.data;
  }
  return { facts };
}
function unanswered(r: SourceResult<unknown>, source: Unanswered['source']): Unanswered {
  const status = r.status === 'refused' || r.status === 'skipped' ? r.status : 'error';
  return { status, detail: 'detail' in r && r.detail ? r.detail : `${source.toLowerCase()}: no answer`, source };
}

/** The record of a summary set aside because Wikipedia's article is under another title. */
export const redirected = (asked: string, got: string) => `Wikipedia redirects ${asked.replace(/_/g, ' ')} to ${got.replace(/_/g, ' ')}`;
/**
 * The record's opening for a title read by the rule: a redirect, or, when the title asked (the item's sitelink, or a
 * title carried from the last build) is itself another species' name, the article as asked (round seventy, A2).
 */
export const titled = (asked: string, got: string) => (titleKey(asked) === titleKey(got) ? `Wikipedia's article ${got.replace(/_/g, ' ')}` : redirected(asked, got));
/** The record of a sitelink or carried title that is another species' name, with no proof (A2, R47-4). */
export const notOurs = (got: string) => `Wikipedia's article ${got.replace(/_/g, ' ')} is under a name that is neither this species' nor one of its older names`;

/** The result of reading a title: the proof and the record's words, no proof, or a source that did not answer. */
export type TitleVerdict = { status: 'ok'; proof: Proof; words: string } | { status: 'none' } | Unanswered;

/**
 * Reads one title end to end: the name first (offline), then, with a fetcher, the facts and the item proofs. Without a
 * fetcher, a title the name does not settle is `skipped`: not asked.
 */
export async function titleProof(f: JsonFetcher | null, title: string, who: Who, pre: Facts = {}): Promise<TitleVerdict> {
  const n = proofByName(title, who);
  if (n) return { status: 'ok', proof: n.proof, words: n.words };
  if (!f) return { status: 'skipped', detail: 'not asked: offline', source: 'Wikidata' };
  const g = await gatherFacts(f, title, who, pre);
  if (!('facts' in g)) return g;
  const p = proofByItem(title, who, g.facts);
  return p ? { status: 'ok', ...p } : { status: 'none' };
}

/** What the record says when a source did not answer while a redirect's proof was read (rule 2: not checked, never none). */
export const notChecked = (asked: string, got: string, u: Unanswered) =>
  `${titled(asked, got)}; whether it is this species' article was not checked: ${u.source} ${u.status === 'refused' ? 'refused' : u.status === 'skipped' ? 'not asked' : 'did not answer'} (${u.detail})`;

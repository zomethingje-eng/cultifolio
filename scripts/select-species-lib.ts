/**
 * The species rule (round seventy-eight; the owner's decisions 1 and 5 of 2026-10-19), the pure part: which GBIF
 * datasets count as living collections, how a source's name is matched to a species Kew accepts, which species are
 * selected, and the form of scripts/species-list.txt. scripts/select-species.ts does the reading and writing; this file
 * is unit-tested (tests/unit/r78s-*.test.ts).
 *
 * The rule: every species Kew accepts with at least three cultivated records, counting iNaturalist observations marked
 * captive or cultivated and GBIF living-specimen records of living collections together, plus every accepted species of
 * the collector genera (scripts/specialist-genera.txt) taken whole, plus every species already in the reference (the
 * owner's clause of 2026-10-19: no page of the reference falls out; a page Kew cannot place stays by its GBIF key).
 */

import { gbifPage, kewPage, type PageId } from '../src/lib/core/page-id';
import { ownByAuthor } from '../src/lib/dossier/authors';
import { abbreviates } from '../src/lib/dossier/extra-keys';

// ---------------------------------------------------------------------------------------------------------------------
// 1. The datasets: a living collection is counted, a genebank is not.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Words that name a genebank or its holdings. Sourced to FAO's Genebank Standards for Plant Genetic Resources for Food
 * and Agriculture (FAO, Rome, 2014; https://www.fao.org/agriculture/crops/thematic-sitemap/theme/seeds-pgr/gene-bank-standards/en/),
 * whose vocabulary is "genebank" (seed, field and in vitro genebanks), "germplasm", "plant genetic resources", "seed
 * bank"/"seed collection" and "passport data" (the FAO/Bioversity Multi-Crop Passport Descriptors, by which a genebank
 * describes its accessions), and to the same words in the languages GBIF's living-specimen datasets are written in
 * (Spanish "banco de germoplasma", German "Genbank", and so on). Matched on whole words, case and accents aside.
 */
export const GENEBANK_WORDS: Array<[RegExp, string]> = [
  [/\bgene ?banks?\b|\bgenbank\b|\bbanco de genes\b|\bbanque de genes\b/, 'genebank'],
  [/\bgermplasm\b|\bgermoplasma\b|\bgermplasme\b|\bkeimplasma\b/, 'germplasm'],
  [/\bseed ?banks?\b|\bseed ?vaults?\b|\bbanco de semillas\b|\bbanque de (?:graines|semences)\b|\bsamenbank\b|\bfrobank(?:en)?\b/, 'seed bank'],
  [/\bseed (?:collections?|accessions?)\b|\bcoleccion(?:es)? de semillas\b/, 'seed collection'],
  [/\bcryo ?banks?\b|\bcryopreserv\w*\b|\bin vitro (?:plant )?(?:culture )?(?:collections?|genebanks?)\b/, 'in vitro or cryopreserved collection'],
  [/\b(?:plant )?genetic resources?\b|\bpgr\b|\bpgrfa\b|\brecursos fitogeneticos\b|\brecursos geneticos\b|\bressources genetiques\b|\bgenetische ressourcen\b/, 'genetic resources'],
  [/\bpassport data\b|\bdatos de pasaporte\b/, 'passport data'],
  [/\bdna (?:and tissue )?banks?\b|\btissue banks?\b/, 'DNA or tissue bank']
];

/**
 * Words that name a living collection of plants. Sourced to Botanic Gardens Conservation International's definition, "a
 * botanic garden is an institution holding documented collections of living plants for the purposes of scientific
 * research, conservation, display and education" (BGCI, https://www.bgci.org/about/botanic-gardens-and-plant-conservation/),
 * whose own terms are "botanic garden" and "arboretum" and "living collection", and to the same words in the languages
 * the datasets are written in. Matched on whole words, case and accents aside.
 */
export const LIVING_COLLECTION_WORDS: Array<[RegExp, string]> = [
  [/\bbotanic(?:al)? gardens?\b|\bbotanic garden\b|\bjardins? botaniques?\b|\bjardin(?:es)? botanicos?\b|\bjardim botanico\b|\bbotanischer? garten\b|\bbotanische tuin\b|\borto botanico\b|\bhortus botanicus\b|\bbotanisk(?:a)? (?:have|hage|tradgard|tradgarden)\b|\bogrod botaniczny\b|\bbotanicka zahrada\b/, 'botanic garden'],
  [/\barboret(?:um|a|o)\b/, 'arboretum'],
  [/\bliving (?:plant )?collections?\b|\blebendsammlung(?:en)?\b|\bcoleccion(?:es)? vivas?\b|\bnational plant collections?\b/, 'living collection'],
  [/\bgardens?\b|\bjardin(?:es|s)?\b|\bjardim\b|\bgarten\b|\bhortus\b|\bparque botanico\b/, 'garden']
];

export interface DatasetFacts {
  key: string;
  title: string;
  description: string;
  type: string;
  publisher: string;
  keywords: string[];
}

export type DatasetVerdict = { side: 'excluded' | 'counted' | 'not decided'; reason: string };

/** Lower case, accents off, markup and punctuation to spaces, so the word lists match whole words. */
export function plain(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function firstHit(words: Array<[RegExp, string]>, fields: Array<[string, string]>): string | null {
  for (const [label, text] of fields) {
    const p = ` ${plain(text)} `;
    for (const [re, word] of words) {
      const m = re.exec(p);
      if (m) return `${label} has "${m[0].trim()}" (${word})`;
    }
  }
  return null;
}

/**
 * THE DATASET RULE, in one sentence: a dataset is excluded when its title, keywords, publisher's name or description uses
 * a word for a genebank (GENEBANK_WORDS); otherwise it is counted when its title, keywords or publisher's name names a
 * living collection (LIVING_COLLECTION_WORDS); otherwise it is not decided, and not counted.
 *
 * The genebank words are looked for everywhere, the description included, so a botanic garden's seed bank is excluded
 * with the rest; the living-collection words only in the title, keywords and publisher, so a survey that mentions a
 * garden in passing is not counted. A dataset's type (OCCURRENCE or SAMPLING_EVENT) is recorded and not used: both kinds
 * hold collections and surveys alike.
 */
export function classifyDataset(d: DatasetFacts): DatasetVerdict {
  const gene = firstHit(GENEBANK_WORDS, [['title', d.title], ['keywords', d.keywords.join(' ; ')], ['publisher', d.publisher], ['description', d.description]]);
  if (gene) return { side: 'excluded', reason: gene };
  const living = firstHit(LIVING_COLLECTION_WORDS, [['title', d.title], ['keywords', d.keywords.join(' ; ')], ['publisher', d.publisher]]);
  if (living) return { side: 'counted', reason: living };
  return { side: 'not decided', reason: 'neither a genebank word anywhere nor a living-collection word in the title, keywords or publisher' };
}

export const DATASET_RULE =
  'A GBIF dataset of living-specimen plant records is excluded when its title, keywords, publisher or description uses a word for a genebank (genebank, germplasm, seed bank or seed collection, plant genetic resources, passport data: FAO Genebank Standards 2014), counted when it does not and its title, keywords or publisher names a living collection (botanic garden, arboretum, living collection: BGCI), and otherwise not decided and not counted.';

// ---------------------------------------------------------------------------------------------------------------------
// 2. Kew's names (WCVP), and the match of a source's name to a species Kew accepts (rule 3).
// ---------------------------------------------------------------------------------------------------------------------

export interface KewRow {
  id: string;
  rank: string;
  status: string;
  family: string;
  genus: string;
  name: string;
  authors: string;
  acc: string;
  parent: string;
  powo: string;
  /** A genus or species hybrid sign in Kew's row. */
  hybrid: boolean;
}

export interface Kew {
  rows: Map<string, KewRow>;
  /** Kew's rows of species rank, by their words (see `words`). */
  byWords: Map<string, KewRow[]>;
  /** POWO's identifier (an IPNI number such as 530017-1) → Kew's plant_name_id. */
  byPowo: Map<string, string>;
}

/** The words of a name: the hybrid sign, spacing and case set aside. */
export const words = (n: string) => n.replace(/×\s*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

/** One pass over wcvp_names.csv (pipe-delimited, header first), a line at a time, so a reader can stream the file. */
export function kewLoader(): { kew: Kew; add(line: string): void } {
  const kew: Kew = { rows: new Map(), byWords: new Map(), byPowo: new Map() };
  let h: Record<string, number> | null = null;
  return {
    kew,
    add(line: string) {
      if (!line) return;
      const x = line.split('|');
      if (!h) {
        h = Object.fromEntries(x.map((k, i) => [k, i]));
        for (const k of ['plant_name_id', 'taxon_rank', 'taxon_status', 'family', 'genus', 'taxon_name', 'taxon_authors', 'accepted_plant_name_id', 'parent_plant_name_id', 'powo_id'])
          if (!(k in h)) throw new Error(`not a WCVP names file: no ${k} column`);
        return;
      }
      const r: KewRow = {
        id: x[h.plant_name_id],
        rank: x[h.taxon_rank],
        status: x[h.taxon_status],
        family: x[h.family],
        genus: x[h.genus],
        name: x[h.taxon_name],
        authors: x[h.taxon_authors],
        acc: x[h.accepted_plant_name_id],
        parent: x[h.parent_plant_name_id],
        powo: x[h.powo_id],
        hybrid: !!((h.genus_hybrid != null && x[h.genus_hybrid]) || (h.species_hybrid != null && x[h.species_hybrid]))
      };
      kew.rows.set(r.id, r);
      if (r.powo) kew.byPowo.set(r.powo, r.id);
      if (r.rank === 'Species') {
        const w = words(r.name);
        const list = kew.byWords.get(w);
        if (list) list.push(r);
        else kew.byWords.set(w, [r]);
      }
    }
  };
}

export function loadKew(lines: Iterable<string>): Kew {
  const l = kewLoader();
  for (const line of lines) l.add(line);
  return l.kew;
}

const INFRA = new Set(['Subspecies', 'Variety', 'Form', 'Subvariety', 'Subform', 'Convariety', 'proles', 'nothosubsp.', 'nothovar.', 'lusus', 'microgène']);

/**
 * The species a Kew row leads to: its own id when it is an accepted species, else its accepted name's; an accepted taxon
 * below species leads to its parent species. "hybrid:<id>" when it leads to an artificial hybrid, which Kew does not
 * hold as an accepted species. null when it leads nowhere (unplaced, misapplied, or an accepted name of another rank).
 */
export function speciesOf(kew: Kew, id: string): string | null {
  let r = kew.rows.get(id);
  if (!r) return null;
  if (r.status === 'Misapplied') return null;
  if (r.status !== 'Accepted' && r.status !== 'Artificial Hybrid') {
    r = r.acc ? kew.rows.get(r.acc) : undefined;
    if (!r || (r.status !== 'Accepted' && r.status !== 'Artificial Hybrid')) return null;
  }
  if (r.rank === 'Species') return r.status === 'Accepted' ? r.id : `hybrid:${r.id}`;
  if (INFRA.has(r.rank)) {
    const p = r.parent ? kew.rows.get(r.parent) : undefined;
    if (p && p.rank === 'Species') return p.status === 'Accepted' ? p.id : p.status === 'Artificial Hybrid' ? `hybrid:${p.id}` : null;
  }
  return null;
}

export type Match =
  | { id: string; how: 'strict' | 'author' | 'framework' | 'deviation' }
  | { id: null; refused: string };

export const REFUSALS = {
  noRow: 'no Kew row of these words',
  nowhere: 'Kew rows only unplaced, misapplied or leading to no species',
  hybrid: 'Kew holds it as an artificial hybrid, not an accepted species',
  two: 'Kew rows lead to two or more species',
  notSpecies: 'not of species rank',
  deviation: 'a deviation from POWO that is not one-to-one',
  notInKew: 'a GBIF key with no species name in the backbone file'
} as const;

const authorKey = (a: string) => a.replace(/[\s.]/g, '').toLowerCase();

/**
 * The strict rule (rule 3): a name is compared with Kew's rows of species rank of the same words, misapplied rows left
 * out; each row leads to a species (`speciesOf`); the name is taken only when every row leads to the same accepted
 * species. With an author (GBIF's backbone gives one), Kew's rows of the same words and author are tried first, and one
 * species so reached is taken ("author").
 */
export function matchStrict(kew: Kew, name: string, author?: string | null): Match {
  const all = kew.byWords.get(words(name));
  if (!all?.length) return { id: null, refused: REFUSALS.noRow };
  const rs = all.filter((r) => r.status !== 'Misapplied');
  if (author) {
    const same = new Set(rs.filter((r) => authorKey(r.authors) === authorKey(author)).map((r) => speciesOf(kew, r.id)).filter((t): t is string => !!t));
    if (same.size === 1) {
      const t = [...same][0];
      if (!t.startsWith('hybrid:')) return { id: t, how: 'author' };
    }
  }
  const targets = new Set(rs.map((r) => speciesOf(kew, r.id)).filter((t): t is string => !!t));
  if (!targets.size) return { id: null, refused: REFUSALS.nowhere };
  if (targets.size > 1) return { id: null, refused: REFUSALS.two };
  const t = [...targets][0];
  if (t.startsWith('hybrid:')) return { id: null, refused: REFUSALS.hybrid };
  return { id: t, how: 'strict' };
}

/** iNaturalist's taxon id of vascular plants (Tracheophyta), the taxon its POWO framework is attached to. */
export const TRACHEOPHYTA = 211194;

/**
 * One relationship of iNaturalist's taxon framework, as its JSON form gives it (TaxonFrameworkRelationshipsController,
 * index.json: relationship, taxa, external_taxa).
 */
export interface FrameworkRelationship {
  relationship: string;
  taxa: Array<{ id: number; name: string; rank: string }>;
  external_taxa: Array<{ name: string; url?: string | null }>;
}

export type Deviation = { kind: 'refuse'; relationship: string } | { kind: 'map'; relationship: string; name: string; powo: string | null };

/**
 * iNaturalist's listed deviations from POWO, by iNaturalist taxon id. A one-to-one or many-to-one relationship names the
 * one POWO taxon the iNaturalist taxon belongs to, which is then taken ("deviation"); one-to-many, many-to-many and an
 * iNaturalist taxon POWO does not hold are refused. Matches and alternate positions (same name, another parent) are not
 * deviations and change nothing.
 */
export function deviationsOf(rels: FrameworkRelationship[]): Map<number, Deviation> {
  const out = new Map<number, Deviation>();
  for (const r of rels) {
    if (r.relationship === 'match' || r.relationship === 'alternate_position' || r.relationship === 'not_internal') continue;
    for (const t of r.taxa) {
      if ((r.relationship === 'one_to_one' || r.relationship === 'many_to_one') && r.external_taxa.length === 1) {
        const e = r.external_taxa[0];
        const powo = /urn:lsid:ipni\.org:names:([0-9]+-[0-9]+)/.exec(e.url ?? '')?.[1] ?? null;
        out.set(t.id, { kind: 'map', relationship: r.relationship, name: e.name, powo });
      } else out.set(t.id, { kind: 'refuse', relationship: r.relationship });
    }
  }
  return out;
}

export interface InatTaxon { id: number; name: string; rank: string; ancestor_ids?: number[]; is_active?: boolean }

/**
 * An iNaturalist name to a species Kew accepts. The strict rule first. Past "two or more species", iNaturalist's taxon
 * framework for vascular plants, sourced to Plants of the World Online (Kew's data) down to subspecies, says that an
 * active iNaturalist name outside its listed deviations is POWO's accepted name: so where Kew accepts exactly one species of
 * those words, that species is taken ("framework"). A listed deviation decides first, when the list is had.
 */
export function matchInat(kew: Kew, t: InatTaxon, deviations: Map<number, Deviation> | null): Match {
  if (t.rank !== 'species' && t.rank !== 'hybrid') return { id: null, refused: REFUSALS.notSpecies };
  // An inactive taxon (an older name iNaturalist has replaced, still holding observations) is outside the framework's
  // current names: the strict rule alone.
  const inFramework = t.is_active !== false && (t.ancestor_ids ?? []).includes(TRACHEOPHYTA);
  const dev = inFramework ? deviations?.get(t.id) : undefined;
  if (dev) {
    if (dev.kind === 'refuse') return { id: null, refused: `${REFUSALS.deviation} (${dev.relationship})` };
    const viaPowo = dev.powo ? kew.byPowo.get(dev.powo) : undefined;
    const target = viaPowo ? speciesOf(kew, viaPowo) : null;
    if (target && !target.startsWith('hybrid:')) return { id: target, how: 'deviation' };
    const byName = matchStrict(kew, dev.name);
    return byName.id !== null ? { id: byName.id, how: 'deviation' } : byName;
  }
  const strict = matchStrict(kew, t.name);
  if (strict.id !== null || !inFramework || strict.refused !== REFUSALS.two) return strict;
  const accepted = (kew.byWords.get(words(t.name)) ?? []).filter((r) => r.status === 'Accepted');
  if (accepted.length === 1) return { id: accepted[0].id, how: 'framework' };
  return strict;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. GBIF's backbone: a GBIF species key to its name and author, and Kew's species to one GBIF key.
// ---------------------------------------------------------------------------------------------------------------------

export interface BackboneName {
  key: string;
  name: string;
  author: string;
  status: string;
  /** The backbone's family and order of the usage, as keys (round eighty, A): what `familyRefuses` reads. */
  familyKey?: string;
  orderKey?: string;
}

/**
 * A line of GBIF's backbone export `simple.txt` (tab-separated, no header: id, parent, basionym, is_synonym, status,
 * rank, nom_status, constituent, origin, source taxon, kingdom, phylum, class, order, family, genus, species, name id,
 * scientific name, canonical name, …): a plant name of species rank, its author being the scientific name less the
 * canonical name. null for any other line.
 */
export function backboneLine(line: string): BackboneName | null {
  const x = line.split('\t');
  if (x.length < 20 || x[5] !== 'SPECIES' || x[10] !== '6') return null;
  const canonical = x[19] === '\\N' ? '' : x[19];
  if (!canonical) return null;
  const sci = x[18];
  // "Aloe vera L., 1753": the year after the author is not part of it.
  // A hybrid's scientific name carries its sign ("Plagianthus ×cymosus Cockayne & Allan") where its canonical name does not
  // (round eighty, X): read without the sign, so a hybrid's author is read too.
  const bare = sci.startsWith(canonical) ? sci : sci.replace(/×\s*/g, '');
  const author = bare.startsWith(canonical) ? bare.slice(canonical.length).trim().replace(/,\s*\d{4}$/, '') : '';
  const k = (v: string | undefined) => (v && v !== '\\N' ? v : undefined);
  return { key: x[0], name: canonical, author, status: x[4], ...(k(x[14]) ? { familyKey: x[14] } : {}), ...(k(x[13]) ? { orderKey: x[13] } : {}) };
}

/**
 * The backbone's families and genera (round eighty, A), from the same export: each accepted family's name to its order,
 * and each accepted genus's name to its family. `familyRefuses` reads them.
 */
export interface BackboneTaxa {
  /** Lower-case family name → the order keys of the backbone's accepted families of that name. */
  familyOrders: Map<string, Set<string>>;
  /** Lower-case genus name → the order keys of the backbone's accepted genera of that name (through their families). */
  genusOrders: Map<string, Set<string>>;
}
/** A family or genus line of the export (kingdom 6), read for `BackboneTaxa`; null for any other. */
export function backboneHigher(line: string): { rank: 'FAMILY' | 'GENUS'; key: string; name: string; status: string; orderKey?: string } | null {
  const x = line.split('\t');
  if (x.length < 20 || (x[5] !== 'FAMILY' && x[5] !== 'GENUS') || x[10] !== '6') return null;
  const name = x[19] === '\\N' ? '' : x[19];
  if (!name) return null;
  return { rank: x[5] as 'FAMILY' | 'GENUS', key: x[0], name, status: x[4], ...(x[13] && x[13] !== '\\N' ? { orderKey: x[13] } : {}) };
}
/** `BackboneTaxa` from the export's family and genus lines, accepted ones only. */
export function backboneTaxa(lines: Iterable<ReturnType<typeof backboneHigher>>): BackboneTaxa {
  const t: BackboneTaxa = { familyOrders: new Map(), genusOrders: new Map() };
  for (const h of lines) {
    if (!h || h.status !== 'ACCEPTED' || !h.orderKey) continue;
    const m = h.rank === 'FAMILY' ? t.familyOrders : t.genusOrders;
    const n = h.name.toLowerCase();
    m.set(n, (m.get(n) ?? new Set()).add(h.orderKey));
  }
  return t;
}

/**
 * Whether GBIF's usage is another plant than Kew's species by where GBIF files it (round eighty, A; review-w 3): GBIF
 * files the usage in another order than the one it gives Kew's family, while GBIF's own accepted genus of that name is in
 * Kew's family's order. Xanthoceras sorbifolium Bunge (Kew, Sapindaceae) was given 9479204, GBIF's "Xanthoceras sorbifolium
 * (A.Braun) Holub", which GBIF files under a doubtful genus Xanthoceras in Poaceae (Poales), while GBIF's accepted genus
 * Xanthoceras Bunge is in Sapindaceae (Sapindales): the page showed Poaceae and three records of that name. A family GBIF
 * places otherwise in the same order (Thesiaceae for Kew's Santalaceae, Onocleaceae for Aspleniaceae) is not this, nor is
 * a genus GBIF itself files elsewhere (Bdallophytum: GBIF's genus and species both in Rafflesiaceae, Kew's in Cytinaceae).
 * With nothing to read either way, nothing is refused. Of the list's 46,022 keyed lines, only Xanthoceras sorbifolium's is
 * refused (measured on the live index's GBIF families with GBIF's orders for the 437 families, 2026-10-22).
 */
export function familyRefuses(row: Pick<KewRow, 'family' | 'genus'>, b: Pick<BackboneName, 'orderKey'>, taxa: BackboneTaxa): boolean {
  const kewOrders = taxa.familyOrders.get(row.family.toLowerCase());
  if (!b.orderKey || !kewOrders?.size || kewOrders.has(b.orderKey)) return false;
  const genus = taxa.genusOrders.get(row.genus.replace(/^×\s*/, '').toLowerCase());
  return !!genus && [...genus].some((o) => kewOrders.has(o));
}

/**
 * Whether Kew's file reads GBIF's usage, by GBIF's own author, as a name of another species than `row` (round eighty, X;
 * agent R's finding): Kew's rows of the usage's words that its author reads to (`ownByAuthor`, or a shorter abbreviation
 * of Kew's, as round seventy-three's rule reads a usage), and none of them leads to `row`'s species. GBIF's
 * "Gymnosporia acuminata (L.fil.) Szyszyl." is Kew's illegitimate "Gymnosporia acuminata (L.f.) Szyszył.", filed under
 * Maytenus acuminata, while the list's Gymnosporia acuminata is Kew's "Hook.f. ex M.A.Lawson": a homonym, another plant,
 * whose records the page would have read. A usage whose author Kew's file reads to no row says nothing either way, and is
 * not refused by this.
 */
export function kewReadsElsewhere(kew: Kew, b: BackboneName, row: KewRow): boolean {
  const rows = (kew.byWords.get(words(b.name)) ?? []).filter((r) => r.status !== 'Misapplied');
  const own = ownByAuthor(rows, b.author || undefined, (r) => r.authors);
  const read = own.length ? own : rows.length === 1 && abbreviates(b.author, rows[0].authors) ? rows : [];
  return read.length > 0 && !read.some((r) => speciesOf(kew, r.id) === row.id);
}

/**
 * Kew's accepted species to GBIF's key, only where it is unambiguous: of the backbone's species of the same words, the
 * one GBIF accepts; of several accepted, the one of Kew's author; where GBIF accepts none, the one it holds as doubtful,
 * or of several doubtful the one of Kew's author. Else null ("-" in the list). GBIF's accepted key comes first because it
 * is the one GBIF files the species' occurrences under (Aloysia virgata: accepted 7297208 "(Ruiz & Pav.) Juss.", and a
 * doubtful 7775299 of Kew's author). With Kew's file (round eighty), a usage Kew reads as another species' name
 * (`kewReadsElsewhere`) is none of these: a homonym's key is never taken, and the species reads no key unless a usage of
 * its own author is one. With the backbone's families and genera (`taxa`, round eighty, A), a usage GBIF files outside
 * Kew's genus's order is none of these either (`familyRefuses`).
 */
export function gbifKeyFor(row: KewRow, backboneByWords: Map<string, BackboneName[]>, kew?: Kew, taxa?: BackboneTaxa): string | null {
  // Round eighty (X): with Kew's file, a usage Kew reads as another species' name is not this species' key. And (A) with the
  // backbone's families and genera, a usage GBIF files in another order than Kew's genus is not either (`familyRefuses`).
  const all = (backboneByWords.get(words(row.name)) ?? []).filter((b) => (!kew || !kewReadsElsewhere(kew, b, row)) && (!taxa || !familyRefuses(row, b, taxa)));
  for (const status of ['ACCEPTED', 'DOUBTFUL']) {
    const of = all.filter((b) => b.status === status);
    if (of.length === 1) return of[0].key;
    if (of.length > 1) {
      const same = of.filter((b) => authorKey(b.author) === authorKey(row.authors));
      return same.length === 1 ? same[0].key : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. The selection, and the list's form.
// ---------------------------------------------------------------------------------------------------------------------

export const MIN_RECORDS = 3;

export interface Selected {
  /** Kew's plant_name_id; null only for a page of the reference that matches no species Kew accepts. */
  id: string | null;
  name: string;
  author: string;
  family: string;
  inat: number;
  gbif: number;
  /** Selected by the counts (at least MIN_RECORDS together). */
  byCounts: boolean;
  /** Selected as a species of a collector genus. */
  byGenus: boolean;
  /** Selected as a species already in the reference (the owner's clause of 2026-10-19). */
  byReference: boolean;
  gbifKey: string | null;
}

/**
 * The accepted species of the collector genera, as derive-names.ts takes them today: Kew's accepted species of those
 * genera, hybrids (a hybrid sign in Kew's row) left out.
 */
export function collectorSpecies(kew: Kew, genera: Set<string>): string[] {
  const out: string[] = [];
  for (const r of kew.rows.values()) if (r.rank === 'Species' && r.status === 'Accepted' && !r.hybrid && genera.has(r.genus)) out.push(r.id);
  return out;
}

/** A page of the reference as it is: its GBIF key (today's page key), its name, author and family, and Kew's entry it cites. */
export interface ReferencePage {
  /** Its GBIF key; null for a page without one (round seventy-nine), which Kew's id alone names. */
  key: number | null;
  name: string;
  author: string;
  family: string;
  kewEntry: string | null;
  /** Where its range is read (the dossier's `distribution.via`): the Kew entry, as Kew's file cites it, and how (round eighty). */
  via?: { entry?: string; kind?: string } | null;
}

/**
 * The list's species without a GBIF key that a page of the reference holds already (round eighty, X; agent R's finding):
 * a page with a GBIF key and no Kew entry of its own (one of the reference's pages that match no species Kew accepts,
 * listed by its GBIF key with "-" for plant_name_id), whose range the build reads through a Kew entry (`distribution.via`:
 * Kew's spelling of its name, Kew's synonym of it, or an older name GBIF gives it that Kew accepts), holds that entry's
 * plant. A line without a GBIF key for that same entry would be a second page of it, built from Kew's file, beside the
 * page that holds its GBIF records and Kew's range already. Such lines are left out: the list leaves them out when it is
 * written, and the build when it reads a list made before. By Kew's entry as Kew's file cites it, its name and author,
 * never by the words alone. Returns each such line's plant_name_id → the page's GBIF key and the entry.
 */
export function heldThroughRange(list: ReadonlyArray<{ kewId: string | null; name: string; author: string; gbifKey: number | null }>, pages: ReadonlyArray<Pick<ReferencePage, 'key' | 'kewEntry' | 'via'>>): Map<string, { key: number; entry: string }> {
  const byEntry = new Map<string, number>();
  for (const p of pages) if (p.key != null && !p.kewEntry && p.via?.entry && p.via.kind !== 'own') byEntry.set(p.via.entry, p.key);
  const out = new Map<string, { key: number; entry: string }>();
  for (const e of list) {
    if (e.gbifKey != null || !e.kewId) continue;
    const label = `${e.name}${e.author ? ` ${e.author}` : ''}`;
    const key = byEntry.get(label);
    if (key != null) out.set(e.kewId, { key, entry: label });
  }
  return out;
}

/**
 * The reference's pages to Kew's accepted species, as round seventy-five measured them: the Kew entry the page cites
 * (name.kew.entry), followed to its accepted species; else the page's name by the strict rule. A page that reaches no
 * accepted species stays a page of its own, by its GBIF key ("unmatched"). Two pages may reach one species.
 */
export function referenceSpecies(kew: Kew, pages: ReferencePage[]): { byKew: Map<string, ReferencePage[]>; unmatched: ReferencePage[] } {
  const byKew = new Map<string, ReferencePage[]>();
  const unmatched: ReferencePage[] = [];
  for (const p of pages) {
    const viaEntry = p.kewEntry ? speciesOf(kew, p.kewEntry) : null;
    let id: string | null = viaEntry && !viaEntry.startsWith('hybrid:') ? viaEntry : null;
    if (!id) {
      const m = matchStrict(kew, p.name);
      id = m.id;
    }
    if (id) byKew.set(id, [...(byKew.get(id) ?? []), p]);
    else unmatched.push(p);
  }
  return { byKew, unmatched };
}

export function select(
  kew: Kew,
  inat: Map<string, number>,
  gbif: Map<string, number>,
  collector: string[],
  keyOf: (r: KewRow) => string | null,
  k = MIN_RECORDS,
  reference: { byKew: Map<string, ReferencePage[]>; unmatched: ReferencePage[] } = { byKew: new Map(), unmatched: [] }
): Selected[] {
  const ids = new Set<string>();
  for (const id of new Set([...inat.keys(), ...gbif.keys()])) if ((inat.get(id) ?? 0) + (gbif.get(id) ?? 0) >= k) ids.add(id);
  const genus = new Set(collector);
  for (const id of genus) ids.add(id);
  for (const id of reference.byKew.keys()) ids.add(id);
  const out: Selected[] = [];
  for (const id of ids) {
    const r = kew.rows.get(id);
    if (!r || r.rank !== 'Species' || r.status !== 'Accepted') continue; // never: every id here is an accepted species
    const i = inat.get(id) ?? 0, g = gbif.get(id) ?? 0;
    // A species held by one page of the reference keeps that page's GBIF key, the key it is built from today; any other
    // species has GBIF's key only where Kew's name reaches one unambiguously.
    const held = reference.byKew.get(id);
    // A page without a GBIF key (round seventy-nine) holds none to keep: the backbone's rule is read again, as for any other.
    const gbifKey = held?.length === 1 && held[0].key != null ? String(held[0].key) : keyOf(r);
    out.push({ id, name: r.name, author: r.authors, family: r.family, inat: i, gbif: g, byCounts: i + g >= k, byGenus: genus.has(id), byReference: !!held, gbifKey });
  }
  // A page Kew's checklist cannot place stays as it is: by its own GBIF key, under its own name.
  // A page without a GBIF key that reaches no species Kew accepts has neither id to be listed by: left out (Kew's file has
  // moved under it; the build's id rule refuses it too).
  for (const p of reference.unmatched)
    if (p.key != null) out.push({ id: null, name: p.name, author: p.author, family: p.family, inat: 0, gbif: 0, byCounts: false, byGenus: false, byReference: true, gbifKey: String(p.key) });
  return out.sort((a, b) => a.name.localeCompare(b.name) || Number(a.id ?? 0) - Number(b.id ?? 0) || Number(a.gbifKey ?? 0) - Number(b.gbifKey ?? 0));
}

/** The first line of scripts/species-list.txt, by which a reader knows the file. */
export const LIST_MAGIC = '# Cultifolio species list, v1';
export const LIST_COLUMNS = ['plant_name_id', 'name', 'author', 'family', 'reason', 'gbif_key'] as const;

export const REASON_REFERENCE = 'already in the reference';

export function reasonOf(s: Pick<Selected, 'inat' | 'gbif' | 'byCounts' | 'byGenus' | 'byReference'>): string {
  const parts: string[] = [];
  if (s.byCounts) parts.push(`inat ${s.inat} + gbif ${s.gbif}`);
  if (s.byGenus) parts.push('collector genus');
  if (s.byReference) parts.push(REASON_REFERENCE);
  return parts.join('; ');
}

/**
 * The list: the magic line, the header lines (each "# "), the column line, then one tab-separated line a species. A
 * page of the reference that matches no species Kew accepts has "-" for its plant_name_id and its GBIF key, which is
 * then never "-"; its page id is "g<GBIF key>".
 */
export function formatSpeciesList(header: string[], list: Selected[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ');
  return [
    LIST_MAGIC,
    ...header.map((h) => `# ${h}`),
    `# ${LIST_COLUMNS.join('\t')}`,
    ...list.map((s) => [s.id ?? '-', clean(s.name), clean(s.author), clean(s.family), reasonOf(s), s.gbifKey ?? '-'].join('\t'))
  ].join('\n') + '\n';
}

export interface ListEntry {
  /** Kew's plant_name_id, or null for a page of the reference that matches no species Kew accepts. */
  kewId: string | null;
  /** The page's id in the form `--index` gives it (`src/lib/core/page-id.ts`): "k<plant_name_id>", or "g<GBIF key>" where there is no Kew id. */
  pageId: PageId;
  name: string;
  author: string;
  family: string;
  reason: string;
  /** GBIF's backbone key, or null where Kew's name matches none unambiguously (never null without a Kew id). */
  gbifKey: number | null;
}

export const isSpeciesList = (text: string) => text.startsWith(LIST_MAGIC);

/** The list read back; throws on a line not of its form, so a list cut off or edited by hand is never half read. */
export function parseSpeciesList(text: string): ListEntry[] {
  if (!isSpeciesList(text)) throw new Error(`not a species list: the first line is not "${LIST_MAGIC}"`);
  const out: ListEntry[] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || l.startsWith('#')) continue;
    const c = l.split('\t');
    if (c.length !== LIST_COLUMNS.length || !/^(\d+|-)$/.test(c[0]) || !/^(× )?[A-Z]/.test(c[1]) || !c[4] || !/^(\d+|-)$/.test(c[5]))
      throw new Error(`species list line ${i + 1} is not "${LIST_COLUMNS.join(' <tab> ')}": ${l.slice(0, 120)}`);
    if (c[0] === '-' && (c[5] === '-' || c[4] !== REASON_REFERENCE))
      throw new Error(`species list line ${i + 1}: an entry with no Kew id must be a page already in the reference, with its GBIF key: ${l.slice(0, 120)}`);
    const pageId = c[0] === '-' ? gbifPage(Number(c[5])) : kewPage(c[0]);
    if (seen.has(pageId)) throw new Error(`species list line ${i + 1}: ${c[0] === '-' ? 'GBIF key' : 'plant_name_id'} ${c[0] === '-' ? c[5] : c[0]} twice`);
    seen.add(pageId);
    out.push({ kewId: c[0] === '-' ? null : c[0], pageId, name: c[1], author: c[2], family: c[3], reason: c[4], gbifKey: c[5] === '-' ? null : Number(c[5]) });
  }
  return out;
}

/**
 * The build's jobs from the list (scripts/build-dossiers.ts): one a species, its name, its page id and the GBIF key it is
 * built by. The build is by GBIF key and `--index` names each page by the id rule (round seventy-eight, the merge of S and
 * I), so a species with a GBIF key is built by it. One with none here (round seventy-nine, the owner's decision 1) is
 * built by the GBIF key of the page on disk under its `pageId`, if there is one, else from Kew's file by its `kewId`
 * (`src/lib/dossier/build-kew.ts`), its GBIF records read only under the keys Kew's synonymy gives it (round seventy-nine,
 * `scripts/extra-keys-kew.txt`), else not checked. It is never matched by its name (rule 3: the backbone
 * gave no one key for it).
 */
export function jobsFromList(list: ListEntry[]): Array<{ name: string; key?: number; pageId: PageId; kewId: string | null; gbifKey: number | null }> {
  return list.map((e) => ({ name: e.name, key: e.gbifKey ?? undefined, pageId: e.pageId, kewId: e.kewId, gbifKey: e.gbifKey }));
}

/**
 * What GBIF's occurrence download is asked for from a list (scripts/bulk-fetch.ts; round seventy-eight, a need of S): each
 * species' GBIF key from the list's last column, by its name as `keys.json` holds it, with no name matched; the species
 * the list gives no GBIF key are named, and left out (rule 3).
 */
/**
 * The download's keys for the list's species without a GBIF key (round seventy-nine; the owner's decision on K's offer):
 * the keys Kew's synonymy gives them (`scripts/extra-keys-kew.txt`, parsed), for the species the list still has without
 * one. Each is written into bulk/keys.json under "<page id> by <GBIF's name>", so the build finds it in the download.
 */
export function kewDownloadKeysOf(list: ListEntry[], kewKeys: ReadonlyArray<{ pageId?: string; key: number; label: string }>): { byName: Record<string, number>; keys: number[]; pages: number } {
  const keyless = new Set(list.filter((e) => e.gbifKey == null).map((e) => e.pageId as string));
  const taken = kewKeys.filter((k) => k.pageId && keyless.has(k.pageId));
  const byName: Record<string, number> = {};
  for (const k of taken) byName[`${k.pageId} by ${k.label}`] = k.key;
  return { byName, keys: [...new Set(taken.map((k) => k.key))], pages: new Set(taken.map((k) => k.pageId)).size };
}
export function downloadKeysOf(list: ListEntry[]): { byName: Record<string, number>; keys: number[]; none: string[] } {
  const byName: Record<string, number> = {};
  for (const e of list) if (e.gbifKey != null) byName[e.name] = e.gbifKey;
  return { byName, keys: [...new Set(list.flatMap((e) => (e.gbifKey != null ? [e.gbifKey] : [])))], none: list.filter((e) => e.gbifKey == null).map((e) => e.name) };
}

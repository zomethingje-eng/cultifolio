/**
 * Kew's names for each page, read once and offline from Kew's own files (round seventy-two, A; REVIEW-TRIAGE-71 A1, A2,
 * A5, A8, C1, C4). `--fill kew-names --bulk <dir>` writes, from `wcvp_names.csv`:
 *
 *   - `name.kew`: the entry Kew accepts for the plant the page is (its `plant_name_id`, or '' where Kew's rows do not
 *     decide), Kew's other names for that plant (`synonyms`, words only), the page's stored older names that Kew accepts
 *     as species of their own (`acceptedElsewhere`: "Allium porrum L." on Allium ampeloprasum), and the day of Kew's file.
 *     Absent on a dossier not yet filled: a reader treats absent as not read, never as none (`kewSynonyms`).
 *   - `name.cited`, with `name.authorship`: where Kew's row for the number the page links is the page's own words by
 *     another citation, the page cites Kew's (Ixora coccinea L., not the backbone's "Comm. ex Lam."), and `cited` keeps the
 *     backbone's citation and the Kew row cited.
 *   - the common names that are a binomial Kew or the reference holds ("Babiana odorata" on Babiana villosula) are dropped.
 *   - a Wikidata row that says the links are "none" where Kew holds the name only under another author says so (Ceropegia
 *     macrocarpa (Sprenger) Bruyns: "Kew holds this name only under another author; no POWO link").
 *
 * Pure: the script streams Kew's file into a `KewNamesIndex` (`scripts/kew-names-load.ts`), and the tests build one from
 * rows. Nothing here asks a source.
 */
import { ownByAuthor, plainlyAnother } from './authors';
/** The record's words of a homonym key (`build.ts` `KEW_NAME`), kept here so a reader of `name.kew` need not load the builder. */
const KEW_NAME = /is cited as Kew (?:accepts|cites) it/;

/** One row of Kew's `wcvp_names.csv`, cut to what the fill reads. */
export interface KewRow {
  id: string; // plant_name_id
  name: string; // taxon_name
  authors: string; // taxon_authors
  status: string; // Accepted, Synonym, Illegitimate, Invalid, Orthographic, Misapplied, Unplaced, Artificial Hybrid, ...
  rank: string; // Species, Variety, Subspecies, ...
  accepted: string; // accepted_plant_name_id ('' for an unplaced name)
  parent: string; // parent_plant_name_id
  powo: string; // powo_id: the IPNI number where IPNI holds the name, else Kew's own "-4"
  /** homotypic_synonym: Kew marks the name as of the same type as the entry it is filed under (round seventy-three). */
  homotypic?: boolean;
}

/** `name.kew`: Kew's names for the page's plant (the shape of FIX-BRIEF-72). */
export interface KewNames { entry: string; synonyms: string[]; acceptedElsewhere: string[]; file: string }
/** `name.cited`: the page cites Kew's author; `gbif` is the backbone's citation, `kew` the Kew row cited. */
export interface KewCited { gbif: string; kew: string }

/** Kew's rows, indexed the ways the fill reads them. Fed only the rows a corpus needs (`scripts/kew-names-load.ts`). */
export class KewNamesIndex {
  readonly byId = new Map<string, KewRow>();
  readonly byPowo = new Map<string, KewRow>();
  readonly byName = new Map<string, KewRow[]>();
  /** Rows Kew files under an entry (`accepted`), the entry itself left out. */
  readonly under = new Map<string, KewRow[]>();
  /** Accepted rows below species whose parent is the key (Rosa spinosissima var. spinosissima under Rosa spinosissima). */
  readonly children = new Map<string, KewRow[]>();
  add(r: KewRow): void {
    if (this.byId.has(r.id)) return;
    this.byId.set(r.id, r);
    if (r.powo) this.byPowo.set(r.powo, r);
    const n = words(r.name);
    this.byName.set(n, [...(this.byName.get(n) ?? []), r]);
    if (r.accepted && r.accepted !== r.id) this.under.set(r.accepted, [...(this.under.get(r.accepted) ?? []), r]);
    if (r.status === 'Accepted' && r.rank !== 'Species' && r.parent) this.children.set(r.parent, [...(this.children.get(r.parent) ?? []), r]);
  }
  /** Kew's rows of these words, hybrid sign and case aside. */
  rowsOf(name: string): KewRow[] { return this.byName.get(words(name)) ?? []; }
}

/** A name as compared: the hybrid sign and spacing aside, lower case. */
export const words = (n: string) => n.replace(/×\s*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const INFRA = /^(subsp|ssp|var|subvar|f|fo|forma|nothosubsp|nothovar|proles)\.?$/;
/** A stored older name ("Allium porrum L.") as its binomial and its author; null for a name below species. */
export function splitName(s: string): { name: string; author: string } | null {
  const w = s.replace(/×\s*/g, '×').trim().split(/\s+/);
  if (w.length < 2 || INFRA.test(w[2] ?? '')) return null;
  return { name: `${w[0]} ${w[1]}`.replace(/×/g, ''), author: w.slice(2).join(' ') };
}

type Page = {
  key: number;
  name: { scientific: string; authorship?: string | null; synonyms?: string[]; vernacular?: Array<{ name: string; lang?: string; source?: string }>; kew?: KewNames; cited?: KewCited };
  ids: { powo?: string | null; ipni?: string | null };
  upstream?: Record<string, { status: string; at: string; detail?: string } | undefined>;
};

/** The number a page links: its POWO number (Kew's address), else its IPNI number. */
export const linkedNumber = (ids: Page['ids']) => ids.powo?.replace(/^urn:lsid:ipni\.org:names:/, '') ?? ids.ipni ?? undefined;

/**
 * The citation a page shows, read against the name it links (A1): where Kew's row for the linked number is the page's
 * own words by another citation, the page cites it as Kew does. Null where the citations agree, the number is not Kew's,
 * or Kew's row is other words (a genus or spelling the page does not show: Bisnaga glaucescens links Ferocactus
 * glaucescens). `gbif` is the backbone's citation, kept from an earlier fill.
 */
export function kewCitation(d: Page, rowOf: (n: string) => KewRow | undefined): { authorship: string; cited: KewCited } | null {
  const n = linkedNumber(d.ids);
  const r = n ? rowOf(n) : undefined;
  if (!r?.authors.trim() || words(r.name) !== words(d.name.scientific)) return null;
  const was = (d.name.authorship ?? '').trim();
  if (was === r.authors.trim()) return null;
  return { authorship: r.authors.trim(), cited: { gbif: d.name.cited?.gbif ?? was, kew: r.id } };
}

/** The Kew entry the page's plant is: the linked number's (its accepted entry), else the one the name and author read to. */
export function kewEntry(d: Page, idx: KewNamesIndex): string {
  const n = linkedNumber(d.ids);
  const r = n ? idx.byPowo.get(n) : undefined;
  if (r) return r.status === 'Accepted' ? r.id : r.accepted;
  const rows = idx.rowsOf(d.name.scientific).filter((x) => x.rank === 'Species' && x.status !== 'Misapplied');
  const own = ownByAuthor(rows, d.name.authorship ?? undefined, (x) => x.authors);
  const pick = own.length ? own : rows.filter((x) => x.status === 'Accepted');
  const entries = [...new Set(pick.map((x) => (x.status === 'Accepted' ? x.id : x.accepted)).filter(Boolean))];
  return entries.length === 1 ? entries[0] : '';
}

/** `name.kew` for a page: its entry, Kew's other names for the plant, and the older names Kew accepts apart. */
export function kewNames(d: Page, idx: KewNamesIndex, file: string): KewNames {
  const entry = kewEntry(d, idx);
  const e = entry ? idx.byId.get(entry) : undefined;
  // The plant: the entry, the species of an entry below species (Fragaria virginiana Duchesne is filed under F.
  // virginiana subsp. virginiana), and the accepted varieties and subspecies of an entry that is a species.
  const plant = new Set<string>(entry ? [entry] : []);
  if (e && e.rank !== 'Species' && e.parent) plant.add(e.parent);
  for (const id of [...plant]) for (const c of idx.children.get(id) ?? []) plant.add(c.id);
  const own = words(d.name.scientific);
  const synonyms = new Set<string>();
  // The entry's own name, where it is other words than the page's (Ferocactus glaucescens for Bisnaga glaucescens).
  for (const id of plant) { const r = idx.byId.get(id); if (r?.rank === 'Species' && words(r.name) !== own) synonyms.add(r.name); }
  for (const id of plant) for (const r of idx.under.get(id) ?? []) if (r.rank === 'Species' && r.status !== 'Misapplied' && words(r.name) !== own) synonyms.add(r.name);
  const acceptedElsewhere = (d.name.synonyms ?? []).filter((s) => {
    const sp = splitName(s);
    if (!sp || !sp.author || words(sp.name) === own) return false;
    const acc = idx.rowsOf(sp.name).filter((r) => r.rank === 'Species' && r.status === 'Accepted');
    return ownByAuthor(acc, sp.author, (r) => r.authors).some((r) => !plant.has(r.id));
  });
  return { entry, synonyms: [...synonyms].sort(), acceptedElsewhere, file };
}

/** A common name that is a binomial Kew or the reference holds (A8): "Babiana odorata", "Salvia mexicana". */
export const BINOMIAL = /^[A-Z][a-z]+(?:-[a-z]+)? ×?[a-z][a-z-]+$/;
export function scientificVernacular(v: string, holds: (name: string) => boolean): boolean {
  const s = v.trim();
  return BINOMIAL.test(s) && holds(s);
}

/** The words a Wikidata row says when the links are none because Kew holds the name only under another author (A5). */
export const onlyAnotherAuthor = (others: string[]) => `Kew holds this name only under another author (${others.join('; ')}); no POWO link`;

/** What `fillKewNames` changed, one line a dossier. */
export type KewNamesCounts = { read: number; changed: number; cited: number; elsewhere: number; vernacularDropped: number; lines: string[] };

/**
 * `--fill kew-names --bulk <dir>`: every page's `name.kew`, its citation (`kewCitation`), its common names that are
 * binomials (`scientificVernacular`) and its "no POWO link" words, from Kew's file. Offline; a second run changes nothing.
 * `reference` is the reference's own names (lower case), for the common names.
 */
export function fillKewNames(store: { files(): string[]; read<T>(f: string): T; write(f: string, d: unknown): void }, idx: KewNamesIndex, file: string, reference: Set<string> = new Set()): KewNamesCounts {
  const c: KewNamesCounts = { read: 0, changed: 0, cited: 0, elsewhere: 0, vernacularDropped: 0, lines: [] };
  for (const f of store.files()) {
    let d: Page;
    try { d = store.read<Page>(f); } catch { continue; }
    c.read++;
    const before = JSON.stringify(d);
    const what: string[] = [];
    d.name.kew = kewNames(d, idx, file);
    if (d.name.kew.acceptedElsewhere.length) c.elsewhere++;
    const k = kewCitation(d, (n) => idx.byPowo.get(n));
    const up = (d.upstream ??= {});
    if (k) {
      what.push(`cited ${d.name.authorship || '(none)'} → ${k.authorship}`);
      d.name.authorship = k.authorship;
      d.name.cited = k.cited;
      const r = idx.byId.get(k.cited.kew)!;
      const row = up['gbif.species'];
      const note = citedWords(d.key, d.name.scientific, k.cited.gbif, `${r.name} ${r.authors}`);
      if (row && !(row.detail ?? '').includes(note)) up['gbif.species'] = { ...row, detail: [row.detail, note].filter(Boolean).join('; ') };
    } else if (!d.name.cited && KEW_NAME.test(up['gbif.species']?.detail ?? '')) {
      // A homonym key (`kewName`, round seventy-one) cites Kew's author already: its fields, from its record.
      const m = new RegExp(`GBIF's key ${d.key} is ${esc(d.name.scientific)} (.*?); Kew accepts`).exec(up['gbif.species']!.detail!);
      const n = linkedNumber(d.ids);
      const r = n ? idx.byPowo.get(n) : undefined;
      if (m && r && words(r.name) === words(d.name.scientific)) { d.name.cited = { gbif: m[1], kew: r.id }; what.push('cited recorded'); }
    }
    if (d.name.cited) c.cited++;
    const holds = (s: string) => words(s) !== words(d.name.scientific) && (reference.has(s.toLowerCase()) || idx.rowsOf(s).length > 0);
    const drop = (d.name.vernacular ?? []).filter((v) => scientificVernacular(v.name, holds));
    if (drop.length) {
      d.name.vernacular = d.name.vernacular!.filter((v) => !drop.includes(v));
      c.vernacularDropped += drop.length;
      const row = up['gbif.vernacular'];
      const note = `${drop.map((v) => `"${v.name}"`).join(', ')} not shown: a scientific name Kew or this reference holds`;
      if (row) up['gbif.vernacular'] = { ...row, detail: [row.detail, note].filter(Boolean).join('; ') };
      what.push(`common names dropped: ${drop.map((v) => v.name).join(', ')}`);
    }
    // The links none because Kew holds the name only under another author: the record says so (A5).
    const wd = up.wikidata;
    if (wd?.detail && !d.ids.powo && /IPNI and POWO linked by Kew's number, none/.test(wd.detail)) {
      const others = idx.rowsOf(d.name.scientific).filter((r) => r.rank === 'Species' && r.status !== 'Misapplied' && plainlyAnother(d.name.authorship ?? undefined, r.authors));
      const own = ownByAuthor(idx.rowsOf(d.name.scientific).filter((r) => r.rank === 'Species'), d.name.authorship ?? undefined, (r) => r.authors);
      if (others.length && !own.length) {
        up.wikidata = { ...wd, detail: wd.detail.replace(/IPNI and POWO linked by Kew's number, none/, onlyAnotherAuthor(others.map((r) => `${r.name} ${r.authors}`))) };
        what.push('no POWO link said');
      }
    }
    if (JSON.stringify(d) === before) continue;
    store.write(f, d);
    c.changed++;
    if (what.length) c.lines.push(`${d.name.scientific} [${d.key}]: ${what.join('; ')}`);
  }
  return c;
}

/** The record's words for a page that cites Kew's name for the number it links (A1); `kewCitedNote` shows them. */
export const citedWords = (key: number, scientific: string, gbif: string, kewLabel: string) => `GBIF's key ${key} is ${scientific}${gbif ? ` ${gbif}` : ', with no author'}; the page links Kew's ${kewLabel}, and the name is cited as Kew cites it`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Kew's other names for the page's plant (`name.kew.synonyms`), for the photograph rules (C1, C4): undefined where the
 * fill has not read the page, which is "not read", never "none".
 */
export const kewSynonyms = (name: { kew?: KewNames } | undefined): string[] | undefined => name?.kew?.synonyms;
/** The page's stored older names Kew accepts as species of their own (A2), undefined where not read. */
export const kewAcceptedElsewhere = (name: { kew?: KewNames } | undefined): string[] | undefined => name?.kew?.acceptedElsewhere;

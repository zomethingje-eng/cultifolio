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
import { headWithKew, unhead, kewAcceptedOf, type KewAccepted, type GbifName } from './kew-heading';
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
  /** ipni_id (round eighty-four): IPNI's number for the name, where IPNI holds it; absent in rows read before. */
  ipni?: string;
}

/**
 * `name.kew`: Kew's names for the page's plant (the shape of FIX-BRIEF-72). `heldBy` (round eighty-two, F; review 1's 4):
 * the page that holds the entry Kew's rows read this page to, when that is another page (its id is `k<entry>`): the entry
 * is then not this page's, so `entry` is '' and `synonyms` empty (they are the other page's plant's names), and the
 * page keeps its GBIF id. Echeveria peacockii (g7530398) read to Dudleya pulverulenta's 2778991, page k2778991's.
 */
export interface KewNames { entry: string; synonyms: string[]; acceptedElsewhere: string[]; file: string; heldBy?: string; accepted?: KewAccepted }
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
  slug?: string;
  name: { scientific: string; authorship?: string | null; rank?: string | null; genus?: string | null; synonyms?: string[]; vernacular?: Array<{ name: string; lang?: string; source?: string }>; kew?: KewNames; cited?: KewCited; gbif?: GbifName | null };
  ids: { powo?: string | null; ipni?: string | null };
  links?: Record<string, string>;
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
  // A linked number Kew files under another species, where Kew also accepts these words by the same author, is not the
  // plant: the accepted row is (round eighty, A; review-d 1: Crocus nudiflorus Sm. linked 436635-1, Kew's illegitimate
  // row under Crocus mazziaricus, and took that species' entry and names).
  const same = r && r.status !== 'Accepted' ? idx.rowsOf(r.name).filter((x) => x.status === 'Accepted' && x.rank === r.rank && x.authors.trim() === r.authors.trim()) : [];
  if (same.length === 1) return same[0].id;
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
  // Kew's row for the entry, which heads the page while its id is `k<entry>` (round eighty-four, decision 1; `kew-heading.ts`).
  // GBIF's name for the key, where Kew files it under another plant only (k3313620: GBIF's Ceropegia tanzaniensis, which
  // Kew's file holds as a synonym of Ceropegia cordiloba, on the page of Kew's Ceropegia dodomaensis), is not made an
  // older name of the page by the heading: `other` names that plant.
  let other: string | undefined;
  if (e && words(e.name) !== own) {
    const rank = (d.name.rank ?? 'SPECIES').toLowerCase();
    const held = idx.rowsOf(d.name.scientific).filter((r) => r.status !== 'Misapplied' && r.rank.toLowerCase() === rank);
    const to = [...new Set(held.map((r) => (r.status === 'Accepted' ? r.id : r.accepted)).filter(Boolean))];
    if (to.length && !to.includes(entry)) other = idx.byId.get(to[0])?.name ?? `Kew's entry ${to[0]}`;
  }
  return { entry, synonyms: [...synonyms].sort(), acceptedElsewhere, file, ...(e ? { accepted: { ...kewAcceptedOf(e), ...(other ? { other } : {}) } } : {}) };
}

/** POWO's address and IPNI's number of a Kew row: Kew's `powo_id`, and IPNI's `ipni_id` (else the `powo_id`) unless it is Kew's own number ("-4"), which IPNI does not hold. */
export function kewNumbers(r: Pick<KewRow, 'powo' | 'ipni'>): { powo?: string; ipni?: string } {
  const ipni = r.ipni || r.powo;
  return { ...(r.powo ? { powo: `urn:lsid:ipni.org:names:${r.powo}` } : {}), ...(ipni && !/-4$/.test(ipni) ? { ipni } : {}) };
}

/**
 * A `k` page's POWO and IPNI links from its Kew entry (round eighty-four; review-d D5: four of 22 sampled hybrids had no
 * POWO link, though Kew's file numbers each, since the name was asked without its sign; and with decision 1 the page is
 * that entry, so it links that entry's pages, not a synonym's: Ceropegia alstonii linked IPNI's record of that name, where
 * the page is Kew's Hoodia alstonii). In the page's order of links: GBIF, then POWO and IPNI, then the rest. True when it
 * changed.
 */
export function linkKewEntry(d: Page, r: Pick<KewRow, 'powo' | 'ipni'>): boolean {
  const n = kewNumbers(r);
  if (!n.powo && !n.ipni) return false;
  const before = JSON.stringify([d.ids, d.links]);
  const ids = d.ids as Record<string, unknown>;
  if (n.powo) ids.powo = n.powo; else delete ids.powo;
  if (n.ipni) ids.ipni = n.ipni; else delete ids.ipni;
  if (d.links) {
    const { gbif, powo: _p, ipni: _i, ...rest } = d.links;
    d.links = { ...(gbif ? { gbif } : {}), ...(n.powo ? { powo: `https://powo.science.kew.org/taxon/${n.powo}` } : {}), ...(n.ipni ? { ipni: `https://www.ipni.org/n/${n.ipni}` } : {}), ...rest };
  }
  return JSON.stringify([d.ids, d.links]) !== before;
}

/** The record's words for a page Kew's accepted name heads, where GBIF names its key otherwise (`kew.names`). */
export const headedWords = (entry: string, acc: KewAccepted, gbif: GbifName) =>
  `this page is Kew's entry ${entry}, ${acc.name}${acc.authors ? ` ${acc.authors}` : ''}, Kew's accepted name, which heads it; GBIF names its key ${gbif.scientific}${gbif.authorship?.trim() ? ` ${gbif.authorship.trim()}` : ''}${gbif.added ? ', an older name of the page here' : acc.other ? `, a name Kew's file holds under ${acc.other}, so not an older name of this page` : ''}`;
const HEADED_WORDS = /^this page is Kew's entry \d+, .*, Kew's accepted name, which heads it/;

/** A common name that is a binomial Kew or the reference holds (A8): "Babiana odorata", "Salvia mexicana". */
export const BINOMIAL = /^[A-Z][a-z]+(?:-[a-z]+)? ×?[a-z][a-z-]+$/;
export function scientificVernacular(v: string, holds: (name: string) => boolean): boolean {
  const s = v.trim();
  return BINOMIAL.test(s) && holds(s);
}

/** The words a Wikidata row says when the links are none because Kew holds the name only under another author (A5). */
export const onlyAnotherAuthor = (others: string[]) => `Kew holds this name only under another author (${others.join('; ')}); no POWO link`;

/** What `fillKewNames` changed, one line a dossier. `held`: pages not given an entry another page holds (round eighty-two). */
export type KewNamesCounts = { read: number; changed: number; cited: number; elsewhere: number; vernacularDropped: number; held: number; lines: string[] };

/**
 * A page's `name.kew` when the entry its rows read to is another page's (round eighty-two, F; review 1's 4): no entry, no
 * Kew names (they are that page's plant's), the older names Kew accepts apart kept (they are this page's own names'
 * reading), and the page that holds it. Its id stays its GBIF key (`page-ids.ts`, 'kew-held').
 */
export function heldElsewhereNames(k: KewNames, heldBy: string): KewNames {
  return { entry: '', synonyms: [], acceptedElsewhere: k.acceptedElsewhere, file: k.file, heldBy };
}
/** The record's words for a page not given the entry another page holds. */
const HELD_WORDS = /^Kew's rows read this name to the entry \d+, which is page k\d+'s/;
export const heldByWords = (entry: string, heldBy: string) => `Kew's rows read this name to the entry ${entry}, which is page ${heldBy}'s: not given to this page (one Kew entry, one page; a merge decides)`;

/**
 * `--fill kew-names --bulk <dir>`: every page's `name.kew`, its citation (`kewCitation`), its common names that are
 * binomials (`scientificVernacular`) and its "no POWO link" words, from Kew's file. Offline; a second run changes nothing.
 * `reference` is the reference's own names (lower case), for the common names.
 */
export function fillKewNames(store: { files(): string[]; read<T>(f: string): T; write(f: string, d: unknown): void }, idx: KewNamesIndex, file: string, reference: Set<string> = new Set(), o: { heldBy?: (entry: string, page: string) => string | undefined } = {}): KewNamesCounts {
  const c: KewNamesCounts = { read: 0, changed: 0, cited: 0, elsewhere: 0, vernacularDropped: 0, held: 0, lines: [] };
  for (const f of store.files()) {
    let d: Page;
    try { d = store.read<Page>(f); } catch { continue; }
    c.read++;
    const before = JSON.stringify(d);
    const what: string[] = [];
    // Kew's entry is read by GBIF's name for the key, as the build read it (round eighty-four): a heading of an earlier fill is taken off first, and put back by the rule below.
    unhead(d);
    d.name.kew = kewNames(d, idx, file);
    // One Kew entry, one page (round eighty-two, F; review 1's 4): an entry another page holds is not given to this one.
    const holder = d.name.kew.entry ? o.heldBy?.(d.name.kew.entry, String(d.key)) : undefined;
    const up = (d.upstream ??= {});
    if (holder) {
      const words = heldByWords(d.name.kew.entry, holder);
      what.push(words);
      d.name.kew = heldElsewhereNames(d.name.kew, holder);
      // The page's record says it, as Kew's file's answer (read, and not this page's).
      if (up['kew.names']?.detail !== words) up['kew.names'] = { status: 'none', at: new Date().toISOString(), detail: words };
      c.held++;
    } else if (HELD_WORDS.test(up['kew.names']?.detail ?? '')) delete up['kew.names'];
    if (d.name.kew.acceptedElsewhere.length) c.elsewhere++;
    const k = kewCitation(d, (n) => idx.byPowo.get(n));
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
    // Kew's accepted name heads the page while its id is `k<entry>` (round eighty-four, decision 1), and the page links that entry.
    const id = String(d.key);
    const wasName = d.name.scientific;
    headWithKew(d, id);
    const entryRow = d.name.kew.entry && id === `k${d.name.kew.entry}` ? idx.byId.get(d.name.kew.entry) : undefined;
    if (entryRow && linkKewEntry(d, entryRow)) {
      what.push(`linked Kew's entry ${d.name.kew.entry}`);
      // A record that said there was no POWO link says where the link now comes from.
      const wd0 = up.wikidata;
      const note = `POWO and IPNI linked from Kew's entry ${d.name.kew.entry}`;
      if (wd0?.detail && /no POWO link|linked by Kew's number, none/.test(wd0.detail) && !wd0.detail.includes(note)) up.wikidata = { ...wd0, detail: `${wd0.detail}; ${note}` };
    }
    if (d.name.gbif && d.name.kew.accepted && entryRow) {
      const words = headedWords(d.name.kew.entry, d.name.kew.accepted, d.name.gbif);
      if (up['kew.names']?.detail !== words) up['kew.names'] = { status: 'ok', at: new Date().toISOString(), detail: words };
      if (d.name.scientific !== wasName) what.push(`headed ${d.name.scientific} (GBIF: ${wasName})`);
    } else if (HEADED_WORDS.test(up['kew.names']?.detail ?? '')) delete up['kew.names'];
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

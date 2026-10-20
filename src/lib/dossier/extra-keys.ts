/**
 * Records and photographs from more than a page's own GBIF key (round seventy-three; the owner's decision on round
 * seventy-two's homonym keys, REVIEW-TRIAGE-71 A7). GBIF files some plants' records under more than one backbone key:
 * Myrica cerifera's page key is "Myrica cerifera Bigelow" (292 records) while GBIF files Linnaeus's name, the wax myrtle,
 * under Morella cerifera (L.) Small (27,086); Ixora coccinea's key is "Comm. ex Lam." and 2,651 records sit under GBIF's
 * "Ixora coccinea L."; Eucalyptus camaldulensis's under "Dehn." (47,349). A page reads another key's records when, and
 * only when, the rule makes it unambiguous (rule 3):
 *
 *   - the key's name and author is one Kew's file holds as the page's plant and of its entry's own type (the owner's
 *     narrower rule, round seventy-three): the entry's name itself (another usage of the same name and author: Ixora
 *     coccinea L.), an orthographic variant Kew files under it, or a name Kew files under it and marks homotypic
 *     (`homotypic_synonym`: Morella cerifera (L.) Small under Myrica cerifera L.; an invalid or illegitimate name only so
 *     marked), or an autonym of one of those ("Ficaria verna subsp. verna"), read by the author rule the ranges read
 *     (`ownByAuthor`), every row so read being of that type; a citation that is only a shorter abbreviation of Kew's one
 *     row of the words ("Dehn." of "Dehnh.") is read as that row. A heterotypic synonym (Lonicera pileata on Lonicera
 *     ligustrina) or a taxon Kew accepts below the entry is listed as refused, "the owner's decision": pulling another
 *     type's records onto a page is a taxonomic claim the owner has not made. The key of a page the owner has merged
 *     into this one (`scripts/merged-pages.txt`) is that claim made, and is read whatever its type (round seventy-eight);
 *   - GBIF does not already file the key's records under the page's own key (a synonym of the page key, or a variety
 *     under it, is in the page key's records already);
 *   - the key is not another reference page's key, is not filed by GBIF under one (Adenia gummifera (Harv.) Harms is
 *     GBIF's synonym of Adenia cissampeloides, a page here), and holds no other page under it;
 *   - GBIF's own word on it is not "pro parte synonym" (a name GBIF says is partly another taxon's is no one plant's);
 *   - and of what GBIF files under it (its synonyms, the taxa below it and theirs), a name Kew holds as another plant or
 *     as another type of this one, or one GBIF holds as a pro parte synonym, is left out record by record (`except`,
 *     read against each record's own taxon key): Morella cerifera's key holds "Myrica cerifera var. pumila Michx.", which
 *     Kew holds as Myrica pusilla Raf. A name Kew does not hold at all is GBIF's to file, as under the page's own key.
 *
 * The list is made offline from Kew's file and GBIF's backbone (`--list-extra-keys --bulk bulk --backbone <file>`) and
 * kept in `scripts/extra-keys.txt`; the build reads it, so a page says which keys its records come from and why
 * (`occurrences.keys`). Pure: the script streams the files, the tests build the indexes from rows.
 */
import { ownByAuthor, authorKey, publishingAuthor, parentheticalAuthor } from './authors';
import { words, type KewRow, type KewNamesIndex } from './kew-names';

/** One GBIF backbone usage, cut to what the rule reads (the backbone's simple export, or `/species/{key}`). */
export interface Usage {
  key: number;
  /** The accepted usage for a synonym; the parent taxon for an accepted one. */
  parent?: number;
  /** ACCEPTED, DOUBTFUL, SYNONYM, HOMOTYPIC_SYNONYM, ... */
  status: string;
  /** SPECIES, SUBSPECIES, VARIETY, FORM, ... */
  rank: string;
  /** GBIF's canonical name: "Ficaria verna verna" for the subspecies. */
  canonical: string;
  /** The author as GBIF cites it: "(L.) Small". */
  author: string;
  /** GBIF's scientific name: "Morella cerifera (L.) Small". */
  label: string;
}

const MARKER: Record<string, string> = { SUBSPECIES: 'subsp.', VARIETY: 'var.', FORM: 'f.', SUBVARIETY: 'subvar.', SUBFORM: 'subf.' };
const KEW_RANK: Record<string, string> = { SPECIES: 'Species', SUBSPECIES: 'Subspecies', VARIETY: 'Variety', FORM: 'Form', SUBVARIETY: 'Subvariety', SUBFORM: 'Subform' };
/** A usage's words as Kew's `taxon_name` writes them ("ficaria verna subsp. verna"), or null for a rank Kew's rows do not name so. */
export function kewForm(u: Pick<Usage, 'canonical' | 'rank'>): string | null {
  const w = u.canonical.replace(/×\s*/g, '').trim().split(/\s+/);
  if (u.rank === 'SPECIES') return w.length === 2 ? words(w.join(' ')) : null;
  const m = MARKER[u.rank];
  return m && w.length === 3 ? words(`${w[0]} ${w[1]} ${m} ${w[2]}`) : null;
}
/** An autonym: below species, its last epithet the species', no author of its own ("Ficaria verna subsp. verna"). */
export const isAutonym = (u: Pick<Usage, 'canonical' | 'rank' | 'author'>) => { const w = u.canonical.trim().split(/\s+/); return u.rank !== 'SPECIES' && w.length === 3 && w[1] === w[2] && !authorKey(u.author); };
const isSynonym = (s: string) => /synonym/i.test(s);

/**
 * The page's plant as Kew holds it (`kewNames`' reading): the entry, the species of an entry below species, and the
 * varieties and subspecies Kew accepts under those.
 */
export function plantOf(entry: string, idx: Pick<KewNamesIndex, 'byId' | 'children'>): Set<string> {
  const plant = new Set<string>(entry ? [entry] : []);
  const e = entry ? idx.byId.get(entry) : undefined;
  if (e && e.rank !== 'Species' && e.parent) plant.add(e.parent);
  for (const id of [...plant]) for (const c of idx.children.get(id) ?? []) plant.add(c.id);
  return plant;
}
/** A Kew row is the plant's: one of its accepted taxa, or a name Kew files under one, misapplied names aside. */
export const ofPlant = (r: KewRow, plant: ReadonlySet<string>) => r.status !== 'Misapplied' && (plant.has(r.id) || (!!r.accepted && plant.has(r.accepted)));
/** A Kew row Kew places in another plant: accepted elsewhere or filed under another entry. An unplaced name is placed nowhere, and is no other plant's. */
export const elsewhere = (r: KewRow, plant: ReadonlySet<string>) => r.status !== 'Unplaced' && !!entryOf(r) && !ofPlant(r, plant);
const proParte = (u: Pick<Usage, 'status'>) => /pro_?parte/i.test(u.status);
/** The entry a Kew row reads to: itself when accepted, else the entry it is filed under ('' for an unplaced name). */
export const entryOf = (r: KewRow) => (r.status === 'Accepted' ? r.id : r.accepted);

/**
 * GBIF's citation as a shorter abbreviation of Kew's (round seventy-three): "Dehn." is "Dehnh.", read only where Kew holds
 * one row of the words, both cite one publishing author, the shorter is four letters or more and an abbreviation (it
 * ends in a full stop), and the basionym's author, if either cites one, is the same.
 */
export function abbreviates(gbif: string, kew: string): boolean {
  const g = publishingAuthor(gbif), k = publishingAuthor(kew);
  if (!g || !k || g === k || g.length < 4 || !k.startsWith(g)) return false;
  if (!/\.\s*$/.test(gbif.trim()) || /[&,]|\bex\b|\bet\b/.test(gbif.replace(/^\s*\([^)]*\)/, '')) || /[&,]|\bex\b|\bet\b/.test(kew.replace(/^\s*\([^)]*\)/, ''))) return false;
  return parentheticalAuthor(gbif) === parentheticalAuthor(kew);
}

/** What Kew's file makes of one GBIF usage: the rows it reads to, or why none. */
export type KewReading = { rows: KewRow[]; how: 'author' | 'abbreviation' | 'autonym' } | { rows: []; why: string };

/** The Kew rows a GBIF usage is (`ownByAuthor` over Kew's rows of its words; misapplied rows are never a name's own). */
export function kewReading(u: Usage, idx: Pick<KewNamesIndex, 'rowsOf'>, parentOf?: (key: number) => Usage | undefined): KewReading {
  if (isAutonym(u)) {
    const p = u.parent ? parentOf?.(u.parent) : undefined;
    const w = u.canonical.trim().split(/\s+/);
    if (!p || p.rank !== 'SPECIES' || p.canonical.trim().split(/\s+/).slice(0, 2).join(' ') !== w.slice(0, 2).join(' ')) return { rows: [], why: "an autonym whose species GBIF does not give" };
    const r = kewReading(p, idx);
    return r.rows.length ? { rows: r.rows, how: 'autonym' } : { rows: [], why: `an autonym of ${p.label}, which ${'why' in r ? r.why : 'Kew does not hold'}` };
  }
  const form = kewForm(u);
  if (!form) return { rows: [], why: `a rank (${u.rank.toLowerCase()}) Kew's rows are not read at` };
  const rank = KEW_RANK[u.rank];
  const rows = idx.rowsOf(form).filter((r) => r.status !== 'Misapplied' && (!rank || r.rank === rank));
  if (!rows.length) return { rows: [], why: 'Kew holds no row of these words' };
  const own = ownByAuthor(rows, u.author || undefined, (r) => r.authors);
  if (own.length) return { rows: own, how: 'author' };
  if (rows.length === 1 && abbreviates(u.author, rows[0].authors)) return { rows, how: 'abbreviation' };
  return { rows: [], why: u.author ? `Kew holds these words only by another author (${rows.map((r) => r.authors || 'no author').join('; ')})` : 'GBIF cites no author' };
}

/**
 * Whether a Kew row of the page's plant is of its entry's own type (the owner's narrower rule, round seventy-three): null
 * when it is (the entry, another row of its name and author, an orthographic variant filed under it, a name filed under it
 * that Kew marks homotypic; for an entry that is an autonym, the same of its species), else why not.
 */
export function typeWhy(r: KewRow, entry: string, idx: Pick<KewNamesIndex, 'byId'>): string | null {
  const e = idx.byId.get(entry);
  const own = new Set([entry]);
  if (e && e.rank !== 'Species' && e.parent) { const w = e.name.trim().split(/\s+/); if (w.length >= 4 && w[w.length - 1] === w[1]) own.add(e.parent); }
  if (own.has(r.id)) return null;
  for (const id of own) { const x = idx.byId.get(id); if (x && words(x.name) === words(r.name) && authorKey(x.authors) === authorKey(r.authors)) return null; }
  const under = r.status === 'Accepted' ? undefined : idx.byId.get(r.accepted);
  if (own.has(r.accepted)) {
    if (r.status === 'Orthographic' || r.homotypic) return null;
    return `heterotypic: the owner's decision (Kew holds ${label(r)} as ${r.status === 'Synonym' ? 'a heterotypic synonym' : `an ${statusWord(r)} name not marked homotypic`} of ${e ? label(e) : entry})`;
  }
  return `another type below the entry: the owner's decision (Kew ${r.status === 'Accepted' ? `accepts ${label(r)} below ${e ? label(e) : entry}` : `holds ${label(r)} under ${under ? label(under) : r.accepted}, a taxon it accepts below ${e ? label(e) : entry}`})`;
}

/** One extra key of a page, as `scripts/extra-keys.txt` holds it a line. */
export interface ExtraKey {
  /** The page's GBIF key (0 for a page without one, which `pageId` names). */
  page: number;
  /**
   * A page without a GBIF key (round seventy-nine; the owner's decision on K's offer): its id, `k<plant_name_id>`. Such a
   * page reads GBIF's records only under keys the rule gives it, the usages of the names Kew's file holds as this plant
   * (`scripts/extra-keys-kew.txt`), never a key matched by its name.
   */
  pageId?: string;
  /** The other GBIF key whose records the page reads. */
  key: number;
  /** GBIF's scientific name for it. */
  label: string;
  /** GBIF's status for it (ACCEPTED, DOUBTFUL, SYNONYM, ...). */
  status: string;
  /** Kew's row it reads to (plant_name_id), and that row's name, author and status, and the entry it is filed under. */
  kew: string;
  kewLabel: string;
  /** How the row is the page's plant: Kew's entry itself, a name filed under it, a taxon below it, an autonym of one, or read by the abbreviation. */
  how: string;
  /** The page's address when this key was another page here, merged into this one by the owner's decision (the old slug). */
  merged?: string;
  /** The keys GBIF files under this one whose records are not read: names Kew holds as another plant, pro parte synonyms, and what GBIF files under those. */
  except?: number[];
}
/** A key that the rule did not take for a page, and why: listed for the report, never read. */
export interface Refused { page: number; pageId?: string; key: number; label: string; why: string }

/** A page the rule is run for: its GBIF key, or (round seventy-nine) none, with its id; and its Kew entry. */
export interface PageIn { key: number | null; entry: string; id?: string }
export interface Backbone {
  /** The usages of some words, as Kew writes them (`kewForm`). */
  usagesOf(kewWords: string): Usage[];
  /** One usage by key. */
  usage(key: number): Usage | undefined;
  /** The keys whose records GBIF also files under this one when asked by `taxonKey`: the key, the accepted usage of a synonym, and the taxa above it to species. */
  lineage(key: number): number[];
  /** The usages GBIF files under this key (its synonyms, the taxa below it and theirs), when known. */
  under?(key: number): Usage[];
}

const label = (r: KewRow) => `${r.name}${r.authors ? ` ${r.authors}` : ''}`;
const statusWord = (r: KewRow) => (r.status === 'Accepted' ? 'accepted' : r.status.toLowerCase());

/**
 * The extra keys of one page, and the keys considered and refused. `reference` is the set of the reference's page keys
 * (a page merged away is not one), `holders` maps a key to the reference pages GBIF files under it, `merged` a merged
 * page's key to its old address and `into` to the page it joins.
 */
export function extraKeysFor(page: PageIn, idx: Pick<KewNamesIndex, 'byId' | 'children' | 'under' | 'rowsOf'>, bb: Backbone, reference: ReadonlySet<number>, holders: ReadonlyMap<number, number[]>, merged: ReadonlyMap<number, string> = new Map(), into: ReadonlyMap<number, number> = new Map()): { keys: ExtraKey[]; refused: Refused[] } {
  const keys: ExtraKey[] = [], refused: Refused[] = [];
  if (!page.entry) return { keys, refused };
  const plant = plantOf(page.entry, idx);
  // The plant's names, as Kew writes them: its accepted taxa and every name filed under them.
  const names = new Set<string>();
  for (const id of plant) { const r = idx.byId.get(id); if (r) names.add(words(r.name)); for (const s of idx.under.get(id) ?? []) if (s.status !== 'Misapplied') names.add(words(s.name)); }
  // The autonyms of its species names ("ficaria verna subsp. verna"): Kew writes no row of them, GBIF may file records under one.
  for (const n of [...names]) { const w = n.split(' '); if (w.length === 2) for (const m of ['subsp.', 'var.', 'f.']) names.add(`${w[0]} ${w[1]} ${m} ${w[1]}`); }
  const seen = new Set<number>(page.key != null ? [page.key] : []);
  const pageOf = { page: page.key ?? 0, ...(page.key == null && page.id ? { pageId: page.id } : {}) };
  const entry = idx.byId.get(page.entry);
  for (const n of [...names].sort()) {
    for (const u of bb.usagesOf(n)) {
      if (seen.has(u.key)) continue;
      seen.add(u.key);
      const take = judge(u);
      if (take && 'why' in take) refused.push({ ...pageOf, key: u.key, label: u.label, why: take.why });
      else if (take) keys.push(take);
    }
  }
  // A key GBIF files under another key taken here is in that key's records already (Myrica cerifera L. under Morella cerifera).
  const taken = new Set(keys.map((k) => k.key));
  const exceptOf = new Map(keys.map((k) => [k.key, new Set(k.except ?? [])]));
  return { keys: keys.filter((k) => !bb.lineage(k.key).slice(1).some((a) => taken.has(a) && !exceptOf.get(a)!.has(k.key))).sort((a, b) => a.key - b.key), refused };

  function judge(u: Usage): ExtraKey | { why: string } | null {
    const read = kewReading(u, idx, (k) => bb.usage(k));
    if (!read.rows.length) return null; // Kew does not hold this usage as any name of the words: not this plant's by the rule, and nothing to say
    const mine = read.rows.filter((r) => ofPlant(r, plant)), others = read.rows.filter((r) => elsewhere(r, plant));
    if (!mine.length) return null; // another plant's name by the same words
    if (others.length) return { why: `its author reads to Kew's ${mine.map(label).join('; ')} and to ${others.map(label).join('; ')}, another plant's` };
    const up = bb.lineage(u.key);
    if (page.key != null && up.includes(page.key)) return null; // GBIF already files its records under the page's key
    if (proParte(u)) return { why: `GBIF holds it as a pro parte synonym (of ${u.parent ?? 'another key'}): partly another taxon's name, so no one plant's` };
    const at = up.find((k) => k !== page.key && reference.has(k));
    if (at !== undefined) return { why: at === u.key ? 'it is another page of this reference' : `GBIF files it under key ${at}, another page of this reference` };
    const holds = (holders.get(u.key) ?? []).filter((k) => k !== page.key);
    if (holds.length) return { why: `GBIF files another page of this reference under it (${holds.join(', ')})` };
    // The key of a page merged into this one (`into`, scripts/merged-pages.txt) is read whatever its type: the merge is the
    // owner's taxonomic claim that the two are one plant (round seventy-eight: six of the seven pairs that held one Kew entry
    // are Kew's heterotypic synonyms of it). What GBIF files under it is still judged name by name, below.
    const other = into.get(u.key) === page.key ? null : mine.map((r) => typeWhy(r, page.entry, idx)).find(Boolean);
    if (other) return { why: other };
    // What GBIF files under it that is another plant's (or a pro parte synonym), and what GBIF files under those: left out.
    const below = bb.under?.(u.key) ?? [];
    const out = new Set<number>();
    for (const c of below) {
      if (proParte(c)) { out.add(c.key); continue; }
      const r = kewReading(c, idx, (k) => bb.usage(k));
      if (r.rows.some((x) => elsewhere(x, plant) || (ofPlant(x, plant) && typeWhy(x, page.entry, idx)))) out.add(c.key);
    }
    for (const c of below) if (!out.has(c.key) && bb.lineage(c.key).slice(1).some((a) => out.has(a))) out.add(c.key);
    const except = [...out].sort((a, b) => a - b);
    const row = mine[0];
    const how = 'how' in read && read.how !== 'author' ? read.how : plant.has(row.id) ? (row.id === page.entry ? 'entry' : 'below') : 'filed';
    const filedUnder = plant.has(row.id) ? '' : ` under ${entry ? label(entry) : page.entry}`;
    return { ...pageOf, key: u.key, label: u.label, status: u.status, kew: row.id, kewLabel: `${label(row)} (${statusWord(row)}${filedUnder})`, how, ...(merged.has(u.key) ? { merged: merged.get(u.key) } : {}), ...(except.length ? { except } : {}) };
  }
}

/** The words the build and the page say of an extra key's Kew reading. */
export function extraWhy(x: Pick<ExtraKey, 'kewLabel' | 'how'>): string {
  const how = x.how === 'abbreviation' ? ', its author read as an abbreviation of Kew\'s' : x.how === 'autonym' ? ', an autonym of that name' : '';
  return `Kew's file holds it as ${x.kewLabel}${how}`;
}

/* ------------------------------------------------------------------ the list file */

/** `scripts/extra-keys.txt`: a line a key, tab-separated: page key, key, GBIF's name, GBIF's status, Kew's row, Kew's reading, how, the merged page's old slug or "-", the keys left out (comma-separated) or "-". */
export function formatExtraKeys(keys: readonly ExtraKey[], head: string[] = []): string {
  return [...head.map((h) => `# ${h}`), ...keys.map((k) => [k.pageId ?? k.page, k.key, k.label, k.status, k.kew, k.kewLabel, k.how, k.merged ?? '-', k.except?.length ? k.except.join(',') : '-'].join('\t'))].join('\n') + '\n';
}
export function parseExtraKeys(text: string): ExtraKey[] {
  const out: ExtraKey[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const c = line.split('\t');
    // A page without a GBIF key is named by its id (round seventy-nine, `scripts/extra-keys-kew.txt`).
    const pageId = /^k[1-9]\d*$/.test(c[0] ?? '') ? c[0] : undefined;
    const page = pageId ? 0 : Number(c[0]), key = Number(c[1]);
    if (!Number.isInteger(page) || !Number.isInteger(key) || c.length < 7) continue;
    const except = c[8] && c[8] !== '-' ? c[8].split(',').map(Number).filter((x) => Number.isInteger(x)) : [];
    out.push({ page, ...(pageId ? { pageId } : {}), key, label: c[2], status: c[3], kew: c[4], kewLabel: c[5], how: c[6], ...(c[7] && c[7] !== '-' ? { merged: c[7] } : {}), ...(except.length ? { except } : {}) });
  }
  return out;
}
/** The keys of the pages without a GBIF key (round seventy-nine), by page id. */
export function byPageId(keys: readonly ExtraKey[]): Map<string, ExtraKey[]> {
  const m = new Map<string, ExtraKey[]>();
  for (const k of keys) if (k.pageId) m.set(k.pageId, [...(m.get(k.pageId) ?? []), k]);
  return m;
}
/** The list by page key. */
export function byPage(keys: readonly ExtraKey[]): Map<number, ExtraKey[]> {
  const m = new Map<number, ExtraKey[]>();
  for (const k of keys) m.set(k.page, [...(m.get(k.page) ?? []), k]);
  return m;
}

/* ------------------------------------------------------------------ pages merged by the owner */

/** One merge (`scripts/merged-pages.txt`): the page that leaves the reference, the page it joins, and the old page's name. */
export interface Merge { from: number; into: number; name: string }
/** "<from key>\t<into key>\t<from name>" a line; "#" starts a comment. */
export function parseMerges(text: string): Merge[] {
  const out: Merge[] = [];
  for (const line of text.split(/\r?\n/)) {
    const l = line.replace(/#.*$/, '').trim();
    if (!l) continue;
    const [a, b, ...n] = l.split('\t');
    if (/^\d+$/.test(a ?? '') && /^\d+$/.test(b ?? '') && n.join(' ').trim()) out.push({ from: Number(a), into: Number(b), name: n.join(' ').trim() });
  }
  return out;
}

/** Which merged pages' dossiers may go: the page that leaves is on disk and the page it joins records its key with its old address. */
export function mergedToPrune(all: Array<{ key: number; occurrences?: { keys?: Array<{ key: number; slug?: string }> } }>, list: readonly Merge[]): { prune: number[]; waiting: string[] } {
  const byKey = new Map(all.map((d) => [d.key, d]));
  const prune: number[] = [], waiting: string[] = [];
  for (const m of list) {
    if (!byKey.has(m.from)) continue;
    const into = byKey.get(m.into);
    if (into?.occurrences?.keys?.some((x) => x.key === m.from && !!x.slug)) prune.push(m.from);
    else waiting.push(`${m.name} [${m.from}] into ${m.into}`);
  }
  return { prune, waiting };
}

/**
 * The pages whose stored records do not come from the keys the list gives them (`--list-extra-keys`): the `--keys` list of
 * a rebuild, "<key> <name>" a line. A page the list gives keys it does not read, or that reads keys the list no longer
 * gives; never a page merged away.
 */
export function extraRebuild(pages: ReadonlyArray<{ key: number; name: { scientific: string }; occurrences?: { keys?: Array<{ key: number }> } }>, list: readonly ExtraKey[], gone: readonly Merge[] = []): string[] {
  const want = byPage(list);
  const away = new Set(gone.map((m) => m.from));
  const out: string[] = [];
  for (const d of pages) {
    if (away.has(d.key)) continue;
    const a = [...new Set((want.get(d.key) ?? []).map((x) => x.key))].sort((x, y) => x - y).join(',');
    const b = [...new Set((d.occurrences?.keys ?? []).map((x) => x.key))].sort((x, y) => x - y).join(',');
    if (a !== b) out.push(`${d.key} ${d.name.scientific}`);
  }
  return out;
}

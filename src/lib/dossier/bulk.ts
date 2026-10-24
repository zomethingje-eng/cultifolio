/**
 * Bulk sources for a large corpus build. Per-species API calls are the wrong
 * shape at thousands of species; two downloads replace the two slowest legs:
 *
 *   WCVP  — Kew's World Checklist of Vascular Plants, one zip with
 *           wcvp_names.csv and wcvp_distribution.csv (pipe-delimited).
 *   GBIF  — one occurrence download (DWCA: occurrence.txt and multimedia.txt,
 *           tab-delimited) for every taxon key in the list, requested by
 *           scripts/bulk-fetch.ts. Records, and the photographs on them. Or
 *           (round seventy-nine) GBIF's SQL download of the same records in
 *           the columns the build reads (`SQL_SELECT`), with the photographs
 *           from a small DWCA of the records with images (bulk/media.zip).
 *
 * Nothing in buildDossier() changes: bulkFetcher() wraps the ordinary fetcher
 * and answers the distribution and occurrence URLs from the files, passing
 * everything else (backbone, photos, Wikipedia, literature) through. The
 * dossier records the same upstream names, so a reader cannot tell which
 * path built it, and neither can the tests.
 */
import type { JsonFetcher, FetchResult, FetchOptions } from './fetch';
import { licenceTag, isOpen } from '$core/licence';
import type { GbifDistribution, GbifOccurrence, OccPage, GbifSpecies, KewDescription, SynonymOf } from './sources/gbif';
import { synonyms as readSynonyms, isWcvpRow } from './sources/gbif';
import { authorKey, authorsAgree, ownByAuthor, inFamily, plainlyAnother, parentheticalAuthor } from './authors';
import { spellingKey } from './epithet';
import type { RangeVia } from './range-via';


/**
 * A copy of a string that shares no storage with the text it was cut from (round eighty, X). A field split from a line
 * that readline cut from a stream's 64 KB chunk is a slice of that chunk, and keeps the whole chunk alive for as long as
 * it is kept: at the full list's size the photographs' index kept the whole of multimedia.txt (22 GB of text) alive, and
 * each Kew index its own copy of Kew's 300 MB names file. Short strings are copies already.
 */
const OWN_ENC = new TextEncoder(), OWN_DEC = new TextDecoder();
export const ownText = (s: string): string => (s.length < 13 ? s : OWN_DEC.decode(OWN_ENC.encode(s)));

/* ------------------------------------------------------------------ WCVP */

export interface WcvpName {
  id: string;
  name: string; // taxon_name, e.g. "Tylecodon pearsonii"
  status: string; // Accepted | Synonym | Unplaced | ...
  acceptedId: string; // accepted_plant_name_id (self for accepted names)
  rank: string;
  /** taxon_authors, used to tell homonyms apart against the backbone's authorship. */
  authors?: string;
  /** The family Kew files the row under (a synonym's, its accepted entry's). */
  family?: string;
  lifeform?: string;
  climate?: string;
}

export interface WcvpDist {
  id: string; // plant_name_id
  l3: string; // area_code_l3
  area: string;
  introduced: boolean;
  extinct: boolean;
  doubtful: boolean;
  /** The level-2 region, for a row Kew gives no level-3 area (Agave calodonta's "Mexico"; round seventy-two, B8). */
  region?: string;
}

/** Split one pipe-delimited WCVP line by a header. Quotes are not used in these files. */
export function wcvpRow(header: string[], line: string): Record<string, string> {
  const cells = line.split('|');
  const out: Record<string, string> = {};
  for (let i = 0; i < header.length; i++) out[header[i]] = cells[i] ?? '';
  return out;
}

const families = new Map<string, string>();
const family = (f?: string) => { if (!f) return undefined; let v = families.get(f); if (!v) families.set(f, (v = ownText(f))); return v; };
export const parseWcvpName = (h: string[], line: string): WcvpName => {
  const r = wcvpRow(h, line);
  return { id: r.plant_name_id, name: r.taxon_name, status: r.taxon_status, acceptedId: r.accepted_plant_name_id || r.plant_name_id, rank: r.taxon_rank, authors: r.taxon_authors || undefined, family: family(r.family), lifeform: r.lifeform_description || undefined, climate: r.climate_description || undefined };
};


export const parseWcvpDist = (h: string[], line: string): WcvpDist => {
  const r = wcvpRow(h, line);
  return { id: r.plant_name_id, l3: r.area_code_l3, area: r.area, introduced: r.introduced === '1', extinct: r.extinct === '1', doubtful: r.location_doubtful === '1', ...(r.region ? { region: r.region } : {}) };
};

/**
 * A name as both indexes compare it: lower case, with the hybrid sign and the space after it taken out. WCVP writes
 * "Lantana × strigocamara" and GBIF's canonical name "Lantana strigocamara", so every nothospecies missed Kew's own entry
 * and fell through to its older names, where one of them found another plant's range (round sixty-nine; triage-68 M2,
 * S-A1, R46-11).
 */
export const wcvpKey = (name: string) => name.toLowerCase().replace(/×\s*/g, '').replace(/\s+/g, ' ').trim();

/** The author rules, in `./authors.ts` since round seventy: `authorsAgree` for older names, `sameNameAuthor` for the species' own. */
export { authorsAgree, sameNameAuthor } from './authors';

/** Kew's range for one accepted entry: rows in the shape gbif.distributions() reads (none when Kew states none), its descriptions, and the entry. */
export type WcvpRange = { rows: GbifDistribution[]; kew: KewDescription; entry: WcvpName; synonymOf?: SynonymOf; rangeVia?: RangeVia };

/**
 * The day of Kew's files (round seventy-two, B1): README_WCVP.xlsx says "Extracted: 04/06/2026" (day first, as its own
 * "[accessed 04 Jun 2026]" shows). Undefined when the text does not say it; the loader then takes the file's own date.
 */
export function wcvpExtractedDay(readmeText: string): string | undefined {
  const m = /Extracted:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(readmeText);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : undefined;
}

/**
 * The day of a GBIF download (B1): the day GBIF made it (`created`, GBIF's own answer for the download, which
 * bulk-fetch.ts and the build keep in download.json since round eighty), else the day it was fetched. The records are as
 * GBIF held them on that day, not on the build's. Never the key's digits (round eighty, X): "0036848-260928105237408"
 * was made on 2026-10-20, and its "260928" is the day GBIF's download service last started, not the download's;
 * round seventy-two's "0006100-260916113435855" was made on 2026-09-19, not 2026-09-16.
 */
export function downloadDay(meta: { key?: string; created?: string; fetched?: string }): string | undefined {
  for (const t of [meta.created, meta.fetched]) if (/^\d{4}-\d{2}-\d{2}/.test(t ?? '')) return t!.slice(0, 10);
  return undefined;
}

/** Levenshtein distance, for the near-spelling rule only (`nearSpellings`). */
function editDistance(a: string, b: string): number {
  let p = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const q = [i];
    for (let j = 1; j <= b.length; j++) q.push(Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    p = q;
  }
  return p[b.length];
}

/** An entry's name as the record cites it, with its authors: "Erythrina afra Thunb.". */
export const entryLabel = (n: WcvpName) => `${n.name}${n.authors ? ` ${n.authors}` : ''}`;

/**
 * The part of WCVP a build needs: for each wanted name, its accepted record and that record's distribution. Built in two
 * streaming passes by the script (names first, then distributions filtered to the accepted ids), so the 300 MB names
 * file is never held in memory.
 */
export class WcvpIndex {
  private byName = new Map<string, WcvpName[]>(); // `wcvpKey` of taxon_name → rows (several when homonyms)
  private byId = new Map<string, WcvpName>(); // every accepted row
  private acceptedByName: Map<string, WcvpName[]> | null = null; // built on first use from byId
  private dist = new Map<string, WcvpDist[]>(); // accepted plant_name_id → rows
  /** The accepted ids the second pass keeps rows for: an entry outside them has a range this index never read. */
  private loaded = new Set<string>();
  /** Entries Kew files names under that are not "Accepted": artificial hybrids (Delphinium × barlowii; round seventy-two, B8). */
  private hybrids = new Map<string, WcvpName>();
  /** The reference's own species names, lower case, when the loader is given them: the near-spelling rule never reads a name the reference holds. */
  private reference: Set<string> | null = null;
  /** The day of Kew's files this index was read from (B1); undefined when not known. */
  fileDay?: string;
  setReference(names: Iterable<string>): void {
    this.reference = new Set([...names].map(wcvpKey));
  }
  /** The entry a row is filed under: itself when Kew accepts it, else its accepted entry, an artificial hybrid included. */
  private entryOf(n: WcvpName): WcvpName {
    return n.status === 'Accepted' ? n : (this.byId.get(n.acceptedId) ?? this.hybrids.get(n.acceptedId) ?? n);
  }

  /** First pass: keep every row whose name is wanted, and every accepted row (small: ~350k) so synonyms can resolve. */
  addName(n: WcvpName, wanted: (name: string) => boolean): void {
    if (n.status === 'Accepted') this.byId.set(n.id, n);
    else if (n.status === 'Artificial Hybrid' && n.acceptedId === n.id) this.hybrids.set(n.id, n);
    const k = wcvpKey(n.name);
    // Asked with the hybrid sign taken out, so "× Gasteraloe beguinii" is wanted by its genus and not by "×".
    if (wanted(n.name.replace(/×\s*/g, '').trim())) {
      const arr = this.byName.get(k) ?? [];
      arr.push(n);
      this.byName.set(k, arr);
      this.loaded.add(n.acceptedId);
    }
  }
  /** The accepted ids the second pass must keep: those of every wanted name, and of every accepted name a wanted synonym points at. */
  acceptedIds(): Set<string> {
    return new Set(this.loaded);
  }
  addDist(d: WcvpDist): void {
    const arr = this.dist.get(d.id) ?? [];
    arr.push(d);
    this.dist.set(d.id, arr);
  }
  /** Every WCVP row under a name: the wanted ones, or else the accepted rows of any genus. */
  private rowsOf(name: string): WcvpName[] | undefined {
    const k = wcvpKey(name);
    const rows = this.byName.get(k);
    if (rows?.length) return rows;
    return this.acceptedNames().get(k);
  }
  private acceptedNames(): Map<string, WcvpName[]> {
    if (!this.acceptedByName) {
      this.acceptedByName = new Map();
      for (const n of this.byId.values()) {
        const kk = wcvpKey(n.name);
        const arr = this.acceptedByName.get(kk) ?? [];
        arr.push(n);
        this.acceptedByName.set(kk, arr);
      }
    }
    return this.acceptedByName;
  }
  private bySpelling: Map<string, WcvpName[]> | null = null; // genus + `spellingKey` of the epithet → rows, built on first use
  /**
   * The rows of a binomial's other spellings: the same genus, the epithet in another gender or spelling of the one rule
   * (`spellingKey`; round seventy, triage-69 B4, S-B5). GBIF's Cyphostemma congoensis is Kew's Cyphostemma congoense.
   */
  private otherSpellings(name: string): WcvpName[] {
    const key = (n: string) => { const w = wcvpKey(n).split(' '); return w.length === 2 ? `${w[0]} ${spellingKey(w[1])}` : null; };
    const k = key(name);
    if (!k) return [];
    if (!this.bySpelling) {
      this.bySpelling = new Map();
      const seen = new Set<WcvpName>();
      for (const rows of [...this.byName.values(), ...this.acceptedNames().values()]) for (const r of rows) {
        const rk = key(r.name);
        if (!rk || seen.has(r)) continue;
        seen.add(r);
        this.bySpelling.set(rk, [...(this.bySpelling.get(rk) ?? []), r]);
      }
    }
    return (this.bySpelling.get(k) ?? []).filter((r) => wcvpKey(r.name) !== wcvpKey(name));
  }
  /**
   * Kew's rows of the species' own name (round seventy; triage-69 B4, S-B4, S-B5), in this order:
   *   - the rows of its words by the backbone's author, read by `ownByAuthor` (the whole citation, then the publishing
   *     author, then without initials, then the basionym's author);
   *   - else the rows of another spelling of its epithet by that author: GBIF's Cyphostemma congoensis (Hort.) Desc. is
   *     Kew's Cyphostemma congoense (Anon.) Desc.;
   *   - else the one entry Kew accepts under its words, whatever its author: Kew and GBIF cite one name's author
   *     differently for about one species in twenty ("(N.E.Br.) Walther" and "(N.E.Br.) E.Walther", "Hochst." and
   *     "Hochst. ex C.Krauss": 7 of 150 sampled on 2026-10-12, each the same plant), and the only plant Kew accepts by the
   *     name is the backbone's accepted one.
   * A row of the words by another author that Kew does not accept is another name: Ceropegia macrocarpa (Sprenger)
   * Bruyns is not Kew's unplaced "Ceropegia macrocarpa J.N.Haage & E.Schmidt", and that row's lack of a range is not
   * Kew's answer for this species. A misapplied name is never the species'. `others` are the rows of its words not
   * taken, for the record. With no author from the backbone, nothing can be compared: every row under the words is
   * read, as before.
   */
  ownRows(name: string, authorship?: string, family?: string): { rows: WcvpName[]; others: WcvpName[]; spelt?: boolean } {
    const exact = this.rowsOf(name) ?? [];
    if (!authorKey(authorship)) return { rows: exact, others: [] };
    const usable = (rs: WcvpName[]) => rs.filter((r) => !/misapplied/i.test(r.status));
    // By the readings of `ownByAuthor`, closest first (round seventy, the owner's run: the publishing author alone made
    // Drimia nana's two Kew rows one, and "W.Heering" another author than "Heering").
    const byAuthor = (rs: WcvpName[]) => ownByAuthor(usable(rs), authorship, (r) => r.authors);
    const accepted = usable(exact).filter((r) => r.status === 'Accepted');
    const own = byAuthor(exact);
    let spelt = false;
    const found = own.length ? own : (() => {
      const v = byAuthor(this.otherSpellings(name));
      if (v.length) { spelt = true; return v; }
      if (accepted.length === 1) return accepted;
      // Kew spells the name otherwise than any rule of `spellingKey` reads, by the same author (round seventy-two, B7):
      // Reicheocactus famatimensis is Kew's famatinensis, Weingartia fidaiana Kew's fidana, Melocactus lemairei Kew's lemarii.
      const near = exact.length ? [] : this.nearSpellings(name, authorship!);
      if (near.length) spelt = true;
      return near;
    })();
    const rows = inFamily(found, usable(exact), family, (r) => this.entryOf(r).family);
    return { rows, others: exact.filter((r) => !rows.includes(r)), ...(spelt && rows.length ? { spelt: true } : {}) };
  }
  /**
   * Kew's rows of the name spelt otherwise, held to every one of these (round seventy-two, B7, as triaged): Kew holds no
   * row of the page's own words; one epithet in the genus, of six letters or more, lies within two letters' edit of the
   * page's; its row's author is the page's by `ownByAuthor` (the basionym's author in its brackets agreeing, for
   * Melocactus lemairei "(Monv. ex Lem.) Miq." and Kew's lemarii "(Monv. ex Lem.) Miq. ex Lem."); all its rows lead to one
   * entry; and the reference holds no species of that spelling (two pages would then share one range).
   */
  private nearSpellings(name: string, authorship: string): WcvpName[] {
    const w = wcvpKey(name).split(' ');
    if (w.length !== 2 || w[1].length < 6) return [];
    const near = new Map<string, WcvpName[]>();
    for (const rows of [...this.byName.values(), ...this.acceptedNames().values()]) for (const r of rows) {
      const rw = wcvpKey(r.name).split(' ');
      if (rw.length !== 2 || rw[0] !== w[0] || rw[1] === w[1] || /misapplied/i.test(r.status) || editDistance(rw[1], w[1]) > 2) continue;
      const k = rw.join(' ');
      const arr = near.get(k) ?? [];
      if (!arr.includes(r)) arr.push(r);
      near.set(k, arr);
    }
    if (near.size !== 1) return [];
    const [[spelling, rows]] = [...near];
    if (this.reference?.has(spelling)) return [];
    // The basionym too: Bisnaga hamatacantha (Muehlenpf.) Orcutt is not Kew's Bisnaga haematacantha (Monv. ex Salm-Dyck)
    // Orcutt, another plant by the same combining author (the dry run on the corpus, round seventy-two).
    const own = ownByAuthor(rows, authorship, (r) => r.authors).filter((r) => parentheticalAuthor(r.authors) === parentheticalAuthor(authorship));
    return new Set(own.map((r) => this.entryOf(r).id)).size === 1 ? own : [];
  }
  /** Whether Kew holds the species' own name (`ownRows`): only when it does not are the older names looked up. */
  holds(name: string, authorship?: string, family?: string): boolean {
    return this.ownRows(name, authorship, family).rows.length > 0;
  }
  /**
   * Resolve a name (as GBIF gives it, canonical) to its accepted WCVP record.
   *
   * With the backbone's authorship, only the rows that are the species' own name count (`ownRows`; round seventy,
   * triage-69 B4): one accepted entry is the answer, two are `ambiguous`. Before, a row by another author stood in when
   * authorship matched nothing, or when it was the only row: Ceropegia macrocarpa took the range, or the absence of one,
   * of another author's name.
   *
   * Without authorship (an offline re-derivation of a dossier that kept none), a name WCVP holds twice is ambiguous
   * unless one row is accepted, as before. An accepted name outside the wanted genera (the target of a synonym the
   * backbone followed) is found among the accepted rows.
   */
  accepted(name: string, authorship?: string, family?: string): WcvpName | 'ambiguous' | undefined {
    const entryOf = (n: WcvpName) => this.entryOf(n);
    if (authorKey(authorship)) {
      const { rows } = this.ownRows(name, authorship, family);
      const ends = new Map(rows.map((r) => [entryOf(r).id, entryOf(r)]));
      // One name by one author under two entries: Kew accepts it and also cites it under another species (a pro parte or
      // misapplied use). The entry Kew accepts it as is its own (round seventy, the owner's run: Datura metel L., Romulea
      // corsica, Scilla laxiflora and six more lost their ranges as "homonyms, unresolved").
      if (ends.size > 1) {
        const acc = rows.filter((r) => r.status === 'Accepted');
        return acc.length === 1 ? acc[0] : 'ambiguous';
      }
      const e = ends.size ? [...ends.values()][0] : undefined;
      // An own row filed under an infraspecific entry of these very words (Kew holds Fragaria virginiana Duchesne under F.
      // virginiana subsp. virginiana): the species is the one entry Kew accepts by the words at species rank, so the page
      // shows the species' range, not one subspecies' (self-review 70).
      if (e && !/^species$/i.test(e.rank) && wcvpKey(e.name).split(' ').slice(0, 2).join(' ') === wcvpKey(name)) {
        const sp = (this.acceptedNames().get(wcvpKey(name)) ?? []).filter((r) => /^species$/i.test(r.rank) && (!family || r.family === family));
        if (sp.length === 1) return sp[0];
      }
      return e;
    }
    const rows = this.rowsOf(name);
    if (!rows?.length) return undefined;
    let pick = rows.length === 1 ? rows : rows.filter((r) => r.status === 'Accepted');
    if (pick.length !== 1) {
      const distinct = new Set(rows.map((r) => r.acceptedId));
      if (distinct.size > 1) return 'ambiguous';
      pick = [rows[0]];
    }
    return entryOf(pick[0]);
  }
  /**
   * The entry round sixty-nine's rule resolved a name to, for `--list-rebuild` alone (round seventy; triage-69 B4): the only
   * row whatever its author, or among homonyms the one whose authorship is the backbone's to the letter, else the one
   * accepted row. A species whose entry differs under `accepted` read Kew's rows of another author or missed another
   * spelling, and is rebuilt.
   */
  legacyAccepted(name: string, authorship?: string): WcvpName | 'ambiguous' | undefined {
    const rows = this.rowsOf(name);
    if (!rows?.length) return undefined;
    let pick = rows.length === 1 ? rows : [];
    if (rows.length > 1 && authorship) {
      const loose = (a?: string) => (a ?? '').toLowerCase().replace(/[^a-z]/g, '');
      const byAuthor = rows.filter((r) => loose(r.authors) === loose(authorship));
      if (byAuthor.length === 1) pick = byAuthor;
    }
    if (pick.length !== 1) pick = rows.filter((r) => r.status === 'Accepted');
    if (pick.length !== 1) {
      if (new Set(rows.map((r) => r.acceptedId)).size > 1) return 'ambiguous';
      pick = [rows[0]];
    }
    const n = pick[0];
    return n.status === 'Accepted' ? n : (this.byId.get(n.acceptedId) ?? n);
  }
  /**
   * The range of the page's own Kew entry, by its plant_name_id (round eighty, A; review-w: five pages had no Kew range
   * because GBIF's name for their key, "Chamaenerion angustifolium (L.) Scop.", is not the name Kew accepts, "Epilobium
   * angustifolium L.", the page's entry by the species list): the entry Kew accepts under that id, and its range, with
   * where it comes from (the page's own row of GBIF's name and author filed under it, else the entry). Null when the
   * index did not read that entry.
   */
  /** The name of the entry Kew accepts under an id, or undefined. */
  entryName(id: string): string | undefined {
    return (this.byId.get(id) ?? this.hybrids.get(id))?.name;
  }
  rangeById(id: string, name?: string, authorship?: string, family?: string): WcvpRange | null {
    const entry = this.byId.get(id) ?? this.hybrids.get(id);
    if (!entry) return null;
    const range = this.rangeOf(entry);
    if (!range) return null;
    const at = { entry: entryLabel(entry), name: entry.name, ...(this.fileDay ? { file: this.fileDay } : {}) };
    if (!name || wcvpKey(entry.name) === wcvpKey(name)) {
      const own = name ? ownByAuthor(this.ownRows(name, authorship, family).rows, authorship, (r) => r.authors).some((r) => this.entryOf(r).id === entry.id) : true;
      return { ...range, rangeVia: own || !authorKey(authorship) ? { kind: 'own', ...at } : { kind: 'kew-entry', ...at } };
    }
    const row = this.ownRows(name, authorship, family).rows.find((r) => r.status !== 'Accepted' && r.acceptedId === entry.id);
    if (row) return { ...range, synonymOf: { row: entryLabel(row), status: row.status, entry: entryLabel(entry), entryName: entry.name }, rangeVia: { kind: 'synonym-of', ...at, row: entryLabel(row), status: row.status.toLowerCase() } };
    return { ...range, rangeVia: { kind: 'kew-entry', ...at } };
  }
  /** One accepted entry's range, read by its id (IND-9: never looked up again by name); null when this index did not read it. */
  rangeOf(entry: WcvpName): WcvpRange | null {
    if (!this.loaded.has(entry.id)) return null;
    // A region Kew records as doubtfully present is served as such (round seventy-two, B5): the page lists it apart, and no
    // record is tested against it; a row with no level-3 area names its level-2 region (Agave calodonta's "Mexico", B8).
    const rows = this.dist.get(entry.id) ?? [];
    return {
      rows: rows.map((d) => ({ locationId: `TDWG:${d.l3}`, locality: d.area || d.region || '', establishmentMeans: d.doubtful ? 'DOUBTFUL' : d.introduced ? 'INTRODUCED' : d.extinct ? 'EXTINCT' : 'NATIVE', status: d.extinct ? 'extinct' : undefined, source: 'World Checklist of Vascular Plants (WCVP), RBG Kew' })),
      kew: { lifeform: entry.lifeform, climate: entry.climate },
      entry
    };
  }
  /**
   * Distribution rows in the shape gbif.distributions() returns, so build.ts needs no new branch: null when the name is
   * unknown or its entry's range was not read, 'ambiguous' for unresolved homonyms, and rows (none when Kew holds the
   * entry with no range: Lantana × strigocamara, a garden hybrid; round sixty-nine, triage-68 M2) otherwise.
   */
  distributions(name: string, authorship?: string, family?: string): WcvpRange | 'ambiguous' | null {
    const a = this.accepted(name, authorship, family);
    if (!a) return null;
    if (a === 'ambiguous') return 'ambiguous';
    const range = this.rangeOf(a);
    if (!range) return range;
    // Where the range comes from, as a field (round seventy-two, B3): `distribution.via`.
    const at = { entry: entryLabel(a), name: a.name, ...(this.fileDay ? { file: this.fileDay } : {}) };
    const own: RangeVia = { kind: 'own', ...at, ...(a.status === 'Unplaced' ? { unplaced: true } : {}) };
    if (!authorKey(authorship)) return { ...range, rangeVia: own };
    const { rows, spelt } = this.ownRows(name, authorship, family);
    if (wcvpKey(a.name) === wcvpKey(name)) {
      // Kew's entry of these words, reached by no row whose author is the backbone's: the one entry Kew accepts by the
      // words, or the entry the family rule or the species rule moved to (B2: Ixora coccinea "Comm. ex Lam." showed Kew's
      // Ixora coccinea L.'s range, and Fragaria virginiana Duchesne Miller's species', and nothing said whose).
      const agreed = ownByAuthor(rows, authorship, (r) => r.authors).some((r) => this.entryOf(r).id === a.id);
      return { ...range, rangeVia: agreed ? own : { kind: 'kew-entry', ...at } };
    }
    // The own row the entry was reached by, when it is another name's entry: said (S-B4).
    const syn = rows.find((r) => r.status !== 'Accepted' && r.acceptedId === a.id && wcvpKey(r.name) === wcvpKey(name));
    if (syn) return { ...range, synonymOf: { row: entryLabel(syn), status: syn.status, entry: entryLabel(a), entryName: a.name }, rangeVia: { kind: 'synonym-of', ...at, row: entryLabel(syn), status: syn.status.toLowerCase() } };
    // Kew's row of the name as Kew spells it: an Accepted entry of other words, or a synonym row of them (B7).
    const spelling = rows.find((r) => r.acceptedId === a.id || r.id === a.id);
    if (spelt && spelling && spelling.status !== 'Accepted') return { ...range, synonymOf: { row: entryLabel(spelling), status: spelling.status, entry: entryLabel(a), entryName: a.name }, rangeVia: { kind: 'synonym-of', ...at, row: entryLabel(spelling), status: spelling.status.toLowerCase() } };
    return { ...range, rangeVia: spelt ? { kind: 'spelling', ...at } : own };
  }
  /**
   * When Kew holds no row at all under the backbone's name, its range under one of the species' older names (round
   * sixty-eight): GBIF's Bisnaga glaucescens is Ferocactus glaucescens at Kew, and its Aeonium tabulaeforme is spelt
   * tabuliforme there. Round sixty-nine (triage-68 M2, S-A1, IND-9, R46-11) closed the path by which Lantana
   * × strigocamara took the range of Lantana camara subsp. aculeata:
   *   - an older name counts only where its author agrees with the WCVP row's, however many rows there are;
   *   - a pro parte synonym is skipped (part of it is another plant);
   *   - every accepted entry reached counts, with a range or without, and exactly one is required, at species rank;
   *   - one older name that leads to two entries is no answer;
   *   - the range is read by the entry's id, and the record names the entry and the older name it was reached by:
   *     "Erythrina afra Thunb.", reached by "Erythrina fissa C.Presl".
   * Same-type names are not required: Erythrina caffra reaches Kew's E. afra only through heterotypic names (S-A1).
   */
  viaOlderNames(older: ReadonlyArray<{ name: string; authorship?: string; status?: string }>): (WcvpRange & { via: string; rangeVia: RangeVia }) | { ambiguous: string } | null {
    const hits = new Map<string, { entry: WcvpName; via: string }>(); // accepted id → the entry, and the older name it was reached by
    for (const o of older) {
      if (/pro.?parte/i.test(o.status ?? '')) continue;
      const agree = (this.rowsOf(o.name) ?? []).filter((r) => authorsAgree(o.authorship, r.authors));
      const via = `${o.name} ${o.authorship}`;
      const ends = new Map<string, WcvpName>();
      for (const r of agree) {
        const e = r.status === 'Accepted' ? r : this.byId.get(r.acceptedId);
        if (e) ends.set(e.id, e);
      }
      // One older name Kew holds twice, by the same author, under two entries: not resolved here, so nothing is taken.
      if (ends.size > 1) return { ambiguous: `Kew holds the older name ${via} under ${ends.size} entries (${[...ends.values()].map(entryLabel).join('; ')})` };
      for (const e of ends.values()) if (!hits.has(e.id)) hits.set(e.id, { entry: e, via });
    }
    if (hits.size > 1) return { ambiguous: `the older names lead to ${hits.size} Kew entries (${[...hits.values()].map((h) => `${entryLabel(h.entry)}, reached by ${h.via}`).join('; ')})` };
    const [hit] = hits.values();
    if (!hit || !/^species$/i.test(hit.entry.rank)) return null;
    const got = this.rangeOf(hit.entry);
    return got?.rows.some((r) => r.establishmentMeans !== 'DOUBTFUL') ? { ...got, via: hit.via, rangeVia: { kind: 'older-name', entry: entryLabel(hit.entry), name: hit.entry.name, row: hit.via, ...(this.fileDay ? { file: this.fileDay } : {}) } } : null;
  }
  get size(): number {
    return this.byName.size;
  }
}

/* ------------------------------------------------------------------ GBIF occurrence download */

/**
 * The columns of occurrence.txt the reader reads, by their Darwin Core Archive names. GBIF's SQL download (round
 * seventy-nine) names a column by the query's alias in lower case (`gbifid`, `decimallatitude`), so a header is read
 * case-blind against these names and both downloads give the reader the same row.
 */
export const OCC_TERMS = ['gbifID', 'decimalLatitude', 'decimalLongitude', 'coordinateUncertaintyInMeters', 'coordinatePrecision', 'year', 'countryCode', 'basisOfRecord', 'license', 'datasetKey', 'establishmentMeans', 'degreeOfEstablishment', 'mediaType', 'speciesKey', 'taxonKey', 'acceptedTaxonKey'] as const;
const TERM_OF = new Map<string, string>(OCC_TERMS.map((t) => [t.toLowerCase(), t]));

/**
 * The SQL download's columns (round seventy-nine): every term the reader reads but `mediaType`, which only marks a record
 * for the photographs and the SQL download carries none (they come from bulk/media.zip). Each is GBIF's column, as
 * https://techdocs.gbif.org/en/data-use/api-sql-downloads lists them, under the alias the reader reads. The three keys are
 * the GBIF Backbone's (`occurrence.gbif_classification.*`): the table's own `specieskey`, `taxonkey` and
 * `acceptedtaxonkey` are Catalogue of Life's, and the build asks and judges by backbone key, as the DWCA (asked with no
 * checklistKey) gives them. A vocabulary column is a structure, read as its concept, which is what a DWCA writes.
 */
export const SQL_SELECT: ReadonlyArray<readonly [expression: string, alias: string]> = [
  ['gbifid', 'gbifid'],
  ['occurrence.gbif_classification.specieskey', 'specieskey'],
  ['occurrence.gbif_classification.taxonkey', 'taxonkey'],
  ['occurrence.gbif_classification.acceptedtaxonkey', 'acceptedtaxonkey'],
  ['decimallatitude', 'decimallatitude'],
  ['decimallongitude', 'decimallongitude'],
  ['coordinateuncertaintyinmeters', 'coordinateuncertaintyinmeters'],
  ['coordinateprecision', 'coordinateprecision'],
  ['"year"', 'year'],
  ['countrycode', 'countrycode'],
  ['basisofrecord', 'basisofrecord'],
  ['license', 'license'],
  ['datasetkey', 'datasetkey'],
  ['establishmentmeans.concept', 'establishmentmeans'],
  ['degreeofestablishment.concept', 'degreeofestablishment']
];

/** Read a records header (a DWCA's occurrence.txt, an old SIMPLE_CSV, or an SQL download's <key>.csv), each name as the reader reads it. Tab-delimited, no quoting. */
export function occHeader(line: string): string[] {
  return line.replace(/^\uFEFF/, '').replace(/\r$/, '').split('\t').map((n) => TERM_OF.get(n.toLowerCase()) ?? n);
}

export function parseOccRow(h: string[], line: string): GbifOccurrence & { speciesKey?: number; taxonKey?: number; acceptedTaxonKey?: number } | null {
  const c = line.replace(/\r$/, '').split('\t');
  if (c.length < h.length - 2) return null;
  const g: Record<string, string> = {};
  for (let i = 0; i < h.length; i++) g[h[i]] = c[i] ?? '';
  // A blank or whitespace coordinate is not 0,0: require a digit before trusting Number().
  if (!/\d/.test(g.decimalLatitude ?? '') || !/\d/.test(g.decimalLongitude ?? '')) return null;
  const lat = Number(g.decimalLatitude), lon = Number(g.decimalLongitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const unc = Number(g.coordinateUncertaintyInMeters);
  const prec = Number(g.coordinatePrecision);
  // The decimal places as the download writes them, before Number() loses a trailing zero: "-33.120" is three (round thirty-five, R2-2).
  const dec = (x: string) => (x.trim().split('.')[1] ?? '').replace(/e.*$/i, '').length;
  return {
    key: Number(g.gbifID),
    decimalLatitude: lat,
    decimalLongitude: lon,
    coordDecimals: Math.min(dec(g.decimalLatitude), dec(g.decimalLongitude)),
    coordinatePrecision: Number.isFinite(prec) && prec > 0 ? prec : undefined,
    year: g.year ? Number(g.year) : undefined,
    countryCode: g.countryCode || undefined,
    basisOfRecord: g.basisOfRecord || undefined,
    license: g.license || undefined,
    datasetKey: g.datasetKey || undefined,
    // GBIF's two cultivation flags carried as one string: the build tests both with one pattern, and the API path sees both fields.
    establishmentMeans: [g.establishmentMeans, g.degreeOfEstablishment].filter(Boolean).join(' ') || undefined,
    coordinateUncertaintyInMeters: Number.isFinite(unc) && unc > 0 ? unc : undefined,
    mediaType: g.mediaType || undefined,
    speciesKey: g.speciesKey ? Number(g.speciesKey) : undefined,
    taxonKey: g.taxonKey ? Number(g.taxonKey) : undefined,
    // The accepted taxon of a record identified as a synonym (round seventy-three): a page's other key below species is
    // asked for by it, as GBIF's taxonKey search answers for the subspecies with its synonyms' records.
    ...(g.acceptedTaxonKey ? { acceptedTaxonKey: Number(g.acceptedTaxonKey) } : {})
  };
}

/**
 * A stable hash of a gbifID into [0, 1), so the sample a rebuild keeps is the same sample.
 *
 * Every safe-integer bit counts: the id's high 32 bits are folded into the low
 * word before the mixer, so idHash(1) !== idHash(4294967297). GBIF ids passed
 * 2^32 in 2024; an earlier version masked to 32 bits and hashed those ids as if
 * they were small ones. For ids below 2^32 the value is unchanged (the high word
 * is zero), so the sample changed once, for ids above 2^32, and a rebuild keeps
 * the new sample from then on.
 */
export function idHash(id: number): number {
  const lo = id >>> 0, hi = Math.floor(id / 4294967296) >>> 0;
  let x = ((lo ^ 0x9e3779b9) ^ Math.imul(hi, 0x85ebca6b)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

/**
 * Occurrences by species key, capped per species. The API path returns at
 * most 900; a download can hold a hundred thousand for one species. Each
 * species keeps the `cap` rows with the smallest id-hash: a uniform sample,
 * decided row by row so memory stays bounded while the file streams, and
 * deterministic so a rebuild finds the same habitat centre. Once a species
 * is full, a row is only admitted if its hash beats the current worst, so
 * the buffer never exceeds cap × 1.25 and admissions become rare quickly.
 *
 * Memory is the whole game: a download for 9,000 species is 28 M rows, so
 * only species in `wanted` (when given) are kept at all. The full list's is
 * about 146 M rows of 47,116 keys, of which about 34 M are kept for the whole
 * build (round eighty, X: 726 a key on a random 500 of the list's keys), so a
 * kept row is 80 bytes of a typed array (`Rows`), its strings numbered once in
 * `Strings`. As a 15-element array it was 241 bytes of heap: about 8.3 GB at
 * the full list, more than the builder's 8 GB.
 */

/** Strings numbered in the order first seen, 0 for none; one table a field, so a small field's numbers stay small. */
class Strings {
  private ids = new Map<string, number>([['', 0]]);
  private list: string[] = [''];
  constructor(private what: string, private max = 0xffffffff) {}
  id(s: string | undefined): number {
    if (!s) return 0;
    let i = this.ids.get(s);
    if (i === undefined) {
      i = this.list.length;
      if (i > this.max) throw new Error(`more than ${this.max} distinct values of ${this.what} in the occurrence download: the sample cannot number them`);
      const own = ownText(s);
      this.ids.set(own, i);
      this.list.push(own);
    }
    return i;
  }
  at(i: number): string { return this.list[i]; }
}

/**
 * One key's kept rows (round eighty, X): row i is eight doubles at f[i * 10], hash, gbifID, latitude, longitude, year,
 * uncertainty, precision and the record's taxon key, then four 32-bit numbers at u[i * 20 + 16], the country, the dataset,
 * the cultivation flags, and the decimals + 1, the part + 1, the basis and the licence a byte each.
 */
class Rows {
  f: Float64Array;
  u: Uint32Array;
  n = 0;
  constructor(public room: number) {
    const b = new ArrayBuffer(room * Rows.BYTES);
    this.f = new Float64Array(b);
    this.u = new Uint32Array(b);
  }
  static readonly BYTES = 80;
  /** Room for one more row, grown by half up to `most`. */
  grow(most: number): void {
    if (this.n < this.room) return;
    const to = Math.max(this.n + 1, Math.min(Math.max(8, Math.ceil(this.room * 1.5)), most));
    const r = new Rows(to);
    r.f.set(this.f.subarray(0, this.n * 10));
    r.n = this.n;
    this.room = to; this.f = r.f; this.u = r.u;
  }
}

export class OccIndex {
  private by = new Map<number, Rows>();
  private worst = new Map<number, number>(); // per species, the largest hash still inside the cap (Infinity until full)
  private cc = new Strings('countryCode');
  private ds = new Strings('datasetKey');
  private est = new Strings('establishmentMeans');
  private basis = new Strings('basisOfRecord', 255);
  private lic = new Strings('license', 255);
  /** The download's DOI, when known: every record served carries it so the dossier can cite it. */
  doi?: string;
  /** The day GBIF made the download (`downloadDay`): the records are as GBIF held them then (round seventy-two, B1). */
  day?: string;
  /**
   * A download asked in parts (round seventy-nine; `bulk-fetch.ts --parts`): each part's DOI and day, in the order read.
   * A record carries its own part's, so a page cites the download that holds its records.
   */
  private parts: Array<{ doi?: string; day?: string }> = [];
  private part = -1;
  /**
   * gbifID → owner key for observation records that carry images, a few dozen per species, so multimedia.txt can be read
   * for them. Kept live: a record is added when it enters a species' media sample and removed when a better hash evicts it.
   */
  readonly withMedia = new Map<number, number>();
  /** Per owner, the media-bearing records inside the sample, sorted by hash ascending: the same rule as the record sample. */
  private mediaBy = new Map<number, Array<[h: number, key: number]>>();
  /** gbifID → its rank in its owner's media sample (open records first, then by id-hash), for MediaIndex's order. */
  readonly mediaRank = new Map<number, number>();
  static readonly MEDIA_PER_SPECIES = 40;
  constructor(private cap = 2000, private wanted?: Set<number>) {}
  private isWanted(k: number): boolean {
    return !this.wanted || this.wanted.has(k);
  }
  /**
   * Photographs: the MEDIA_PER_SPECIES media-bearing observation records with the smallest id-hash per owner, so the set
   * is a uniform sample of the download rather than the first forty in file order (which favours whichever dataset sorts
   * first). A small sorted array per owner; a newcomer that beats the worst evicts it.
   */
  private admitMedia(owner: number, key: number, h: number): void {
    const arr = this.mediaBy.get(owner) ?? [];
    const full = arr.length >= OccIndex.MEDIA_PER_SPECIES;
    if (full && h >= arr[arr.length - 1][0]) return;
    let i = arr.length;
    while (i > 0 && arr[i - 1][0] > h) i--;
    if (arr.some((x) => x[1] === key)) return; // a record seen twice (an archive read again) is one record
    arr.splice(i, 0, [h, key]);
    this.withMedia.set(key, owner);
    this.mediaRank.set(key, h);
    if (full) { const out = arr.pop()![1]; this.withMedia.delete(out); this.mediaRank.delete(out); }
    this.mediaBy.set(owner, arr);
  }
  /** The download's parts (round seventy-nine): records added from here on are of a part with this DOI and day. */
  startPart(doi?: string, day?: string): void {
    this.parts.push({ doi, day });
    this.part = this.parts.length - 1;
  }
  add(o: GbifOccurrence & { speciesKey?: number; taxonKey?: number; acceptedTaxonKey?: number }): void {
    const h = idHash(o.key);
    this.addMedia(o);
    for (const k of new Set([o.speciesKey, o.taxonKey, o.acceptedTaxonKey])) {
      if (!k) continue;
      if (!this.isWanted(k)) continue;
      if (h >= (this.worst.get(k) ?? Infinity)) continue;
      let rows = this.by.get(k);
      if (!rows) this.by.set(k, (rows = new Rows(8)));
      rows.grow(Math.floor(this.cap * 1.25) + 1);
      const i = rows.n++, f = i * 10, u = i * 20 + 16;
      rows.f[f] = h; rows.f[f + 1] = o.key; rows.f[f + 2] = o.decimalLatitude ?? NaN; rows.f[f + 3] = o.decimalLongitude ?? NaN;
      rows.f[f + 4] = o.year ?? 0; rows.f[f + 5] = o.coordinateUncertaintyInMeters ?? 0; rows.f[f + 6] = o.coordinatePrecision ?? 0; rows.f[f + 7] = o.taxonKey ?? 0;
      const dec = (o.coordDecimals ?? -1) + 1, part = this.part + 1;
      if (dec > 255 || part > 255) throw new Error(`a record with ${o.coordDecimals} decimals in its coordinates, or of part ${this.part + 1}: more than the sample can hold`);
      rows.u[u] = this.cc.id(o.countryCode); rows.u[u + 1] = this.ds.id(o.datasetKey); rows.u[u + 2] = this.est.id(o.establishmentMeans);
      rows.u[u + 3] = dec | (part << 8) | (this.basis.id(o.basisOfRecord) << 16) | (this.lic.id(o.license) << 24);
      if (rows.n > this.cap * 1.25) this.trim(k, rows);
    }
  }
  /**
   * The photographs' half of `add` alone (round seventy-nine): a record of the images' download (bulk/media.zip) beside an
   * SQL download, which holds the same record without its images. The same rule, so the same records are marked as a
   * DWCA's own reading would mark them, and no record is kept twice.
   */
  addMedia(o: GbifOccurrence & { speciesKey?: number; taxonKey?: number; acceptedTaxonKey?: number }): void {
    // A record identified to a subspecies belongs to its species' page, so the owner of its photographs is the species
    // key, unless that species is not wanted and the subspecies (taxonKey) is: then the subspecies' page gets them.
    const owner = o.speciesKey && this.isWanted(o.speciesKey) ? o.speciesKey : (o.taxonKey ?? o.speciesKey);
    // Records under an open licence first, as the API path asks for them (`license=CC0_1_0&license=CC_BY_4_0`), and the
    // others only where there are fewer than forty open ones (an NC record may carry an open photograph): forty drawn
    // whatever their licence left a few open photographs where the API gives twenty-four (round seventy, the owner's run:
    // Anisocampium niponicum 24 to 8; 177 of its 949 photographed records are open).
    const h = idHash(o.key);
    const rank = !o.license || isOpen(licenceTag(o.license)) ? h : 1 + h;
    if (owner && this.isWanted(owner) && /still/i.test(o.mediaType ?? '') && o.basisOfRecord === 'HUMAN_OBSERVATION') this.admitMedia(owner, o.key, rank);
  }
  /** The rows in the order `order` gives, the first `n` of them, into a buffer of `room` rows (at least `n`). */
  private reorder(rows: Rows, order: number[], n: number, room: number): void {
    const r = new Rows(Math.max(n, room));
    for (let j = 0; j < n; j++) {
      const i = order[j];
      r.f.set(rows.f.subarray(i * 10, i * 10 + 8), j * 10);
      r.u.set(rows.u.subarray(i * 20 + 16, i * 20 + 20), j * 20 + 16);
    }
    rows.f = r.f; rows.u = r.u; rows.room = r.room; rows.n = n;
  }
  private trim(k: number, rows: Rows, room = rows.room): void {
    const f = rows.f;
    // By hash, then gbifID; a sort that keeps the order of equal rows, as the array's sort did.
    const order = Array.from({ length: rows.n }, (_, i) => i).sort((a, b) => f[a * 10] - f[b * 10] || f[a * 10 + 1] - f[b * 10 + 1]);
    // A record two parts of a download both hold (round seventy-nine: one part asked for a synonym's key, another for its
    // species') is one record: its copies sort together, and only the first is kept.
    let w = 0;
    for (let r = 0; r < order.length; r++) if (!w || f[order[r] * 10 + 1] !== f[order[w - 1] * 10 + 1]) order[w++] = order[r];
    let n = w;
    if (n > this.cap) {
      n = this.cap;
      this.worst.set(k, f[order[this.cap - 1] * 10]);
    }
    this.reorder(rows, order, n, room);
  }
  /** Finish: apply the cap to every species and put rows in id order, each key's buffer cut to its rows. */
  seal(): void {
    for (const [k, rows] of this.by) {
      this.trim(k, rows, 0);
      const f = rows.f;
      this.reorder(rows, Array.from({ length: rows.n }, (_, i) => i).sort((a, b) => f[a * 10 + 1] - f[b * 10 + 1]), rows.n, 0);
    }
  }
  get(key: number): GbifOccurrence[] | undefined {
    const rows = this.by.get(key);
    if (!rows) return undefined;
    const out: GbifOccurrence[] = [];
    for (let i = 0; i < rows.n; i++) {
      const f = i * 10, u = i * 20 + 16, packed = rows.u[u + 3];
      const dec = (packed & 255) - 1, part = ((packed >>> 8) & 255) - 1;
      out.push({
        key: rows.f[f + 1],
        decimalLatitude: rows.f[f + 2],
        decimalLongitude: rows.f[f + 3],
        year: rows.f[f + 4] || undefined,
        countryCode: this.cc.at(rows.u[u]) || undefined,
        basisOfRecord: this.basis.at((packed >>> 16) & 255) || undefined,
        license: this.lic.at(packed >>> 24) || undefined,
        datasetKey: this.ds.at(rows.u[u + 1]) || undefined,
        establishmentMeans: this.est.at(rows.u[u + 2]) || undefined,
        coordinateUncertaintyInMeters: rows.f[f + 5] || undefined,
        coordDecimals: dec >= 0 ? dec : undefined,
        coordinatePrecision: rows.f[f + 6] || undefined,
        // The name the record is identified as (round seventy-three): a page's other keys leave some out by it.
        ...(rows.f[f + 7] ? { taxonKey: rows.f[f + 7] } : {}),
        downloadDoi: this.parts[part]?.doi ?? this.doi,
        ...((this.parts[part]?.day ?? this.day) ? { downloadDay: this.parts[part]?.day ?? this.day } : {})
      });
    }
    return out;
  }
  get species(): number {
    return this.by.size;
  }
  /** Rows currently held, over every species. */
  get kept(): number {
    let n = 0;
    for (const r of this.by.values()) n += r.n;
    return n;
  }
}

/* ------------------------------------------------------------------ GBIF multimedia (DWCA downloads) */

export interface MediaRow {
  gbifID: number;
  identifier: string;
  license?: string;
  creator?: string;
  rightsHolder?: string;
  references?: string;
  type?: string;
  format?: string;
}

/** One multimedia.txt row by its header (tab-delimited, no quoting). */
export function parseMediaRow(h: string[], line: string): MediaRow | null {
  const c = line.replace(/\r$/, '').split('\t');
  const g: Record<string, string> = {};
  for (let i = 0; i < h.length; i++) g[h[i]] = c[i] ?? '';
  const id = Number(g.gbifID);
  if (!Number.isFinite(id) || !g.identifier) return null;
  return { gbifID: id, identifier: g.identifier, license: g.license || undefined, creator: g.creator || undefined, rightsHolder: g.rightsHolder || undefined, references: g.references || undefined, type: g.type || undefined, format: g.format || undefined };
}

/**
 * Photographs from the download's multimedia.txt: for the observation records
 * OccIndex marked as carrying images, the image rows with an open licence, up
 * to thirty a species. Served to the builder in the shape of GBIF's media
 * search, so the media adapter and the dossier cannot tell the paths apart.
 *
 * The thirty are the first by their record's rank in the sample (`rankOf`: open records first, then by id-hash; without
 * it, by id-hash), and a record's own images in the order the file gives them, never the first thirty in file order
 * (round seventy-nine): a DWCA and the images' download beside an SQL download hold the same records in different
 * orders, and each must give a page the same photographs.
 */
export class MediaIndex {
  private by = new Map<number, Array<{ gbifID: number; m: MediaRow; rank: number; seq: number }>>();
  private seq = 0;
  static readonly CAP = 30;
  constructor(private ownerOf: Map<number, number>, private rankOf?: Map<number, number>) {}
  add(m: MediaRow): void {
    const k = this.ownerOf.get(m.gbifID);
    if (!k) return;
    if (m.type && !/still/i.test(m.type)) return;
    if (m.format && !/^image\//i.test(m.format)) return;
    if (!isOpen(licenceTag(m.license))) return; // the per-photo licence decides; a CC-BY-NC image is not served
    const arr = this.by.get(k) ?? [];
    const rank = this.rankOf?.get(m.gbifID) ?? idHash(m.gbifID);
    type Row = { gbifID: number; m: MediaRow; rank: number; seq: number };
    const before = (a: Row, b: Row) => a.rank < b.rank || (a.rank === b.rank && (a.gbifID < b.gbifID || (a.gbifID === b.gbifID && a.seq < b.seq)));
    const probe: Row = { gbifID: m.gbifID, m, rank, seq: this.seq };
    if (arr.length >= MediaIndex.CAP && !before(probe, arr[arr.length - 1])) return;
    // Kept: its text copied out of the line (`ownText`), so the photograph does not keep the file's text alive.
    const o = (x?: string) => (x === undefined ? undefined : ownText(x));
    const row: Row = { gbifID: m.gbifID, m: { gbifID: m.gbifID, identifier: ownText(m.identifier), license: o(m.license), creator: o(m.creator), rightsHolder: o(m.rightsHolder), references: o(m.references), type: o(m.type), format: o(m.format) }, rank, seq: this.seq++ };
    let i = arr.length;
    while (i > 0 && before(row, arr[i - 1])) i--;
    arr.splice(i, 0, row);
    if (arr.length > MediaIndex.CAP) arr.pop();
    this.by.set(k, arr);
  }
  /** As GBIF's occurrence search with mediaType=StillImage would answer: one occurrence per record, its media on it. */
  page(key: number): OccPage | undefined {
    const rows = this.by.get(key);
    if (!rows) return undefined;
    const byRec = new Map<number, GbifOccurrence>();
    for (const { gbifID, m } of rows) {
      const o = byRec.get(gbifID) ?? { key: gbifID, basisOfRecord: 'HUMAN_OBSERVATION', media: [] };
      o.media!.push({ type: 'StillImage', identifier: m.identifier, license: m.license, rightsHolder: m.rightsHolder, creator: m.creator, references: m.references });
      byRec.set(gbifID, o);
    }
    const results = [...byRec.values()];
    return { results, endOfRecords: true, count: results.length };
  }
  get species(): number {
    return this.by.size;
  }
}

/* ------------------------------------------------------------------ the wrapping fetcher */

const RE_SPECIES = /\/species\/(\d+)$/;
const RE_DIST = /\/species\/(\d+)\/distributions/;
const RE_SYN = /\/species\/(\d+)\/synonyms\?/;
const RE_OCC = /\/occurrence\/search\?taxonKey=(\d+)&hasCoordinate=true/;
const RE_MEDIA = /\/occurrence\/search\?taxonKey=(\d+)&mediaType=StillImage/;

export interface BulkSources {
  wcvp?: WcvpIndex;
  occ?: OccIndex;
  media?: MediaIndex;
  /**
   * The species the download request left to the API path (bulk/api-path.txt): the download holds no record of theirs, so
   * its having no photograph of them says nothing, and their media requests go through (round sixty-seven; triage-66 N4:
   * 120 such species lost every photograph to an offline re-derivation that read "none" from the files).
   */
  apiPath?: ReadonlySet<number>;
  /**
   * The species the download was asked for (bulk/keys.json's keys), when known. A species outside it has no record in the
   * files because none was asked, so its media requests go through as well (round seventy, the owner's run: a rebuild of
   * 118 species with a download made for 33 of them read "no photograph" for the other 85, and Heliotropium velutinum,
   * Talinella grevei and eight more lost their GBIF photographs).
   */
  covered?: ReadonlySet<number>;
  /**
   * The page's own Kew entry for a GBIF key (round eighty, A): the species list's plant_name_id for the key, or the id of
   * the page on disk (`k<plant_name_id>`). Where it is known and Kew's file holds it, the range is that entry's, read by
   * its id, whatever Kew makes of GBIF's name for the key; where GBIF's name reaches that same entry, the answer is the
   * name's, as before.
   */
  entryOf?: (key: number) => string | undefined;
}

/**
 * Answer distribution and occurrence requests from the bulk files; pass the
 * rest through. When a file has nothing for a species the request falls
 * through to the API, so a name missing from the download still builds.
 */
export function bulkFetcher(base: JsonFetcher, src: BulkSources, stats = { wcvp: 0, occ: 0, media: 0, through: 0 }): JsonFetcher & { stats: typeof stats } {
  // JsonFetcher is generic in what the caller expects (`f<T>(url)`), and the URL is the only thing that says what T is: a
  // fetcher cannot prove to the type checker that a distributions URL is answered with a distributions page. The regexes
  // below decide that, so each answer is built in the shape the matching adapter asks for and cast `as unknown as T` at
  // this one boundary; the adapters' tests, run through this fetcher, are what keep the shapes honest.
  const names = new Map<number, { name: string; authorship?: string; family?: string }>(); // key → canonical name and authorship, learned from /species/{key} on the way past
  // The builder's own reading of GBIF's synonyms, page by page as it asked them, for the species being built (one at a
  // time): the older-name fallback reads the same list, through the same function, and asks GBIF nothing again (round
  // sixty-nine; triage-68 M4, S-A3: the two asks could have disagreed, one refused and one answered).
  let synOf = 0;
  const synPages = new Map<string, FetchResult<unknown>>();
  const f = async <T = unknown>(url: string, opts?: FetchOptions): Promise<FetchResult<T>> => {
    let m: RegExpExecArray | null;
    if ((m = RE_SYN.exec(url))) {
      if (Number(m[1]) !== synOf) { synOf = Number(m[1]); synPages.clear(); }
      const held = synPages.get(url);
      if (held) return held as FetchResult<T>;
      stats.through++;
      const r = await base<T>(url, opts);
      synPages.set(url, r);
      return r;
    }
    if (src.wcvp && (m = RE_DIST.exec(url))) {
      const key = Number(m[1]);
      let sp = names.get(key);
      if (!sp) {
        const r = await base<GbifSpecies>(url.replace(/\/distributions.*$/, ''));
        if (r.status === 'ok') names.set(key, (sp = { name: r.data.canonicalName ?? r.data.scientificName, authorship: r.data.authorship, family: r.data.family }));
      }
      const got = sp ? src.wcvp.distributions(sp.name, sp.authorship, sp.family) : null;
      // The page's own Kew entry, where the name reaches another entry or none (round eighty, A): its range by its id.
      const own = src.entryOf?.(key);
      // A name that reaches the entry itself, or an entry below it (Orbea maculata subsp. rangeana for the list's Orbea
      // maculata: the narrower range is the page's), keeps the name's answer.
      const below = (g: WcvpRange, id: string) => g.entry.id === id || (() => { const e = src.wcvp!.entryName(id); return !!e && wcvpKey(g.entry.name).startsWith(`${wcvpKey(e)} `); })();
      const byEntry = own && !(got && got !== 'ambiguous' && below(got, own)) ? src.wcvp.rangeById(own, sp?.name, sp?.authorship, sp?.family) : null;
      if (byEntry) {
        stats.wcvp++;
        const syn = { ...(byEntry.synonymOf ? { synonymOf: byEntry.synonymOf } : {}), ...(byEntry.rangeVia ? { rangeVia: byEntry.rangeVia } : {}), ...(src.wcvp.fileDay ? { kewFile: src.wcvp.fileDay } : {}) };
        if (!byEntry.rows.some((r) => r.establishmentMeans !== 'DOUBTFUL')) return { status: 'ok', data: { results: [], held: `${entryLabel(byEntry.entry)}${byEntry.entry.status === 'Artificial Hybrid' ? ', an artificial hybrid' : ''}`, kew: byEntry.kew, ...syn } as unknown as T };
        return { status: 'ok', data: { results: byEntry.rows, kew: byEntry.kew, ...syn } as unknown as T };
      }
      if (got === 'ambiguous') {
        // WCVP holds this name twice, under two entries, and the backbone's authorship does not tell them apart (round
        // seventy: by the publishing author, `ownRows`): no range, and the dossier says why.
        stats.wcvp++;
        // Said as it is (round seventy, second pass; triage-69 B8, R47-10): "matches neither" was written where the author
        // matched both.
        const n = sp!.authorship ? src.wcvp.ownRows(sp!.name, sp!.authorship, sp!.family).rows.length : 0;
        const how = !sp!.authorship ? 'the backbone gives no author to tell them apart' : n > 1 ? `the backbone's authorship (${sp!.authorship}) matches ${n} of them, under different entries` : `the backbone's authorship (${sp!.authorship}) matches neither`;
        return { status: 'ok', data: { results: [], ambiguous: `WCVP lists ${sp!.name} more than once, and ${how}` } as unknown as T };
      }
      if (got) {
        stats.wcvp++;
        // Kew holds the name and states no range for it: that is the answer, never a reason to look under older names (round sixty-nine; triage-68 M2).
        // Where the range comes from and the day of Kew's files, passed on (round seventy-two, B1, B3).
        const syn = { ...(got.synonymOf ? { synonymOf: got.synonymOf } : {}), ...(got.rangeVia ? { rangeVia: got.rangeVia } : {}), ...(src.wcvp.fileDay ? { kewFile: src.wcvp.fileDay } : {}) };
        // Only doubtful regions, or none: Kew holds the name with no range (an artificial hybrid said so: Delphinium × cultorum, B8).
        if (!got.rows.some((r) => r.establishmentMeans !== 'DOUBTFUL')) return { status: 'ok', data: { results: [], held: `${entryLabel(got.entry)}${got.entry.status === 'Artificial Hybrid' ? ', an artificial hybrid' : ''}`, kew: got.kew, ...syn } as unknown as T };
        return { status: 'ok', data: { results: got.rows, kew: got.kew, ...syn } as unknown as T };
      }
      // No row of the species' own name (`ownRows`: none under its words by its author, or under another spelling): one of
      // its older names may be Kew's (round sixty-eight), read from the builder's own paged list; a list refused, failed or
      // cut short is no answer, and nothing is taken (triage-68 M4). Rows of its words by another author are another
      // name, said in the record, never Kew's answer for this species (round seventy; triage-69 B4, S-B4).
      // Why Kew's file gave this species no range, for the record when GBIF has none either (round eighty-two, F; review
      // 1's 7: Bisnaga hamatacantha's range row said "none" and not why).
      let noKew: string | undefined;
      if (sp && !src.wcvp.holds(sp.name, sp.authorship, sp.family)) {
        const others = src.wcvp.ownRows(sp.name, sp.authorship, sp.family).others;
        // "Another name" only where the row is plainly another author's (`plainlyAnother`, the rule the links read): Kew's
        // "Monsonia mossamedensis Welw. ex Oliv." is GBIF's "Welw.", one name the author rule does not read as the species'
        // own (round seventy-two, B: four pages called their own name another).
        const plainly = others.filter((r) => plainlyAnother(sp.authorship, r.authors)), cited = others.filter((r) => !plainly.includes(r));
        const otherAuthor = others.length ? [plainly.length ? `Kew holds ${sp.name} only under another author (${plainly.map(entryLabel).join('; ')}), which is another name` : '', cited.length ? `Kew cites ${sp.name} otherwise (${cited.map(entryLabel).join('; ')}), and its row is not read as this species' own` : ''].filter(Boolean).join('; ') : undefined;
        const syn = await readSynonyms(f, key);
        const via = syn.status === 'ok' && !syn.truncated ? src.wcvp.viaOlderNames(syn.rows ?? []) : null;
        if (via && 'ambiguous' in via) {
          stats.wcvp++;
          return { status: 'ok', data: { results: [], olderAmbiguous: via.ambiguous, ...(otherAuthor ? { otherAuthor } : {}) } as unknown as T };
        }
        if (via) {
          stats.wcvp++;
          return { status: 'ok', data: { results: via.rows, kew: via.kew, entry: entryLabel(via.entry), via: via.via, rangeVia: via.rangeVia, ...(src.wcvp.fileDay ? { kewFile: src.wcvp.fileDay } : {}), ...(otherAuthor ? { otherAuthor } : {}) } as unknown as T };
        }
        if (otherAuthor) {
          // Nothing of Kew's is this species': GBIF's own answer is asked for the national checklists, without the WCVP rows
          // GBIF may have attached to the key from the other author's name, and the record says why.
          stats.through++;
          const r = await base<{ results?: GbifDistribution[] }>(url, opts);
          return (r.status === 'ok' ? { status: 'ok', data: { ...r.data, results: (r.data.results ?? []).filter((d) => !isWcvpRow(d)), otherAuthor } } : r) as unknown as FetchResult<T>;
        }
        const n = syn.status === 'ok' ? (syn.rows ?? []).length : 0;
        const older = syn.status !== 'ok' ? `GBIF's older names for it were not read (${syn.status})` : syn.truncated ? "GBIF's list of its older names was cut short, so they were not read" : n ? `none of GBIF's ${n} older name${n === 1 ? '' : 's'} for it leads to one species Kew accepts with a native range` : 'GBIF lists no older name for it';
        noKew = `Kew's file${src.wcvp.fileDay ? ` of ${src.wcvp.fileDay}` : ''} holds no row of ${sp.name}${sp.authorship ? ` ${sp.authorship}` : ''}, and ${older}`;
      } else if (sp && got === null) noKew = `Kew's file holds ${sp.name}${sp.authorship ? ` ${sp.authorship}` : ''}, and this build did not read its entry's range`;
      if (noKew) {
        stats.through++;
        const r = await base<{ results?: GbifDistribution[] }>(url, opts);
        return (r.status === 'ok' || r.status === 'none' ? { status: 'ok', data: { ...(r.status === 'ok' ? r.data : { results: [] }), noKew } } : r) as unknown as FetchResult<T>;
      }
    } else if (src.media && (m = RE_MEDIA.exec(url)) && !src.apiPath?.has(Number(m[1])) && (!src.covered || src.covered.has(Number(m[1])))) {
      const key = Number(m[1]);
      const page = src.media.page(key);
      if (page) {
        stats.media++;
        return { status: 'ok', data: page as unknown as T };
      }
      // A download with a multimedia member is asked for the whole list of names, so for any species built with it,
      // nothing in the files is the answer: no observation photographs with coordinates. Falling through to the network
      // instead, and then keeping the previous GBIF set when offline, kept herbarium sheets from builds before round
      // thirty on 235 species; a first fix asked only for species with an occurrence set, and 1,407 have none (round
      // thirty-two, 3; round thirty-three).
      stats.media++;
      return { status: 'ok', data: { results: [], endOfRecords: true, count: 0 } as unknown as T };
    } else if (src.occ && (m = RE_OCC.exec(url))) {
      const key = Number(m[1]);
      const rows = src.occ.get(key);
      if (rows) {
        stats.occ++;
        const page: OccPage = { results: rows, endOfRecords: true, count: rows.length };
        return { status: 'ok', data: page as unknown as T };
      }
    }
    stats.through++;
    const r = await base<T>(url, opts);
    if ((m = RE_SPECIES.exec(url)) && r.status === 'ok') {
      const sp = r.data as unknown as GbifSpecies;
      if (sp?.canonicalName) names.set(Number(m[1]), { name: sp.canonicalName, authorship: sp.authorship, family: sp.family });
    }
    return r;
  };
  return Object.assign(f, { stats });
}

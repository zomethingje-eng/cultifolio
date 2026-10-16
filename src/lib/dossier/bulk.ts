/**
 * Bulk sources for a large corpus build. Per-species API calls are the wrong
 * shape at thousands of species; two downloads replace the two slowest legs:
 *
 *   WCVP  — Kew's World Checklist of Vascular Plants, one zip with
 *           wcvp_names.csv and wcvp_distribution.csv (pipe-delimited).
 *   GBIF  — one occurrence download (DWCA: occurrence.txt and multimedia.txt,
 *           tab-delimited) for every taxon key in the list, requested by
 *           scripts/bulk-fetch.ts. Records, and the photographs on them.
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
const family = (f?: string) => { if (!f) return undefined; let v = families.get(f); if (!v) families.set(f, (v = f)); return v; };
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
 * The day of a GBIF download (B1): its key begins with the day GBIF made it ("0006100-260916113435855" is 2026-09-16), else
 * the day it was fetched. The records are as GBIF held them on that day, not on the build's.
 */
export function downloadDay(meta: { key?: string; fetched?: string }): string | undefined {
  const m = /^\d+-(\d{2})(\d{2})(\d{2})\d*$/.exec(meta.key ?? '');
  if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  return /^\d{4}-\d{2}-\d{2}/.test(meta.fetched ?? '') ? meta.fetched!.slice(0, 10) : undefined;
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

/** Read the SIMPLE_CSV header and give a row parser. Tab-delimited, no quoting. */
export function occHeader(line: string): string[] {
  return line.replace(/\r$/, '').split('\t');
}

export function parseOccRow(h: string[], line: string): GbifOccurrence & { speciesKey?: number; taxonKey?: number } | null {
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
    taxonKey: g.taxonKey ? Number(g.taxonKey) : undefined
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
 * only species in `wanted` (when given) are kept at all, and a kept row is a
 * flat array with its strings interned, about a tenth of an object per row.
 */
type Row = [h: number, key: number, lat: number, lon: number, year: number, cc: string, basis: string, lic: string, ds: string, est: string, unc: number, dec: number, prec: number];

export class OccIndex {
  private by = new Map<number, Row[]>();
  private worst = new Map<number, number>(); // per species, the largest hash still inside the cap (Infinity until full)
  private strings = new Map<string, string>();
  /** The download's DOI, when known: every record served carries it so the dossier can cite it. */
  doi?: string;
  /** The day GBIF made the download (`downloadDay`): the records are as GBIF held them then (round seventy-two, B1). */
  day?: string;
  /**
   * gbifID → owner key for observation records that carry images, a few dozen per species, so multimedia.txt can be read
   * for them. Kept live: a record is added when it enters a species' media sample and removed when a better hash evicts it.
   */
  readonly withMedia = new Map<number, number>();
  /** Per owner, the media-bearing records inside the sample, sorted by hash ascending: the same rule as the record sample. */
  private mediaBy = new Map<number, Array<[h: number, key: number]>>();
  static readonly MEDIA_PER_SPECIES = 40;
  constructor(private cap = 2000, private wanted?: Set<number>) {}
  private intern(s: string | undefined): string {
    if (!s) return '';
    let v = this.strings.get(s);
    if (!v) this.strings.set(s, (v = s));
    return v;
  }
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
    arr.splice(i, 0, [h, key]);
    this.withMedia.set(key, owner);
    if (full) this.withMedia.delete(arr.pop()![1]);
    this.mediaBy.set(owner, arr);
  }
  add(o: GbifOccurrence & { speciesKey?: number; taxonKey?: number }): void {
    const h = idHash(o.key);
    // A record identified to a subspecies belongs to its species' page, so the owner of its photographs is the species
    // key, unless that species is not wanted and the subspecies (taxonKey) is: then the subspecies' page gets them.
    const owner = o.speciesKey && this.isWanted(o.speciesKey) ? o.speciesKey : (o.taxonKey ?? o.speciesKey);
    // Records under an open licence first, as the API path asks for them (`license=CC0_1_0&license=CC_BY_4_0`), and the
    // others only where there are fewer than forty open ones (an NC record may carry an open photograph): forty drawn
    // whatever their licence left a few open photographs where the API gives twenty-four (round seventy, the owner's run:
    // Anisocampium niponicum 24 to 8; 177 of its 949 photographed records are open).
    const rank = !o.license || isOpen(licenceTag(o.license)) ? h : 1 + h;
    if (owner && this.isWanted(owner) && /still/i.test(o.mediaType ?? '') && o.basisOfRecord === 'HUMAN_OBSERVATION') this.admitMedia(owner, o.key, rank);
    for (const k of new Set([o.speciesKey, o.taxonKey])) {
      if (!k) continue;
      if (!this.isWanted(k)) continue;
      if (h >= (this.worst.get(k) ?? Infinity)) continue;
      const arr = this.by.get(k) ?? [];
      arr.push([h, o.key, o.decimalLatitude ?? NaN, o.decimalLongitude ?? NaN, o.year ?? 0, this.intern(o.countryCode), this.intern(o.basisOfRecord), this.intern(o.license), this.intern(o.datasetKey), this.intern(o.establishmentMeans), o.coordinateUncertaintyInMeters ?? 0, o.coordDecimals ?? -1, o.coordinatePrecision ?? 0]);
      if (arr.length > this.cap * 1.25) this.trim(k, arr);
      this.by.set(k, arr);
    }
  }
  private trim(k: number, arr: Row[]): void {
    arr.sort((a, b) => a[0] - b[0]);
    if (arr.length > this.cap) {
      arr.length = this.cap;
      this.worst.set(k, arr[this.cap - 1][0]);
    }
  }
  /** Finish: apply the cap to every species and put rows in id order. */
  seal(): void {
    for (const [k, arr] of this.by) {
      this.trim(k, arr);
      arr.sort((a, b) => a[1] - b[1]);
    }
  }
  get(key: number): GbifOccurrence[] | undefined {
    const arr = this.by.get(key);
    return arr?.map((r) => ({
      key: r[1],
      decimalLatitude: r[2],
      decimalLongitude: r[3],
      year: r[4] || undefined,
      countryCode: r[5] || undefined,
      basisOfRecord: r[6] || undefined,
      license: r[7] || undefined,
      datasetKey: r[8] || undefined,
      establishmentMeans: r[9] || undefined,
      coordinateUncertaintyInMeters: r[10] || undefined,
      coordDecimals: r[11] >= 0 ? r[11] : undefined,
      coordinatePrecision: r[12] || undefined,
      downloadDoi: this.doi,
      ...(this.day ? { downloadDay: this.day } : {})
    }));
  }
  get species(): number {
    return this.by.size;
  }
  /** Rows currently held, over every species. */
  get kept(): number {
    let n = 0;
    for (const a of this.by.values()) n += a.length;
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
 */
export class MediaIndex {
  private by = new Map<number, Array<{ gbifID: number; m: MediaRow }>>();
  static readonly CAP = 30;
  constructor(private ownerOf: Map<number, number>) {}
  add(m: MediaRow): void {
    const k = this.ownerOf.get(m.gbifID);
    if (!k) return;
    if (m.type && !/still/i.test(m.type)) return;
    if (m.format && !/^image\//i.test(m.format)) return;
    if (!isOpen(licenceTag(m.license))) return; // the per-photo licence decides; a CC-BY-NC image is not served
    const arr = this.by.get(k) ?? [];
    if (arr.length >= MediaIndex.CAP) return;
    arr.push({ gbifID: m.gbifID, m });
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

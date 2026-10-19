/**
 * Kew's names offline in place of GBIF's copy of them (round seventy-eight, agent B; docs/SCALE-STUDY.md 3.3, "Kew's
 * entry through GBIF's copy of WCVP"). The build asks GBIF's copy of Kew's World Checklist for the rows of a name once a
 * species or more (`/species?datasetKey=<WCVP>&name=`): for the IPNI and POWO numbers a page links and the name it
 * cites (`gbif.kewIpni`), a homonym key (`kewName`), a Wikidata item's proof (`crossIds`), a Wikipedia title's proof
 * (`summary-proof.ts`), and an iNaturalist name or a Commons title read against Kew (`inat.ts`, `photo-kind.ts`). With
 * Kew's own file (`--bulk`), the same question is answered from it, in the shape GBIF gives, so each of those reads the
 * answer unchanged:
 *
 *   - the rows whose name, the hybrid sign set aside, is the name asked, in `plant_name_id` order;
 *   - GBIF's reading of Kew's status, as GBIF's copy gives it for each of Kew's (measured 2026-10-19, three names a
 *     status): Accepted, Local Biotype and Artificial Hybrid are ACCEPTED; Synonym, Invalid, Illegitimate and
 *     Orthographic are SYNONYM; Unplaced is DOUBTFUL; Misapplied is MISAPPLIED;
 *   - the accepted name with its authors, the family (a synonym's is its accepted entry's, as GBIF writes it), Kew's
 *     `plant_name_id` as `taxonID`, and the POWO address of `powo_id` as `references`, from which the IPNI number is read.
 *
 * One thing is not GBIF's: the order of a name's rows. GBIF's copy gives them in the order of its own keys, which Kew's
 * file does not hold; here they are in `plant_name_id` order. Round seventy-eight's live comparison (155 names, 50
 * species) found every row's fields the same once a synonym's family was its entry's, the order different for 13 names
 * of several rows, and `kewIpni`'s answer the same for 49 of 50 species: the 50th, Rubus parviflorus, lists Kew's rows
 * of the name by other authors in another order, which only the wording of a record can show.
 *
 * GBIF's own keys for those rows are not in Kew's file; a row's key here is `KEW_KEY + plant_name_id`, which the two
 * requests that read a key back (an accepted entry's record, `kewEntryIpni`; a genus's accepted species, `genusCount`)
 * are answered with too, and which is stored nowhere. A name outside the genera loaded goes to GBIF, as before. The
 * answer is Kew's file of its day (`fileDay`), the one the range is read from, where GBIF's copy is of the day GBIF last
 * read Kew's: where they differ, the page's links and its range are now of one day.
 */
import type { JsonFetcher, FetchOptions, FetchResult } from './fetch';

/** Added to a `plant_name_id` to make a key no GBIF key is: GBIF's keys for the dataset are under 400 million. */
export const KEW_KEY = 10_000_000_000;
export const WCVP_DATASET = 'f382f0ce-323a-4091-bb9f-add557f3a9a2';

/** GBIF's `taxonomicStatus` for each of Kew's `taxon_status`, as GBIF's copy of Kew's checklist gives it. */
export const GBIF_STATUS: Record<string, string> = {
  Accepted: 'ACCEPTED',
  'Local Biotype': 'ACCEPTED',
  'Artificial Hybrid': 'ACCEPTED',
  Synonym: 'SYNONYM',
  Invalid: 'SYNONYM',
  Illegitimate: 'SYNONYM',
  Orthographic: 'SYNONYM',
  Unplaced: 'DOUBTFUL',
  Misapplied: 'MISAPPLIED'
};

/** One row of Kew's names file, the fields the answer is made of. */
export interface KewRow {
  id: string;
  name: string; // taxon_name, "Lonicera × minutiflora"
  authors: string;
  status: string;
  rank: string; // Species, Genus, Variety, …
  family: string;
  acceptedId: string;
  parentId: string;
  powoId: string;
}

/** A name as GBIF's copy writes its canonical form: the hybrid sign set aside ("Lonicera minutiflora"). */
export const canonicalOfKew = (name: string) => name.replace(/×\s*/g, '').replace(/\s+/g, ' ').trim();
/** A name as GBIF's copy writes it in `scientificName`: the hybrid sign against the word it marks ("Lonicera ×minutiflora Zabel"). */
const sciOf = (r: KewRow) => `${r.name.replace(/×\s+/g, '×')}${r.authors ? ` ${r.authors}` : ''}`;

/** A row kept as one string, its fields in `KewRow`'s order: a million rows held as objects took 1.3 GB at 54,000 species. */
const SEP = '\t';
const encode = (r: KewRow) => [r.id, r.name, r.authors, r.status, r.rank, r.family, r.acceptedId, r.parentId, r.powoId].join(SEP);
const decode = (s: string): KewRow => { const [id, name, authors, status, rank, family, acceptedId, parentId, powoId] = s.split(SEP); return { id, name, authors, status, rank, family, acceptedId, parentId, powoId }; };

export class KewRows {
  /** Lower-case canonical name of one or two words → its rows, of the genera loaded. */
  private byName = new Map<string, string[]>();
  /** `plant_name_id` → row: every row of a name kept, and every row another may be filed under, of any genus. */
  private byId = new Map<number, string>();
  private genera = new Set<string>();
  private children: Map<string, string[]> | null = null;
  /** The day of Kew's file. */
  fileDay?: string;
  /** Rows are kept for the genera given (lower case), and every accepted entry, so a synonym's accepted name reads. */
  constructor(genera: Iterable<string>) {
    for (const g of genera) this.genera.add(g.toLowerCase());
  }
  /**
   * Whether the file's answer for a name is the whole answer: a genus or a binomial (the questions the build asks of
   * Kew's names) of a genus loaded. Anything else is asked of GBIF's copy.
   */
  holds(name: string): boolean {
    const w = canonicalOfKew(name).split(' ');
    return w.length <= 2 && this.genera.has(w[0].toLowerCase());
  }
  /** One row of the file: kept when it is a genus or binomial of a genus loaded, or an entry rows may be filed under. */
  add(r: KewRow): void {
    const canon = canonicalOfKew(r.name);
    const w = canon.split(' ');
    const named = w.length <= 2 && this.genera.has(w[0].toLowerCase());
    // An entry another row may be filed under: its own accepted entry, or a row Kew places nowhere (an Unplaced variety
    // is the "accepted" of Rubus parviflorus Figert ex Sprib. in GBIF's copy).
    const entry = r.acceptedId === r.id || !r.acceptedId;
    if (!named && !entry) return;
    const enc = encode(r);
    if (named) {
      const k = canon.toLowerCase();
      const arr = this.byName.get(k);
      if (arr) arr.push(enc);
      else this.byName.set(k, [enc]);
    }
    this.byId.set(Number(r.id), enc);
  }
  get size(): number {
    return this.byId.size;
  }
  private get(id: string): KewRow | undefined {
    const e = id ? this.byId.get(Number(id)) : undefined;
    return e ? decode(e) : undefined;
  }
  /** GBIF's row for one of Kew's. */
  row(r: KewRow): Record<string, unknown> {
    const acc = r.acceptedId && r.acceptedId !== r.id ? this.get(r.acceptedId) : undefined;
    const status = GBIF_STATUS[r.status] ?? 'DOUBTFUL';
    return {
      key: KEW_KEY + Number(r.id),
      datasetKey: WCVP_DATASET,
      taxonID: r.id,
      scientificName: sciOf(r),
      canonicalName: canonicalOfKew(r.name),
      authorship: r.authors ?? '',
      rank: r.rank.toUpperCase(),
      taxonomicStatus: status,
      // A synonym's family is its accepted entry's, as GBIF's copy writes it (Ixora coccinea Comm. ex Lam., Kew's synonym
      // of Embothrium coccineum, is Proteaceae there, where Kew's file says Rubiaceae), which `kewIpni`'s family rule reads.
      ...((acc?.family || r.family) ? { family: acc?.family || r.family } : {}),
      ...(acc ? { acceptedKey: KEW_KEY + Number(acc.id), accepted: sciOf(acc) } : {}),
      ...(r.parentId ? { parentKey: KEW_KEY + Number(r.parentId) } : {}),
      ...(r.powoId ? { references: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${r.powoId}` } : {})
    };
  }
  /** `/species?datasetKey=<WCVP>&name=`: the rows of the name, in `plant_name_id` order, at most `limit`. */
  byNameAnswer(name: string, limit: number): { offset: number; limit: number; endOfRecords: boolean; results: Array<Record<string, unknown>> } {
    const canon = canonicalOfKew(name);
    const rows = (this.byName.get(canon.toLowerCase()) ?? []).map(decode).filter((r) => canonicalOfKew(r.name) === canon).sort((a, b) => Number(a.id) - Number(b.id));
    return { offset: 0, limit, endOfRecords: rows.length <= limit, results: rows.slice(0, limit).map((r) => this.row(r)) };
  }
  /** `/species/<key>` for a key made here. */
  byKey(key: number): Record<string, unknown> | null {
    const r = this.get(String(key - KEW_KEY));
    return r ? this.row(r) : null;
  }
  /** `/species/search?…&highertaxonKey=<genus key made here>&rank=SPECIES&status=ACCEPTED`: the genus's accepted species. */
  acceptedSpecies(genusKey: number, limit: number): { count: number; results: Array<Record<string, unknown>> } | null {
    const g = this.get(String(genusKey - KEW_KEY));
    if (!g) return null;
    if (!this.children) {
      this.children = new Map();
      for (const e of this.byId.values()) {
        const r = decode(e);
        if (!r.parentId || r.rank !== 'Species' || GBIF_STATUS[r.status] !== 'ACCEPTED') continue;
        const a = this.children.get(r.parentId);
        if (a) a.push(e);
        else this.children.set(r.parentId, [e]);
      }
    }
    const out = (this.children.get(g.id) ?? []).map(decode).sort((a, b) => Number(a.id) - Number(b.id));
    return { count: out.length, results: out.slice(0, limit).map((r) => this.row(r)) };
  }
}

const RE_BY_NAME = new RegExp(`^https://api\\.gbif\\.org/v1/species\\?datasetKey=${WCVP_DATASET}&name=([^&]+)&limit=(\\d+)$`);
const RE_KEY = /^https:\/\/api\.gbif\.org\/v1\/species\/(\d{11,})$/;
const RE_GENUS = new RegExp(`^https://api\\.gbif\\.org/v1/species/search\\?datasetKey=${WCVP_DATASET}&highertaxonKey=(\\d{11,})&rank=SPECIES&status=ACCEPTED&limit=(\\d+)$`);

/**
 * GBIF's copy of Kew's names answered from Kew's file, for the names of the genera loaded; everything else goes through.
 * `stats.answered` counts the requests answered here, `stats.through` those of a genus not loaded.
 */
export function kewRowsFetcher(base: JsonFetcher, kew: KewRows, stats = { answered: 0, through: 0 }): JsonFetcher & { stats: typeof stats } {
  const f = (async <T = unknown>(url: string, opts?: FetchOptions): Promise<FetchResult<T>> => {
    let m: RegExpExecArray | null;
    if ((m = RE_BY_NAME.exec(url))) {
      const name = decodeURIComponent(m[1]);
      if (kew.holds(name)) {
        stats.answered++;
        return { status: 'ok', data: kew.byNameAnswer(name, Number(m[2])) as unknown as T };
      }
      stats.through++;
    } else if ((m = RE_KEY.exec(url))) {
      const r = kew.byKey(Number(m[1]));
      stats.answered++;
      return r ? { status: 'ok', data: r as unknown as T } : { status: 'none' };
    } else if ((m = RE_GENUS.exec(url))) {
      const r = kew.acceptedSpecies(Number(m[1]), Number(m[2]));
      stats.answered++;
      return r ? { status: 'ok', data: { offset: 0, limit: Number(m[2]), endOfRecords: r.count <= Number(m[2]), ...r } as unknown as T } : { status: 'none' };
    }
    return base<T>(url, opts);
  }) as JsonFetcher & { stats: typeof stats };
  f.stats = stats;
  return f;
}

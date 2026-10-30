/**
 * The names GBIF files under a species' own varieties and subspecies, for the search (round eighty-four; outside review
 * A8: "Trichocereus pachanoi" and "Echinopsis pachanoi", San Pedro, answered nothing, though `/species/trichocereus-pachanoi`
 * moved to the page of Trichocereus macrogonus; GBIF files the names under T. macrogonus var. pachanoi, and the index kept
 * the species' own synonyms only). Kew's side is read already: `name.kew.synonyms` holds the names Kew files under the
 * entry's accepted varieties and subspecies (`kewNames`).
 *
 * Read from GBIF's backbone export (`simple.txt.gz`, the file `--list-extra-keys` reads), in two passes, as rows:
 *   1. every accepted usage below species (a subspecies, a variety, a form) whose parent is a page's own GBIF key;
 *   2. every synonym of species rank whose accepted usage (the export's parent of a synonym) is one of those.
 * Their canonical names are the page's `name.infra`, written by `--fill gbif-infra` and by a build given `--bulk` whose
 * folder holds `backbone/simple.txt.gz`; the index adds them to the names the search reads only as a name typed (`kew`),
 * never shown, never an address, and never one another page of the reference is named by. Pure: the script streams the
 * file through these.
 */

/** A row of the export as the passes read it: its key, its parent (a synonym's accepted usage), whether it is a synonym, its rank and its canonical name. */
export interface BackboneRow { key: number; parent: number; synonym: boolean; rank: string; canonical: string }

const BELOW_SPECIES = new Set(['SUBSPECIES', 'VARIETY', 'FORM']);

/** The two passes' state: the infraspecific usages of each page's key, then the names filed under them. */
export class InfraNames {
  /** An accepted usage below species → the page key it is under. */
  private readonly infra = new Map<number, number>();
  /** Page key → the names, as GBIF writes them (canonical, without author). */
  private readonly names = new Map<number, Set<string>>();
  constructor(private readonly pages: ReadonlySet<number>) {}
  /** Pass 1: an accepted subspecies, variety or form of a page's species. */
  first(r: BackboneRow): void {
    if (!r.synonym && BELOW_SPECIES.has(r.rank) && this.pages.has(r.parent)) this.infra.set(r.key, r.parent);
  }
  /** Pass 2: a synonym of species rank filed under one of them. */
  second(r: BackboneRow): void {
    if (!r.synonym || r.rank !== 'SPECIES' || !r.canonical) return;
    const page = this.infra.get(r.parent);
    if (page === undefined) return;
    const xs = this.names.get(page) ?? new Set<string>();
    xs.add(r.canonical.replace(/\s+/g, ' ').trim());
    this.names.set(page, xs);
  }
  /** How many usages below species the first pass found. */
  get usages(): number { return this.infra.size; }
  /** A page's names, sorted, without its own name and the names its record holds already; empty when none. */
  of(page: number, own: { scientific: string; synonyms?: readonly string[] }): string[] {
    const plain = (n: string) => n.replace(/×\s*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const held = new Set([own.scientific, ...(own.synonyms ?? [])].map((s) => plain(s.split(' ').slice(0, 2).join(' '))));
    return [...(this.names.get(page) ?? [])].filter((n) => n.split(' ').length === 2 && !held.has(plain(n))).sort();
  }
}

/** A line of the export (tab-separated, no header) as a `BackboneRow`; null for a line of another kingdom or one that does not read. Columns as `scripts/backbone-load.ts` reads them. */
export function backboneRow(line: string): BackboneRow | null {
  const c = line.split('\t');
  if (c.length < 20 || c[10] !== '6') return null; // Plantae
  const key = Number(c[0]), parent = c[1] && c[1] !== '\\N' ? Number(c[1]) : 0;
  if (!(key > 0)) return null;
  return { key, parent, synonym: c[3] === 't', rank: c[5], canonical: c[19] && c[19] !== '\\N' ? c[19] : '' };
}

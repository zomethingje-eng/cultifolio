/**
 * Kew's hybrid sign on the reference's hybrid pages (round eighty-one, H; review-w 3, review-d 3).
 *
 * A page's name is GBIF's canonical name, or Kew's name with the sign taken out (`canonicalOfKew`), so its address and
 * every comparison of names read it without the sign. The 485 hybrids of the species list (473 nothospecies such as
 * Mentha × piperita, 12 nothogenera such as × Astrolista bicarinata) were shown that way too, as wild species. Kew's file
 * writes each with its sign, and `hybrids.json` (made by `scripts/hybrid-names.ts` from the list and Kew's file) carries
 * those names by Kew's `plant_name_id`, which is the page's id (`k<plant_name_id>`). The name a page shows, its title,
 * its heading, its index entry and its search answers take the sign from here; its address and the matching do not.
 */
import file from './hybrids.json';
import { withoutSign } from './names';

/** One hybrid of the list: Kew's name with its sign, Kew's IPNI and POWO numbers for the entry, and its parents as Kew states them. */
export type HybridRow = { name: string; ipni?: string; powo?: string; parents?: string };

/** The file's own note, written by the script (so the file says what it is without a comment). */
export const HYBRIDS_FILE_NOTE = "Kew's hybrid sign for the species list's hybrids, by Kew's plant_name_id (the page id without its k): made by scripts/hybrid-names.ts from scripts/species-list.txt and Kew's wcvp_names.csv; read by src/lib/core/hybrids.ts";

const rows = (file as { rows: Record<string, HybridRow> }).rows;

/** The day of Kew's file the table was read from. */
export const HYBRIDS_KEW_DAY: string | null = (file as { kew?: string | null }).kew ?? null;

/** A name without the hybrid sign (`withoutSign`). */
export const unsigned = withoutSign;

/** The hybrid a page id names, or undefined: a `k` page whose Kew entry is one of the list's hybrids. */
export function hybridOf(key: string | null | undefined): HybridRow | undefined {
  if (!key || key[0] !== 'k') return undefined;
  const id = key.slice(1);
  return Object.hasOwn(rows, id) ? rows[id] : undefined;
}

/**
 * The name a page shows: Kew's, with its sign, when the page is one of the list's hybrids and the name is that hybrid's
 * (a page whose name is another, after a rebuild under another name, keeps its own). Any other name as it is. The same
 * for a name that already carries the sign, so it can be applied twice.
 */
export function signedName(key: string | null | undefined, name: string): string {
  const h = hybridOf(key);
  return h && unsigned(h.name) === unsigned(name) ? h.name : name;
}

/**
 * Kew's IPNI and POWO numbers for a hybrid page, for a page whose dossier links neither: its own row was asked by the
 * name without the sign, and Kew's copy at GBIF writes it with one, so it was never found (review-d 3; Fragaria ×
 * ananassa, Sarracenia × farnhamii). A number ending "-4" is Kew's own, a POWO page and never an IPNI record (`WCVP_ONLY`).
 */
export function hybridLinks(key: string | null | undefined): { ipni?: string; powo?: string } {
  const h = hybridOf(key);
  if (!h) return {};
  return { ...(h.ipni && !/-4$/.test(h.ipni) ? { ipni: h.ipni } : {}), ...(h.powo ? { powo: `urn:lsid:ipni.org:names:${h.powo}` } : {}) };
}

/** How many hybrids the table holds (for the about page and the tests). */
export const hybridCount = () => Object.keys(rows).length;

/**
 * Index entries with Kew's sign on the hybrids' names (`--index`; round eighty-one, H): a new entry where the name
 * changes, the same entry otherwise, in the same order. The photographs are judged with the names as the dossiers hold
 * them; the index, its search files, its cards and its rows carry the names as the pages show them.
 */
export function signEntries<T extends { key: string; name: string }>(entries: T[]): T[] {
  return entries.map((e) => { const n = signedName(e.key, e.name); return n === e.name ? e : { ...e, name: n }; });
}

/**
 * A page's identifiers and links with Kew's numbers for a hybrid whose record lacks POWO's or IPNI's link (the species
 * route; round eighty-one, H; round eighty-four, review-d D5: a hybrid whose record linked IPNI alone, as Aesculus ×
 * woerlitzensis and Rhododendron × sochadzeae did, showed no POWO link, since only a record with neither was given Kew's),
 * in the order the page lists its links (GBIF, then POWO and IPNI, then the rest): each one missing from Kew's entry, a
 * stored one as it is. Any other page's as they are, and `kew` false. The re-derivation stores the entry's own on every
 * `k` page (`linkKewEntry`), so this then finds nothing to add.
 */
export function withKewLinks<I extends { ipni?: string; powo?: string }>(key: string | null | undefined, ids: I, links: Record<string, string>): { ids: I; links: Record<string, string>; kew: boolean } {
  if (ids.ipni && ids.powo) return { ids, links, kew: false };
  const k = hybridLinks(key);
  const powo = ids.powo ? undefined : k.powo;
  const ipni = ids.ipni ? undefined : k.ipni;
  if (!powo && !ipni) return { ids, links, kew: false };
  const { gbif, powo: p0, ipni: i0, ...rest } = links;
  const P = powo ? `https://powo.science.kew.org/taxon/${powo}` : p0;
  const I = ipni ? `https://www.ipni.org/n/${ipni}` : i0;
  return {
    ids: { ...ids, ...(powo ? { powo } : {}), ...(ipni ? { ipni } : {}) },
    links: { ...(gbif ? { gbif } : {}), ...(P ? { powo: P } : {}), ...(I ? { ipni: I } : {}), ...rest },
    kew: true
  };
}

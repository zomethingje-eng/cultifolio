/**
 * A species page's id (round seventy-eight; docs/SCALE-STUDY.md section 5, the owner's decision 4): `k<plant_name_id>`
 * when Kew's file gives the page one accepted taxon that no other page holds, else `g<GBIF backbone key>`.
 *
 * Why a letter: Kew's ids (1 to 3,331,952 in wcvp_names.csv of 2026-06-04) and GBIF's backbone keys (1 to about twelve
 * million) are both numbers, and each range holds the other's, so a bare number in an API path or on a device could be
 * either. The letter names the namespace; the type makes the compiler find any GBIF number used as a page's identity.
 *
 * A GBIF key stays a number everywhere it is GBIF's: `ids.gbif`, a plant's `taxonKey`, `occurrences.keys`, the build's
 * requests. A page's own GBIF key is an alias of its id (`gbifAlias`), so a GBIF answer finds its page.
 */
export type PageId = `k${number}` | `g${number}`;

/** The one pattern a page id has: the letter, then a positive whole number without leading zeros, at most ten digits. */
export const PAGE_ID = /^[kg][1-9][0-9]{0,9}$/;

export const isPageId = (x: unknown): x is PageId => typeof x === 'string' && PAGE_ID.test(x);

/** The id of the page Kew's `plant_name_id` names (a string of digits, as Kew's file and `name.kew.entry` write it). */
export function kewPage(plantNameId: string | number): PageId {
  const id = `k${plantNameId}`;
  if (!isPageId(id)) throw new Error(`not a Kew plant_name_id: ${plantNameId}`);
  return id as PageId;
}

/** The id of a page keyed by its GBIF backbone key, where Kew's file gives no one taxon that is this page's alone. */
export function gbifPage(key: number): PageId {
  const id = `g${key}`;
  if (!isPageId(id)) throw new Error(`not a GBIF key: ${key}`);
  return id as PageId;
}

/** The namespace of an id: Kew's or GBIF's. */
export const idKind = (id: PageId): 'kew' | 'gbif' => (id[0] === 'k' ? 'kew' : 'gbif');

/** The number an id carries (Kew's plant_name_id or GBIF's key; `idKind` says which). */
export const idNumber = (id: PageId): number => Number(id.slice(1));

/** A card file's record for a GBIF key, beside a slug and `#<id>`: the page whose own GBIF key it is. Never a slug's form. */
export const gbifAlias = (key: number) => `@${key}`;

/** A GBIF backbone key as an API path gives it: digits that make a whole number (one no page holds is no page's), else null. */
export function gbifKeyOf(x: string): number | null {
  if (!/^[0-9]{1,16}$/.test(x)) return null;
  const n = Number(x);
  return Number.isSafeInteger(n) ? n : null;
}

/** Ids in a stable order: Kew's before GBIF's, then by number (lists and reports, never the index's order). */
export const byId = (a: PageId, b: PageId) => (a[0] === b[0] ? idNumber(a) - idNumber(b) : a[0] === 'k' ? -1 : 1);

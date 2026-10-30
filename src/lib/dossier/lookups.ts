/**
 * The Worker's name lookups without the whole index (round seventy-six; docs/SCALE-STUDY.md section 2.4). Until that
 * round a cold isolate parsed the index whole and built maps over it (`indexMaps`): by key, by accepted name, by genus,
 * and the older names behind the redirects and the shared-name 404. The build writes those maps as small products,
 * read by key, so a species page reads its own few small files and the files it shows, and nothing of the whole:
 *
 *   cards/<h>.json            what a species page reads (round seventy-seven): each page's address to its id, `#<id>`
 *                             to the species' card, and (round seventy-eight) `@<GBIF key>` to the id of the page whose
 *                             own GBIF key it is; split by an FNV hash of the record's name, about 35 species a file
 *                             (`cardFilesFor`)
 *   older/<h>.json            the names that are not a page's address (round seventy-seven): each accepted name in
 *                             lower case, and each older name in lower case and as a slug (as `indexMaps` keys them);
 *                             read only for an address that is no page's, and for `?was=`; about 70 species a file
 *   rows/<by>/<h>.json        each catalogue row's species, sorted, by row id (the opened row, a page's genus siblings)
 *   genera.json               every genus with its count of species, in the index's order
 *   featured.json             the front page strip's species (`featuredPoolOf`)
 *   sitemap/<n>.json          the sitemap's addresses and days, forty thousand a file
 *
 * Round seventy-six wrote the first two as one product, `names/<h>.json`, every key's answers in one record: a page
 * read its own name files and one per near species, 113 KB each, of which the older names were two thirds; split, a page
 * reads files of about 14 KB, and a crawl that holds them all holds 3.5 MB of cards, not 14.4 MB of names.
 *
 * Pure: the build writes these with the same maps the Worker read before (`indexMaps` is here, and the Worker still
 * reads it for a corpus whose manifest lacks any of these files, round seventy-six's own among them), so the two answer
 * alike by construction, and the proof (tests/unit/r76w-lookups.test.ts; scripts/dev/scale/r76-proof.ts on the real
 * corpus) checks every key.
 */
import { genusOf, slugify, canonicalSynonym, nameOrder } from '$core/names';
import { prepare, search } from '$core/search';
import type { IndexEntry } from './index-entry';
import { gbifAlias, type PageId } from '$core/page-id';
import { BYS, catalogueItems, rowGroupsOf, featuredPoolOf, featuredOf, type By, type Item, type Featured, type GrownRule } from './catalogue';

/* ---------- the maps over the whole index, as the Worker built them per isolate until round seventy-six ---------- */

/**
 * `bySynonym`: an older name held by one species, in lower case, and under its slug as well. `ambiguous`: an older name
 * two species or more hold, with every species that holds it, under both keys too; `sharedName`, the name as an entry
 * writes it, under both (round sixty-nine; triage-68 N1; round seventy; triage-69 F1, N3).
 */
export type IndexMaps = { byKey: Map<PageId, IndexEntry>; byGbif: Map<number, IndexEntry>; byName: Map<string, IndexEntry>; byGenus: Map<string, IndexEntry[]>; bySynonym: Map<string, { entry: IndexEntry; matched: string }>; ambiguous: Map<string, IndexEntry[]>; sharedName: Map<string, string> };
const maps = new WeakMap<readonly IndexEntry[], IndexMaps>();
/** Maps over the index, built once per index load rather than per request: by key, and the species of each genus sorted by name (round fifty-one, 6). */
export function indexMaps(index: readonly IndexEntry[]): IndexMaps {
  let m = maps.get(index);
  if (m) return m;
  const byKey = new Map<PageId, IndexEntry>();
  // Each page's own GBIF key (round seventy-eight): the alias a GBIF answer, a plant's key or an old API path finds the
  // page by. The last in the index's order under one key, as `byKey` keeps (no two pages of a corpus share one).
  const byGbif = new Map<number, IndexEntry>();
  const byName = new Map<string, IndexEntry>(); // each accepted name in lower case (round seventy-one; S-F3)
  const byGenus = new Map<string, IndexEntry[]>();
  // Each older name's holders, under its name in lower case and under its slug: "Arbutus uva-ursi" is
  // `arbutus-uva-ursi` at an address, which `nameFromSlug` reads as "Arbutus uva ursi", a name no species holds (round
  // seventy; triage-69 N3, S-F3: 230 hyphenated older names of one species each were 404s). Keyed by the slug, two
  // spellings an address cannot tell apart are one name, and their holders are counted together.
  const held = new Map<string, Array<{ entry: IndexEntry; matched: string }>>();
  const hold = (k: string, e: IndexEntry, name: string) => {
    const xs = held.get(k) ?? [];
    if (!xs.some((x) => x.entry === e)) xs.push({ entry: e, matched: name });
    held.set(k, xs);
  };
  for (const e of index) {
    byKey.set(e.key, e);
    if (e.gbif != null) byGbif.set(e.gbif, e);
    byName.set(e.name.toLowerCase().replace(/×\s*/g, ''), e); // without Kew's hybrid sign, which a hybrid's entry shows and no name asked carries (round eighty-one, H)
    const g = genusOf(e.name);
    const xs = byGenus.get(g);
    if (xs) xs.push(e); else byGenus.set(g, [e]);
    // Every older name of species rank too, past the six `syn` shows (round sixty-seven; triage-66 N1): an address under
    // "Ferocactus glaucescens" is Bisnaga glaucescens from the index, without asking the backbone.
    // And the record's names by another author (`hom`, round eighty-two), held as `syn` and `older` held them before: an
    // address or a `?was=` under one is answered as it was (the accepted page of that name first, the species route's rule).
    for (const syn of [...(e.syn ?? []), ...(e.older ?? []), ...(e.hom ?? [])]) {
      hold(syn.toLowerCase(), e, syn);
      const slug = slugify(syn);
      if (slug) hold(slug, e, syn);
    }
  }
  const bySynonym = new Map<string, { entry: IndexEntry; matched: string }>();
  const ambiguous = new Map<string, IndexEntry[]>();
  const sharedName = new Map<string, string>();
  // Which species an older name answers (round seventy; triage-69 F1, S-F1; rule 3): the one species that holds it. A
  // name two species or more hold is no one species' name, whichever shows it: it does not redirect, and the species
  // route's 404 names every holder.
  for (const [k, by] of held) {
    if (by.length === 1) { bySynonym.set(k, by[0]); continue; }
    ambiguous.set(k, by.map((x) => x.entry));
    sharedName.set(k, by[0].matched);
  }
  for (const xs of byGenus.values()) xs.sort((a, b) => nameOrder(a.name, b.name)); // past a hybrid's sign (round eighty-one, H)
  maps.set(index, (m = { byKey, byGbif, byName, byGenus, bySynonym, ambiguous, sharedName }));
  return m;
}
/** An older name as the maps key it: a slug as it is, a name in lower case with its spaces closed up. */
export const synonymKey = (nameOrSlug: string) => nameOrSlug.trim().replace(/\s+/g, ' ').toLowerCase();
/**
 * The holders of a shared older name in the order the 404 names them: the order the search gives them for the name
 * (the species that holds it exactly and keeps its epithet first, then one that shows it, then the alphabet), then any
 * the search did not rank (round sixty-nine; triage-68 N1; round seventy: triage-69 F1).
 */
export function sharedOrder<E extends IndexEntry>(holders: E[], shared: string): E[] {
  const order = search(prepare(holders), shared);
  return [...order, ...holders.filter((e) => !order.includes(e))];
}
/** A name as the species page compares older names: lower case, without rank markers ("var.", "subsp."), spaces closed up. */
export const plainName = (x: string) => x.toLowerCase().replace(/×\s*/g, '').replace(/\b(var|subsp|ssp|f)\.? /g, '').replace(/\s+/g, ' ').trim(); // and without a hybrid sign (round eighty-one, H)

/* ---------- the products ---------- */

/** FNV-1a, 32 bits: the file a key is in (docs/SCALE-STUDY.md, `design-products.ts`). */
export const fnv32 = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
const pow2 = (x: number) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));
/** How many card files a corpus of `species` is split into: about 35 species a file, at least 64 (256 at today's 8,947). */
export const cardFilesFor = (species: number) => Math.max(64, pow2(species / 64));
/** How many files of accepted and older names: about 70 species' names a file, at least 64 (128 at today's 8,947). */
export const olderFilesFor = (species: number) => Math.max(64, pow2(species / 100));
/** The file a key is in, of `files`: a slug and `#<key>` in the card files, a name in the files of names. */
export const keyFileOf = (k: string, files: number) => String(fnv32(k) % files);
/** How many row files a grouping is split into: a genus row is a few species, a family or a region many. */
export const rowFilesFor = (by: By, species: number) => Math.max(16, pow2(species / (by === 'genus' ? 150 : 600)));
export const rowFileOf = (id: string, files: number) => String(fnv32(id) % files);
/** Addresses a sitemap file holds (the protocol's cap is 50,000). */
export const SITEMAP_CHUNK = 40_000;

/** A species as a lookup answers it: its id, slug and accepted name. */
export type Ref = [key: PageId, slug: string, name: string];
/** A species as its page needs it of the index (`#<id>`): what its card shows, its older names and nearest climates, and its place in the index. */
export type Card = {
  key: PageId;
  /** Its own GBIF key (round seventy-eight), absent in an index without it. */
  gbif?: number;
  slug: string;
  name: string;
  /** Its place in the index's order, which settles which of two keys a GBIF answer names comes first, as the index did. */
  at: number;
  family?: string;
  common?: string;
  thumb?: string;
  credit?: string;
  open: number;
  climate?: string;
  syn?: string[];
  near?: PageId[];
  /** The record's older names (its dossier's `name.synonyms`, as `plainName`) that are another species' accepted name here, with that species. */
  x?: Record<string, Ref>;
};
/**
 * A card file's records (`cards/<h>.json`): a page's address (its slug) to its id, the last species in the index's order
 * under that slug, as the slug map kept; `#<id>` to the species' card; and `@<GBIF key>` to the id of the page whose own
 * GBIF key it is (round seventy-eight). A slug never begins with `#` or `@`.
 */
export type CardFile = Record<string, PageId | Card>;
/**
 * A file of names (`older/<h>.json`): a name in lower case or as a slug to its answers. A name can be both, so each kind
 * has its own field, as each had its own map: `n` the species whose accepted name it is in lower case (the last in the
 * index's order, as the map kept); `o` an older name's holders, in the order the 404 names them when there are two or
 * more, and `m` the name as the first holder in the index writes it.
 */
export type NameRecord = { n?: Ref; o?: { m: string; h: Ref[] } };
export const keyName = (key: PageId) => `#${key}`;
const ref = (e: IndexEntry): Ref => [e.key, e.slug, e.name];

/**
 * The card files of an index: `synonymsOf` gives each species' dossier synonyms (the build passes them; without it no
 * species records the older names that are another's accepted name, `Card.x`).
 */
export function buildCardFiles(index: readonly IndexEntry[], synonymsOf?: (key: PageId) => readonly string[] | undefined): Map<string, CardFile> {
  const files = cardFilesFor(index.length);
  const m = indexMaps(index);
  const out = new Map<string, CardFile>();
  for (let i = 0; i < files; i++) out.set(String(i), {});
  const put = (k: string, v: PageId | Card) => { out.get(keyFileOf(k, files))![k] = v; };
  // The slug map was `new Map(idx.map((e) => [e.slug, e.key]))`: the last entry under a slug wins.
  for (const e of index) put(e.slug, e.key);
  // Each page's own GBIF key to its id (round seventy-eight), as `byGbif` keeps it.
  for (const [g, e] of m.byGbif) put(gbifAlias(g), e.key);
  index.forEach((e, i) => {
    if (m.byKey.get(e.key) !== e) return; // a key twice: the map kept the last
    const x: Record<string, Ref> = {};
    for (const n of new Set((synonymsOf?.(e.key) ?? []).map(canonicalSynonym).filter((y): y is string => !!y && y !== e.name.replace(/×\s*/g, '')))) {
      const o = m.byName.get(plainName(n));
      if (o && o.key !== e.key) x[plainName(n)] = ref(o);
    }
    put(keyName(e.key), { key: e.key, ...(e.gbif != null ? { gbif: e.gbif } : {}), slug: e.slug, name: e.name, at: i, family: e.family, common: e.common, thumb: e.thumb, credit: e.credit, open: e.open, climate: e.climate, ...(e.syn ? { syn: e.syn } : {}), ...(e.near ? { near: e.near } : {}), ...(Object.keys(x).length ? { x } : {}) });
  });
  return out;
}
/** The files of accepted and older names of an index. */
export function buildOlderFiles(index: readonly IndexEntry[]): Map<string, Record<string, NameRecord>> {
  const files = olderFilesFor(index.length);
  const m = indexMaps(index);
  const out = new Map<string, Record<string, NameRecord>>();
  for (let i = 0; i < files; i++) out.set(String(i), {});
  const at = (k: string): NameRecord => { const f = out.get(keyFileOf(k, files))!; return Object.hasOwn(f, k) ? f[k] : (f[k] = {}); };
  for (const [k, e] of m.byName) at(k).n = ref(e);
  for (const [k, x] of m.bySynonym) at(k).o = { m: x.matched, h: [ref(x.entry)] };
  for (const [k, holders] of m.ambiguous) at(k).o = { m: m.sharedName.get(k)!, h: sharedOrder(holders, m.sharedName.get(k)!).map(ref) };
  return out;
}

/** A row's species and each one's place in the index (which orders the "Popular genera" chip's rows as the index did). */
export type RowRecord = { at: number[]; items: Item[] };
/** The row files of a grouping: each row's species under "all", sorted by name, by row id. */
export function buildRowFiles(index: IndexEntry[], by: By): Map<string, Record<string, RowRecord>> {
  const files = rowFilesFor(by, index.length);
  const place = new Map(catalogueItems(index).map((c, i) => [c, i]));
  const out = new Map<string, Record<string, RowRecord>>();
  for (let i = 0; i < files; i++) out.set(String(i), {});
  for (const [id, items] of rowGroupsOf(index, by, 'all')) out.get(rowFileOf(id, files))![id] = { at: items.map((c) => place.get(c)!), items };
  return out;
}
/** Every genus with its count of species, in the order the index first names it. */
export function generaOfIndex(index: readonly IndexEntry[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const e of index) { const g = genusOf(e.name); m.set(g, (m.get(g) ?? 0) + 1); }
  return [...m];
}
/** The strip's species, as `featured.json` holds them. */
export const featuredFile = (index: IndexEntry[], grown?: GrownRule): Featured[] => featuredPoolOf(catalogueItems(index), grown).map(featuredOf);

/** The card files, the files of names, the row files, the genera, the strip and the sitemap a manifest must name for the Worker to read names from them. */
export function lookupFileNames(species: number, sitemaps = 1): string[] {
  return [
    ...Array.from({ length: cardFilesFor(species) }, (_, i) => `cards/${i}.json`),
    ...Array.from({ length: olderFilesFor(species) }, (_, i) => `older/${i}.json`),
    ...BYS.flatMap((by) => Array.from({ length: rowFilesFor(by, species) }, (_, i) => `rows/${by}/${i}.json`)),
    'genera.json',
    'featured.json',
    ...Array.from({ length: sitemaps }, (_, i) => `sitemap/${i + 1}.json`)
  ];
}

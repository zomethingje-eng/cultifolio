/**
 * The Worker's name lookups without the whole index (round seventy-six; docs/SCALE-STUDY.md section 2.4). Until this
 * round a cold isolate parsed the index whole and built maps over it (`indexMaps`): by key, by accepted name, by genus,
 * and the older names behind the redirects and the shared-name 404. The build now writes those maps as small products,
 * read by key, so a species page reads one name shard and the files it shows, and nothing of the whole:
 *
 *   names/<h>.json            every key a request resolves: a slug, an accepted name in lower case, each older name in
 *                             lower case and as a slug (as `indexMaps` keys them), and `#<key>` for the species itself;
 *                             split by an FNV hash of the key, about 100 species a file (`namesFilesFor`)
 *   rows/<by>/<h>.json        each catalogue row's species, sorted, by row id (the opened row, a page's genus siblings)
 *   genera.json               every genus with its count of species, in the index's order
 *   featured.json             the front page strip's species (`featuredPoolOf`)
 *   sitemap/<n>.json          the sitemap's addresses and days, forty thousand a file
 *
 * Pure: the build writes these with the same maps the Worker read before (`indexMaps` is here, and the Worker still
 * reads it for a corpus whose manifest names none of these files), so the two answer alike by construction, and the
 * proof (tests/unit/r76w-lookups.test.ts; scripts/dev/scale/r76-proof.ts on the real corpus) checks every key.
 */
import { genusOf, slugify, canonicalSynonym } from '$core/names';
import { prepare, search } from '$core/search';
import type { IndexEntry } from './index-entry';
import { BYS, catalogueItems, rowGroupsOf, featuredPoolOf, featuredOf, type By, type Item, type Featured } from './catalogue';

/* ---------- the maps over the whole index, as the Worker built them per isolate until round seventy-six ---------- */

/**
 * `bySynonym`: an older name held by one species, in lower case, and under its slug as well. `ambiguous`: an older name
 * two species or more hold, with every species that holds it, under both keys too; `sharedName`, the name as an entry
 * writes it, under both (round sixty-nine; triage-68 N1; round seventy; triage-69 F1, N3).
 */
export type IndexMaps = { byKey: Map<number, IndexEntry>; byName: Map<string, IndexEntry>; byGenus: Map<string, IndexEntry[]>; bySynonym: Map<string, { entry: IndexEntry; matched: string }>; ambiguous: Map<string, IndexEntry[]>; sharedName: Map<string, string> };
const maps = new WeakMap<readonly IndexEntry[], IndexMaps>();
/** Maps over the index, built once per index load rather than per request: by key, and the species of each genus sorted by name (round fifty-one, 6). */
export function indexMaps(index: readonly IndexEntry[]): IndexMaps {
  let m = maps.get(index);
  if (m) return m;
  const byKey = new Map<number, IndexEntry>();
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
    byName.set(e.name.toLowerCase(), e);
    const g = genusOf(e.name);
    const xs = byGenus.get(g);
    if (xs) xs.push(e); else byGenus.set(g, [e]);
    // Every older name of species rank too, past the six `syn` shows (round sixty-seven; triage-66 N1): an address under
    // "Ferocactus glaucescens" is Bisnaga glaucescens from the index, without asking the backbone.
    for (const syn of [...(e.syn ?? []), ...(e.older ?? [])]) {
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
  for (const xs of byGenus.values()) xs.sort((a, b) => a.name.localeCompare(b.name));
  maps.set(index, (m = { byKey, byName, byGenus, bySynonym, ambiguous, sharedName }));
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
export const plainName = (x: string) => x.toLowerCase().replace(/\b(var|subsp|ssp|f)\.? /g, '').replace(/\s+/g, ' ').trim();

/* ---------- the products ---------- */

/** FNV-1a, 32 bits: the file a key is in (docs/SCALE-STUDY.md, `design-products.ts`). */
export const fnv32 = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; };
const pow2 = (x: number) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));
/** How many name files a corpus of `species` is split into: about a hundred species a file, at least 64 (128 at today's 8,945). */
export const namesFilesFor = (species: number) => Math.max(64, pow2(species / 100));
export const namesFileOf = (k: string, files: number) => String(fnv32(k) % files);
/** How many row files a grouping is split into: a genus row is a few species, a family or a region many. */
export const rowFilesFor = (by: By, species: number) => Math.max(16, pow2(species / (by === 'genus' ? 150 : 600)));
export const rowFileOf = (id: string, files: number) => String(fnv32(id) % files);
/** Addresses a sitemap file holds (the protocol's cap is 50,000). */
export const SITEMAP_CHUNK = 40_000;

/** A species as a lookup answers it: its key, slug and accepted name. */
export type Ref = [key: number, slug: string, name: string];
/** A species as its page needs it of the index (`#<key>`): what its card shows, its older names and nearest climates, and its place in the index. */
export type Card = {
  key: number;
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
  near?: number[];
  /** The record's older names (its dossier's `name.synonyms`, as `plainName`) that are another species' accepted name here, with that species. */
  x?: Record<string, Ref>;
};
/**
 * One key's answers. A slug and a name can be the same string as an older name's slug or name, so each kind has its own
 * field, as each had its own map: `s` the species whose slug it is; `n` the species whose accepted name it is in lower
 * case (the last in the index's order, as the map kept); `o` an older name's holders, in the order the 404 names them
 * when there are two or more, and `m` the name as the first holder in the index writes it; `k` the species under `#<key>`.
 */
export type NameRecord = { s?: number; n?: Ref; o?: { m: string; h: Ref[] }; k?: Card };
export const keyName = (key: number) => `#${key}`;
const ref = (e: IndexEntry): Ref => [e.key, e.slug, e.name];

/**
 * The name files of an index: `synonymsOf` gives each species' dossier synonyms (the build passes them; without it no
 * species records the older names that are another's accepted name, `Card.x`).
 */
export function buildNameFiles(index: readonly IndexEntry[], synonymsOf?: (key: number) => readonly string[] | undefined): Map<string, Record<string, NameRecord>> {
  const files = namesFilesFor(index.length);
  const m = indexMaps(index);
  const out = new Map<string, Record<string, NameRecord>>();
  for (let i = 0; i < files; i++) out.set(String(i), {});
  const at = (k: string): NameRecord => { const f = out.get(namesFileOf(k, files))!; return Object.hasOwn(f, k) ? f[k] : (f[k] = {}); };
  // The slug map was `new Map(idx.map((e) => [e.slug, e.key]))`: the last entry under a slug wins.
  for (const e of index) at(e.slug).s = e.key;
  for (const [k, e] of m.byName) at(k).n = ref(e);
  for (const [k, x] of m.bySynonym) at(k).o = { m: x.matched, h: [ref(x.entry)] };
  for (const [k, holders] of m.ambiguous) at(k).o = { m: m.sharedName.get(k)!, h: sharedOrder(holders, m.sharedName.get(k)!).map(ref) };
  index.forEach((e, i) => {
    if (m.byKey.get(e.key) !== e) return; // a key twice: the map kept the last
    const x: Record<string, Ref> = {};
    for (const n of new Set((synonymsOf?.(e.key) ?? []).map(canonicalSynonym).filter((y): y is string => !!y && y !== e.name))) {
      const o = m.byName.get(plainName(n));
      if (o && o.key !== e.key) x[plainName(n)] = ref(o);
    }
    at(keyName(e.key)).k = { key: e.key, slug: e.slug, name: e.name, at: i, family: e.family, common: e.common, thumb: e.thumb, credit: e.credit, open: e.open, climate: e.climate, ...(e.syn ? { syn: e.syn } : {}), ...(e.near ? { near: e.near } : {}), ...(Object.keys(x).length ? { x } : {}) };
  });
  return out;
}

/** A row's species and each one's place in the index (which orders the "Most grown" chip's rows as the index did). */
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
export const featuredFile = (index: IndexEntry[]): Featured[] => featuredPoolOf(catalogueItems(index)).map(featuredOf);

/** The name files, the row files, the genera, the strip and the sitemap a manifest must name for the Worker to read names from them. */
export function lookupFileNames(species: number, sitemaps = 1): string[] {
  return [
    ...Array.from({ length: namesFilesFor(species) }, (_, i) => `names/${i}.json`),
    ...BYS.flatMap((by) => Array.from({ length: rowFilesFor(by, species) }, (_, i) => `rows/${by}/${i}.json`)),
    'genera.json',
    'featured.json',
    ...Array.from({ length: sitemaps }, (_, i) => `sitemap/${i + 1}.json`)
  ];
}

/**
 * The build's products from an index (round fifty-three, 2; src/lib/dossier/manifest.ts): the index itself, the
 * entries and the sheets of each bucket (the count chosen for the corpus's size), the search's postings (round
 * fifty-six, 1; $core/postings), and the nine catalogues' rows; and the manifest that names them. Everything the
 * Worker used to derive from the index in memory, derived once on the PC. Pure: the script writes each body under its
 * hash, and a file already on disk under that hash is the same file, so a build that changed a little writes only the
 * files that differ, and the copy up carries only those.
 */
import type { IndexEntry } from './index-entry';
import type { PageId } from '$core/page-id';
import type { Sheet } from './sheet';
import { DOSSIER_V } from './schema';
import { bucketOf, bucketsFor, bucketNames } from '$core/bucket';
import { buildPostings, postingFilesFor } from '$core/postings';
import { buildSearchFiles } from '$core/search-files';
import { prepare, search } from '$core/search';
import { contentHash, SHORT_HITS, type Manifest } from './manifest';
import { md5 } from './md5';
import type { GrownRule } from './catalogue';
import { catalogueOf, rowsOnly, catalogueFile, BYS, CHIPS } from './catalogue';
import { buildCardFiles, buildOlderFiles, buildRowFiles, generaOfIndex, featuredFile, SITEMAP_CHUNK } from './lookups';
import { sitemapUrls, sitemapDays } from '$lib/server/sitemap';

export interface Products {
  manifest: Manifest;
  /** Each product's body by its name (stored under its hash, `manifest.files[name]`). */
  files: Map<string, string>;
  /**
   * The search's key and answer files (round seventy-seven; $core/search-files), by hash: stored under it as every product
   * is, and named not by the manifest but by the search's directories, which the manifest names. Empty when the caller
   * gave a `sink`, which took each body as it was made; `storedHashes` names them either way.
   */
  stored: Map<string, string>;
  storedHashes: Set<string>;
}

/** A page merged into another by the owner's decision (round seventy-three): its old address, and the id of the page it joined. */
export type Alias = { slug: string; key: PageId };

/**
 * The old addresses the products answer for (round seventy-three): each alias whose page the index lists and whose slug no
 * entry holds, with that page's entry. A grower's plant, label or followed species under the old name finds the species
 * by its slug's bucket (the device asks by slug, never by key), and the entry or sheet it gets carries the old slug, so
 * the device's own lookup matches; a link to it is the old address, which the species route redirects as an older name.
 * Never in the index: the reference is its pages, and `/api/dossier/<old key>` answers 404 (its GBIF key is no page's own).
 */
export function aliasesOf(index: readonly IndexEntry[], aliases: readonly Alias[]): Array<{ slug: string; entry: IndexEntry }> {
  const bySlug = new Set(index.map((e) => e.slug));
  const byKey = new Map(index.map((e) => [e.key, e]));
  const out: Array<{ slug: string; entry: IndexEntry }> = [];
  for (const a of aliases) {
    const e = byKey.get(a.key);
    if (!e || bySlug.has(a.slug) || out.some((x) => x.slug === a.slug)) continue;
    out.push({ slug: a.slug, entry: e });
  }
  return out;
}

export function buildProducts(index: IndexEntry[], indexText: string, sheetsOf: (count: number) => Map<string, Sheet[]>, built = new Date().toISOString(), aliases: readonly Alias[] = [], synonymsOf?: (key: PageId) => readonly string[] | undefined, sink?: (hash: string, body: string) => void, o: { grown?: GrownRule } = {}): Products {
  const files = new Map<string, string>();
  const hashes: Record<string, string> = {};
  const put = (name: string, body: string) => { files.set(name, body); hashes[name] = md5(body); };
  put('index.json', indexText);
  const buckets = bucketsFor(index.length);
  const entries = new Map<string, IndexEntry[]>();
  for (const e of index) { const b = bucketOf(e.slug, buckets); (entries.get(b) ?? entries.set(b, []).get(b)!).push(e); }
  for (const { slug, entry } of aliasesOf(index, aliases)) { const b = bucketOf(slug, buckets); (entries.get(b) ?? entries.set(b, []).get(b)!).push({ ...entry, slug }); }
  for (const b of bucketNames(buckets)) put(`entries/${b}.json`, JSON.stringify(entries.get(b) ?? []));
  const sheets = sheetsOf(buckets);
  for (const b of bucketNames(buckets)) put(`sheets/${b}.json`, JSON.stringify(sheets.get(b) ?? []));
  const postings = postingFilesFor(index.length);
  const posted = buildPostings(index, postings);
  for (const [f, body] of posted) put(`postings/${f}.json`, JSON.stringify(body));
  // The first keystrokes' answers (round fifty-eight): every key of one or two characters that begins a word, with the
  // whole index's best hundred for it as positions in the index. A one-letter query matches most of the index; ranking
  // it per request cost what the whole index costs (the first reviewer's finding 13).
  const whole = prepare(index);
  const place = new Map(index.map((e, i) => [e, i]));
  const short: Record<string, number[]> = {};
  for (const body of posted.values()) for (const k of Object.keys(body)) if (k.length <= 2 && !Object.hasOwn(short, k)) short[k] = search(whole, k, SHORT_HITS).map((e) => place.get(e)!).filter((i) => i !== undefined);
  put('short.json', JSON.stringify(Object.fromEntries(Object.entries(short).sort(([a], [b]) => (a < b ? -1 : 1)))));
  // The search from key files (round seventy-seven): the Worker that reads them holds no index. The postings and
  // `short.json` above stay for a Worker deployed before them, which needs them to accept this manifest.
  const keyed = buildSearchFiles(index, whole, md5, sink);
  for (const [name, body] of keyed.named) put(name, body);
  for (const by of BYS) for (const chip of CHIPS) put(catalogueFile(by, chip), JSON.stringify(rowsOnly(catalogueOf(index, by, chip))));
  // What the Worker read from the index for everything but the search, written as files read by key (round seventy-six;
  // ./lookups.ts): the card files and the files of names (one product, `names/`, until round seventy-seven), each
  // grouping's row files, the genera, the strip and the sitemap.
  for (const [f, body] of buildCardFiles(index, synonymsOf)) put(`cards/${f}.json`, JSON.stringify(body));
  for (const [f, body] of buildOlderFiles(index)) put(`older/${f}.json`, JSON.stringify(body));
  for (const by of BYS) for (const [f, body] of buildRowFiles(index, by)) put(`rows/${by}/${f}.json`, JSON.stringify(body));
  put('genera.json', JSON.stringify(generaOfIndex(index)));
  // The front page's strip from the popular genera (round eighty-four, the owner's decision 4), where the build reads their files.
  put('featured.json', JSON.stringify(featuredFile(index, o.grown)));
  const urls = sitemapUrls(index), days = sitemapDays(index);
  for (let n = 1; (n - 1) * SITEMAP_CHUNK < urls.length; n++) put(`sitemap/${n}.json`, JSON.stringify({ urls: urls.slice((n - 1) * SITEMAP_CHUNK, n * SITEMAP_CHUNK), days: days.slice((n - 1) * SITEMAP_CHUNK, n * SITEMAP_CHUNK) }));
  // The id names everything in the directory, not the index alone: a dossier change that leaves its index entry as it was
  // still changes its sheet, and a sheet rewritten under an unchanged id sat in every cache for a day (round fifty-four, 3; both reviewers).
  const id = contentHash([...files.keys()].sort().map((n) => `${n}=${hashes[n]}`).join('\n')).slice(0, 16);
  const manifest: Manifest = { v: DOSSIER_V, id, built, species: index.length, buckets, postings, files: hashes };
  return { manifest, files, stored: keyed.stored, storedHashes: keyed.hashes };
}

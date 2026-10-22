import { genusOf, slugify } from '$core/names';
import { dayIso } from '$dossier/changed';
import type { IndexEntry } from '$dossier/index-entry';

/**
 * The sitemap as an index of files: the protocol caps one file at 50,000 addresses, and a corpus a few times the
 * present one crosses that with its genus rows. `/sitemap.xml` lists the files; `/sitemap-<n>.xml` holds a chunk
 * (round forty, own). The first file still names a species page early, which the live check reads.
 */
import { SITEMAP_CHUNK } from '$dossier/lookups';
export { SITEMAP_CHUNK };
const BASE = 'https://cultifolio.com';
const esc = (s: string) => s.replace(/&/g, '&amp;');

/** Every address, in a stable order: the fixed pages, the species, then the genus rows. Once per index (round fifty-eight). */
const made = new WeakMap<IndexEntry[], string[]>();
export function sitemapUrls(index: IndexEntry[]): string[] {
  let urls = made.get(index);
  if (!urls) made.set(index, (urls = urlsOf(index)));
  return urls;
}
/** The pages that change with a deploy, not with a corpus build: the front page (its strip changes daily too) and the about pages. */
const FIXED = ['/', '/about/how', '/about/formats'];
function urlsOf(index: IndexEntry[]): string[] {
  const genera = [...new Set(index.map((e) => genusOf(e.name)))].sort();
  return [...FIXED, ...index.map((e) => `/species/${e.slug}`), ...genera.map((g) => `/?by=genus&open=${slugify(g)}`)];
}

/**
 * A sitemap's `<lastmod>`: the day the corpus was built, from its manifest, so a crawler re-reads the pages after a
 * refresh and not before (round sixty; the corpus review, 14). Since round sixty-three each species gives its own day
 * (`sitemapDays`), and this is the fallback for an entry without one and the sitemap index's; a corpus with no
 * manifest (the fixture) has none to give, and none is written.
 */
export function lastmodOf(built: string | null | undefined): string | null {
  if (!built) return null;
  const t = Date.parse(built);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
const mod = (lastmod: string | null | undefined) => (lastmod ? `<lastmod>${lastmod}</lastmod>` : '');

/**
 * Each address's own day, in `sitemapUrls`' order, as the index's day numbers (`changed`, whole days since 1970): a species
 * page the day its dossier last changed in substance (src/lib/dossier/changed.ts), a genus row the latest of its species'
 * days (the row shows their photographs and figures), and the fixed pages none, as before. An entry without a day, an
 * index built before round sixty-three, is null here and given the corpus's build day by `sitemapChunk` (round
 * sixty-three; REVIEW-TRIAGE-61's deferred list). Once per index, as the addresses are.
 */
const days = new WeakMap<IndexEntry[], Array<number | null>>();
export function sitemapDays(index: IndexEntry[]): Array<number | null> {
  let out = days.get(index);
  if (out) return out;
  const own = (e: IndexEntry) => (typeof e.changed === 'number' && Number.isFinite(e.changed) && e.changed > 0 ? e.changed : null);
  const byGenus = new Map<string, number | null>();
  for (const e of index) {
    const g = genusOf(e.name);
    const d = own(e);
    // One species without a day leaves its row without one too: the latest of the rest might be earlier than its change.
    byGenus.set(g, !byGenus.has(g) ? d : byGenus.get(g) == null || d == null ? null : Math.max(byGenus.get(g)!, d));
  }
  const genera = [...new Set(index.map((e) => genusOf(e.name)))].sort();
  out = [...FIXED.map(() => null), ...index.map(own), ...genera.map((g) => byGenus.get(g) ?? null)];
  days.set(index, out);
  return out;
}

/**
 * How long the edge and a crawler keep a sitemap answer (round eighty; review C 2). The index, `/sitemap.xml`, is the
 * address robots.txt names and cannot change, so it is kept five minutes: kept a day, one data centre went on serving
 * the previous corpus's one-file index for most of a day after an upload, and the 14,893 addresses of the new
 * `sitemap-2.xml` were listed nowhere there. The files it names carry the corpus's id (`/sitemap-<id>-<n>.xml`), so a new
 * corpus's files are new addresses that no copy holds, and they are kept a day. A file asked by its bare number
 * (`/sitemap-<n>.xml`, the names before round eighty, which crawlers and the live check still have) or under another
 * corpus's id is answered with the current corpus's file and kept five minutes.
 */
export const SITEMAP_INDEX_CACHE = 'public, max-age=300';
export const SITEMAP_FILE_CACHE = 'public, max-age=86400';
export const SITEMAP_OTHER_CACHE = 'public, max-age=300';
/** A corpus id fit for an address: the manifest's (16 hex digits), or any hash of hex digits; else none (the fixture's 'fixture'). */
export const sitemapCorpus = (corpus: string | null | undefined): string | null => (corpus && /^[0-9a-f]{8,64}$/.test(corpus) ? corpus : null);
/** The address of the sitemap's file `n` under this corpus. */
export const sitemapFileName = (n: number, corpus: string | null = null) => (corpus ? `sitemap-${corpus}-${n}.xml` : `sitemap-${n}.xml`);
/** The route's parameter (`<n>` or `<id>-<n>`) read back: null when it is neither. */
export function sitemapParam(param: string): { corpus: string | null; n: number } | null {
  const m = /^(?:([0-9a-f]{8,64})-)?([1-9]\d{0,5})$/.exec(param);
  return m ? { corpus: m[1] ?? null, n: Number(m[2]) } : null;
}

export function sitemapIndex(urls: string[] | number, lastmod: string | null = null, corpus: string | null = null): string {
  const files = typeof urls === 'number' ? urls : sitemapFiles(urls.length);
  const id = sitemapCorpus(corpus);
  const entries = Array.from({ length: files }, (_, i) => `  <sitemap><loc>${BASE}/${sitemapFileName(i + 1, id)}</loc>${mod(lastmod)}</sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>\n`;
}

/**
 * One file of addresses. A day is given only to the pages the corpus makes (the species and the genus rows): the front
 * page and the about pages change with deploys, and a `lastmod` that does not track a page's changes teaches a crawler to
 * discount every one (round sixty-one; the corpus review, 15). Each page's own day from `sitemapDays` when the index
 * carries one (round sixty-three), else the corpus's build day.
 */
export function sitemapChunk(urls: string[], n: number, lastmod: string | null = null, own: ReadonlyArray<number | null> = []): string {
  const from = (n - 1) * SITEMAP_CHUNK;
  return sitemapPart(urls.slice(from, n * SITEMAP_CHUNK), own.slice(from, n * SITEMAP_CHUNK), lastmod);
}
/** One file of addresses from its own addresses and days: the build's `sitemap/<n>.json` (round seventy-six), or a slice of the whole. */
export function sitemapPart(part: readonly string[], own: ReadonlyArray<number | null>, lastmod: string | null = null): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${part.map((u, i) => `  <url><loc>${esc(BASE + u)}</loc>${FIXED.includes(u) ? '' : mod(dayIso(own[i]) ?? lastmod)}</url>`).join('\n')}\n</urlset>\n`;
}
/** How many files a sitemap of this many addresses is. */
export const sitemapFiles = (urls: number) => Math.max(1, Math.ceil(urls / SITEMAP_CHUNK));

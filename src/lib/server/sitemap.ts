import { genusOf, slugify } from '$core/names';
import type { IndexEntry } from './dossiers';

/**
 * The sitemap as an index of files: the protocol caps one file at 50,000 addresses, and a corpus a few times the
 * present one crosses that with its genus rows. `/sitemap.xml` lists the files; `/sitemap-<n>.xml` holds a chunk
 * (round forty, own). The first file still names a species page early, which the live check reads.
 */
export const SITEMAP_CHUNK = 40_000;
const BASE = 'https://cultifolio.com';
const esc = (s: string) => s.replace(/&/g, '&amp;');

/** Every address, in a stable order: the fixed pages, the species, then the genus rows. Once per index (round fifty-eight). */
const made = new WeakMap<IndexEntry[], string[]>();
export function sitemapUrls(index: IndexEntry[]): string[] {
  let urls = made.get(index);
  if (!urls) made.set(index, (urls = urlsOf(index)));
  return urls;
}
function urlsOf(index: IndexEntry[]): string[] {
  const genera = [...new Set(index.map((e) => genusOf(e.name)))].sort();
  return ['/', '/about/how', '/about/formats', ...index.map((e) => `/species/${e.slug}`), ...genera.map((g) => `/?by=genus&open=${slugify(g)}`)];
}

export function sitemapIndex(urls: string[]): string {
  const files = Math.max(1, Math.ceil(urls.length / SITEMAP_CHUNK));
  const entries = Array.from({ length: files }, (_, i) => `  <sitemap><loc>${BASE}/sitemap-${i + 1}.xml</loc></sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</sitemapindex>\n`;
}

export function sitemapChunk(urls: string[], n: number): string {
  const part = urls.slice((n - 1) * SITEMAP_CHUNK, n * SITEMAP_CHUNK);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${part.map((u) => `  <url><loc>${esc(BASE + u)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

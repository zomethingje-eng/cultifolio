import { getIndex } from '$lib/server/dossiers';
import { genusOf, slugify } from '$core/names';
import type { RequestHandler } from './$types';

/**
 * Every species page and every genus row, for crawlers: the catalogue renders a window of rows at a time, so a crawler
 * following links from the front page would otherwise reach most species only through sibling links. Cached for a day;
 * the index changes only when the corpus is refilled.
 */
export const GET: RequestHandler = async ({ platform, fetch }) => {
  const index = await getIndex(platform, fetch);
  const base = 'https://cultifolio.com';
  const esc = (s: string) => s.replace(/&/g, '&amp;');
  const genera = [...new Set(index.map((e) => genusOf(e.name)))].sort();
  const urls = ['/', '/about/how', '/about/formats', ...genera.map((g) => `/?by=genus&open=${slugify(g)}`), ...index.map((e) => `/species/${e.slug}`)];
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(base + u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
};

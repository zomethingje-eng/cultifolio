import { corpusNow, fromFiles } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import { sitemapUrls, sitemapIndex, lastmodOf } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

/**
 * The sitemap index, for crawlers: the catalogue renders a window of rows at a time, so a crawler following links from
 * the front page would otherwise reach most species only through sibling links. One index of chunk files since round
 * forty (the protocol's 50,000-address cap per file); cached for a day, since the index changes only when the corpus is refilled.
 */
export const GET: RequestHandler = async ({ platform, fetch, getClientAddress }) => {
  const stop = await limited(platform, getClientAddress, 'reference'); // every request reaches the Worker, counted (round fifty-eight; round sixty)
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  // The build's sitemap files under a manifest that names them, counted from it; else the addresses from the index (round seventy-six).
  const files = fromFiles(c) ? Object.keys(c.manifest!.files).filter((n) => /^sitemap\/\d+\.json$/.test(n)).length : sitemapUrls(c.idx!);
  return new Response(sitemapIndex(files, lastmodOf(c.manifest?.built)), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
};

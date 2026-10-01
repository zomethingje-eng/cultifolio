import { getIndex } from '$lib/server/dossiers';
import { sitemapUrls, sitemapIndex } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

/**
 * The sitemap index, for crawlers: the catalogue renders a window of rows at a time, so a crawler following links from
 * the front page would otherwise reach most species only through sibling links. One index of chunk files since round
 * forty (the protocol's 50,000-address cap per file); cached for a day, since the index changes only when the corpus is refilled.
 */
export const GET: RequestHandler = async ({ platform, fetch }) =>
  new Response(sitemapIndex(sitemapUrls(await getIndex(platform, fetch))), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });

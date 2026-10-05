import { error } from '@sveltejs/kit';
import { corpusNow } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import { sitemapUrls, sitemapChunk, lastmodOf, SITEMAP_CHUNK } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

/** One file of the sitemap index: `/sitemap-1.xml` holds the first `SITEMAP_CHUNK` addresses, and so on (round forty, own). */
export const GET: RequestHandler = async ({ params, platform, fetch, getClientAddress }) => {
  const n = Number(params.n);
  const stop = await limited(platform, getClientAddress, 'reference'); // every request reaches the Worker, counted (round fifty-eight; round sixty)
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  const urls = sitemapUrls(c.idx);
  if (!Number.isInteger(n) || n < 1 || (n - 1) * SITEMAP_CHUNK >= urls.length) error(404, 'no such sitemap file');
  return new Response(sitemapChunk(urls, n, lastmodOf(c.manifest?.built)), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
};

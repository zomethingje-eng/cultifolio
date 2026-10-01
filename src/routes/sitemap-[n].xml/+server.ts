import { error } from '@sveltejs/kit';
import { getIndex } from '$lib/server/dossiers';
import { sitemapUrls, sitemapChunk, SITEMAP_CHUNK } from '$lib/server/sitemap';
import type { RequestHandler } from './$types';

/** One file of the sitemap index: `/sitemap-1.xml` holds the first `SITEMAP_CHUNK` addresses, and so on (round forty, own). */
export const GET: RequestHandler = async ({ params, platform, fetch }) => {
  const n = Number(params.n);
  const urls = sitemapUrls(await getIndex(platform, fetch));
  if (!Number.isInteger(n) || n < 1 || (n - 1) * SITEMAP_CHUNK >= urls.length) error(404, 'no such sitemap file');
  return new Response(sitemapChunk(urls, n), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' } });
};

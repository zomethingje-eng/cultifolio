import { error } from '@sveltejs/kit';
import { corpusNow, fromFiles, product, UNREADABLE } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import { sitemapUrls, sitemapChunk, sitemapPart, sitemapDays, sitemapFiles, lastmodOf, sitemapParam, sitemapCorpus, SITEMAP_CHUNK, SITEMAP_FILE_CACHE, SITEMAP_OTHER_CACHE } from '$lib/server/sitemap';
import { browseOf, entranceUrls, hasBrowse } from '$lib/browse/load.server';
import type { RequestHandler } from './$types';

/**
 * One file of the sitemap index: `/sitemap-1.xml` holds the first `SITEMAP_CHUNK` addresses, and so on (round forty, own).
 * Since round eighty the index names them `/sitemap-<corpus id>-<n>.xml`, kept a day under that corpus's address; the bare
 * number, or another corpus's id, is the current corpus's file, kept five minutes (src/lib/server/sitemap.ts). The file
 * after the species' last is the browse entrance pages' (round eighty-seven, C2), each with the corpus's build day.
 */
export const GET: RequestHandler = async ({ params, platform, fetch, getClientAddress }) => {
  const asked = sitemapParam(params.n);
  const n = asked?.n ?? NaN;
  const stop = await limited(platform, getClientAddress, 'reference'); // every request reaches the Worker, counted (round fifty-eight; round sixty)
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  const own = !!asked?.corpus && asked.corpus === sitemapCorpus(c.corpus);
  const headers = { 'content-type': 'application/xml; charset=utf-8', 'cache-control': own ? SITEMAP_FILE_CACHE : SITEMAP_OTHER_CACHE };
  // The file after the last of the species' files: the browse entrance pages.
  const speciesFiles = fromFiles(c) ? Object.keys(c.manifest!.files).filter((x) => /^sitemap\/\d+\.json$/.test(x)).length : sitemapFiles(sitemapUrls(c.idx!).length);
  if (n === speciesFiles + 1 && hasBrowse(c)) return new Response(sitemapPart(entranceUrls(await browseOf(c, platform, fetch)), [], lastmodOf(c.manifest?.built)), { headers });
  if (fromFiles(c)) {
    // The build's file of these addresses and their days (round seventy-six): the index is not read.
    if (!Number.isInteger(n) || n < 1 || !Object.hasOwn(c.manifest!.files, `sitemap/${n}.json`)) error(404, 'no such sitemap file');
    const part = await product<{ urls: string[]; days: Array<number | null> }>(c, platform, fetch, `sitemap/${n}.json`);
    if (!part || !Array.isArray(part.urls) || !Array.isArray(part.days)) error(503, { message: UNREADABLE });
    return new Response(sitemapPart(part.urls, part.days, lastmodOf(c.manifest?.built)), { headers });
  }
  const urls = sitemapUrls(c.idx!);
  if (!Number.isInteger(n) || n < 1 || (n - 1) * SITEMAP_CHUNK >= urls.length) error(404, 'no such sitemap file');
  return new Response(sitemapChunk(urls, n, lastmodOf(c.manifest?.built), sitemapDays(c.idx!)), { headers });
};

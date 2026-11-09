import type { RequestHandler } from './$types';

/**
 * Everything public may be crawled; the collection pages hold nothing a crawler can read (the collection is on the device).
 * Not the browse pages' CSV files (round eighty-seven, C1): each view's table as a file, every species of a region or a
 * genus again, which a crawler would fetch once per view it found.
 */
export const GET: RequestHandler = () =>
  new Response('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /browse/csv\nSitemap: https://cultifolio.com/sitemap.xml\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });

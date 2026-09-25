import type { RequestHandler } from './$types';

/** Everything public may be crawled; the collection pages hold nothing a crawler can read (the collection is on the device). */
export const GET: RequestHandler = () =>
  new Response('User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://cultifolio.com/sitemap.xml\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' } });

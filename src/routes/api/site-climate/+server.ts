import type { RequestHandler } from './$types';

/**
 * A one-degree square of the site climate (round 126; SPECIES 20, the lens's Outdoors view; docs/PLAN-SITE-CLIMATE.md):
 * the twelve months of the daily high, the nightly low and the rain of each 0.05° cell of land in it, cut from the same
 * CHELSA V2.1 1981–2010 grid the species pages' habitat climates are read from (scripts/site-tiles.ts). `sq` is the
 * square's south-west corner in whole degrees ("51,-1"), so the site learns a square about 110 km across and nothing
 * finer. The bytes are passed on as stored, gzip, for the browser to unpack; a square of sea is a 404.
 */
const TILES_V = 'v1';
export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  const m = /^(-?\d{1,2}),(-?\d{1,3})$/.exec(url.searchParams.get('sq') ?? '');
  const lat = m ? Number(m[1]) : NaN, lon = m ? Number(m[2]) : NaN;
  if (!m || lat < -90 || lat > 89 || lon < -180 || lon > 179) return new Response('sq is the square\'s south-west corner in whole degrees, as "51,-1"', { status: 400, headers: { 'cache-control': 'no-store' } });
  const key = `climate/${TILES_V}/${lat}_${lon}.bin.gz`;
  const headers = { 'content-type': 'application/gzip', 'cache-control': 'public, max-age=31536000, immutable' };
  const obj = await platform?.env?.STORE?.get(key);
  if (obj) return new Response(obj.body, { headers });
  // Without the bucket (a local build), the static copy, where one was put.
  if (!platform?.env?.STORE) { const r = await fetch(`/${key}`).catch(() => null); if (r?.ok) return new Response(r.body, { headers }); }
  return new Response('no land climate for this square', { status: 404, headers: { 'cache-control': 'public, max-age=86400' } });
};

import { json, error } from '@sveltejs/kit';
import { getIndex } from '$lib/server/dossiers';
import type { RequestHandler } from './$types';

/**
 * GET /api/entries?slugs=a,b,c — the index entries for a few species, for the pages that
 * need a grower's own species (thumbnails on the plants list, tiles on the front page, keys
 * for label care lines) and not the whole 3 MB catalogue. Up to 200 slugs; unknown slugs are
 * simply absent, so a caller can tell "not in the reference" from "not reached".
 */
export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  const slugs = (url.searchParams.get('slugs') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!slugs.length) error(400, 'slugs required');
  if (slugs.length > 200) error(400, 'at most 200 slugs');
  const want = new Set(slugs);
  const idx = await getIndex(platform, fetch);
  return json(idx.filter((e) => want.has(e.slug)), { headers: { 'cache-control': 'public, max-age=300' } });
};

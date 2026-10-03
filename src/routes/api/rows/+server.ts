import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { catalogueRows, byOf, chipOf } from '$lib/server/catalogue';

/**
 * GET /api/rows?by=<genus|origin|family>&chip=<all|climate|noclimate>&at=<row>&n=<count>&c=<corpus> — a window of the
 * catalogue's rows, for the front page to append as the reader nears the end of what the HTML carried, and to jump to a
 * letter (round forty-seven, 1). The rows are the build's file under the corpus id, or derived from the index once per
 * load and grouping and kept (round fifty-three, 2); the answer is cacheable for a day under the corpus id, as the
 * search is, and `no-store` under another.
 */
export const _MAX_ROWS = 200;

export const GET: RequestHandler = async ({ url, platform, fetch }) => {
  const { cat, corpus } = await catalogueRows(platform, fetch, byOf(url.searchParams.get('by')), chipOf(url.searchParams.get('chip')));
  const at = Math.max(0, Math.min(cat.rows.length, Math.floor(Number(url.searchParams.get('at')) || 0)));
  const n = Math.min(_MAX_ROWS, Math.max(1, Math.floor(Number(url.searchParams.get('n')) || 160)));
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  return json({ at, count: cat.rows.length, rows: cat.rows.slice(at, at + n) }, { headers: { 'cache-control': asked === corpus ? 'public, max-age=86400' : 'no-store' } });
};

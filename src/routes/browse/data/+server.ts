import { json, error } from '@sveltejs/kit';
import { corpusNow } from '$lib/server/dossiers';
import { forBuild } from '$lib/server/build';
import { limited } from '$lib/server/sync';
import { browseOf, hasBrowse } from '$lib/browse/load.server';
import { parseQuery, allRows, regionCounts, type Prepared } from '$lib/browse/engine';
import { keyAt, slugAt } from '$lib/browse/table';
import { encodeKeys, PIN_FOLLOW_MAX } from '$lib/browse/pins';
import { CONTINENTS, LEVEL3, REGIONS } from '$lib/browse/tdwg';
import points from '$lib/browse/map-points.json';
import type { RequestHandler } from './$types';

/**
 * GET /browse/data?part=<part>&<a browse query>&c=<corpus>&v=<build> (round eighty-seven, C6 and C7): what a browse
 * page's scripts ask of the browse table, as JSON, the same answer for anyone who asks it:
 *
 * - `count`: how many species the query gives (the map picker's "Show N species" as regions are ticked);
 * - `regions`: the map picker's regions (TDWG's levels 1 to 3, each level-3 region with where the map writes it,
 *   whether it is small, and its extent: $lib/browse/map-points.json), each level-3 region with how many of the species
 *   the query's other filters give are native to it, the ticked regions set aside;
 * - `keys`: the species the query gives, as page ids written short (`encodeKeys`), for a pinned view to compare with the
 *   species it held when last seen; none past PIN_FOLLOW_MAX, and said so (`wide`); none where the query names a region
 *   the scheme no longer holds, with those codes (`gone`) and the count of the rest;
 * - `names`: the name and address of each page id asked (`k=k123,g456`, at most sixty) that the reference holds, for the
 *   species a pinned view gained or lost; a page id the reference no longer holds is left out, and the page says so.
 *
 * The query is the view's alone (a pinned view's, a page's): nothing of a collection is in it, and the scripts never
 * add anything of one (the collection lens works in the browser and asks nothing; /about/how#privacy). Counted under the
 * `render` allowance, as a browse page is. Kept five minutes by the browser and the edge only under the corpus and the
 * build it was asked under, as /api/suggest keeps its answers; asked under another corpus or none, answered and not kept.
 * A corpus with no browse table answers 503 in words, as the pages do.
 */
const PARTS = new Set(['count', 'regions', 'keys', 'names']);
const byKey = new WeakMap<Prepared, Map<string, number>>();
const placeOf = (p: Prepared) => { let m = byKey.get(p); if (!m) { m = new Map(); for (let i = 0; i < p.t.n; i++) m.set(keyAt(p.t, i), i); byKey.set(p, m); } return m; };

export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const part = url.searchParams.get('part') ?? '';
  if (!PARTS.has(part)) error(400, { message: 'Not a part of a browse view: count, regions, keys or names' });
  const stop = await limited(platform, getClientAddress, 'render').catch(() => null);
  if (stop) return stop;
  const c = await corpusNow(platform, fetch);
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const headers = { 'cache-control': asked && asked === c.corpus ? forBuild(url, 'public, max-age=300') : 'no-store' };
  if (!hasBrowse(c)) error(503, { message: 'This build of the reference has no browse table yet.', unreadable: true });
  const p = await browseOf(c, platform, fetch);
  const q = { ...parseQuery(url.searchParams), at: 0, view: 'tiles' as const, in: '', more: '' as const };
  if (part === 'count') return json({ n: allRows(p, q).length }, { headers });
  if (part === 'regions') {
    const { l3 } = regionCounts(p, allRows(p, { ...q, r: [], all: false, only: false }));
    const at = (points as { at: Record<string, number[]> }).at;
    return json({
      l1: CONTINENTS.map((r) => [r.code, r.label]),
      l2: [...REGIONS.values()].filter((r) => r.level === 2).map((r) => [r.code, r.label, r.up]),
      l3: LEVEL3.map((r) => [r.code, r.label, r.up, l3.get(r.code) ?? 0, ...(at[r.code] ?? [0, 0, 1, 0, 0, 0, 0])])
    }, { headers });
  }
  if (part === 'keys') {
    const rows = allRows(p, { ...q, sort: 'az' });
    // A view naming a region the scheme no longer holds: how many the rest of it gives, and which codes are gone, with no
    // species to compare, so a pin says the region is gone rather than "too many to follow" (the review of stage 2's pages, 6).
    if (q.gone?.length) return json({ n: rows.length, keys: null, gone: q.gone }, { headers });
    if (rows.length > PIN_FOLLOW_MAX) return json({ n: rows.length, keys: null, wide: true }, { headers });
    return json({ n: rows.length, keys: encodeKeys(rows.map((i) => keyAt(p.t, i))) }, { headers });
  }
  const want = [...new Set((url.searchParams.get('k') ?? '').split(',').filter((k) => /^[kg][1-9]\d{0,9}$/.test(k)))].slice(0, 60);
  const at = placeOf(p);
  const rows = want.map((k) => at.get(k)).filter((i): i is number => i !== undefined);
  return json({ names: rows.map((i) => ({ key: keyAt(p.t, i), name: p.t.name[i], slug: slugAt(p.t, i), ...(p.t.common[i] ? { common: p.t.common[i] } : {}) })) }, { headers });
};

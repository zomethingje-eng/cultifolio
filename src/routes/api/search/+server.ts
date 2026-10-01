import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getIndexWithCorpus, type IndexEntry } from '$lib/server/dossiers';
import { prepare, search, type Prepared } from '$core/search';
import { limited } from '$lib/server/sync';

/**
 * GET /api/search?q=<text>&n=<limit>&c=<corpus> — the catalogue search, answered from the index the Worker holds in
 * memory with the same ranking the front page used to run over the whole index in the browser. The browser fetched the
 * 4 MB index for the first keystroke; at a few tens of thousands of species that would be unusable, and the index is
 * the one thing the site's size would grow (round thirty-nine, the index). What is sent is the text typed into a
 * public catalogue's search box, never a plant's record; /about/how lists it.
 *
 * The prepared index is built once per index load (a `WeakMap` on the loaded array, so a corpus refresh prepares the
 * new one and lets the old go). Answers are cacheable at the edge and in the browser for a day under the corpus id, as
 * the entries and sheets routes are, and `no-store` when asked under another id (round thirteen, 4; round sixteen, 12).
 */
const prepared = new WeakMap<IndexEntry[], Prepared<IndexEntry>[]>();
/** Letters and marks of any script, digits, space, period, apostrophe, hyphen, the hybrid sign: what a name, a common name or a region is written in. */
export const _SEARCH_QUERY = /^[\p{L}\p{M}\p{N}\s.'\-×]{1,80}$/u;
export const _MAX_HITS = 100;
const DEFAULT_HITS = 60;

export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (!q) return json([], { headers: { 'cache-control': 'public, max-age=86400' } });
  if (!_SEARCH_QUERY.test(q)) return json({ error: 'a search is letters, digits, spaces, periods, apostrophes, hyphens and ×' }, { status: 400, headers: { 'cache-control': 'no-store' } });
  const stop = await limited(platform, getClientAddress, 'search');
  if (stop) return stop;
  const n = Math.min(_MAX_HITS, Math.max(1, Number(url.searchParams.get('n')) || DEFAULT_HITS));
  const { idx, corpus } = await getIndexWithCorpus(platform, fetch);
  let p = prepared.get(idx);
  if (!p) prepared.set(idx, (p = prepare(idx)));
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const current = asked === corpus;
  return json(search(p, q, n), { headers: { 'cache-control': current ? 'public, max-age=86400' : 'no-store' } });
};

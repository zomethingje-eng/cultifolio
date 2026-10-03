import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchAnswer } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';

/**
 * GET /api/search?q=<text>&n=<limit>&c=<corpus> — the catalogue search, answered from the index the Worker holds in
 * memory with the same ranking the front page used to run over the whole index in the browser. The browser fetched the
 * 4 MB index for the first keystroke; at a few tens of thousands of species that would be unusable, and the index is
 * the one thing the site's size would grow (round thirty-nine, the index). What is sent is the text typed into a
 * public catalogue's search box, never a plant's record; /about/how lists it.
 *
 * Under a manifest the build's postings name the few entries a query can match, prepared for the request; without one
 * the prepared index is built once per index load (a `WeakMap` on the loaded array, so a corpus refresh prepares the
 * new one and lets the old go). Answers are cacheable at the edge and in the browser for a day under the corpus id, as
 * the entries and sheets routes are, and `no-store` when asked under another id (round thirteen, 4; round sixteen, 12).
 */
/**
 * Anything that is not a letter, a mark or a digit becomes a space before the search, since the tokeniser splits on it
 * anyway: the route refused "Lithops ’Ruby’" (iOS writes every apostrophe as ’), "copiapoa, cinerea" and "Aloe/Gasteria"
 * with a 400 the page showed as "Nothing matches" (round forty, R1-1). A query that is nothing but such characters is an
 * empty search.
 */
export const _clean = (q: string) => q.replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ').trim().slice(0, 80);
export const _MAX_HITS = 100;
const DEFAULT_HITS = 60;

export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const q = _clean((url.searchParams.get('q') ?? '').slice(0, 200));
  if (!q) return json([], { headers: { 'cache-control': 'public, max-age=86400' } });
  // The limit answers with a Retry-After the page turns into "try again in N minutes", not "could not be reached" (round forty, R1-3).
  const stop = await limited(platform, getClientAddress, 'search');
  if (stop) return stop;
  const n = Math.min(_MAX_HITS, Math.max(1, Number(url.searchParams.get('n')) || DEFAULT_HITS));
  // The build's postings name the entries the query can match, and only those are ranked (round fifty-six, 1); without
  // a manifest, the whole index prepared with the index. A posting file the bucket lacks leaves the whole index prepared
  // for the request, under a rate bucket of its own: that is a second's work at fifty thousand species (round fifty-five, 4).
  const a = await searchAnswer(platform, fetch, q, n, () => limited(platform, getClientAddress, 'searchmiss'));
  if ('stop' in a) return a.stop;
  const { hits, corpus } = a;
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const current = asked === corpus;
  return json(hits, { headers: { 'cache-control': current ? 'public, max-age=86400' : 'no-store' } });
};

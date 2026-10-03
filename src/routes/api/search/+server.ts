import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCorpus, searchFor, searchWhole, hasProducts } from '$lib/server/dossiers';
import { search, shardOf, hasExact } from '$core/search';
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
  const { id: corpus } = await getCorpus(platform, fetch);
  // The build's shard for the query's first character, else the whole index prepared with the index (round fifty-two, 5; round fifty-three, 2).
  const shard = shardOf(q);
  if (!shard) return json([], { headers: { 'cache-control': 'public, max-age=86400' } }); // no word the tokeniser keeps: nothing matches, nothing is prepared (round fifty-five, 4)
  const p = await searchFor(platform, fetch, shard);
  let hits = search(p, q, n);
  // A shard holds every exact hit, not every near one: a slip in the first letter ("hile" for Chile) found nothing, or
  // a few names beginning with the slipped letter, where the whole index found the five hundred (round fifty-four, 3;
  // the second reviewer's finding 19). When the shard's exact pass finds nothing, the query is tried over the whole,
  // prepared for this request and let go; a miss is rare enough that the cost stays off the ordinary path.
  // Only for a first word of four letters or more (a slip in a shorter one is a different word, and the near pass forgives
  // none under four), and under a rate bucket of its own: the whole pass is a second's work at fifty thousand species (round fifty-five, 4).
  const firstWord = q.toLowerCase().split(/\s+/).find((w) => w && !['var', 'subsp', 'ssp', 'f'].includes(w)) ?? '';
  if (!hasExact(p, q) && firstWord.length >= 4 && (await hasProducts(platform, fetch))) {
    const stopMiss = await limited(platform, getClientAddress, 'searchmiss');
    if (!stopMiss) hits = search(await searchWhole(platform, fetch), q, n);
  }
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const current = asked === corpus;
  return json(hits, { headers: { 'cache-control': current ? 'public, max-age=86400' : 'no-store' } });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchAnswer, corpusNow } from '$lib/server/dossiers';
import { limited } from '$lib/server/sync';
import { droppedLabel, nearAnswer, genusReading, genusOfReading, leftOut } from '$core/search';
import { genusOf } from '$core/names';

/**
 * GET /api/search?q=<text>&n=<limit>&c=<corpus> — the catalogue search, answered from the index the Worker holds in
 * memory with the same ranking the front page used to run over the whole index in the browser. The browser fetched the
 * 4 MB index for the first keystroke; at a few tens of thousands of species that would be unusable, and the index is
 * the one thing the site's size would grow (round thirty-nine, the index). What is sent is the text typed into a
 * public catalogue's search box, never a plant's record; /about/how lists it.
 *
 * Under a manifest the build's postings name the few entries a query can match, prepared for the request; without one
 * the prepared index is built once per index load (a `WeakMap` on the loaded array, so a corpus refresh prepares the
 * new one and lets the old go). The browser may keep an answer for a day under the corpus id, and `no-store` when asked
 * under another id (round thirteen, 4; round sixteen, 12).
 *
 * A Worker's own response is not kept by the edge on its own (round twelve, 8, for the sheets): every keystroke reached
 * here and counted against the address. So each answer is put in the Worker's cache (the Cache API) for a day, under
 * the corpus it came from and the query as cleaned, and a second reader typing the same thing is answered from there,
 * uncounted (round sixty; the server review, 15; the corpus review, 17).
 *
 * The answer is a list of hits. When nothing matched the query as written and its first two words found something
 * (`relaxedQuery`), those are the hits, and the answer says so, so the page can say "Showing results for …" (round
 * sixty): asked with `&shape=2`, the answer is always `{ hits, relaxed?: { query } }`; asked without (a page from an
 * older build, the picker, compare), it stays a plain list, and the retry is named in the `x-search-relaxed` header
 * (the query, URI-encoded), so no page that reads a list is handed an object.
 */
/**
 * The query as the search reads it: normalised (NFC) first, then anything that is not a letter, a mark, a digit or one
 * of the few marks a pasted name carries (a bracket, a full stop, "&", a quote, "×") becomes a space, since the tokeniser
 * splits on it anyway; then cut to 80 characters, counted as characters, not UTF-16 units (round sixty; A28: two
 * spellings of one long query could be cut at different places, and a cut could split a character in two). The route
 * refused "Lithops ’Ruby’" (iOS writes every apostrophe as ’), "copiapoa, cinerea" and "Aloe/Gasteria" with a 400 the
 * page showed as "Nothing matches" (round forty, R1-1). The quotes and the citation marks stay so the search can drop a
 * cultivar and an author (round sixty). A query with no letter or digit is an empty search. NFKC, not NFC, and the
 * format characters (`\p{Cf}`: a zero-width space, a soft hyphen) taken out first: they split a word, and full-width
 * letters matched nothing (round sixty-two; A7).
 */
export const _clean = (q: string) => [...q.normalize('NFKC').replace(/\p{Cf}/gu, '').replace(/[^\p{L}\p{M}\p{N}().&'"‘’“”×-]+/gu, ' ').trim()].slice(0, 80).join('').trim();
export const _MAX_HITS = 100;
const DEFAULT_HITS = 60;
const CACHE_S = 86_400;

export const GET: RequestHandler = async ({ url, platform, fetch, getClientAddress }) => {
  const q = _clean([...(url.searchParams.get('q') ?? '')].slice(0, 200).join(''));
  if (!/[\p{L}\p{N}]/u.test(q)) return json(url.searchParams.get('shape') === '2' ? { hits: [] } : [], { headers: { 'cache-control': `public, max-age=${CACHE_S}` } });
  const n = Math.min(_MAX_HITS, Math.max(1, Number(url.searchParams.get('n')) || DEFAULT_HITS));
  const asked = (url.searchParams.get('c') ?? '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 40);
  const c = await corpusNow(platform, fetch);
  const headers = (corpus: string) => ({ 'cache-control': asked === corpus ? `public, max-age=${CACHE_S}` : 'no-store' });
  const edge = platform?.caches?.default;
  const key = new Request(`https://cache.cultifolio/search5?c=${encodeURIComponent(c.corpus)}&n=${n}&q=${encodeURIComponent(q)}`); // the case kept: an author citation is read by its capitals; search5: answers kept before round sixty-three's similar-spelling rule (N3) are not served
  const shaped = url.searchParams.get('shape') === '2';
  // `near`: the hits came by a similar spelling, so the picker can say "similar spelling" (round sixty-two; A7, B2).
  // `relaxed.left`: the reading matched and left these typed words out (an author, a cultivar, "sp."), where a relaxed
  // answer without it is a retry, after nothing matched as written (round sixty-two; the verification review's search 3).
  type Relaxed = { query: string; left?: string };
  const answer = (corpus: string, hits: unknown[], relaxed: Relaxed | undefined, near: boolean) =>
    new Response(JSON.stringify(shaped ? { hits, ...(relaxed ? { relaxed } : {}), ...(near ? { near } : {}) } : hits), { headers: { 'content-type': 'application/json', ...headers(corpus), ...(relaxed ? { 'x-search-relaxed': encodeURIComponent(relaxed.query) } : {}), ...(relaxed?.left ? { 'x-search-left': encodeURIComponent(relaxed.left) } : {}), ...(near ? { 'x-search-near': '1' } : {}) } });
  // A cache that fails to answer is a search, not a 500.
  const hit = edge ? await edge.match(key).catch(() => undefined) : undefined;
  if (hit) {
    // Kept as `{ hits, relaxed? }` whichever shape was asked, and answered in the shape this request asks for.
    const kept = (await hit.json().catch(() => null)) as { hits?: unknown; relaxed?: { query?: unknown; left?: unknown }; near?: unknown } | null;
    if (kept && Array.isArray(kept.hits)) return answer(c.corpus, kept.hits, typeof kept.relaxed?.query === 'string' ? { query: kept.relaxed.query, ...(typeof kept.relaxed.left === 'string' ? { left: kept.relaxed.left } : {}) } : undefined, kept.near === true);
  }
  // The limit answers with a Retry-After the page turns into "try again in N minutes", not "could not be reached" (round forty, R1-3).
  const stop = await limited(platform, getClientAddress, 'search');
  if (stop) return stop;
  // The build's postings name the entries the query can match, and only those are ranked (round fifty-six, 1); without
  // a manifest, the whole index prepared with the index. A posting file the bucket lacks leaves the whole index prepared
  // for the request, under a rate bucket of its own: that is a second's work at fifty thousand species (round fifty-five, 4).
  const miss = () => limited(platform, getClientAddress, 'searchmiss');
  let a = await searchAnswer(platform, fetch, q, n, miss, c);
  if ('stop' in a) return a.stop;
  // Last, a genus followed by capitalised words that nothing answered, not by a similar spelling of a whole epithet nor
  // by its first two words, is a cultivar of the genus ("Echeveria Lola", "Haworthia Big Band"): answered by the genus,
  // and only when the first word is a genus of the reference, by the answer's own names, so a common name in title case
  // never shrinks to its first word (round sixty-two; the verification review's search 1 and 2; A7, B2).
  const genus = !a.hits.length ? genusReading(q) : null;
  if (genus) {
    const g = await searchAnswer(platform, fetch, genus, n, miss, c);
    if ('stop' in g) return g.stop;
    const own = g.hits.filter((h) => genusOfReading(genus, genusOf(h.name)));
    if (own.length) a = { hits: own, corpus: g.corpus, relaxed: { query: genus } };
  }
  const { hits, corpus } = a;
  // The words used, when the reading that answered dropped some of the query (an author, a quoted cultivar, "sp."):
  // named in the answer as a retry's are (round sixty-two; B2), with what it left out (search 3).
  const dropped = a.relaxed ? null : droppedLabel(q, hits);
  const left = dropped ? leftOut(q) : null;
  const relaxed: Relaxed | undefined = a.relaxed ?? (dropped ? { query: dropped, ...(left ? { left } : {}) } : undefined);
  const near = nearAnswer(a.relaxed?.query ?? q, hits);
  // Kept only under the corpus the answer is from (the key names the corpus loaded above, which is the one searched).
  if (edge && corpus === c.corpus) {
    const put = edge.put(key, new Response(JSON.stringify({ hits, ...(relaxed ? { relaxed } : {}), ...(near ? { near } : {}) }), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_S}` } })).catch(() => {});
    if (platform?.context?.waitUntil) platform.context.waitUntil(put);
    else await put;
  }
  return answer(corpus, hits, relaxed, near);
};

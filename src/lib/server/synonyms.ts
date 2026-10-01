/**
 * An old name at a species address: growers' labels and seed lists are full of
 * them (Haworthia attenuata, Cotyledon paniculata), and the reference files a
 * species under the name the GBIF backbone accepts. When no dossier answers to
 * a slug, the Worker asks the backbone's match service whether the name is a
 * synonym, and, if the accepted species is in the reference, the page
 * redirects there and says so (round thirty, R2-8). The question goes from the
 * server, never from the browser, and only for an address the reference does
 * not hold; the answer is cached at the edge for a day.
 */
import { getIndex, type Platform, type Fetch } from './dossiers';

export interface SynonymAnswer {
  /** The name as the backbone matched it. */
  matched: string;
  /** The accepted species' backbone key and canonical name. */
  acceptedKey: number;
  acceptedName: string;
  /** The reference's slug for the accepted species, when it holds it. */
  slug: string | null;
}

/** A species slug as a name the backbone can match: `haworthia-attenuata-var-radula` → `Haworthia attenuata var. radula`. */
export function nameFromSlug(slug: string): string {
  let parts = slug.split('-').filter(Boolean);
  if (parts[0] === 'x' && parts.length > 2) parts = parts.slice(1); // a hybrid's × is not a word: `x-gasteraloe-beguinii` is Gasteraloe beguinii to the backbone (round thirty-three, 12)
  if (!parts.length || parts.length > 6) return '';
  const words = parts.map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : /^(var|subsp|ssp|f|fo)$/.test(w) ? `${w}.` : w));
  return words.join(' ');
}

const MATCH = 'https://api.gbif.org/v1/species/match';

/**
 * The reference's own answer first: the index carries each species' older names as binomials (round thirty-one, 3), so
 * a slug that is one of them is answered from the index with no request. The backbone's match service is asked only
 * for a name the index does not know; it is fuzzy and answers a bare binomial it cannot place with the family
 * ("Cotyledon paniculata" came back as Crassulaceae and the page was a 404 while Tylecodon paniculatus listed the
 * name under Also known as).
 */
export async function synonymInIndex(platform: Platform, fetch: Fetch, slug: string): Promise<SynonymAnswer | null> {
  const name = nameFromSlug(slug);
  if (!name || !/^[A-Z][a-z]+ [a-z]/.test(name)) return null;
  const want = name.toLowerCase();
  const index = await getIndex(platform, fetch);
  const entry = index.find((e) => e.syn?.some((s) => s.toLowerCase() === want));
  if (!entry) return null;
  const matched = entry.syn!.find((s) => s.toLowerCase() === want)!;
  return { matched, acceptedKey: entry.key, acceptedName: entry.name, slug: entry.slug };
}

/**
 * Whether the slug's name is a synonym in the backbone, and of what. Null when the backbone does not know the name,
 * knows it as accepted (then the reference simply lacks it), or cannot be reached.
 */
export async function synonymOf(platform: Platform, fetch: Fetch, slug: string): Promise<SynonymAnswer | null> {
  const name = nameFromSlug(slug);
  if (!name || !/^[A-Z][a-z]+ [a-z]/.test(name)) return null; // a binomial at least: a bare genus is not a species address
  const cacheKey = new Request(`https://cache.cultifolio/match?name=${encodeURIComponent(name.toLowerCase())}`);
  const cache = platform?.caches?.default;
  let body: Record<string, unknown> | null = null;
  const hit = await cache?.match(cacheKey);
  if (hit) body = (await hit.json()) as Record<string, unknown>;
  else {
    try {
      const r = await fetch(`${MATCH}?kingdom=Plantae&strict=false&name=${encodeURIComponent(name)}`, { headers: { accept: 'application/json', 'user-agent': 'Cultifolio/3.0 (https://cultifolio.com)' } });
      if (!r.ok) return null;
      body = (await r.json()) as Record<string, unknown>;
      if (cache) platform?.context?.waitUntil?.(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })));
    } catch {
      return null;
    }
  }
  // The match service says `status: "SYNONYM"`; older replies said `synonym: true`. Either is the answer (found on the first deploy: the live check's Haworthia attenuata came back a plain 404).
  if (!body || !(body.synonym === true || body.status === 'SYNONYM') || typeof body.acceptedUsageKey !== 'number') return null;
  // An exact match, or a fuzzy one the service is sure of and in the same genus: a typo, or a name the backbone lacks,
  // can fuzzy-match a neighbouring synonym, and the page would then state "X is a synonym" as fact (round thirty-three, 12).
  const matchType = String(body.matchType ?? '');
  // The name as the reader wrote it when the match is exact (the backbone's canonical form drops "var.", and the page
  // then could not find the name among the species' own); the backbone's spelling when the match corrected one.
  const matched = matchType === 'EXACT' ? name : String(body.canonicalName ?? name);
  if (matchType !== 'EXACT' && !(matchType === 'FUZZY' && Number(body.confidence ?? 0) >= 90 && matched.split(' ')[0] === name.split(' ')[0])) return null;
  const acceptedName = String(body.species ?? body.canonicalName ?? '');
  if (!acceptedName) return null;
  const index = await getIndex(platform, fetch);
  // The accepted usage of a variety is the variety; the reference files species, so its `speciesKey` is what the index may hold.
  const keys = [body.acceptedUsageKey, typeof body.speciesKey === 'number' ? body.speciesKey : null].filter((k): k is number => typeof k === 'number');
  const entry = index.find((e) => keys.includes(e.key));
  return { matched, acceptedKey: body.acceptedUsageKey, acceptedName, slug: entry?.slug ?? null };
}

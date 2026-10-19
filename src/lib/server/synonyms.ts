/**
 * An old name at a species address: growers' labels and seed lists are full of
 * them (Haworthia attenuata, Cotyledon paniculata), and the reference files a
 * species under the name the GBIF backbone accepts. When no dossier answers to
 * a slug, the Worker asks the backbone's match service whether the name is a
 * synonym, and, if the accepted species is in the reference, the page
 * redirects there and says so (round thirty, R2-8). The question goes from the
 * server, never from the browser, and only for an address the reference does
 * not hold; the answer is kept in the Worker's cache (the Cache API) for a day.
 */
import { corpusNow, type Platform, type Fetch, type Loaded } from './dossiers';
import { lookupOf } from './lookup';
import { upstreamCall } from './sync';
import { workerKey } from './worker-cache';
import { canonicalSynonym } from '$core/names';

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
  // Split on a hyphen, an underscore or a space alike: `copiapoa_cinerea` said the reference had none of its genus (round sixty; the corpus review, 9).
  let parts = slug.toLowerCase().split(/[-_\s]+/).filter(Boolean);
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
export async function synonymInIndex(platform: Platform, fetch: Fetch, slug: string, held?: Loaded): Promise<SynonymAnswer | null> {
  const name = nameFromSlug(slug);
  if (!name || !/^[A-Z][a-z]+ [a-z]/.test(name)) return null;
  const want = name.toLowerCase();
  const look = lookupOf(held ?? (await corpusNow(platform, fetch)), platform, fetch); // the request's own corpus, as the page's (round sixty; A27)
  // The address's slug first, as it is: the maps hold every older name under its slug too, so `arbutus-uva-ursi` is
  // Arbutus uva-ursi, where `nameFromSlug` reads "Arbutus uva ursi", which no species holds (round seventy; triage-69 N3,
  // S-F3). Then the name read from it, as before. A name held by one species only: one held by two or more answers neither.
  // Read by key from the build's files of names (round seventy-six; `older/` since round seventy-seven), or from the maps over the index.
  const one = async (k: string) => { const o = await look.older(k); return o && 'one' in o ? o : null; };
  const hit = (await one(slug.trim().toLowerCase())) ?? (await one(want));
  if (!hit) return null;
  return { matched: hit.matched, acceptedKey: hit.one[0], acceptedName: hit.one[2], slug: hit.one[1] };
}

/**
 * Whether the slug's name is a synonym in the backbone, and of what. Null when the backbone does not know the name or
 * knows it as accepted (then the reference simply lacks it); `'unchecked'` when it could not be asked, which the 404
 * says, since "not an older name" and "could not ask" are different facts (round fifty-nine; rule 2); `'held'` when the
 * site held the call back itself (its minute of calls to GBIF used up), which the 404 says as that (round sixty-one).
 * `ip` is the reader's address as `clientIp` keys it: the call is counted to it as the names route counts its own, so
 * one address takes at most its tenth of GBIF's share whichever route asks (round sixty-two; the server review, 3; A29:
 * counted to the site alone, one address took a fifth). Null counts the share alone, for a caller with no reader. It
 * is required, with no default: a default of null counted a new caller to the site alone without a word (round
 * sixty-two; the self-review's triage, agent S's need).
 */
export async function synonymOf(platform: Platform, fetch: Fetch, slug: string, held: Loaded | undefined, ip: string | null): Promise<SynonymAnswer | null | 'unchecked' | 'held'> {
  const a = await synonymAsk(platform, fetch, slug, held, ip);
  return a === 'refused' ? 'unchecked' : a;
}
/**
 * `synonymOf`, with GBIF's own refusal of this site's request (its 429 or 403) as `'refused'`, which the 404 says as
 * that, never as "GBIF's name service did not answer" (round sixty-seven; triage-66 S8, R45-11). `synonymOf` keeps its
 * answers (a refusal is `'unchecked'` there) for a caller that does not word the two apart.
 */
export async function synonymAsk(platform: Platform, fetch: Fetch, slug: string, held: Loaded | undefined, ip: string | null): Promise<SynonymAnswer | null | 'unchecked' | 'held' | 'refused'> {
  const name = nameFromSlug(slug);
  if (!name || !/^[A-Z][a-z]+ [a-z]/.test(name)) return null; // a binomial at least: a bare genus is not a species address
  // Keyed by the build (round sixty-nine; triage-68 W3): the answer is GBIF's, but what this build makes of it is its own.
  const cacheKey = workerKey('match', { name: name.toLowerCase() });
  const cache = platform?.caches?.default;
  let body: Record<string, unknown> | null = null;
  const hit = await cache?.match(cacheKey).catch(() => undefined); // a cache that fails is a lookup, not a 500 (round sixty)
  if (hit) body = (await hit.json().catch(() => null)) as Record<string, unknown> | null;
  if (!hit) {
    // The site's own minute of calls to GBIF, for every address together, and this reader's part of it: past either, not
    // asked (round sixty; the server review, 16; round sixty-two: the server review, 3).
    if (!(await upstreamCall(platform, ['gbif'], ip)).ok) return 'held'; // held back by the site, said as that (round sixty-one; the server review, 4)
    try {
      const r = await fetch(`${MATCH}?kingdom=Plantae&strict=false&name=${encodeURIComponent(name)}`, { headers: { accept: 'application/json', 'user-agent': 'Cultifolio/3.0 (https://cultifolio.com)' } });
      if (r.status === 429 || r.status === 403) return 'refused';
      if (!r.ok) return 'unchecked';
      body = (await r.json()) as Record<string, unknown>;
      if (cache) platform?.context?.waitUntil?.(cache.put(cacheKey, new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } })).catch(() => {}));
    } catch {
      return 'unchecked';
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
  const look = lookupOf(held ?? (await corpusNow(platform, fetch)), platform, fetch); // the request's own corpus (round sixty; A27)
  // The accepted usage of a variety is the variety; the reference files species, so its `speciesKey` is what the index may hold.
  const keys = [body.acceptedUsageKey, typeof body.speciesKey === 'number' ? body.speciesKey : null].filter((k): k is number => typeof k === 'number');
  // Of the two, the one the index lists first, as the scan of the index found it (round seventy-six: read by key).
  const found = (await Promise.all(keys.map((k) => look.species(k)))).filter((e) => !!e).sort((a, b) => a!.at - b!.at);
  return { matched, acceptedKey: body.acceptedUsageKey, acceptedName, slug: found[0]?.slug ?? null };
}

/**
 * The backbone's cached answer for a name, read from the Worker's cache only, never asked (round seventy-one; S-F8): the
 * redirect from `/species/echinopsis-pachanoi` put GBIF's answer there a moment before, so the page it lands on can say
 * why it was sent, without trusting `?was=` (anyone can write it) and without a request of its own. Null on any miss.
 */
export async function cachedMatch(platform: Platform, name: string): Promise<{ status?: string; matchType?: string; acceptedUsageKey?: number; speciesKey?: number } | null> {
  const cache = platform?.caches?.default;
  if (!cache || !/^[A-Z][a-z]+ [a-z]/.test(name)) return null;
  const hit = await cache.match(workerKey('match', { name: name.toLowerCase() })).catch(() => undefined);
  if (!hit) return null;
  const body = (await hit.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return null;
  return { status: typeof body.status === 'string' ? body.status : body.synonym === true ? 'SYNONYM' : undefined, matchType: typeof body.matchType === 'string' ? body.matchType : undefined, acceptedUsageKey: typeof body.acceptedUsageKey === 'number' ? body.acceptedUsageKey : undefined, speciesKey: typeof body.speciesKey === 'number' ? body.speciesKey : undefined };
}

/**
 * The authors under which a species' stored synonyms (the dossier's `name.synonyms`, GBIF's with their authorship) hold
 * an older name (round seventy; triage-69 F1): "Echeveria farinosa Lindl." gives "Lindl." for "Echeveria farinosa". Each
 * author once, in the record's order; empty where the record holds the name with no author, or not at all. Nothing is
 * guessed: the text after the name is the record's, as it stands.
 */
export function authorsOf(name: string, synonyms: readonly string[]): string[] {
  const want = name.trim().replace(/\s+/g, ' ').toLowerCase();
  const out: string[] = [];
  for (const s of synonyms) {
    const t = s.trim().replace(/\s+/g, ' ');
    if (canonicalSynonym(t)?.toLowerCase() !== want) continue;
    // The record's text past the name: a variety's rank and epithet are part of the name, so only a binomial's own record
    // matches a binomial, and the rest is its author.
    // One author written twice with other spacing ("(Jacq.) Ker Gawl." and "(Jacq.) KerGawl.") is said once, as first written.
    const author = t.slice(want.length).trim();
    if (t.slice(0, want.length).toLowerCase() === want && author && !out.some((a) => a.replace(/\s+/g, '') === author.replace(/\s+/g, ''))) out.push(author);
  }
  return out;
}

/**
 * The 404's sentence for an older name two species or more of the reference hold (round sixty-nine; triage-68 N1; round
 * seventy: triage-69 F1, N2, S-F1, S-F7): each holder named with the author under which it holds the name where its
 * record has one ("Echeveria farinosa Lindl., now Dudleya farinosa"), and without one where it has none; "neither" for
 * two, "none of them" for three or more ("Eugenia malaccensis … leads to neither" named three).
 */
export function sharedNameMessage(name: string, holders: ReadonlyArray<{ name: string; authors: readonly string[] }>): string {
  const count = ['two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][holders.length - 2] ?? String(holders.length);
  const each = holders.map((h) => `${h.authors.length ? h.authors.map((a) => `${name} ${a}`).join(' and ') : name}, now ${h.name}`);
  // One author under two holders or more is one name GBIF files under each (a pro parte use), not two names (round
  // seventy-one; S-F11: "Vernonia praealta (L.) Michx., now V. gigantea; Vernonia praealta (L.) Michx., now V. noveboracensis").
  const key = (a: string) => a.replace(/\s+/g, '').toLowerCase();
  const seen = new Map<string, string[]>();
  holders.forEach((h) => { for (const a of h.authors) { const k = key(a); seen.set(k, [...(seen.get(k) ?? []), h.name]); } });
  const both = [...seen.entries()].filter(([, hs]) => hs.length > 1).map(([k, hs]) => {
    const shown = holders.flatMap((h) => h.authors).find((a) => key(a) === k)!;
    return `GBIF files ${name} ${shown} under ${hs.length === 2 ? `both ${hs[0]} and ${hs[1]}` : `each of ${hs.slice(0, -1).join(', ')} and ${hs[hs.length - 1]}`}: one name, not ${hs.length === 2 ? 'two' : 'several'}`;
  });
  return [`${name} is an older name of ${count} species of the reference, so this address leads to ${holders.length === 2 ? 'neither' : 'none of them'}: ${each.join('; ')}`, ...both].join('. ');
}

/**
 * What the service worker keeps, and for how long (round eighty-two; the independent review's 8, its cache half).
 *
 * Three kinds of cache are the worker's own (`cultifolio-` and a name):
 * - this build's (`cultifolio-<version>`): the app shell, the build files, and the pages read online (species pages,
 *   the about pages, the front page, Settings);
 * - the build before it, kept only while a tab that was open when this build took over is still open: such a tab runs
 *   the old build and may still ask for its own chunks (round sixty-seven; triage-66 P2). Before, it was kept until the
 *   next deploy reached the device, so a device that came back after three weeks held that build's copy for good
 *   (the review saw one from 2026-10-04);
 * - the reference's answers (`cultifolio-corpus`), kept by corpus id across deploys and pruned to the corpus in use.
 *
 * And two caps: the species pages a device has read (a page and its data, under `/species/` or `/s/`) and the corpus
 * answers. Both grew by one entry a page read or a hash group asked for, with no bound. Past the cap the oldest go
 * first: the Cache API lists a cache's entries in the order they were written, and a page read again is written again
 * (network first), so it moves to the end.
 *
 * Pure of the worker's globals, so the unit tests run it over a fake CacheStorage.
 */

export interface CacheLike {
  keys(): Promise<ReadonlyArray<{ url: string }>>;
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: { url: string } | string): Promise<boolean>;
}
export interface CacheStorageLike {
  keys(): Promise<string[]>;
  open(name: string): Promise<CacheLike>;
  delete(name: string): Promise<boolean>;
}

export const OUR_PREFIX = 'cultifolio-';
/**
 * The species pages a device keeps: 200 entries, a page and its data being two (about a hundred pages read). A species
 * page was about 240 kB of HTML as the cache holds it (`/species/sempervivum-tectorum`, 238,280 B), so the cap is under
 * about 50 MB at the worst; since round eighty-three that page is about 140 kB (the species page's weight). A plant's own page does not need them: it reads its species from the corpus answers.
 */
export const SPECIES_KEEP = 200;
/**
 * The corpus answers a device keeps: 600. The live corpus has 256 hash groups (48,361 species, at most 320 a group),
 * so every sheet group (one request each) and every entries group (asked four to a request) is 320 entries; 600 leaves
 * room for the same groups asked in other fours. A collection that needs them all keeps them all.
 */
export const CORPUS_KEEP = 600;
/** Where the build before this one is recorded as kept, and for which tabs: in this build's own cache, under a path no page asks for. */
export const HELD_KEY = '/__cultifolio-worker/held-previous';

/** A species page or its data, as the worker keeps them (the `/species/` and `/s/` branch of the fetch handler). */
export const isSpeciesEntry = (url: string): boolean => {
  try {
    return /^\/(species|s)\//.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

/** The worker's build caches other than this one, oldest first (a version is the build's time in milliseconds). */
export function otherBuilds(keys: string[], current: string, corpus: string): string[] {
  return keys.filter((k) => k.startsWith(OUR_PREFIX) && k !== current && k !== corpus).sort();
}

interface Held { previous: string; clients: string[] }

async function readHeld(cache: CacheLike): Promise<Held | null> {
  const r = await cache.match(HELD_KEY);
  if (!r) return null;
  try {
    const v = (await r.json()) as Partial<Held>;
    return typeof v.previous === 'string' && Array.isArray(v.clients) ? { previous: v.previous, clients: v.clients.filter((c) => typeof c === 'string') } : null;
  } catch {
    return null;
  }
}

/**
 * On activation: every build cache older than the newest other one goes, and that one stays only while a tab open now
 * (`openClients`, the window clients' ids) is open; with no tab open none of the old build's pages can ask for it, and
 * it goes too. Returns the caches deleted.
 */
export async function pruneOnActivate(storage: CacheStorageLike, current: string, corpus: string, openClients: string[]): Promise<string[]> {
  const others = otherBuilds(await storage.keys(), current, corpus);
  const previous = others.at(-1);
  const drop = openClients.length ? others.slice(0, -1) : others;
  for (const k of drop) await storage.delete(k);
  const cache = await storage.open(current);
  if (previous && openClients.length) await cache.put(HELD_KEY, new Response(JSON.stringify({ previous, clients: openClients }), { headers: { 'content-type': 'application/json' } }));
  else await cache.delete(HELD_KEY);
  return drop;
}

/**
 * Later, from the fetch handler: the build before this one goes once no tab that held it at the takeover is open.
 * Returns whether a kept build is still recorded (so the worker can stop looking when none is).
 */
export async function sweepPrevious(storage: CacheStorageLike, current: string, openClients: string[]): Promise<boolean> {
  const cache = await storage.open(current);
  const held = await readHeld(cache);
  if (!held) return false;
  const open = new Set(openClients);
  if (held.clients.some((id) => open.has(id))) return true;
  await storage.delete(held.previous);
  await cache.delete(HELD_KEY);
  return false;
}

/** The oldest entries the test counts, past `max`, deleted; returns how many. */
export async function capCache(cache: CacheLike, max: number, counts: (url: string) => boolean = () => true): Promise<number> {
  const keys = (await cache.keys()).filter((k) => counts(k.url));
  const over = keys.length - max;
  if (over <= 0) return 0;
  for (const k of keys.slice(0, over)) await cache.delete(k);
  return over;
}

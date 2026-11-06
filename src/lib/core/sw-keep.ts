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

/**
 * The species pages read before an update, read again after it (round eighty-five; review-c C6). A species page and its
 * data are kept in the build's own cache, because the page's HTML names that build's scripts; an update deletes that
 * cache, so a grower who read their species before a deploy found "No connection" in the greenhouse after it. Now the new
 * worker, as it takes over, lists the species pages the builds before it held (`carryList`), and while the device is
 * online asks for each one's data again from the new server (`carryOver`), with the species page's scripts and styles of
 * the new build: a page read before the update opens offline after it, from the offline page's own path (it opens a page
 * whose data the worker holds), in the new build's format, never an old copy under new scripts.
 *
 * At most `CARRY_MAX` pages, the most recently read first: one request each, once per update and device.
 */
export const CARRY_MAX = 50;
/** Where the list waiting to be read again is kept: in this build's cache, under a path no page asks for. */
export const CARRY_KEY = '/__cultifolio-worker/carry';
/** A species page's own path, as the worker keeps it: its HTML, or its data. */
const SPECIES_PATH = /^\/species\/([a-z0-9][a-z0-9-]*)(?:\/__data\.json)?$/;

/** The species pages (`/species/<slug>`) the other builds' caches hold, the most recently written first, at most `max`. */
export async function carryList(storage: CacheStorageLike, current: string, corpus: string, max = CARRY_MAX): Promise<string[]> {
  const seen: string[] = [];
  for (const k of otherBuilds(await storage.keys(), current, corpus)) {
    for (const r of await (await storage.open(k)).keys()) {
      let u: URL;
      try { u = new URL(r.url); } catch { continue; /* not a URL: nothing of a page's */ }
      // A page's own copy has no query but the framework's own on its data: one asked with another (`?was=`) is not it.
      const q = new URLSearchParams(u.search);
      q.delete('x-sveltekit-invalidated');
      if ([...q.keys()].length) continue;
      const m = SPECIES_PATH.exec(u.pathname);
      if (!m) continue;
      const page = `/species/${m[1]}`;
      const at = seen.indexOf(page);
      if (at >= 0) seen.splice(at, 1);
      seen.push(page); // written later, read later: the end of the list is the most recent
    }
  }
  return seen.reverse().slice(0, max);
}

/** Keeps the list for `carryOver`, in this build's cache. */
export async function saveCarry(storage: CacheStorageLike, current: string, pages: string[]): Promise<void> {
  const cache = await storage.open(current);
  if (pages.length) await cache.put(CARRY_KEY, new Response(JSON.stringify(pages), { headers: { 'content-type': 'application/json' } }));
  else await cache.delete(CARRY_KEY);
}

export interface Carried { read: number; gone: number; left: number }

/**
 * A map file a species page draws from: a coastline, the world's regions in one file, or one region's shape at either
 * scale (`$lib/map/still`). Only these are fetched and kept for a page (round eighty-six; review C's C4): a list handed
 * over by a page or read from its data names nothing else.
 */
export const isMapFile = (p: unknown): p is string => typeof p === 'string' && /^\/maps\/(?:land110|land50|regions110|w\/w-[A-Z]{3}|r\/r-[A-Z]{3})\.svg$/.test(p);
/** At most this many map files for one page: the most a range of 157 regions draws is two coastlines, the world's file and the close-up's few dozen. */
export const MAP_FILES_MAX = 120;

/**
 * The map files a species page's data names (`mapFiles`, which the server adds to a move inside the app's data), read from
 * the framework's `__data.json` without its parser: each node's data is one flat list whose first item is the page's
 * object, its fields the places in the list of their values. Nothing found, or a list it cannot read, is none.
 */
export function mapFilesOfData(text: string): string[] {
  try {
    const j = JSON.parse(text) as { nodes?: unknown[] };
    for (const node of j.nodes ?? []) {
      const data = (node as { data?: unknown } | null)?.data;
      if (!Array.isArray(data)) continue;
      const root = data[0] as Record<string, unknown> | null;
      if (!root || typeof root !== 'object' || Array.isArray(root) || typeof root.mapFiles !== 'number') continue;
      const list = data[root.mapFiles];
      if (!Array.isArray(list)) continue;
      return [...new Set(list.map((i) => (typeof i === 'number' ? data[i] : null)).filter(isMapFile))].slice(0, MAP_FILES_MAX);
    }
  } catch {
    /* not the data of a page: no files */
  }
  return [];
}

/**
 * The map files given (only those `isMapFile` and `ours` accept), each fetched and kept unless already held. Returns false
 * when one did not reach the server (the caller tries again later), true otherwise; a file the server does not have is
 * passed over.
 */
export async function keepFiles(cache: CacheLike, files: readonly unknown[], fetcher: (url: string) => Promise<Response>, origin: string, ours: (path: string) => boolean = () => true): Promise<boolean> {
  for (const f of [...new Set(files)].filter(isMapFile).filter(ours).slice(0, MAP_FILES_MAX)) {
    if (await cache.match(origin + f)) continue;
    const got = await fetcher(origin + f).catch(() => null);
    if (!got || got.status >= 500) return false;
    if (got.ok) await cache.put(origin + f, got);
  }
  return true;
}

/**
 * Each page on the list read again (its `__data.json` from the network) and kept in this build's cache, with `files` (the
 * species page's build files) first, and after each page the map files its data names (`ours`: those this build serves). A page the server no longer has (404, 410) is dropped; a request that does not reach
 * the server, or a 5xx, stops the round, and what is left waits on the list for the next. The list is written back as it
 * shrinks, so a worker stopped half-way goes on where it was.
 */
export async function carryOver(storage: CacheStorageLike, current: string, fetcher: (url: string) => Promise<Response>, origin: string, files: readonly string[] = [], ours: (path: string) => boolean = () => true): Promise<Carried> {
  const cache = await storage.open(current);
  const r = await cache.match(CARRY_KEY);
  let pages: string[] = [];
  try { pages = r ? ((await r.json()) as unknown[]).filter((p): p is string => typeof p === 'string' && SPECIES_PATH.test(p)) : []; } catch { pages = []; /* an unreadable list is no list */ }
  const done: Carried = { read: 0, gone: 0, left: pages.length };
  if (!pages.length) return done;
  for (const f of files) {
    if (await cache.match(origin + f)) continue;
    const got = await fetcher(origin + f).catch(() => null);
    if (!got || !got.ok) return done; // not reached: the next round tries again
    await cache.put(origin + f, got);
  }
  while (pages.length) {
    const page = pages[0];
    const url = `${origin}${page}/__data.json`;
    const got = await fetcher(url).catch(() => null);
    if (!got || got.status >= 500) break; // not reached, or the server failing: the rest wait
    if (got.ok) {
      // With the files its two maps draw from, which the data names (round eighty-six; review C's C4): the page carried
      // over opened offline with its words and figures and two empty maps. A file not reached leaves the page on the list.
      const maps = mapFilesOfData(await got.clone().text().catch(() => ''));
      await cache.put(url, got);
      if (!(await keepFiles(cache, maps, fetcher, origin, ours))) break;
      done.read++;
    } else done.gone++; // a page the server no longer has: nothing to keep
    pages.shift();
    await saveCarry(storage, current, pages);
  }
  done.left = pages.length;
  return done;
}

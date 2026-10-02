/**
 * Where dossiers come from, in order: the R2 bucket (production and any dev
 * session with a bucket bound), then the static corpus under /s/v2/ (what
 * scripts/build-dossiers.ts writes, served as assets), then the fixture
 * corpus compiled into the build (so tests work with nothing else present).
 */
import { parseDossier, dossierPath, genusPath, GenusRecord, DOSSIER_V, type Dossier } from '$dossier/schema';
import * as v from 'valibot';

export interface IndexEntry {
  key: number;
  slug: string;
  name: string;
  family?: string;
  common?: string;
  origin?: string[];
  thumb?: string;
  photos: number;
  open: number;
  climate: string;
  /** The six species whose habitat climate is nearest (src/lib/core/near.ts), written at index time. */
  near?: number[];
  /** Older names for the species, as binomials, written at index time (round thirty-one, 3). */
  syn?: string[];
}

export type Fetch = typeof fetch;

const fixtureFiles = import.meta.glob('/fixtures/dossiers/s/v2/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const fixtureIndex = (import.meta.glob('/fixtures/dossiers/index.json', { eager: true, import: 'default' }) as Record<string, IndexEntry[]>)['/fixtures/dossiers/index.json'] ?? [];

const fixturesByKey = new Map<number, Dossier>();
for (const [path, json] of Object.entries(fixtureFiles)) {
  try {
    const d = parseDossier(json);
    fixturesByKey.set(d.key, d);
  } catch (e) {
    console.warn(`fixture ${path} does not parse as a v${DOSSIER_V} dossier and is ignored`, e);
  }
}

export type Platform = App.Platform | undefined;

/** Union by key; the first list wins a collision. Linear, not quadratic: a corpus is thousands of species. */
const merge = (a: IndexEntry[], b: IndexEntry[]) => {
  const seen = new Set(a.map((y) => y.key));
  return [...a, ...b.filter((x) => !seen.has(x.key))];
};

/**
 * The parsed index, kept per isolate: the homepage, slug resolution and the API all read it, and parsing thousands of
 * rows per request is waste. It is trusted for a minute without a question; past that, the bucket is asked for the
 * object's etag alone (a `head`, a few milliseconds), and the parsed copy is kept while the etag is the one it came
 * with. Before this the minute lapsed into a full re-read, four megabytes fetched and parsed, on the first request of
 * nearly every minute of a quiet site, which was most of a species page's time to first byte (round forty-three, 1).
 */
let cached: { at: number; idx: IndexEntry[]; bySlug: Map<string, number>; corpus: string; etag: string | null } | null = null;
const CACHE_MS = 60_000;
/** For tests: forget the parsed index. */
export const _forgetIndex = () => { cached = null; };

async function staticJson<T>(fetch: Fetch, path: string): Promise<T | null> {
  try {
    const r = await fetch(`/${path}`);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function getIndex(platform: Platform, fetch: Fetch): Promise<IndexEntry[]> {
  return (await loadIndex(platform, fetch)).idx;
}

/** The index and the corpus id it came with, from one load: a route that reads them in two calls can straddle the cache's minute and answer old entries under a new id (round seventeen, 10). */
export async function getIndexWithCorpus(platform: Platform, fetch: Fetch): Promise<{ idx: IndexEntry[]; corpus: string }> {
  const c = await loadIndex(platform, fetch);
  return { idx: c.idx, corpus: c.corpus };
}

/**
 * The corpus id: what the client puts on its reference requests (`?c=`) so a corpus refresh, which is an upload and
 * not a deploy, turns the edge, worker and browser caches over (round twelve, 7). The R2 object's etag when the index
 * comes from the bucket; a hash of the file otherwise; 'fixture' for the fixture corpus.
 */
export async function getCorpusId(platform: Platform, fetch: Fetch): Promise<string> {
  return (await loadIndex(platform, fetch)).corpus;
}

const fnv = (s: string) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

async function loadIndex(platform: Platform, fetch: Fetch): Promise<NonNullable<typeof cached>> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  let idx: IndexEntry[] = [];
  let corpus = '';
  let etag: string | null = null;
  const store = platform?.env?.STORE;
  if (store) {
    const path = `s/v${DOSSIER_V}/index.json`;
    if (cached?.etag) {
      // The minute is up: the object's etag says whether the copy held is still the bucket's. A head answers from
      // metadata alone; the four megabytes are read again only after an upload (round forty-three, 1).
      const h = await store.head(path);
      if (h?.etag === cached.etag) {
        cached.at = Date.now();
        return cached;
      }
    }
    const obj = await store.get(path);
    if (obj) {
      const text = await obj.text();
      idx = JSON.parse(text) as IndexEntry[];
      etag = obj.etag || null;
      corpus = (obj.etag || fnv(text)).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 16);
    }
  }
  const stat = await staticJson<IndexEntry[]>(fetch, `s/v${DOSSIER_V}/index.json`);
  if (stat) {
    idx = merge(idx, stat);
    corpus = corpus || fnv(JSON.stringify(stat));
  }
  // Fixtures only fill in when nothing real exists, so a real corpus never shows synthetic species.
  const out = idx.length ? idx : fixtureIndex;
  cached = { at: Date.now(), idx: out, bySlug: new Map(out.map((e) => [e.slug, e.key])), corpus: idx.length ? corpus : 'fixture', etag };
  return cached;
}

export async function getDossier(platform: Platform, fetch: Fetch, key: number): Promise<Dossier | null> {
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(dossierPath(key));
    if (obj) {
      try {
        return parseDossier(await obj.json());
      } catch (e) {
        // A stored dossier that no longer parses is not served; it is rebuilt.
        console.warn(`dossier ${key} failed schema`, e);
      }
    }
  }
  const stat = await staticJson<unknown>(fetch, dossierPath(key));
  if (stat) {
    try {
      return parseDossier(stat);
    } catch (e) {
      console.warn(`static dossier ${key} failed schema`, e);
    }
  }
  return fixturesByKey.get(key) ?? null;
}

export async function resolveSlug(platform: Platform, fetch: Fetch, slug: string): Promise<number | null> {
  const idx = await getIndex(platform, fetch);
  const hit = cached?.bySlug.get(slug);
  if (hit != null) return hit;
  // Synthetic species are reachable only while no real corpus exists.
  if (idx === fixtureIndex) for (const d of fixturesByKey.values()) if (d.slug === slug) return d.key;
  return null;
}

const fixtureGenera = import.meta.glob('/fixtures/dossiers/s/v2/g/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;

/** A genus's record (its Wikipedia lead), or null when none was ever written. R2, then the static corpus, then the fixtures. */
export async function getGenus(platform: Platform, fetch: Fetch, slug: string): Promise<GenusRecord | null> {
  const parse = (x: unknown) => {
    const r = v.safeParse(GenusRecord, x);
    return r.success ? r.output : null;
  };
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(genusPath(slug));
    if (obj) return parse(await obj.json());
  }
  const stat = await staticJson<unknown>(fetch, genusPath(slug));
  if (stat) return parse(stat);
  return parse(fixtureGenera[`/fixtures/dossiers/s/v2/g/${slug}.json`]) ?? null;
}

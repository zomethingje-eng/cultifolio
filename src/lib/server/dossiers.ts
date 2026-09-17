/**
 * Where dossiers come from, in order: the R2 bucket (production and any dev
 * session with a bucket bound), then the static corpus under /s/v1/ (what
 * scripts/build-dossiers.ts writes, served as assets), then the fixture
 * corpus compiled into the build (so tests work with nothing else present).
 */
import { parseDossier, dossierPath, DOSSIER_V, type Dossier } from '$dossier/schema';

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
}

type Fetch = typeof fetch;

const fixtureFiles = import.meta.glob('/fixtures/dossiers/s/v1/*.json', { eager: true, import: 'default' }) as Record<string, unknown>;
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

type Platform = App.Platform | undefined;

const merge = (a: IndexEntry[], b: IndexEntry[]) => [...a, ...b.filter((x) => !a.some((y) => y.key === x.key))];

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
  let idx: IndexEntry[] = [];
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(`s/v${DOSSIER_V}/index.json`);
    if (obj) idx = (await obj.json()) as IndexEntry[];
  }
  const stat = await staticJson<IndexEntry[]>(fetch, `s/v${DOSSIER_V}/index.json`);
  if (stat) idx = merge(idx, stat);
  // Fixtures only fill in when nothing real exists, so a real corpus never shows synthetic species.
  return idx.length ? idx : fixtureIndex;
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
  const hit = idx.find((e) => e.slug === slug);
  if (hit) return hit.key;
  // Synthetic species are reachable only while no real corpus exists.
  if (idx === fixtureIndex) for (const d of fixturesByKey.values()) if (d.slug === slug) return d.key;
  return null;
}

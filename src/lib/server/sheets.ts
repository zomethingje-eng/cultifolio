import { getIndex, getDossier, type Platform, type Fetch } from './dossiers';
import { bucketOf } from '$core/bucket';

export { sheetOf, type Sheet, type SheetMonth, type SheetClimate } from '$dossier/sheet';
import { sheetOf, type Sheet } from '$dossier/sheet';
import { DOSSIER_V } from '$dossier/schema';

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; sheets: Sheet[] }>();

/** Where the corpus build writes a bucket's sheets (`npm run dossier -- --index`), beside index.json. */
export const sheetsPath = (bucket: string) => `s/v${DOSSIER_V}/sheets/${bucket}.json`;

/**
 * Every sheet in a bucket. First the file the corpus build wrote for it (one object read, R2 then the static corpus),
 * else derived here from the dossiers (a few hundred reads, sixteen at a time; the fixture corpus and a corpus uploaded
 * before the files existed). Kept ten minutes in this isolate; the route puts it in the edge cache (round twelve, 8).
 */
export async function sheetsIn(platform: Platform, fetch: Fetch, bucket: string): Promise<Sheet[]> {
  const hit = cache.get(bucket);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.sheets;
  let out: Sheet[] | null = await sheetsFile(platform, fetch, bucket);
  if (!out) {
    const entries = (await getIndex(platform, fetch)).filter((e) => bucketOf(e.slug) === bucket);
    out = [];
    const width = 16;
    for (let i = 0; i < entries.length; i += width) {
      const got = await Promise.all(entries.slice(i, i + width).map(async (e) => { const d = await getDossier(platform, fetch, e.key); return d ? sheetOf(d, e.thumb) : null; }));
      for (const s of got) if (s) out.push(s);
    }
  }
  cache.set(bucket, { at: Date.now(), sheets: out });
  return out;
}

async function sheetsFile(platform: Platform, fetch: Fetch, bucket: string): Promise<Sheet[] | null> {
  const store = platform?.env?.STORE;
  if (store) {
    const obj = await store.get(sheetsPath(bucket));
    if (obj) return (await obj.json()) as Sheet[];
  }
  try {
    const r = await fetch(`/${sheetsPath(bucket)}`);
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return (await r.json()) as Sheet[];
  } catch {
    /* no static file: derived below */
  }
  return null;
}

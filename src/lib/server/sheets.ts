import { getDossier, product, type Loaded, type Platform, type Fetch } from './dossiers';
import { bucketOf } from '$core/bucket';

export { sheetOf, type Sheet, type SheetMonth, type SheetClimate } from '$dossier/sheet';
import { sheetOf, type Sheet } from '$dossier/sheet';

const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { at: number; sheets: Sheet[] }>();

/**
 * Every sheet in a bucket. The build's file named by the manifest (one object read), else derived here from the
 * dossiers (a few hundred reads, sixteen at a time; the fixture corpus, which has no manifest). Kept ten minutes in
 * this isolate; the route puts it in the Worker's cache, the Cache API (round twelve, 8).
 */
export async function sheetsIn(c: Loaded, platform: Platform, fetch: Fetch, bucket: string): Promise<Sheet[]> {
  const corpus = c.corpus;
  const ck = `${corpus}:${bucket}`; // keyed by corpus as well as bucket, so an isolate that outlives a refresh does not serve the old one (round thirteen, 4)
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.sheets;
  // The bucket file and the index it is derived from are the corpus the request holds, never whichever is current at the read (round fifty-eight).
  let out: Sheet[] | null = await product<Sheet[]>(c, platform, fetch, `sheets/${bucket}.json`);
  if (!out) {
    const entries = c.idx.filter((e) => bucketOf(e.slug, c.buckets) === bucket);
    out = [];
    const width = 16;
    for (let i = 0; i < entries.length; i += width) {
      const got = await Promise.all(entries.slice(i, i + width).map(async (e) => { const d = await getDossier(platform, fetch, e.key); return d ? { ...sheetOf(d, e.thumb), slug: e.slug } : null; })); // under the index slug, as the build's bucket files are (round seventeen, 6)
      for (const s of got) if (s) out.push(s);
    }
  }
  // An older corpus's buckets stayed in the map for the isolate's life (round fifty-one, 6): a refresh drops them.
  for (const k of cache.keys()) if (!k.startsWith(`${corpus}:`)) cache.delete(k);
  cache.set(ck, { at: Date.now(), sheets: out });
  return out;
}


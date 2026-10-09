import { getDossier, product, type Loaded, type Platform, type Fetch } from './dossiers';
import { bucketOf } from '$core/bucket';

export { sheetOf, type Sheet, type SheetMonth, type SheetClimate } from '$dossier/sheet';
import { sheetOf, type Sheet } from '$dossier/sheet';

const CACHE_MS = 10 * 60_000;

/**
 * A bucket one of whose species' dossiers could not be read: the route answers 503, and nothing is cached. `retryAfter`
 * (seconds): how long this isolate keeps the refusal before deriving the bucket again.
 */
export class SheetsUnreadable extends Error {
  constructor(bucket: string, readonly retryAfter = REFUSED_S) { super(`the sheets of bucket ${bucket} could not all be read`); this.name = 'SheetsUnreadable'; }
}
const cache = new Map<string, { at: number; sheets: Sheet[] }>();
/**
 * A refused bucket is kept refused in this isolate for half a minute (round sixty-two, second pass; the server review,
 * 6): every device's retry derived it again, up to a few hundred dossier reads each, before reaching the unreadable one.
 */
const REFUSED_S = 30;
const refused = new Map<string, number>();
/** For tests: forget the buckets this isolate refused. */
export const _forgetRefusedSheets = () => refused.clear();

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
  const until = refused.get(ck);
  if (until != null && Date.now() < until) throw new SheetsUnreadable(bucket, Math.max(1, Math.ceil((until - Date.now()) / 1000)));
  refused.delete(ck);
  // The bucket file and the index it is derived from are the corpus the request holds, never whichever is current at the read (round fifty-eight).
  let out: Sheet[] | null = await product<Sheet[]>(c, platform, fetch, `sheets/${bucket}.json`, REFUSED_S * 1000);
  // Under a manifest the build wrote every bucket's file (a manifest without them is refused), so one that cannot be read
  // is the store's fault, said as a refusal and asked again shortly. Deriving it read the dossiers as the store holds them
  // now, which after an upload is another corpus than the request's, at a few hundred reads (round sixty-three; S5, left
  // in round fifty-nine). Only a corpus with no manifest (the fixture corpus) derives its buckets.
  // Kept refused for the half minute its Retry-After says, a read that threw as well as a miss, and the file's miss is
  // kept no longer than that (`product`'s `missMs`), so a device that waits as told is answered from a fresh read (round
  // sixty-three; the server review of the round, R3 3: the miss was kept a minute and a throw not at all).
  if (!out && c.manifest) {
    for (const k of refused.keys()) if (!k.startsWith(`${corpus}:`)) refused.delete(k);
    refused.set(ck, Date.now() + REFUSED_S * 1000);
    throw new SheetsUnreadable(bucket);
  }
  if (!out) {
    const entries = c.idx.filter((e) => bucketOf(e.slug, c.buckets) === bucket);
    out = [];
    const width = 16;
    for (let i = 0; i < entries.length; i += width) {
      const got = await Promise.all(entries.slice(i, i + width).map(async (e) => { const d = await getDossier(platform, fetch, e.key); return d ? { ...sheetOf(d, e.thumb, e.credit), slug: e.slug } : null; })); // under the index slug, as the build's bucket files are (round seventeen, 6)
      // A species the index lists whose dossier cannot be read is a failure of the bucket, never an absence: left out,
      // a device read it as "not in the reference" (round sixty-two; the corpus review of round sixty, 13, open until now).
      if (got.some((s) => !s)) {
        // Named in the log, so the operator can see which dossier keeps the bucket refused: one that fails its schema, or
        // that the index lists and the store lacks, refuses its bucket until it is put right (the server review, 6).
        const keys = entries.slice(i, i + width).filter((_, j) => !got[j]).map((e) => `${e.key} (${e.slug})`);
        console.error(`sheets: bucket ${bucket} of corpus ${corpus} refused; these dossiers could not be read: ${keys.join(', ')}`);
        for (const k of refused.keys()) if (!k.startsWith(`${corpus}:`)) refused.delete(k);
        refused.set(ck, Date.now() + REFUSED_S * 1000);
        throw new SheetsUnreadable(bucket);
      }
      for (const s of got) if (s) out.push(s);
    }
  }
  // An older corpus's buckets stayed in the map for the isolate's life (round fifty-one, 6): a refresh drops them.
  for (const k of cache.keys()) if (!k.startsWith(`${corpus}:`)) cache.delete(k);
  cache.set(ck, { at: Date.now(), sheets: out });
  return out;
}


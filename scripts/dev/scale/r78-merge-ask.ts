/**
 * Round seventy-eight (I): what the Worker answers for each merged page once the merge is done (`r78-merge-proof.mjs` makes
 * the corpus), asked of its own functions over the corpus folder: the page kept, by its id and by its GBIF key; the old
 * address (the species route's redirect, as an older name); the old name as an older name and in the search; the old
 * slug's entry for a grower's plant (the entries bucket); the merged page's GBIF key, which is no page's own. One line a
 * merge, so round seventy-three's two and the seven of round seventy-eight are read side by side.
 *
 *   SCALE_TMP=<scratch> node scripts/dev/scale/run-ts.mjs scripts/dev/scale/r78-merge-ask.ts <s/v3 dir> <merges file>...
 */
import { readFileSync, existsSync } from 'node:fs';
import { corpusNow, _forgetIndex } from '$lib/server/dossiers';
import { lookupOf, addressOf } from '$lib/server/lookup';
import { productPath } from '$dossier/manifest';
import { parseMerges } from '$dossier/extra-keys';
import { bucketOf } from '$core/bucket';
import { slugify } from '$core/names';
import { resetRateLimits } from '$lib/server/sync';
import { GET as dossierGet } from '../../../src/routes/api/dossier/[key]/+server';
import { GET as searchGet } from '../../../src/routes/api/search/+server';

const [dir, ...files] = process.argv.slice(2);
const noStatic = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) as { v: number; files: Record<string, string> };
const v = `s/v${manifest.v}/`;
const at = (k: string) => `${dir}/${k.slice(v.length)}`;
const has = (k: string) => k.startsWith(v) && existsSync(at(k));
const store = {
  get: async (k: string) => { if (!has(k)) return null; const t = readFileSync(at(k), 'utf8'); return { text: async () => t, json: async () => JSON.parse(t), etag: `"${k}"`, body: t }; },
  head: async (k: string) => (has(k) ? { etag: `"${k}"` } : null)
};
const kv = () => { const m = new Map<string, string>(); return { get: async (k: string) => m.get(k) ?? null, put: async (k: string, x: string) => void m.set(k, x) }; };
const platform = { env: { STORE: store, QUEUE: kv() }, context: { waitUntil: (p: Promise<unknown>) => void p } } as unknown as App.Platform;
_forgetIndex();
const c = await corpusNow(platform, noStatic);
const look = lookupOf(c, platform, noStatic);
const api = async (key: string) => {
  resetRateLimits();
  const url = new URL(`https://cultifolio.com/api/dossier/${key}`);
  try {
    const r = await dossierGet({ params: { key }, platform, fetch: noStatic, url, request: new Request(url), getClientAddress: () => '192.0.2.78', setHeaders: () => {} } as never);
    return r.status === 302 ? `302 ${r.headers.get('location')}` : String(r.status);
  } catch (e) { return String((e as { status?: number }).status ?? 500); }
};
const search = async (q: string) => {
  resetRateLimits();
  const url = new URL(`https://cultifolio.com/api/search?q=${encodeURIComponent(q)}&c=${c.corpus}`);
  const r = await searchGet({ url, platform, fetch: noStatic, getClientAddress: () => '192.0.2.78' } as never);
  return ((await r.json()) as Array<{ slug: string }>).map((h) => h.slug).slice(0, 3);
};
const buckets = c.buckets;
const entriesOf = (slug: string) => {
  const name = `entries/${bucketOf(slug, buckets)}.json`;
  const h = manifest.files[name];
  return h ? (JSON.parse(readFileSync(at(productPath(h)), 'utf8')) as Array<{ slug: string; key: string; gbif: number; name: string }>) : [];
};
const rows: string[] = [];
let bad = 0;
for (const f of files) {
  for (const m of parseMerges(readFileSync(f, 'utf8'))) {
    const old = slugify(m.name);
    const kept = await look.gbif(m.into);
    const was = await look.gbif(m.from);
    const addr = await addressOf(look, old);
    const older = await look.older(m.name.toLowerCase());
    const entry = entriesOf(old).find((e) => e.slug === old);
    const answers = {
      kept: kept ? `${kept.key} ${kept.slug}` : null,
      keptById: kept ? await api(kept.key) : null,
      keptByGbif: await api(String(m.into)),
      oldSlugIsPage: await look.slug(old),
      oldAddress: addr.kind === 'older' ? `older → ${addr.slug} (${addr.key})` : addr.kind,
      oldName: older && 'one' in older ? `older of ${older.one[0]} ${older.one[1]}` : older ? 'shared' : null,
      search: (await search(m.name)).join(','),
      plantEntry: entry ? `${entry.slug} → ${entry.key} ${entry.name} (GBIF ${entry.gbif})` : null,
      oldGbif: was ? `${was.key}` : null,
      oldGbifApi: await api(String(m.from))
    };
    const ok = !!kept && kept.key.startsWith('k') && answers.keptById === '200' && answers.keptByGbif === `302 /api/dossier/${kept.key}` && answers.oldSlugIsPage === null
      && answers.oldAddress === `older → ${kept.slug} (${kept.key})` && answers.oldName === `older of ${kept.key} ${kept.slug}` && answers.search.split(',')[0] === kept.slug
      && answers.plantEntry === `${old} → ${kept.key} ${kept.name} (GBIF ${m.into})` && answers.oldGbif === null && answers.oldGbifApi === '404';
    if (!ok) bad++;
    rows.push(`${ok ? 'as round 73' : 'DIFFERENT'}\t${m.name} [${m.from}] into ${m.into}\t${JSON.stringify(answers)}`);
  }
}
console.log(rows.join('\n'));
console.log(`${rows.length} merges asked, ${rows.length - bad} answering as round seventy-three's do, ${bad} otherwise; corpus ${c.corpus}`);
process.exit(bad ? 1 : 0);

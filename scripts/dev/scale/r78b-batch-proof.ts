/**
 * Round seventy-eight, agent B: the batched sources against the per-species ones, live, on real species.
 *
 * Each species is built twice with the real builder (`buildDossier`), a minute or so apart: once asking Wikidata and
 * Wikipedia species by species, as the build did, and once through `batchSources` (`src/lib/dossier/batch.ts`), its
 * batches asked first for the whole sample. GBIF's answers (the name, synonyms, common names, range, Kew's rows) are
 * asked once and shared by both builds, since they are not under test; the occurrence searches, iNaturalist, Commons and
 * GBIF's media are not asked (each build marks them not asked alike). Every request is counted by host and timed, and
 * paced politely for a shared machine: Wikimedia's hosts together one request every 2.5 s, any other host one a second,
 * a 429's Retry-After honoured.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/r78b-batch-proof.ts <index.json> <dossier dir> <n> <out dir> [--record <names> [--only]]
 *
 * Writes <out>/proof.json (per species: equal or the differing fields with both values; the counts and times) and, with
 * --record, the recorded answers of the named species for the unit test (tests/unit/r78b-batch-recorded.json).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { buildDossier } from '../../../src/lib/dossier/build';
import { makeFetcher, type JsonFetcher, type FetchResult } from '../../../src/lib/dossier/fetch';
import { batchSources } from '../../../src/lib/dossier/batch';

const [indexPath, dossierDir, nArg, outDir] = process.argv.slice(2);
const recordNames = (() => { const i = process.argv.indexOf('--record'); return i >= 0 ? process.argv[i + 1].split(',') : []; })();
mkdirSync(outDir, { recursive: true });

const WIKIMEDIA = /(^|\.)(wikipedia|wikidata|wikimedia)\.org$/;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let chain: Promise<unknown> = Promise.resolve();
const last = new Map<string, number>();
type Count = { n: number; ms: number };
const counts: Record<string, Record<string, Count>> = { perSpecies: {}, batched: {}, shared: {} };
let phase: keyof typeof counts = 'shared';

/** One request at a time, each host paced, Wikimedia's as one; every request counted under the phase that made it. */
const paced = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const host = new URL(u).hostname;
  const key = WIKIMEDIA.test(host) ? 'wikimedia' : host;
  const gap = key === 'wikimedia' ? 2500 : 1000;
  const mine = chain.then(async () => {
    const wait = (last.get(key) ?? 0) + gap - Date.now();
    if (wait > 0) await sleep(wait);
    last.set(key, Date.now());
  });
  chain = mine.catch(() => {});
  await mine;
  const t = Date.now();
  const res = await fetch(input, init);
  const c = ((counts[phase][host] ??= { n: 0, ms: 0 }));
  c.n++;
  c.ms += Date.now() - t;
  if (res.status === 429) last.set(key, Date.now() + 1000 * Number(res.headers.get('retry-after') ?? 30));
  return res;
}) as typeof fetch;

const net = makeFetcher(paced);
/** GBIF's answers, asked once and shared: not under test. */
const shared = new Map<string, Promise<FetchResult<unknown>>>();
const recorded: Record<string, Record<string, unknown>> = {};
let recording: string | null = null;
function fetcherFor(which: 'perSpecies' | 'batched'): JsonFetcher {
  return (async <T>(url: string, o?: Parameters<JsonFetcher>[1]) => {
    const host = new URL(url).hostname;
    if (/\/occurrence\/search\?/.test(url)) return { status: 'skipped', detail: 'not asked: the proof compares Wikidata and Wikipedia' } as FetchResult<T>;
    let r: FetchResult<T>;
    if (WIKIMEDIA.test(host)) {
      const before = phase;
      phase = which;
      r = await net<T>(url, o);
      phase = before;
    } else {
      if (!shared.has(url)) { const before = phase; phase = 'shared'; shared.set(url, net(url, o)); await shared.get(url); phase = before; }
      r = (await shared.get(url)) as FetchResult<T>;
    }
    if (recording) (recorded[`${which}:${recording}`] ??= {})[url] = r.status === 'ok' ? r.data : { __status: r.status, ...('detail' in r ? { detail: r.detail } : {}) };
    return r;
  }) as JsonFetcher;
}

type Entry = { key: number; name: string };
// An index of version 3 (round seventy-eight) names each page by its id, its file's name, and carries its GBIF key as
// `gbif`; one of version 2 by its GBIF key. Either way the proof builds by GBIF key and reads the page's file by its name.
const fileOf = new Map<number, string>();
const index = (JSON.parse(readFileSync(indexPath, 'utf8')) as Array<{ key: number | string; gbif?: number; name: string }>).map((e): Entry => {
  const key = typeof e.key === 'number' ? e.key : e.gbif!;
  fileOf.set(key, String(e.key));
  return { key, name: e.name };
});
// A fixed sample: the named ones, then a seeded shuffle of the rest.
let seed = 78;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const named = ['Aloe vera', 'Welwitschia mirabilis', 'Kroenleinia grusonii', 'Crassula ovata', 'Haworthia decipiens', ...recordNames];
// `--only`: the recorded species alone, a chunk of their own (what the unit test replays).
const pick = process.argv.includes('--only') ? index.filter((e) => recordNames.includes(e.name)) : [...index.filter((e) => named.includes(e.name)), ...index.filter((e) => !named.includes(e.name)).map((e) => [rand(), e] as const).sort((a, b) => a[0] - b[0]).map(([, e]) => e)].slice(0, Number(nArg));

const strip = (d: unknown): unknown => JSON.parse(JSON.stringify(d, (k, v) => (k === 'at' || k === 'built' || k === 'changed' ? undefined : v)));
const opts = (fetcher: JsonFetcher) => ({ fetcher, builtBy: 'node' as const, skip: ['inat', 'commons', 'gbif.media', 'openalex'] as const });
const prevOf = (key: number) => { const p = `${dossierDir}/${fileOf.get(key) ?? key}.json`; return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

async function main() {
  // The GBIF answers first, so both builds read the same ones and the clocks below time Wikimedia alone.
  const out: Array<Record<string, unknown>> = [];
  const t = { perSpecies: 0, batched: 0, prefetch: 0 };
  const per: Record<number, unknown> = {};
  for (const e of pick) {
    recording = recordNames.includes(e.name) ? e.name : null;
    const t0 = Date.now();
    const r = await buildDossier(e.key, { ...opts(fetcherFor('perSpecies')), skip: [...opts(fetcherFor('perSpecies')).skip] });
    t.perSpecies += Date.now() - t0;
    per[e.key] = r.ok ? strip(r.dossier) : r;
    process.stdout.write(`per-species ${e.name}: ${r.ok ? 'ok' : r.reason}\n`);
  }
  recording = null;
  const b = batchSources(fetcherFor('batched'));
  const p0 = Date.now();
  phase = 'batched';
  // The batches' own requests are recorded under each recorded species too, so the unit test replays them.
  recording = recordNames.length ? '__batches' : null;
  await b.prefetch(pick.map((e) => ({ key: e.key, name: prevOf(e.key)?.name?.scientific ?? e.name })));
  recording = null;
  t.prefetch = Date.now() - p0;
  for (const e of pick) {
    recording = recordNames.includes(e.name) ? e.name : null;
    const t0 = Date.now();
    const r = await buildDossier(e.key, { ...opts(b.fetcher), skip: [...opts(b.fetcher).skip] });
    t.batched += Date.now() - t0;
    const got = r.ok ? strip(r.dossier) : r;
    const want = per[e.key];
    const diff: Record<string, { perSpecies: unknown; batched: unknown }> = {};
    const a = want as Record<string, unknown>, c = got as Record<string, unknown>;
    for (const k of new Set([...Object.keys(a ?? {}), ...Object.keys(c ?? {})])) {
      if (k === 'upstream') {
        for (const u of new Set([...Object.keys((a.upstream ?? {}) as object), ...Object.keys((c.upstream ?? {}) as object)])) {
          const x = (a.upstream as Record<string, unknown>)?.[u], y = (c.upstream as Record<string, unknown>)?.[u];
          if (JSON.stringify(x) !== JSON.stringify(y)) diff[`upstream.${u}`] = { perSpecies: x, batched: y };
        }
      } else if (JSON.stringify(a?.[k]) !== JSON.stringify(c?.[k])) diff[k] = { perSpecies: a?.[k], batched: c?.[k] };
    }
    out.push({ key: e.key, name: e.name, equal: !Object.keys(diff).length, ...(Object.keys(diff).length ? { diff } : {}) });
    process.stdout.write(`batched ${e.name}: ${Object.keys(diff).length ? `differs in ${Object.keys(diff).join(', ')}` : 'equal'}\n`);
  }
  recording = null;
  const result = { at: new Date().toISOString(), species: pick.length, equal: out.filter((x) => x.equal).length, times: t, counts, stats: b.stats, out };
  writeFileSync(`${outDir}/proof.json`, JSON.stringify(result, null, 1));
  if (recordNames.length) writeFileSync(`${outDir}/recorded.json`, JSON.stringify({ recorded: result.at, species: pick.map((e) => ({ key: e.key, name: e.name })), answers: recorded }));
  console.log(JSON.stringify({ species: result.species, equal: result.equal, times: t, counts, stats: b.stats }, null, 1));
}
main().catch((e) => { console.error(e); process.exit(1); });

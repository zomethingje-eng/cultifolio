/**
 * Round seventy-nine, agent P: iNaturalist's wild photographs from its open data against the API's, live, on real species.
 *
 * For each species of the sample (`<gbif key> <name> <iNaturalist taxon> …`, tab-separated), iNaturalist's API is asked
 * the builder's wild request (`wildUrl`, 24 observations), and, where it counts more than 24 and at most 200, the same
 * request for 200, so the whole qualifying set is known. The open data's answer is the reader's file
 * (`scripts/inat-open-load.ts … --taxa <the sample's taxa> --keep 200`). Then:
 *   - the qualifying set: the API's count and the open data's, and, up to 200, the observations each holds and the other
 *     does not, each read again from the API (`observations?uuid=`, 100 a request) to say why: created or changed since
 *     the export, its grade, taxon or licence changed, or gone;
 *   - the builder's photographs (`inat.photos`, the real code) from the API's answer and from the open data's
 *     (`heldWild`), field by field, where the API counts 24 or fewer (the same observations by either rule), and for the
 *     rest the photographs both chose, field by field, and how many of the API's 24 the open data's rule chose;
 *   - every photograph both hold: licence, author, address and size.
 * The API is asked at most once every 2.1 s, with the project's User-Agent; a 429 or 503 waits and asks again.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/r79p-inat-open-proof.ts <sample.tsv> <reader's file> <out dir> [--ask-only]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import * as inat from '../../../src/lib/dossier/sources/inat';
import { openWildStore, heldWild } from '../../../src/lib/dossier/inat-open';
import { USER_AGENT, type JsonFetcher, type FetchResult } from '../../../src/lib/dossier/fetch';
import type { Photo } from '../../../src/lib/dossier/schema';

const [samplePath, storePath, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
let requests = 0;
const answersPath = `${outDir}/api-answers.json`;
/** The API's answers, kept so the comparison can be run again without asking (`--again`). */
const kept: Record<string, unknown> = existsSync(answersPath) ? JSON.parse(readFileSync(answersPath, 'utf8')) : {};
async function ask(url: string): Promise<any> {
  if (kept[url] !== undefined) return kept[url];
  for (let attempt = 0; ; attempt++) {
    const wait = last + 2100 - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    requests++;
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
    if ((r.status === 429 || r.status === 503) && attempt < 4) { await sleep(30_000 * (attempt + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} for ${url}`);
    const j = await r.json();
    kept[url] = trimAnswer(j);
    writeFileSync(answersPath, JSON.stringify(kept));
    return kept[url];
  }
}
/** An API answer cut to the fields the builder and this proof read. */
function trimAnswer(j: any): any {
  return {
    total_results: j.total_results,
    results: (j.results ?? []).map((o: any) => ({
      id: o.id, uuid: o.uuid, observed_on: o.observed_on, place_guess: o.place_guess, captive: o.captive, quality_grade: o.quality_grade,
      created_at: o.created_at, updated_at: o.updated_at, cached_votes_total: o.cached_votes_total, faves_count: o.faves_count,
      taxon: o.taxon ? { id: o.taxon.id, name: o.taxon.name, rank: o.taxon.rank, ancestor_ids: o.taxon.ancestor_ids } : undefined,
      user: o.user ? { id: o.user.id, login: o.user.login, name: o.user.name } : undefined,
      photos: (o.photos ?? []).map((p: any) => ({ id: p.id, license_code: p.license_code, url: p.url, attribution: p.attribution, original_dimensions: p.original_dimensions }))
    }))
  };
}
const asJson = (data: unknown): JsonFetcher => (async <T>() => ({ status: 'ok', data: data as T }) as FetchResult<T>) as JsonFetcher;
const never: JsonFetcher = (async <T>(url: string) => ({ status: 'refused', detail: `not held: ${url}` }) as FetchResult<T>) as JsonFetcher;

const sample = readFileSync(samplePath, 'utf8').trim().split('\n').map((l) => { const [gbif, name, taxon] = l.split('\t'); return { gbif: Number(gbif), name, taxon: Number(taxon) }; });
// `--ask-only`: the API's answers asked and kept, before the reader's file is there (the comparison runs later, asking
// only for the observations one side holds and the other does not).
if (process.argv.includes('--ask-only')) {
  for (const s of sample) {
    const a24 = await ask(inat.wildUrl(s.taxon, 24));
    if (a24.total_results > 24 && a24.total_results <= 200) await ask(inat.wildUrl(s.taxon, 200));
    process.stdout.write(`\r  ${s.name}: ${a24.total_results} (${requests} requests)          `);
  }
  console.log(`\n${requests} requests; answers kept in ${answersPath}`);
  process.exit(0);
}
const store = openWildStore(storePath);
type Row = Record<string, unknown>;
const rows: Row[] = [];
const order = { observations: 0, samePhotos: 0, apiIsPosition: 0, apiIsIdAscending: 0, apiIsNeither: 0, multi: 0 };
const tally = { species: 0, apiTotalSame: 0, setsCompared: 0, setsSame: 0, builderCompared: 0, builderSame: 0, photosBoth: 0, photoFieldsDiffer: 0, largeSpecies: 0, apiChosenAlsoChosen: 0, apiChosenWithVotes: 0, apiChosen: 0 };
const fieldDiffs: Record<string, number> = {};

for (const s of sample) {
  tally.species++;
  const a24 = await ask(inat.wildUrl(s.taxon, 24));
  const held = store.get(s.taxon);
  const row: Row = { name: s.name, gbif: s.gbif, taxon: s.taxon, apiTotal: a24.total_results, openTotal: held?.n ?? null };
  if (held && held.n === a24.total_results) tally.apiTotalSame++;
  // The whole qualifying set, where it is at most 200.
  const full = a24.total_results <= 24 ? a24 : a24.total_results <= 200 ? await ask(inat.wildUrl(s.taxon, 200)) : null;
  if (full && held && held.n <= 200) {
    tally.setsCompared++;
    const api = new Map<string, any>(full.results.map((o: any) => [o.uuid, o]));
    const open = new Map(held.results.map((o) => [o.uuid, o]));
    const onlyApi = [...api.keys()].filter((u) => !open.has(u));
    const onlyOpen = [...open.keys()].filter((u) => !api.has(u));
    if (!onlyApi.length && !onlyOpen.length) tally.setsSame++;
    const why: string[] = [];
    for (const u of onlyApi) { const o = api.get(u); why.push(`API only ${u}: created ${o.created_at?.slice(0, 10)}, updated ${o.updated_at?.slice(0, 10)}`); }
    // Each observation the open data holds and the API's set does not, read again by its uuid.
    for (let i = 0; i < onlyOpen.length; i += 100) {
      const part = onlyOpen.slice(i, i + 100);
      const now = await ask(`${inat.INAT}/observations?uuid=${part.join(',')}&per_page=100`);
      const byU = new Map<string, any>(now.results.map((o: any) => [o.uuid, o]));
      for (const u of part) {
        const o = byU.get(u);
        if (!o) { why.push(`open only ${u}: not answered by the API now (deleted, or hidden)`); continue; }
        const lic = (o.photos ?? []).map((p: any) => p.license_code ?? 'none').join(',');
        why.push(`open only ${u}: now ${o.quality_grade}, captive ${o.captive}, taxon ${o.taxon?.id} ${o.taxon?.name}, photo licences ${lic}, updated ${o.updated_at?.slice(0, 10)}`);
      }
    }
    // The photographs' order within an observation: the API's, the open data's `position`, and their ids.
    for (const [u, o] of api) {
      const h = open.get(u);
      if (!h) continue;
      order.observations++;
      const ao = (o.photos as Array<{ id: number; license_code: string }>).filter((p) => ['cc0', 'cc-by', 'cc-by-sa'].includes(p.license_code)).map((p) => p.id);
      const ho = h.photos.map((p) => p.id);
      if (ao.length !== ho.length || [...ao].sort().join() !== [...ho].sort().join()) continue;
      order.samePhotos++;
      if (ao.length < 2) continue;
      order.multi++;
      const asc = [...ao].sort((x, y) => x - y);
      if (ao.join() === ho.join()) order.apiIsPosition++;
      if (ao.join() === asc.join()) order.apiIsIdAscending++;
      if (ao.join() !== ho.join() && ao.join() !== asc.join()) { order.apiIsNeither++; const list = (row.orderNeither as string[] | undefined) ?? []; list.push(`${u}: API ${ao.join(',')}, open ${ho.join(',')}`); row.orderNeither = list; }
    }
    row.onlyApi = onlyApi.length;
    row.onlyOpen = onlyOpen.length;
    if (why.length) row.why = why;
  }
  // The builder's photographs, by the real code, from each answer.
  const owner = {};
  const fromApi = await inat.photos(asJson(a24), s.taxon, true, 24, owner);
  const said = { held: 0 };
  const fromOpen = await inat.photos(heldWild(never, store, said), s.taxon, true, 24, owner);
  const pa: Photo[] = fromApi.status === 'ok' ? fromApi.data : [];
  const po: Photo[] = fromOpen.status === 'ok' ? fromOpen.data : [];
  row.builder = { api: `${fromApi.status} ${pa.length}`, open: `${fromOpen.status} ${po.length}`, openDetail: (fromOpen as { detail?: string }).detail ?? null };
  const idOfUuid = new Map<string, number>(a24.results.map((o: any) => [o.uuid, o.id]));
  const byId = new Map(po.map((p) => [p.id, p]));
  const diffs: string[] = [];
  for (const p of pa) {
    const q = byId.get(p.id);
    if (!q) continue;
    tally.photosBoth++;
    let differs = false;
    for (const k of ['url', 'thumb', 'width', 'height', 'licence', 'attribution', 'captive', 'observedOn', 'src'] as const) {
      if (JSON.stringify(p[k]) !== JSON.stringify(q[k])) { differs = true; fieldDiffs[k] = (fieldDiffs[k] ?? 0) + 1; diffs.push(`${p.id} ${k}: API ${JSON.stringify(p[k])}, open ${JSON.stringify(q[k])}`); }
    }
    // The page: the API's by the observation's number, the open data's by its uuid, the same observation.
    const u = /observations\/(.+)$/.exec(q.page ?? '')?.[1] ?? '';
    if (`https://www.inaturalist.org/observations/${idOfUuid.get(u)}` !== p.page) { differs = true; fieldDiffs.page = (fieldDiffs.page ?? 0) + 1; diffs.push(`${p.id} page: API ${p.page}, open ${q.page}`); }
    if (p.place && !q.place) fieldDiffs.placeOnlyApi = (fieldDiffs.placeOnlyApi ?? 0) + 1;
    if (differs) tally.photoFieldsDiffer++;
  }
  if (diffs.length) row.photoDiffs = diffs.slice(0, 20);
  if (a24.total_results <= 24) {
    tally.builderCompared++;
    const same = pa.length === po.length && pa.every((p) => byId.has(p.id));
    if (same) tally.builderSame++;
    row.builderSame = same;
    if (!same) row.builderOnly = { api: pa.filter((p) => !byId.has(p.id)).map((p) => p.id), open: po.filter((p) => !pa.some((x) => x.id === p.id)).map((p) => p.id) };
  } else {
    tally.largeSpecies++;
    const chosen = new Set(held?.results.slice(0, 24).map((o) => o.uuid) ?? []);
    const apiChosen = a24.results.map((o: any) => o.uuid);
    const both = apiChosen.filter((u: string) => chosen.has(u)).length;
    const voted = a24.results.filter((o: any) => (o.cached_votes_total ?? 0) > 0).length;
    tally.apiChosen += apiChosen.length;
    tally.apiChosenAlsoChosen += both;
    tally.apiChosenWithVotes += voted;
    row.choice = { apiChose: apiChosen.length, openChoseTheSame: both, apiChoicesWithVotes: voted, photographsBoth: pa.filter((p) => byId.has(p.id)).length, photographsApi: pa.length, photographsOpen: po.length };
  }
  rows.push(row);
  process.stdout.write(`\r  ${tally.species} of ${sample.length} (${requests} requests)   `);
}
const result = { asked: new Date().toISOString(), export: store.header.day, requests, tally, fieldDiffs, order, rows };
writeFileSync(`${outDir}/proof.json`, JSON.stringify(result, null, 1));
console.log(`\n${JSON.stringify({ requests, tally, fieldDiffs, order }, null, 1)}`);

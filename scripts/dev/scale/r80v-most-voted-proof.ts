/**
 * Round eighty, agent V: the fill's most-voted wild sets against iNaturalist's API alone, live, on real species.
 *
 * Given a folder of dossiers the real fill has just filled (`npm run dossier -- --fill inat --inat-open <file>`, which asks
 * iNaturalist's API for the 24 most-voted wild observations of each taxon the open data holds more than 24 of), and the
 * open-data file it read, this asks the API the builder's wild request (`wildUrl`, 24 observations) for every such taxon
 * again, runs the builder's real `inat.photos` on the answer, and compares field by field with the photographs the fill
 * wrote. It also compares the API's choice with agent P's answers of a day before (`r79p/api-answers.json`), to say how
 * stable the API's order is, and with the open data's 24 newest the page had before the fill (`--before <dir>`).
 * One request every 2.1 s, with the project's User-Agent; a 429 or 503 waits and asks again.
 *
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/dev/scale/r80v-most-voted-proof.ts <dossiers dir> <open-data file> <out dir> --before <dir>
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import * as inat from '../../../src/lib/dossier/sources/inat';
import { openWildStore, MOST_VOTED_RULE, OPEN_WILD_RULE } from '../../../src/lib/dossier/inat-open';
import { USER_AGENT, type JsonFetcher, type FetchResult } from '../../../src/lib/dossier/fetch';
import type { Photo } from '../../../src/lib/dossier/schema';

const [dir, storePath, outDir] = process.argv.slice(2);
const beforeDir = process.argv.includes('--before') ? process.argv[process.argv.indexOf('--before') + 1] : undefined;
mkdirSync(outDir, { recursive: true });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
let requests = 0;
const answersPath = `${outDir}/api-answers.json`;
const kept: Record<string, any> = existsSync(answersPath) ? JSON.parse(readFileSync(answersPath, 'utf8')) : {};
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
    const j = (await r.json()) as any;
    kept[url] = {
      asked: new Date().toISOString(),
      total_results: j.total_results,
      results: (j.results ?? []).map((o: any) => ({
        id: o.id, uuid: o.uuid, observed_on: o.observed_on, place_guess: o.place_guess, captive: o.captive, quality_grade: o.quality_grade,
        cached_votes_total: o.cached_votes_total, faves_count: o.faves_count,
        taxon: o.taxon ? { id: o.taxon.id, name: o.taxon.name, rank: o.taxon.rank, ancestor_ids: o.taxon.ancestor_ids } : undefined,
        user: o.user ? { id: o.user.id, login: o.user.login, name: o.user.name } : undefined,
        photos: (o.photos ?? []).map((p: any) => ({ id: p.id, license_code: p.license_code, url: p.url, attribution: p.attribution, original_dimensions: p.original_dimensions }))
      }))
    };
    writeFileSync(answersPath, JSON.stringify(kept));
    return kept[url];
  }
}
const answer = (data: unknown): JsonFetcher => (async <T>() => ({ status: 'ok', data: data as T }) as FetchResult<T>) as JsonFetcher;
const pAnswers: Record<string, any> = JSON.parse(readFileSync('scripts/dev/scale/results/r79p/api-answers.json', 'utf8'));
const store = openWildStore(storePath);
type D = { key: string; name: { scientific: string }; ids: { inat?: number }; photos: Array<Photo & { captive?: boolean }>; upstream: Record<string, { status: string; detail?: string }> };
const wildOf = (d: D) => d.photos.filter((p) => p.src === 'inat' && !p.captive);
const obsOf = (ps: Photo[]) => [...new Set(ps.map((p) => p.page))];
const rows: any[] = [];
const tally = { pages: 0, mostVoted: 0, recordSaysApi: 0, photosSame: 0, fieldsSame: 0, observationsSame: 0, sameAsDayBefore: 0, comparedDayBefore: 0, apiChosen: 0, apiChosenAlsoNewest: 0, apiChosenWithVotes: 0, photosBefore: 0, photosAfter: 0 };
for (const f of readdirSync(dir).filter((x) => /^[kg]\d+\.json$/.test(x)).sort()) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as D;
  tally.pages++;
  const id = d.ids.inat;
  const n = id ? store.count(id) : undefined;
  if (!id || n == null || n <= 24) continue;
  tally.mostVoted++;
  const rec = d.upstream['inat.photos.wild'];
  if ((rec?.detail ?? '').includes(MOST_VOTED_RULE)) tally.recordSaysApi++;
  const url = inat.wildUrl(id, 24);
  const a = await ask(url);
  const want = await inat.photos(answer(a), id, true, 24, { key: d.key as never });
  const wantPhotos = want.status === 'ok' ? want.data : [];
  const got = wildOf(d);
  const ids = (ps: Photo[]) => ps.map((p) => p.id).join(',');
  const photosSame = ids(got) === ids(wantPhotos);
  const strip = (p: any) => JSON.stringify({ id: p.id, url: p.url, thumb: p.thumb, width: p.width, height: p.height, licence: p.licence, attribution: p.attribution, page: p.page, captive: !!p.captive, observedOn: p.observedOn, place: p.place });
  const fieldsSame = photosSame && got.every((p, i) => strip(p) === strip(wantPhotos[i]));
  const uuids = (a?.results ?? []).map((o: any) => o.uuid);
  const obsSame = JSON.stringify(obsOf(got)) === JSON.stringify(obsOf(wantPhotos));
  // A day before: agent P's answer to the same request, kept.
  const dayBefore = pAnswers[url];
  const sameDayBefore = dayBefore ? JSON.stringify(dayBefore.results.map((o: any) => o.uuid)) === JSON.stringify(uuids) : null;
  const dayBeforeOverlap = dayBefore ? dayBefore.results.filter((o: any) => uuids.includes(o.uuid)).length : null;
  // The page before the fill: the open data's 24 newest.
  const before = beforeDir ? (JSON.parse(readFileSync(`${beforeDir}/${f}`, 'utf8')) as D) : null;
  const newest = before ? obsOf(wildOf(before)).map((p) => p!.split('/').pop()) : [];
  tally.photosSame += +photosSame; tally.fieldsSame += +fieldsSame; tally.observationsSame += +obsSame;
  if (sameDayBefore != null) { tally.comparedDayBefore++; tally.sameAsDayBefore += +sameDayBefore; }
  tally.apiChosen += uuids.length;
  tally.apiChosenAlsoNewest += uuids.filter((u: string) => newest.includes(u)).length;
  tally.apiChosenWithVotes += (a?.results ?? []).filter((o: any) => (o.cached_votes_total ?? 0) > 0).length;
  tally.photosBefore += before ? wildOf(before).length : 0;
  tally.photosAfter += got.length;
  rows.push({ page: d.key, name: d.name.scientific, taxon: id, openCount: n, apiCount: a.total_results, record: rec?.detail, beforeRecordWasOpenData: before ? (before.upstream['inat.photos.wild']?.detail ?? '').startsWith(OPEN_WILD_RULE) : null, photosSame, fieldsSame, observationsSame: obsSame, photos: { fill: got.length, api: wantPhotos.length, before: before ? wildOf(before).length : null }, withVotes: (a?.results ?? []).filter((o: any) => (o.cached_votes_total ?? 0) > 0).length, sameAsDayBefore: sameDayBefore, dayBeforeOverlap });
}
writeFileSync(`${outDir}/proof.json`, JSON.stringify({ what: 'the fill\'s most-voted wild sets against the API alone, asked again after the fill', ran: new Date().toISOString(), requests, tally, rows }, null, 1));
console.log(JSON.stringify(tally, null, 1));
console.log(`${requests} requests to iNaturalist`);

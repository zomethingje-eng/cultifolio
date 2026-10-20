/**
 * Fetch the two bulk files a large corpus build reads instead of calling the
 * APIs per species. Runs on your PC; needs the network.
 *
 *   npx tsx scripts/bulk-fetch.ts wcvp                    # Kew's checklist → bulk/wcvp_names.csv, bulk/wcvp_distribution.csv
 *   npx tsx scripts/bulk-fetch.ts gbif names.txt          # one GBIF occurrence download for every name → bulk/occurrence.zip
 *   npx tsx scripts/bulk-fetch.ts gbif names.txt --max-records 100000   # species with more records than this are left to the API path (default 100000)
 *   npx tsx scripts/bulk-fetch.ts gbif names.txt --wait   # request and wait for it (usually 5–30 min); without --wait, come back with `gbif-status`
 *   npx tsx scripts/bulk-fetch.ts gbif-status             # poll the pending download and fetch it when ready
 *
 * Round seventy-nine (agent D): GBIF's records in either form, the same records and the same dossiers.
 *   npx tsx scripts/bulk-fetch.ts gbif-count list.txt     # count what each download would hold, with GBIF's count API (no account needed): records,
 *                                                         # records with images (iNaturalist's apart), and each download's size estimated
 *   npx tsx scripts/bulk-fetch.ts gbif-sql list.txt --wait   # GBIF's SQL download (SQL_TSV_ZIP, once GBIF's helpdesk has enabled it for the account):
 *                                                         # the same records in the 15 columns the build reads → bulk/occurrence.zip
 *   npx tsx scripts/bulk-fetch.ts gbif-media list.txt --wait # beside an SQL download: a DWCA of the records with images alone → bulk/media.zip,
 *                                                         # iNaturalist's dataset left out (--with-inat keeps it, for the DWCA route's photographs exactly)
 *   npx tsx scripts/bulk-fetch.ts gbif-media-status [--wait] # poll that one and fetch it when ready
 *   … --dry-run                                           # with gbif, gbif-sql or gbif-media: write the request file (bulk/request-*.json) and send nothing
 *   … --parts N                                           # with gbif or gbif-sql: ask in N requests of the keys, each its own zip, which the build reads in turn
 *
 * The GBIF download API needs a (free) GBIF account: set GBIF_USER, GBIF_PASSWORD
 * and GBIF_EMAIL in the environment. Name → key matching is cached in
 * bulk/keys.json so re-running is quick and the same keys go to the build.
 *
 * The occurrence archive is not extracted: a download for thousands of species
 * runs to tens of GB as text, so the build streams it out of the zip with
 * `tar -xOf` (bsdtar, on Windows 10+, macOS and Linux). Species with very many
 * records (a street tree has millions) are counted first and left out of the
 * download; the build samples those through the API, which serves a few
 * hundred records per species and is all the habitat centre needs. WCVP's
 * archive is small and is extracted.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, createWriteStream } from 'node:fs';
import { execSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { makeFetcher } from '../src/lib/dossier/fetch';
import { matchName } from '../src/lib/dossier/sources/gbif';
import { downloadKeysOf, kewDownloadKeysOf, isSpeciesList, parseSpeciesList } from './select-species-lib';
import { parseExtraKeys } from '../src/lib/dossier/extra-keys';
import { dwcaRequest, sqlRequest, mediaRequest, predicateItems, splitKeys, partsNeeded, countUrl, sizes, PREDICATE_ITEMS_MAX, INAT_DATASET } from './gbif-request-lib';

const DIR = 'bulk';
const WCVP_URL = 'http://sftp.kew.org/pub/data-repositories/WCVP/wcvp.zip';
const GBIF = 'https://api.gbif.org/v1';
const args = process.argv.slice(2);
const cmd = args[0];
mkdirSync(DIR, { recursive: true });

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

async function download(url: string, to: string, headers: Record<string, string> = {}): Promise<void> {
  const res = await fetch(url, { headers });
  if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  let got = 0, lastSaid = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, ctl) {
      got += chunk.length;
      if (Date.now() - lastSaid > 2000) {
        process.stdout.write(`\r  ${mb(got)}${total ? ` of ${mb(total)}` : ''}   `);
        lastSaid = Date.now();
      }
      ctl.enqueue(chunk);
    }
  });
  await pipeline(Readable.fromWeb(res.body.pipeThrough(counter) as never), createWriteStream(to));
  process.stdout.write(`\r  ${mb(got)} → ${to}\n`);
}

function extract(zip: string, into: string): void {
  console.log(`  extracting ${zip}…`);
  execSync(`tar -xf "${zip}" -C "${into}"`, { stdio: 'inherit' });
}

async function wcvp(): Promise<void> {
  const zip = `${DIR}/wcvp.zip`;
  if (!existsSync(zip)) {
    console.log(`Downloading WCVP from ${WCVP_URL}`);
    await download(WCVP_URL, zip);
  } else console.log(`${zip} already here (${mb(statSync(zip).size)}); delete it to refetch.`);
  extract(zip, DIR);
  for (const f of ['wcvp_names.csv', 'wcvp_distribution.csv']) {
    if (!existsSync(`${DIR}/${f}`)) throw new Error(`${f} not found after extraction; the archive layout may have changed. Look inside ${DIR}/.`);
    console.log(`  ${f}: ${mb(statSync(`${DIR}/${f}`).size)}`);
  }
}

/**
 * names.txt → GBIF species keys, cached. Reports what did not resolve.
 *
 * A species list (scripts/species-list.txt; round seventy-eight) gives each species' GBIF key in its last column, chosen
 * by the list's own rule: those keys are taken as they are, with no name matched, and a species the list gives no key is
 * not matched by its name either (rule 3: the backbone had no one key for it). Each is written into keys.json under its
 * name, which is how the build finds what the download was asked for. Since round seventy-nine (the owner's decision on
 * K's offer) the keys Kew's synonymy gives the species without one (`scripts/extra-keys-kew.txt`) are asked too, so every
 * request (`gbif-count`, `gbif-sql`, `gbif-media`, `gbif`, and their parts) carries them.
 */
async function keysFor(file: string): Promise<number[]> {
  const cachePath = `${DIR}/keys.json`;
  const cache: Record<string, number | null> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const text = readFileSync(file, 'utf8');
  if (isSpeciesList(text)) {
    const listed = parseSpeciesList(text);
    const { byName, keys, none } = downloadKeysOf(listed);
    const kewFile = 'scripts/extra-keys-kew.txt';
    const kew = existsSync(kewFile) ? kewDownloadKeysOf(listed, parseExtraKeys(readFileSync(kewFile, 'utf8'))) : { byName: {}, keys: [], pages: 0 };
    Object.assign(cache, byName, kew.byName);
    writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    writeFileSync(`${DIR}/unresolved.txt`, none.join('\n') + '\n');
    const all = [...new Set([...keys, ...kew.keys])];
    console.log(`  a species list: ${keys.length} GBIF keys from its last column, no name matched; of the ${none.length} species with no GBIF key in the list, ${kew.pages} are asked by the ${kew.keys.length} keys Kew's synonymy gives them (${kewFile}), never by their name; the other ${none.length - kew.pages} are left out of the download (all ${none.length} listed in ${DIR}/unresolved.txt); ${all.length} keys in all`);
    return all;
  }
  const f = makeFetcher();
  const names = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  let n = 0;
  for (const name of names) {
    if (name in cache) continue;
    const m = await matchName(f, name);
    cache[name] = m.status === 'ok' && m.data.usageKey && !/HIGHERRANK/.test(m.data.matchType ?? '') ? (m.data.acceptedUsageKey ?? m.data.usageKey) : null;
    if (++n % 50 === 0) {
      writeFileSync(cachePath, JSON.stringify(cache, null, 1));
      process.stdout.write(`\r  matched ${n}…   `);
    }
  }
  writeFileSync(cachePath, JSON.stringify(cache, null, 1));
  const unresolved = names.filter((x) => cache[x] == null);
  if (unresolved.length) console.log(`\n  ${unresolved.length} names did not resolve in the backbone (they still build on demand, and are listed in ${DIR}/unresolved.txt)`);
  writeFileSync(`${DIR}/unresolved.txt`, unresolved.join('\n') + '\n');
  const keys = [...new Set(names.map((x) => cache[x]).filter((k): k is number => typeof k === 'number'))];
  console.log(`  ${keys.length} taxon keys for ${names.length} names`);
  return keys;
}

/** Trimmed: `set GBIF_USER= name` in cmd.exe keeps the space, and GBIF answers 401 to " name". */
function creds(): { u: string; p: string; email: string } {
  const u = process.env.GBIF_USER?.trim(), p = process.env.GBIF_PASSWORD?.trim(), email = process.env.GBIF_EMAIL?.trim();
  if (!u || !p || !email) throw new Error('Set GBIF_USER, GBIF_PASSWORD and GBIF_EMAIL (a free account at gbif.org) for occurrence downloads.');
  return { u, p, email };
}
function auth(): string {
  const { u, p } = creds();
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

/**
 * Records per taxon key (with coordinates, no geospatial issue, present),
 * cached. One search request carries 200 taxon keys and returns a count per
 * species as a facet, so 9,000 species is about 50 requests rather than
 * 9,000, which is what GBIF's per-IP throttle wants. A species absent from
 * the facet has no records that pass the filters.
 */
async function countsFor(keys: number[]): Promise<Map<number, number>> {
  const cachePath = `${DIR}/counts.json`;
  const cache: Record<string, number> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const todo = keys.filter((k) => !(String(k) in cache));
  const BATCH = 200;
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const url = `${GBIF}/occurrence/search?${batch.map((k) => `taxonKey=${k}`).join('&')}&hasCoordinate=true&hasGeospatialIssue=false&occurrenceStatus=PRESENT&limit=0&facet=speciesKey&facetLimit=${BATCH * 2}`;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url);
      if (res.ok) {
        const d = (await res.json()) as { facets: Array<{ field: string; counts: Array<{ name: string; count: number }> }> };
        const got = new Map((d.facets.find((f) => f.field === 'SPECIES_KEY')?.counts ?? []).map((c) => [Number(c.name), c.count]));
        for (const k of batch) cache[String(k)] = got.get(k) ?? 0;
        break;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 8) {
        const ra = Number(res.headers.get('retry-after'));
        await new Promise((r) => setTimeout(r, Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60_000, 5000 * 2 ** attempt)));
        continue;
      }
      throw new Error(`counting records: HTTP ${res.status} ${await res.text()}`);
    }
    writeFileSync(cachePath, JSON.stringify(cache));
    process.stdout.write(`\r  counted ${Math.min(i + BATCH, todo.length)} of ${todo.length}…   `);
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (todo.length) console.log();
  return new Map(keys.map((k) => [k, cache[String(k)] ?? 0]));
}

type Route = 'dwca' | 'sql' | 'media';
const STATE: Record<Route, string> = { dwca: `${DIR}/download.json`, sql: `${DIR}/download.json`, media: `${DIR}/media-download.json` };
const ZIP: Record<Route, string> = { dwca: `${DIR}/occurrence.zip`, sql: `${DIR}/occurrence.zip`, media: `${DIR}/media.zip` };

/** The keys the download asks for: the list's, less those over the cut, which go to the API path (bulk/api-path.txt). */
async function downloadKeys(file: string, maxRecords: number): Promise<{ keys: number[]; counts: Map<number, number> }> {
  const all = await keysFor(file);
  console.log('  counting records per species (cached in bulk/counts.json)…');
  const counts = await countsFor(all);
  const keys = all.filter((k) => counts.get(k)! <= maxRecords);
  const heavy = all.filter((k) => counts.get(k)! > maxRecords);
  const rows = keys.reduce((a, k) => a + counts.get(k)!, 0);
  const heavyRows = heavy.reduce((a, k) => a + counts.get(k)!, 0);
  writeFileSync(`${DIR}/api-path.txt`, heavy.map((k) => `${k}\t${counts.get(k)}`).join('\n') + '\n');
  console.log(`  ${keys.length} species with ${(rows / 1e6).toFixed(1)} M records go in the download; ${heavy.length} species with more than ${maxRecords} records each (${(heavyRows / 1e6).toFixed(1)} M in all) are left to the API path, listed in ${DIR}/api-path.txt`);
  if (!keys.length) throw new Error('nothing to download');
  return { keys, counts };
}

/** POST one request body; the download's key, or a sentence that says what GBIF answered and what to do. */
async function submit(body: unknown, route: Route): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GBIF}/occurrence/download/request`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth() }, body: JSON.stringify(body) });
    if (res.ok) return (await res.text()).trim();
    const text = await res.text();
    // GBIF lets one account have at most three downloads in preparation (the Occurrence API reference, "Occurrence
    // Download Limits"): a part past that waits for one to finish.
    if (res.status === 429 && attempt < 240) { console.log('  GBIF holds three of your downloads in preparation already: waiting a minute for one to finish…'); await new Promise((r) => setTimeout(r, 60_000)); continue; }
    if (route === 'sql' && res.status === 403) throw new Error(`GBIF refused the SQL download (HTTP 403): SQL downloads are not enabled for this account yet. Ask GBIF's helpdesk to enable them, or take the Darwin Core Archive route: npm run bulk -- gbif scripts/species-list.txt --wait`);
    if (res.status === 401) throw new Error('GBIF refused the account (HTTP 401): check GBIF_USER (your user name, not your e-mail address) and GBIF_PASSWORD');
    throw new Error(`download request refused: HTTP ${res.status} ${text}`);
  }
}

/**
 * Ask GBIF for a download of the list's records in one form (`route`), or in `parts` requests of its keys. The request
 * body is written first to bulk/request-<route>[-<n>].json, which is what is sent (and, with `--dry-run`, all that is done).
 */
async function gbifRequest(route: Route, file: string, o: { maxRecords: number; parts?: number; dryRun?: boolean; inat?: boolean }): Promise<void> {
  const { keys, counts } = await downloadKeys(file, o.maxRecords);
  const who = o.dryRun ? {} : (() => { const { u, email } = creds(); return { creator: u, email }; })();
  const n = Math.max(o.parts ?? 1, route === 'sql' ? 1 : partsNeeded(keys.length, route === 'media' ? 6 : 3));
  if (route === 'media' && n > 1) throw new Error(`the images' download asks for ${keys.length} keys, more than one request may hold (${PREDICATE_ITEMS_MAX} items): ask it in parts by hand`);
  if ((o.parts ?? 1) < n) console.log(`  ${keys.length} keys are more than one predicate may hold (${PREDICATE_ITEMS_MAX} items, GBIF's limit): asked in ${n} parts`);
  const chunks = splitKeys(keys, n);
  const bodies = chunks.map((ks) => (route === 'dwca' ? dwcaRequest(ks, who) : route === 'sql' ? sqlRequest(ks, who) : mediaRequest(ks, who, { inat: o.inat !== false })));
  const names = bodies.map((_, i) => `${DIR}/request-${route}${bodies.length > 1 ? `-${i + 1}` : ''}.json`);
  bodies.forEach((b, i) => writeFileSync(names[i], JSON.stringify(b, null, 1)));
  const items = bodies.map((b) => ('predicate' in b ? predicateItems(b.predicate) : chunks[0].length));
  console.log(`  the request${bodies.length > 1 ? 's' : ''}: ${names.join(', ')} (${bodies.map((b, i) => `${chunks[i].length} keys${'predicate' in b ? `, ${items[i]} predicate items of GBIF's ${PREDICATE_ITEMS_MAX}` : `, ${(JSON.stringify(b).length / 1024).toFixed(0)} KB of SQL`}`).join('; ')})`);
  const recs = keys.reduce((a, k) => a + counts.get(k)!, 0);
  if (route !== 'media') console.log(`  about ${(recs / 1e6).toFixed(1)} M records by GBIF's count; ${route === 'dwca' ? `about ${(sizes(recs, 0, 0).dwca / 1e9).toFixed(0)} GB at ${456} bytes a record (round seventy-two's download)` : 'see gbif-count for its size'}`);
  if (route === 'sql') {
    // GBIF's validation of the query (no account needed): a fault in it is said before anything is asked.
    const v = await fetch(`${GBIF}/occurrence/download/request/validate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ format: 'SQL_TSV_ZIP', sql: bodies[0] && 'sql' in bodies[0] ? bodies[0].sql : '' }) });
    if (!v.ok) throw new Error(`GBIF's validation refused the SQL (HTTP ${v.status}): ${(await v.text()).slice(0, 600)}`);
    console.log(`  GBIF's validation accepted the SQL (HTTP ${v.status})`);
  }
  if (o.dryRun) { console.log('  --dry-run: nothing sent.'); return; }
  const parts: Array<{ key: string; taxa: number; requested: string }> = [];
  for (const [i, b] of bodies.entries()) {
    const key = await submit(b, route);
    parts.push({ key, taxa: chunks[i].length, requested: new Date().toISOString() });
    console.log(`  download requested: ${key} (${chunks[i].length} taxa${bodies.length > 1 ? `, part ${i + 1} of ${bodies.length}` : ''}). GBIF prepares it in minutes to hours.`);
    // Each part's state is written as it is asked, so a stop part-way loses no download already asked.
    writeFileSync(STATE[route], JSON.stringify(stateOf(route, parts, bodies.length, o.inat !== false), null, 1));
  }
}

function stateOf(route: Route, parts: Array<{ key: string; taxa: number; requested: string }>, of: number, inat: boolean) {
  const format = route === 'sql' ? 'SQL_TSV_ZIP' : 'DWCA';
  if (of === 1) return { key: parts[0].key, format, requested: parts[0].requested, taxa: parts[0].taxa, ...(route === 'media' ? { inat } : {}) };
  return { format, of, parts: parts.map((p, i) => ({ ...p, file: `occurrence-${i + 1}.zip` })) };
}

type Part = { key: string; file?: string; doi?: string; records?: number; csv?: string; media?: string; fetched?: string };
async function gbifStatus(route: Route, wait: boolean): Promise<void> {
  const p = STATE[route];
  if (!existsSync(p)) throw new Error(`No pending download; run \`${route === 'media' ? 'gbif-media' : 'gbif'} names.txt\` first.`);
  const state = JSON.parse(readFileSync(p, 'utf8')) as Part & { format?: string; parts?: Part[]; of?: number; inat?: boolean; taxa?: number; requested?: string };
  const parts: Part[] = state.parts ?? [{ ...state, file: ZIP[route].slice(DIR.length + 1) }];
  for (;;) {
    let left = 0;
    for (const part of parts) {
      if (part.fetched) continue;
      const res = await fetch(`${GBIF}/occurrence/download/${part.key}`);
      if (!res.ok) throw new Error(`status check failed: HTTP ${res.status}`);
      const d = (await res.json()) as { status: string; downloadLink?: string; totalRecords?: number; size?: number; doi?: string };
      console.log(`  ${part.key}: ${d.status}${d.totalRecords ? ` · ${d.totalRecords} records` : ''}${d.size ? ` · ${mb(d.size)}` : ''}`);
      if (d.status === 'SUCCEEDED' && d.downloadLink) {
        const zip = `${DIR}/${part.file}`;
        await download(d.downloadLink, zip);
        // The archive stays zipped; the build streams its members with `tar -xOf` (or unzip).
        const listed = execSync(`tar -tf "${zip}"`, { encoding: 'utf8' }).trim().split(/\r?\n/);
        // A DWCA holds occurrence.txt and multimedia.txt; an older SIMPLE_CSV download one .csv; an SQL download one <key>.csv.
        const csv = listed.find((f) => f === 'occurrence.txt') ?? listed.find((f) => f.endsWith('.csv'));
        const media = listed.find((f) => f === 'multimedia.txt');
        if (!csv) throw new Error(`no occurrence.txt or .csv inside ${zip} (found: ${listed.join(', ')})`);
        Object.assign(part, { doi: d.doi, records: d.totalRecords, csv, media, fetched: new Date().toISOString() });
        if (state.parts) writeFileSync(p, JSON.stringify(state, null, 1));
        else writeFileSync(p, JSON.stringify({ key: part.key, format: state.format, doi: d.doi, records: d.totalRecords, taxa: state.taxa, csv, media, ...(route === 'media' ? { inat: state.inat } : {}), fetched: part.fetched }, null, 1));
        console.log(`  ${zip} ready (${mb(statSync(zip).size)}, ${d.totalRecords} records). Cite as https://doi.org/${d.doi}`);
        continue;
      }
      if (d.status === 'FAILED' || d.status === 'KILLED' || d.status === 'CANCELLED') throw new Error(`download ${part.key} ${d.status}${route === 'sql' ? ': GBIF could not make the SQL download. Ask it again in parts (npm run bulk -- gbif-sql scripts/species-list.txt --parts 4 --wait), or take the Darwin Core Archive route (npm run bulk -- gbif scripts/species-list.txt --wait)' : ''}`);
      left++;
    }
    if (!left) return;
    if (!wait) {
      console.log(`  not ready; run \`${route === 'media' ? 'gbif-media-status' : 'gbif-status'}\` again later, or with --wait.`);
      return;
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

/**
 * What each download would hold, by GBIF's count API, before anything is asked (round seventy-nine): the records (the
 * cached facet of bulk/counts.json), and the records with a still image that are human observations, iNaturalist's
 * dataset counted apart (a facet by dataset, 200 keys a request, cached in bulk/media-counts.json). Then each download's
 * size, estimated.
 */
async function gbifCount(file: string, maxRecords: number): Promise<void> {
  const { keys, counts } = await downloadKeys(file, maxRecords);
  const recs = keys.reduce((a, k) => a + counts.get(k)!, 0);
  const cachePath = `${DIR}/media-counts.json`;
  const cache: Record<string, { all: number; inat: number; total: number }> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const BATCH = 200;
  const batches = splitKeys(keys, Math.ceil(keys.length / BATCH));
  let all = 0, inat = 0, batchTotal = 0;
  for (const [i, b] of batches.entries()) {
    const id = `${b[0]}-${b[b.length - 1]}-${b.length}`;
    if (!cache[id]) {
      const d = await getJson<{ count: number }>(countUrl(b, { media: true }) + `&datasetKey=${INAT_DATASET}`);
      const e = await getJson<{ count: number }>(countUrl(b, { media: true }));
      const t = await getJson<{ count: number }>(countUrl(b));
      cache[id] = { all: e.count, inat: d.count, total: t.count };
      writeFileSync(cachePath, JSON.stringify(cache));
      process.stdout.write(`\r  counted the images of ${Math.min((i + 1) * BATCH, keys.length)} of ${keys.length} species…   `);
    }
    all += cache[id].all; inat += cache[id].inat; batchTotal += cache[id].total;
  }
  console.log();
  // Bytes a row, zipped: between the 25.3 measured on the proof's sample and the 39.8 of a public SQL download of ten
  // columns (scripts/dev/scale/results/r79d-sql-proof.txt), an estimate until GBIF makes one.
  const sqlRow = 34;
  const z = sizes(recs, all - inat, sqlRow);
  const gb = (x: number) => `${(x / 1e9).toFixed(1)} GB`;
  console.log(`  records: ${recs} by the species facet, ${batchTotal} by each batch's count (a record two batches both match is counted twice there)`);
  console.log(`  the Darwin Core Archive (gbif): about ${gb(z.dwca)} (${456} bytes a record, round seventy-two's download)`);
  console.log(`  the SQL download (gbif-sql): about ${gb(z.sql)} (${sqlRow} bytes a row, a sample in its shape; GBIF's own compression may differ)`);
  console.log(`  records with images, human observations: ${all}; iNaturalist's dataset ${inat}, the others ${all - inat}`);
  console.log(`  the images' download (gbif-media): about ${gb(z.media)} without iNaturalist's dataset, ${gb(all * 456)} with it (--with-inat)`);
}

async function getJson<T>(url: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { 'user-agent': 'cultifolio-bulk-fetch' } });
    await new Promise((r) => setTimeout(r, 1000)); // one request a second
    if (res.ok) return (await res.json()) as T;
    if ((res.status === 429 || res.status >= 500) && attempt < 8) { await new Promise((r) => setTimeout(r, Math.min(60_000, 5000 * 2 ** attempt))); continue; }
    throw new Error(`counting: HTTP ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const num = (flag: string, d?: number) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : d; };
  const list = () => { const file = args[1]; if (!file || !existsSync(file)) throw new Error(`usage: ${cmd} <names.txt or scripts/species-list.txt> [--wait] [--dry-run]`); return file; };
  if (cmd === 'wcvp') await wcvp();
  else if (cmd === 'gbif' || cmd === 'gbif-sql' || cmd === 'gbif-media') {
    const route: Route = cmd === 'gbif' ? 'dwca' : cmd === 'gbif-sql' ? 'sql' : 'media';
    const file = list();
    const dryRun = args.includes('--dry-run');
    await gbifRequest(route, file, { maxRecords: num('--max-records', 100_000)!, parts: num('--parts'), dryRun, inat: route === 'media' ? args.includes('--with-inat') : undefined });
    if (!dryRun) await gbifStatus(route, args.includes('--wait'));
  } else if (cmd === 'gbif-status') await gbifStatus('dwca', args.includes('--wait'));
  else if (cmd === 'gbif-media-status') await gbifStatus('media', args.includes('--wait'));
  else if (cmd === 'gbif-count') await gbifCount(list(), num('--max-records', 100_000)!);
  else {
    console.error('usage: tsx scripts/bulk-fetch.ts wcvp | gbif <names.txt> [--wait] | gbif-sql <list> [--wait] | gbif-media <list> [--wait] [--with-inat] | gbif-status [--wait] | gbif-media-status [--wait] | gbif-count <list>   (gbif, gbif-sql, gbif-media: --dry-run, --max-records N; gbif, gbif-sql: --parts N)');
    process.exit(2);
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

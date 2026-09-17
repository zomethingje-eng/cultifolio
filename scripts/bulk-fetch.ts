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

/** names.txt → GBIF species keys, cached. Reports what did not resolve. */
async function keysFor(file: string): Promise<number[]> {
  const cachePath = `${DIR}/keys.json`;
  const cache: Record<string, number | null> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const f = makeFetcher();
  const names = readFileSync(file, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
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

async function gbifRequest(file: string, maxRecords: number): Promise<string> {
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
  const { u, email } = creds();
  const body = {
    creator: u,
    notificationAddresses: [email],
    sendNotification: false,
    format: 'SIMPLE_CSV',
    predicate: {
      type: 'and',
      predicates: [
        { type: 'in', key: 'TAXON_KEY', values: keys.map(String) },
        { type: 'equals', key: 'HAS_COORDINATE', value: 'true' },
        { type: 'equals', key: 'HAS_GEOSPATIAL_ISSUE', value: 'false' },
        { type: 'equals', key: 'OCCURRENCE_STATUS', value: 'PRESENT' }
      ]
    }
  };
  const res = await fetch(`${GBIF}/occurrence/download/request`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: auth() }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`download request refused: HTTP ${res.status} ${await res.text()}`);
  const key = (await res.text()).trim();
  writeFileSync(`${DIR}/download.json`, JSON.stringify({ key, requested: new Date().toISOString(), taxa: keys.length }, null, 1));
  console.log(`  download requested: ${key} (${keys.length} taxa). GBIF prepares it in minutes to an hour.`);
  return key;
}

async function gbifStatus(wait: boolean): Promise<void> {
  const p = `${DIR}/download.json`;
  if (!existsSync(p)) throw new Error('No pending download; run `gbif names.txt` first.');
  const { key } = JSON.parse(readFileSync(p, 'utf8')) as { key: string };
  for (;;) {
    const res = await fetch(`${GBIF}/occurrence/download/${key}`);
    if (!res.ok) throw new Error(`status check failed: HTTP ${res.status}`);
    const d = (await res.json()) as { status: string; downloadLink?: string; totalRecords?: number; size?: number; doi?: string };
    console.log(`  ${key}: ${d.status}${d.totalRecords ? ` · ${d.totalRecords} records` : ''}${d.size ? ` · ${mb(d.size)}` : ''}`);
    if (d.status === 'SUCCEEDED' && d.downloadLink) {
      const zip = `${DIR}/occurrence.zip`;
      await download(d.downloadLink, zip);
      // The archive holds one file named <key>.csv. It stays zipped; the build streams it with `tar -xOf`.
      const listed = execSync(`tar -tf "${zip}"`, { encoding: 'utf8' }).trim().split(/\r?\n/);
      const csv = listed.find((f) => f.endsWith('.csv'));
      if (!csv) throw new Error(`no .csv inside ${zip} (found: ${listed.join(', ')})`);
      writeFileSync(p, JSON.stringify({ key, doi: d.doi, records: d.totalRecords, csv, fetched: new Date().toISOString() }, null, 1));
      console.log(`  ${zip} ready (${mb(statSync(zip).size)}, ${d.totalRecords} records). Cite as https://doi.org/${d.doi}`);
      return;
    }
    if (d.status === 'FAILED' || d.status === 'KILLED' || d.status === 'CANCELLED') throw new Error(`download ${d.status}`);
    if (!wait) {
      console.log('  not ready; run `gbif-status` again later, or with --wait.');
      return;
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

async function main() {
  if (cmd === 'wcvp') await wcvp();
  else if (cmd === 'gbif') {
    const file = args[1];
    if (!file || !existsSync(file)) throw new Error('usage: gbif <names.txt> [--wait] [--max-records N]');
    const i = args.indexOf('--max-records');
    await gbifRequest(file, i >= 0 ? Number(args[i + 1]) : 100_000);
    await gbifStatus(args.includes('--wait'));
  } else if (cmd === 'gbif-status') await gbifStatus(args.includes('--wait'));
  else {
    console.error('usage: tsx scripts/bulk-fetch.ts wcvp | gbif <names.txt> [--wait] | gbif-status [--wait]');
    process.exit(2);
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

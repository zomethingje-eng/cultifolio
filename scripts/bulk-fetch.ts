/**
 * Fetch the two bulk files a large corpus build reads instead of calling the
 * APIs per species. Runs on your PC; needs the network.
 *
 *   npx tsx scripts/bulk-fetch.ts wcvp                    # Kew's checklist → bulk/wcvp_names.csv, bulk/wcvp_distribution.csv
 *   npx tsx scripts/bulk-fetch.ts gbif names.txt          # one GBIF occurrence download for every name → bulk/occurrence.csv
 *   npx tsx scripts/bulk-fetch.ts gbif names.txt --wait   # request and wait for it (usually 5–30 min); without --wait, come back with `gbif-status`
 *   npx tsx scripts/bulk-fetch.ts gbif-status             # poll the pending download and fetch it when ready
 *
 * The GBIF download API needs a (free) GBIF account: set GBIF_USER, GBIF_PASSWORD
 * and GBIF_EMAIL in the environment. Name → key matching is cached in
 * bulk/keys.json so re-running is quick and the same keys go to the build.
 *
 * Extraction uses `tar -xf`, which reads zips on Windows 10+, macOS and Linux.
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

function auth(): string {
  const u = process.env.GBIF_USER, p = process.env.GBIF_PASSWORD;
  if (!u || !p || !process.env.GBIF_EMAIL) throw new Error('Set GBIF_USER, GBIF_PASSWORD and GBIF_EMAIL (a free account at gbif.org) for occurrence downloads.');
  return 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');
}

async function gbifRequest(file: string): Promise<string> {
  const keys = await keysFor(file);
  const body = {
    creator: process.env.GBIF_USER,
    notificationAddresses: [process.env.GBIF_EMAIL],
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
      extract(zip, DIR);
      // The archive holds one file named <key>.csv; give it a stable name.
      const csv = `${DIR}/${key}.csv`;
      if (!existsSync(csv)) throw new Error(`expected ${csv} inside the archive`);
      execSync(process.platform === 'win32' ? `move /Y "${csv.replace(/\//g, '\\')}" "${DIR}\\occurrence.csv"` : `mv -f "${csv}" "${DIR}/occurrence.csv"`, { stdio: 'inherit' });
      writeFileSync(p, JSON.stringify({ key, doi: d.doi, records: d.totalRecords, fetched: new Date().toISOString() }, null, 1));
      console.log(`  ${DIR}/occurrence.csv ready (${mb(statSync(`${DIR}/occurrence.csv`).size)}). Cite as https://doi.org/${d.doi}`);
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
    if (!file || !existsSync(file)) throw new Error('usage: gbif <names.txt> [--wait]');
    await gbifRequest(file);
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

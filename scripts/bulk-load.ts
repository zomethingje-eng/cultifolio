/**
 * Stream the bulk files into the in-memory indexes the build reads from.
 * Node-only (readline over files); the parsing and the indexes are in
 * src/lib/dossier/bulk.ts where they are unit-tested.
 */
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { WcvpIndex, OccIndex, MediaIndex, parseWcvpName, parseWcvpDist, occHeader, parseOccRow, parseMediaRow } from '../src/lib/dossier/bulk';

const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`;

async function eachLine(path: string, each: (line: string, i: number) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
  let i = 0;
  for await (const line of rl) each(line, i++);
}

/**
 * WCVP in two passes. Rows are kept for every genus in the name list (not just
 * the exact names) so a name the backbone resolves to a synonym or a sister
 * species in the same genus still finds its range without an API call.
 */
export async function loadWcvp(dir: string, names: string[]): Promise<WcvpIndex | null> {
  const namesCsv = `${dir}/wcvp_names.csv`, distCsv = `${dir}/wcvp_distribution.csv`;
  if (!existsSync(namesCsv) || !existsSync(distCsv)) return null;
  const genera = new Set(names.map((n) => n.split(' ')[0].toLowerCase()));
  const wanted = (name: string) => genera.has(name.split(' ')[0].toLowerCase());
  const idx = new WcvpIndex();
  let h: string[] = [];
  console.log(`  WCVP names (${mb(statSync(namesCsv).size)})…`);
  await eachLine(namesCsv, (line, i) => {
    if (i === 0) h = line.replace(/^﻿/, '').split('|');
    else if (line) idx.addName(parseWcvpName(h, line), wanted);
  });
  const keep = idx.acceptedIds();
  console.log(`  ${idx.size} names in ${genera.size} genera; WCVP distributions (${mb(statSync(distCsv).size)})…`);
  await eachLine(distCsv, (line, i) => {
    if (i === 0) h = line.replace(/^﻿/, '').split('|');
    else if (line) {
      const d = parseWcvpDist(h, line);
      if (keep.has(d.id)) idx.addDist(d);
    }
  });
  return idx;
}

/** The taxon keys bulk-fetch resolved for these names (bulk/keys.json), so the occurrence index keeps only what this run builds. */
export function wantedKeys(dir: string, names: string[]): Set<number> | undefined {
  const p = `${dir}/keys.json`;
  if (!existsSync(p)) return undefined;
  const cache = JSON.parse(readFileSync(p, 'utf8')) as Record<string, number | null>;
  const out = new Set<number>();
  for (const n of names) {
    const k = cache[n];
    if (typeof k === 'number') out.add(k);
  }
  return out;
}

/**
 * The GBIF occurrence download, sampled per species as it streams. Read
 * straight out of occurrence.zip with `tar -xOf` (bsdtar; Windows 10+, macOS,
 * Linux all ship it), so a download of tens of GB never lands on disk as
 * text. A plain occurrence.csv is read too, for the small case.
 */
/** Stream one member of the archive (or a plain file) line by line. bsdtar reads zips on Windows and macOS; GNU tar does not, so unzip on Linux. */
function streamMember(zip: string, member: string): { input: NodeJS.ReadableStream; exit: Promise<number | null>; how: string } {
  const [cmd, cmdArgs] = process.platform === 'win32' || !hasCmd('unzip') ? ['tar', ['-xOf', zip, member]] : ['unzip', ['-p', zip, member]];
  const child = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'inherit'] });
  child.stdout.setEncoding('utf8');
  return { input: child.stdout, exit: new Promise((res) => child.on('close', res)), how: cmd };
}

/** Which members the archive holds: a SIMPLE_CSV download has one .csv; a DWCA has occurrence.txt and multimedia.txt. */
function members(zip: string, meta: string): { records: string; media?: string } | null {
  const m = existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { csv?: string; records?: string; media?: string }) : {};
  if (m.records) return { records: m.records, media: m.media };
  if (m.csv) return { records: m.csv };
  const listed = execSync(`tar -tf "${zip}"`, { encoding: 'utf8' }).trim().split(/\r?\n/);
  const records = listed.find((f) => f === 'occurrence.txt') ?? listed.find((f) => f.endsWith('.csv'));
  if (!records) return null;
  return { records, media: listed.find((f) => f === 'multimedia.txt') };
}

export async function loadOccurrences(dir: string, cap = 2000, wanted?: Set<number>): Promise<{ occ: OccIndex; media: MediaIndex | null } | null> {
  const csv = `${dir}/occurrence.csv`, zip = `${dir}/occurrence.zip`, meta = `${dir}/download.json`;
  // A names file with nothing in the download (a handful of extras) should not cost a pass over 28 M rows.
  if (wanted && wanted.size === 0) {
    console.log('  none of these species are in the occurrence download: occurrences will come from the API');
    return null;
  }
  let input: NodeJS.ReadableStream;
  let what: string;
  let exit: Promise<number | null> = Promise.resolve(0);
  let mediaMember: string | undefined;
  if (existsSync(csv)) {
    input = createReadStream(csv, { encoding: 'utf8' });
    what = `${csv} (${mb(statSync(csv).size)})`;
  } else if (existsSync(zip)) {
    const mm = members(zip, meta);
    if (!mm) return null;
    const st = streamMember(zip, mm.records);
    input = st.input;
    exit = st.exit;
    mediaMember = mm.media;
    what = `${zip} (${mb(statSync(zip).size)} zipped, ${mm.records} streamed with ${st.how})`;
  } else return null;
  const idx = new OccIndex(cap, wanted);
  if (existsSync(meta)) idx.doi = (JSON.parse(readFileSync(meta, 'utf8')) as { doi?: string }).doi;
  let h: string[] = [];
  let n = 0;
  console.log(`  GBIF occurrences from ${what}${wanted ? `, keeping ${wanted.size} species` : ''}…`);
  let i = 0;
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    if (i++ === 0) h = occHeader(line);
    else if (line) {
      const o = parseOccRow(h, line);
      if (o) idx.add(o);
      if (++n % 500_000 === 0) process.stdout.write(`\r  ${(n / 1e6).toFixed(1)} M rows, ${idx.species} taxa, ${idx.kept} kept…   `);
    }
  }
  const code = await exit;
  if (code) throw new Error(`reading ${zip} failed (exit ${code}); is the archive complete?`);
  if (n === 0) throw new Error(`no occurrence rows read from ${what}`);
  idx.seal();
  console.log(`\r  ${n} rows → ${idx.species} taxa, ${idx.kept} rows kept (≤${cap} each)      `);

  // A DWCA download carries the photographs too: one more pass, over multimedia.txt, for the records marked as having images.
  let media: MediaIndex | null = null;
  if (mediaMember && idx.withMedia.size) {
    media = new MediaIndex(idx.withMedia);
    const st = streamMember(zip, mediaMember);
    let mh: string[] = [];
    let j = 0, rows = 0;
    console.log(`  GBIF photographs from ${mediaMember} for ${idx.withMedia.size} observation records…`);
    for await (const line of createInterface({ input: st.input, crlfDelay: Infinity })) {
      if (j++ === 0) mh = occHeader(line);
      else if (line) {
        const m = parseMediaRow(mh, line);
        if (m) media.add(m);
        if (++rows % 500_000 === 0) process.stdout.write(`\r  ${(rows / 1e6).toFixed(1)} M image rows, ${media.species} species with photographs…   `);
      }
    }
    const mc = await st.exit;
    if (mc) throw new Error(`reading ${mediaMember} failed (exit ${mc})`);
    console.log(`\r  ${rows} image rows → ${media.species} species with openly licensed photographs      `);
  }
  return { occ: idx, media };
}

function hasCmd(c: string): boolean {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio: 'ignore' }).status === 0;
}

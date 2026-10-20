/**
 * Stream the bulk files into the in-memory indexes the build reads from.
 * Node-only (readline over files); the parsing and the indexes are in
 * src/lib/dossier/bulk.ts where they are unit-tested.
 */
import { createReadStream, existsSync, statSync, readFileSync } from 'node:fs';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { WcvpIndex, OccIndex, MediaIndex, parseWcvpName, parseWcvpDist, occHeader, parseOccRow, parseMediaRow, wcvpExtractedDay, downloadDay } from '../src/lib/dossier/bulk';

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
/**
 * The day of Kew's files in `dir` (round seventy-two, B1), for every step that reads them: README_WCVP.xlsx's "Extracted:"
 * line, read from the workbook's shared strings with the same tar or unzip the occurrence reader uses; else the day of
 * wcvp_names.csv itself. Undefined when neither can be read.
 */
export function wcvpFileDay(dir: string): string | undefined {
  const readme = `${dir}/README_WCVP.xlsx`, names = `${dir}/wcvp_names.csv`;
  if (existsSync(readme)) {
    const [cmd, cmdArgs] = process.platform === 'win32' || !hasCmd('unzip') ? ['tar', ['-xOf', readme, 'xl/sharedStrings.xml']] : ['unzip', ['-p', readme, 'xl/sharedStrings.xml']];
    const r = spawnSync(cmd, cmdArgs, { encoding: 'utf8', maxBuffer: 1 << 24 });
    const day = r.status === 0 ? wcvpExtractedDay(r.stdout) : undefined;
    if (day) return day;
  }
  return existsSync(names) ? statSync(names).mtime.toISOString().slice(0, 10) : undefined;
}

export async function loadWcvp(dir: string, names: string[], reference?: Iterable<string>): Promise<WcvpIndex | null> {
  const namesCsv = `${dir}/wcvp_names.csv`, distCsv = `${dir}/wcvp_distribution.csv`;
  if (!existsSync(namesCsv) || !existsSync(distCsv)) return null;
  const genera = new Set(names.map((n) => n.split(' ')[0].toLowerCase()));
  const wanted = (name: string) => genera.has(name.split(' ')[0].toLowerCase());
  const idx = new WcvpIndex();
  idx.fileDay = wcvpFileDay(dir);
  // The reference's own names, so Kew's spelling of a name is never read as another page's (B7).
  if (reference) idx.setReference(reference);
  let h: string[] = [];
  console.log(`  WCVP names (${mb(statSync(namesCsv).size)})…`);
  await eachLine(namesCsv, (line, i) => {
    if (i === 0) h = line.replace(/^﻿/, '').split('|');
    else if (line) idx.addName(parseWcvpName(h, line), wanted);
  });
  const keep = idx.acceptedIds();
  console.log(`  Kew's files of ${idx.fileDay ?? 'a day not known'}; ${idx.size} names in ${genera.size} genera; WCVP distributions (${mb(statSync(distCsv).size)})…`);
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

/** Which members the archive holds: a SIMPLE_CSV download has one .csv; a DWCA has occurrence.txt and multimedia.txt; an SQL download (SQL_TSV_ZIP) one <key>.csv. */
function members(zip: string, meta: string): { records: string; media?: string } | null {
  // download.json: `csv` is the records member (occurrence.txt or <key>.csv), `media` the multimedia member; `records` is the row count.
  const m = existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { csv?: string; media?: string }) : {};
  if (typeof m.csv === 'string') return { records: m.csv, media: typeof m.media === 'string' ? m.media : undefined };
  const listed = execSync(`tar -tf "${zip}"`, { encoding: 'utf8' }).trim().split(/\r?\n/);
  const records = listed.find((f) => f === 'occurrence.txt') ?? listed.find((f) => f.endsWith('.csv'));
  if (!records) return null;
  return { records, media: listed.find((f) => f === 'multimedia.txt') };
}

/** One archive of the records: the download, or one of its parts (round seventy-nine), with what download.json says of it. */
export type DownloadPart = { file: string; records: string; media?: string; doi?: string; key?: string; fetched?: string; plain?: boolean };

/**
 * The records' archives in `dir`, in the order they are read: `occurrence.csv` (a plain file, the small case), else the
 * parts download.json lists (`parts`, each its own zip: a request split by `bulk-fetch.ts --parts`), else `occurrence.zip`.
 * Null when there is none.
 */
export function downloadParts(dir: string): DownloadPart[] | null {
  const csv = `${dir}/occurrence.csv`, zip = `${dir}/occurrence.zip`, meta = `${dir}/download.json`;
  if (existsSync(csv)) return [{ file: csv, records: csv, plain: true }];
  const m = existsSync(meta) ? (JSON.parse(readFileSync(meta, 'utf8')) as { parts?: Array<{ file?: string; csv?: string; media?: string; doi?: string; key?: string; fetched?: string }>; doi?: string; key?: string; fetched?: string }) : null;
  if (m?.parts?.length) {
    const parts = m.parts.map((p) => ({ file: `${dir}/${p.file}`, records: p.csv ?? '', media: p.media, doi: p.doi, key: p.key, fetched: p.fetched }));
    const missing = parts.filter((p) => !p.records || !existsSync(p.file));
    if (missing.length) throw new Error(`download.json lists ${parts.length} parts, and ${missing.length} of them (${missing.map((p) => p.file).join(', ')}) are not fetched yet: run npm run bulk -- gbif-status --wait`);
    return parts;
  }
  if (!existsSync(zip)) return null;
  // A download asked for and not yet fetched (round seventy-nine): the occurrence.zip here is an older one, for other
  // species, and a build from it would ask GBIF's API for every species it lacks.
  if (m?.key && !(m as { csv?: string }).csv && !m.fetched) throw new Error(`download.json names download ${m.key}, asked for and not fetched yet, so ${zip} is an older one: run npm run bulk -- gbif-status --wait first`);
  const mm = members(zip, meta);
  if (!mm) return null;
  return [{ file: zip, records: mm.records, media: mm.media, doi: m?.doi, key: m?.key, fetched: m?.fetched }];
}

/**
 * Whether the download in `dir` was asked for these keys, the species list's (round seventy-nine): a sentence saying what
 * is short, or null. The download records how many species it was asked for (`taxa`, or each part's); the species the
 * request left to the API path (bulk/api-path.txt) are the rest. An older download (round seventy-two's, for 8,900
 * species) has no count, and a build of the list from it would ask GBIF's API for every species it lacks. Beside an SQL
 * download, the images' download must be asked for the same species, or a page outside it would read "no photograph".
 * No download at all is not this function's to say (the build says it and asks the API).
 */
export function downloadShortOf(dir: string, keys: readonly number[]): string | null {
  const meta = `${dir}/download.json`;
  if (!existsSync(meta)) return existsSync(`${dir}/occurrence.zip`) ? `${dir}/occurrence.zip has no download.json beside it, so what it was asked for is not known: ask GBIF's download for the list (npm run bulk -- gbif-sql scripts/species-list.txt --wait, or gbif …)` : null;
  const m = JSON.parse(readFileSync(meta, 'utf8')) as { taxa?: number; format?: string; parts?: Array<{ taxa?: number }> };
  const taxa = m.parts ? m.parts.reduce((n, p) => (n == null || p.taxa == null ? undefined : n + p.taxa), 0 as number | undefined) : m.taxa;
  const want = new Set(keys);
  const apiPath = existsSync(`${dir}/api-path.txt`) ? readFileSync(`${dir}/api-path.txt`, 'utf8').split(/\r?\n/).map((l) => Number(l.split('\t')[0])).filter((k) => want.has(k)).length : 0;
  if (taxa == null) return `${meta} does not say how many species its download was asked for (a download from before round seventy-nine): ask GBIF's download for the list (npm run bulk -- gbif-sql scripts/species-list.txt --wait, or gbif …)`;
  if (taxa + apiPath < keys.length) return `the occurrence download in ${dir} was asked for ${taxa} species (and ${apiPath} left to the API path), not the list's ${keys.length}: ask it for the list (npm run bulk -- gbif-sql scripts/species-list.txt --wait, or gbif …)`;
  const mm = `${dir}/media-download.json`;
  if (m.format === 'SQL_TSV_ZIP' && existsSync(`${dir}/media.zip`) && existsSync(mm)) {
    const mt = (JSON.parse(readFileSync(mm, 'utf8')) as { taxa?: number }).taxa;
    if (mt == null || mt < taxa) return `the images' download (${dir}/media.zip) was asked for ${mt ?? 'an unknown number of'} species, not the records' ${taxa}: ask it again (npm run bulk -- gbif-media scripts/species-list.txt --wait)`;
  }
  return null;
}

/** Each line of one member of an archive (or of a plain file), and the reader's exit. */
async function eachRow(p: DownloadPart, member: string, each: (line: string, i: number) => void): Promise<void> {
  const st = p.plain ? { input: createReadStream(p.file, { encoding: 'utf8' }) as NodeJS.ReadableStream, exit: Promise.resolve(0 as number | null), how: 'read' } : streamMember(p.file, member);
  let i = 0;
  for await (const line of createInterface({ input: st.input, crlfDelay: Infinity })) each(line, i++);
  const code = await st.exit;
  if (code) throw new Error(`reading ${member} of ${p.file} failed (exit ${code}); is the archive complete?`);
}

/** A taxon key a reader can take: a backbone key is a whole number. Catalogue of Life's ("CVW5J") is not. */
const notBackboneKey = (raw: string | undefined) => !!raw && !/^\d+$/.test(raw.trim());

/**
 * The GBIF occurrence download, sampled per species as it streams, whichever form it came in (round seventy-nine): a
 * DWCA (occurrence.txt, and its multimedia.txt for the photographs), or GBIF's SQL download (SQL_TSV_ZIP: one <key>.csv
 * of the columns `SQL_SELECT` names) with the photographs from the images' download beside it (bulk/media.zip, a DWCA of
 * the records with images, `npm run bulk -- gbif-media`). Read straight out of each zip with `tar -xOf` (bsdtar;
 * Windows 10+, macOS, Linux all ship it), so a download of tens of GB never lands on disk as text. A plain
 * occurrence.csv is read too, for the small case. The same records give the same sample and the same photographs by
 * either form: the reader reads each column by its name, in any order and either case.
 */
export async function loadOccurrences(dir: string, cap = 2000, wanted?: Set<number>): Promise<{ occ: OccIndex; media: MediaIndex | null; format: 'dwca' | 'sql' | 'csv'; photos: string; mediaDoi?: string } | null> {
  // A names file with nothing in the download (a handful of extras) should not cost a pass over 28 M rows.
  if (wanted && wanted.size === 0) {
    console.log('  none of these species are in the occurrence download: occurrences will come from the API');
    return null;
  }
  const parts = downloadParts(dir);
  if (!parts) return null;
  const idx = new OccIndex(cap, wanted);
  idx.doi = parts[0].doi;
  idx.day = downloadDay(parts[0]);
  let format: 'dwca' | 'sql' | 'csv' = 'csv';
  let n = 0;
  for (const [pi, p] of parts.entries()) {
    idx.startPart(p.doi, downloadDay(p));
    const what = p.plain ? `${p.file} (${mb(statSync(p.file).size)})` : `${p.file} (${mb(statSync(p.file).size)} zipped, ${p.records} streamed)`;
    console.log(`  GBIF occurrences from ${what}${parts.length > 1 ? `, part ${pi + 1} of ${parts.length}` : ''}${wanted ? `, keeping ${wanted.size} species` : ''}…`);
    let h: string[] = [];
    let raw: string[] = [];
    let read = 0;
    await eachRow(p, p.records, (line, i) => {
      if (i === 0) {
        raw = line.replace(/^\uFEFF/, '').replace(/\r$/, '').split('\t');
        h = occHeader(line);
        // GBIF's SQL download names its columns in lower case, as the query's aliases (round seventy-nine).
        format = raw.includes('gbifid') ? 'sql' : p.records === 'occurrence.txt' ? 'dwca' : format === 'sql' ? 'sql' : 'csv';
        const lacking = ['gbifID', 'decimalLatitude', 'decimalLongitude', 'speciesKey'].filter((t) => !h.includes(t));
        if (lacking.length) throw new Error(`${p.records} of ${p.file} has no ${lacking.join(', ')} column: not a download the build can read`);
        return;
      }
      if (!line) return;
      const o = parseOccRow(h, line);
      if (o) {
        // A key of another taxonomy is never read as a backbone key: an SQL download asked for the table's own key columns
        // (Catalogue of Life's since 2025) instead of occurrence.gbif_classification's would build every page from nothing.
        if (read < 1000 && (Number.isNaN(o.speciesKey) || Number.isNaN(o.taxonKey) || Number.isNaN(o.acceptedTaxonKey))) {
          const c = line.split('\t'), bad = ['speciesKey', 'taxonKey', 'acceptedTaxonKey'].map((t) => c[h.indexOf(t)]).find(notBackboneKey);
          throw new Error(`${p.records} of ${p.file} holds a taxon key that is not a GBIF Backbone key ("${bad}"): an SQL download must select occurrence.gbif_classification's keys, as npm run bulk -- gbif-sql asks`);
        }
        read++;
        idx.add(o);
      }
      if (++n % 500_000 === 0) process.stdout.write(`\r  ${(n / 1e6).toFixed(1)} M rows, ${idx.species} taxa, ${idx.kept} kept…   `);
    });
  }
  if (n === 0) throw new Error(`no occurrence rows read from ${parts.map((p) => p.file).join(', ')}`);
  idx.seal();
  console.log(`\r  ${n} rows → ${idx.species} taxa, ${idx.kept} rows kept (≤${cap} each)      `);

  // The photographs. A DWCA carries them: one more pass, over each part's multimedia.txt, for the records marked as having
  // images. An SQL download does not: they come from the images' download beside it, a DWCA of the records with images
  // alone (bulk/media.zip), whose records mark which are photographed by the same rule and whose multimedia.txt gives them.
  let media: MediaIndex | null = null;
  let photos = 'none';
  let mediaDoi: string | undefined;
  const withMedia = parts.filter((p) => p.media);
  const mediaZip = `${dir}/media.zip`, mediaMeta = `${dir}/media-download.json`;
  if (withMedia.length) {
    if (existsSync(mediaZip)) console.log(`  ${mediaZip} is not read: the download carries its own photographs (multimedia.txt)`);
    if (idx.withMedia.size) {
      media = new MediaIndex(idx.withMedia, idx.mediaRank);
      photos = 'multimedia.txt';
      mediaDoi = parts[0].doi;
      for (const p of withMedia) await readMedia(p, p.media!, media);
    }
  } else if (existsSync(mediaZip)) {
    const mm = members(mediaZip, mediaMeta);
    if (!mm?.media) throw new Error(`${mediaZip} has no multimedia.txt: it must be a DWCA (npm run bulk -- gbif-media asks for one)`);
    const mmeta = existsSync(mediaMeta) ? (JSON.parse(readFileSync(mediaMeta, 'utf8')) as { doi?: string; key?: string; fetched?: string; inat?: boolean }) : {};
    const mp: DownloadPart = { file: mediaZip, records: mm.records, media: mm.media, doi: mmeta.doi, key: mmeta.key, fetched: mmeta.fetched };
    console.log(`  GBIF photographs' records from ${mediaZip} (${mb(statSync(mediaZip).size)} zipped)${mmeta.inat === false ? "; iNaturalist's dataset left out of it (its photographs come from iNaturalist's open data)" : ''}…`);
    let h: string[] = [];
    let marked = 0;
    await eachRow(mp, mm.records, (line, i) => {
      if (i === 0) { h = occHeader(line); return; }
      if (!line) return;
      const o = parseOccRow(h, line);
      if (o) { idx.addMedia(o); marked++; }
    });
    console.log(`  ${marked} records with images read; ${idx.withMedia.size} marked for their photographs`);
    if (idx.withMedia.size) {
      media = new MediaIndex(idx.withMedia, idx.mediaRank);
      photos = 'media.zip';
      mediaDoi = mmeta.doi;
      await readMedia(mp, mm.media, media);
    }
  }
  return { occ: idx, media, format, photos, mediaDoi };
}

async function readMedia(p: DownloadPart, member: string, media: MediaIndex): Promise<void> {
  let mh: string[] = [];
  let rows = 0;
  console.log(`  GBIF photographs from ${member} of ${p.file}…`);
  await eachRow(p, member, (line, j) => {
    if (j === 0) { mh = occHeader(line); return; }
    if (!line) return;
    const m = parseMediaRow(mh, line);
    if (m) media.add(m);
    if (++rows % 500_000 === 0) process.stdout.write(`\r  ${(rows / 1e6).toFixed(1)} M image rows, ${media.species} species with photographs…   `);
  });
  console.log(`\r  ${rows} image rows → ${media.species} species with openly licensed photographs      `);
}

function hasCmd(c: string): boolean {
  return spawnSync(process.platform === 'win32' ? 'where' : 'which', [c], { stdio: 'ignore' }).status === 0;
}

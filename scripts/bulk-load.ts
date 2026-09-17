/**
 * Stream the bulk files into the in-memory indexes the build reads from.
 * Node-only (readline over files); the parsing and the indexes are in
 * src/lib/dossier/bulk.ts where they are unit-tested.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { WcvpIndex, OccIndex, parseWcvpName, parseWcvpDist, occHeader, parseOccRow } from '../src/lib/dossier/bulk';

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

/** The GBIF occurrence download, sampled per species as it streams. */
export async function loadOccurrences(dir: string, cap = 4000): Promise<OccIndex | null> {
  const csv = `${dir}/occurrence.csv`;
  if (!existsSync(csv)) return null;
  const idx = new OccIndex(cap);
  let h: string[] = [];
  let n = 0;
  console.log(`  GBIF occurrences (${mb(statSync(csv).size)})…`);
  await eachLine(csv, (line, i) => {
    if (i === 0) h = occHeader(line);
    else if (line) {
      const o = parseOccRow(h, line);
      if (o) idx.add(o);
      if (++n % 500_000 === 0) process.stdout.write(`\r  ${(n / 1e6).toFixed(1)} M rows…   `);
    }
  });
  idx.seal();
  console.log(`\r  ${n} rows → ${idx.species} taxa (≤${cap} each)      `);
  return idx;
}

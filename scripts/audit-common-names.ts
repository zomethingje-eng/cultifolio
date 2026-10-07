/**
 * The audit of the common-name rule (round sixty-one, decision 7), to run on the live index before the deploy that
 * changes it, and to read: how many species would show another common name than they show now, why, and a sample.
 *
 *   npx tsx scripts/audit-common-names.ts <index.json | https://cultifolio.com/api/index> [--sample 40] [--json]
 *
 * An index carries each species' English names as `common` then `commons`, in the order the old rule kept them (GBIF's
 * order, one per spelling in lower case), and not GBIF's `preferred` flag or source counts, which the dossiers keep only
 * from this round. So the audit reads the index's names as GBIF's list with neither: it measures rules 1, 2 and 5 and the
 * spelling (the genus, comma and binomial set-back, the grouping of spellings and the capital first letter) exactly, and
 * rules 3 and 4 (preferred, most sources) only as far as two spellings of one name stand for two sources. The rebuild
 * after the deploy reads the dossiers' own flags, so its choices can differ from this audit's where GBIF marks a name
 * preferred; the build's index is the one to read after it (run this again on it).
 */
import { readFileSync } from 'node:fs';
import { englishNames, generaOf } from '../src/lib/dossier/index-entry';

export type AuditEntry = { name: string; common?: string; commons?: string[] };
export interface Audit {
  species: number;
  withCommon: number;
  changed: number;
  /** Of the changed: the old name was set back (it names another genus, is a comma list, or is shaped like a binomial). */
  setBack: number;
  /** Of the changed: the same name, spelled otherwise (another spelling of it, or the first letter as a capital). */
  spellingOnly: number;
  /** Of the changed: another name, chosen because two spellings of it count as two sources. */
  bySources: number;
  /** An evenly spread sample of the changes, "Genus species: before -> after". */
  sample: string[];
}

const key = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’‘`]/g, "'").replace(/[-\s]+/g, ' ').trim();

export function auditCommonNames(idx: AuditEntry[], sampleSize = 40): Audit {
  const genera = generaOf(idx.map((e) => e.name));
  let withCommon = 0, setBack = 0, spellingOnly = 0, bySources = 0;
  const changes: string[] = [];
  for (const e of idx) {
    if (!e.common) continue;
    withCommon++;
    const before = e.common;
    const v = [before, ...(e.commons ?? [])].map((name) => ({ name, lang: 'eng' }));
    const after = englishNames(v, { genus: e.name, genera }).common;
    if (after === before) continue;
    changes.push(`${e.name}: "${before}" -> "${after}"`);
    if (after && key(after) === key(before)) spellingOnly++;
    else if (englishNames([{ name: before, lang: 'eng' }, { name: after ?? '', lang: 'eng' }], { genus: e.name, genera }).common !== before) setBack++;
    else bySources++;
  }
  const step = changes.length / Math.max(1, sampleSize);
  const sample = changes.length <= sampleSize ? changes : Array.from({ length: sampleSize }, (_, i) => changes[Math.floor(i * step)]);
  return { species: idx.length, withCommon, changed: changes.length, setBack, spellingOnly, bySources, sample };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--'));
  if (!src) {
    console.error('usage: npx tsx scripts/audit-common-names.ts <index.json | URL> [--sample 40] [--json]');
    process.exit(2);
  }
  const at = args.indexOf('--sample');
  const n = at >= 0 ? Number(args[at + 1]) || 40 : 40;
  const text = /^https?:/.test(src) ? await (await fetch(src)).text() : readFileSync(src, 'utf8');
  const a = auditCommonNames(JSON.parse(text) as AuditEntry[], n);
  if (args.includes('--json')) { console.log(JSON.stringify(a, null, 1)); return; }
  console.log(`${a.species} species, ${a.withCommon} with a common name; the rule changes ${a.changed} (${a.setBack} set back, ${a.spellingOnly} spelling only, ${a.bySources} by sources).`);
  console.log(`A sample of ${a.sample.length}, before -> after:`);
  for (const s of a.sample) console.log(`  ${s}`);
}

if (process.argv[1]?.endsWith('audit-common-names.ts')) void main();

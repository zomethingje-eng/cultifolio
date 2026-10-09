/**
 * The audit of the common-name rule (round sixty-one, decision 7), to run on the live index before the deploy that
 * changes it, and to read: how many species would show another common name than they show now, why, and a sample.
 *
 *   npx tsx scripts/audit-common-names.ts <index.json | https://cultifolio.com/api/index> [--sample 40] [--json]
 *   npx tsx scripts/audit-common-names.ts <index.json after> --before <index.json before> [--sample 40] [--json]
 *
 * With `--before`, it says what changed between two built indexes instead: the species whose shown common name differs,
 * and a sample. That is how to see what the `--names` step changed: the rule alone, run on the old index, cannot see
 * the preferred flags and source counts the step brings (round sixty-two; the verification review's search 18).
 *
 * An index carries each species' English names as `common` then `commons`, in the order a rule kept them, and not GBIF's
 * `preferred` flag or source counts, which only the dossiers keep (since the `--names` step of round sixty-two). So the
 * audit reads the index's names as GBIF's list with neither: it measures rules 1, 2 and 5 and the spelling (the genus,
 * comma and binomial set-back, the grouping of spellings and the capital first letter) exactly, and rules 3 and 4
 * (preferred, most sources) only as far as two spellings of one name stand for two sources. Run on an index the rule
 * itself built, it reports what the rule changes of its own order, which is nothing for most species: it is meant for
 * an index built under an older rule. The index built after the `--names` step reads the dossiers' own flags.
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

/** What changed between two indexes: species (by name) in both whose shown common name differs, with an evenly spread sample. */
export interface CommonDiff {
  /** Species in both indexes. */
  species: number;
  /** Of those, the ones whose shown common name differs (one gained or lost a name counts too). */
  changed: number;
  /** An evenly spread sample of the changes, "Genus species: before -> after" ("(none)" for no name). */
  sample: string[];
}
export function diffCommonNames(before: AuditEntry[], after: AuditEntry[], sampleSize = 40): CommonDiff {
  const old = new Map(before.map((e) => [e.name, e.common]));
  let species = 0;
  const changes: string[] = [];
  for (const e of after) {
    if (!old.has(e.name)) continue;
    species++;
    const was = old.get(e.name);
    if (was !== e.common) changes.push(`${e.name}: "${was ?? '(none)'}" -> "${e.common ?? '(none)'}"`);
  }
  const step = changes.length / Math.max(1, sampleSize);
  const sample = changes.length <= sampleSize ? changes : Array.from({ length: sampleSize }, (_, i) => changes[Math.floor(i * step)]);
  return { species, changed: changes.length, sample };
}

/**
 * The arguments, in any order: the source (the first argument that is neither a flag nor the value of `--sample` or
 * `--before`), `--sample N` or `--sample=N`, `--before <index>` or `--before=<index>`, and `--json` (round sixty-two;
 * the corpus review, 10h: "--sample 40 index.json" read "40" as the source).
 */
export function auditArgs(args: string[]): { src?: string; sample: number; json: boolean; before?: string } {
  let src: string | undefined, sample = 40, before: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = /^--sample=(.*)$/.exec(a);
    if (eq) { sample = Number(eq[1]) || 40; continue; }
    if (a === '--sample') { sample = Number(args[i + 1]) || 40; i++; continue; }
    const be = /^--before=(.*)$/.exec(a);
    if (be) { before = be[1] || undefined; continue; }
    if (a === '--before') { before = args[i + 1]; i++; continue; }
    if (a.startsWith('--')) continue;
    src ??= a;
  }
  return { src, sample, json: args.includes('--json'), ...(before ? { before } : {}) };
}

async function main(): Promise<void> {
  const { src, sample: n, json, before } = auditArgs(process.argv.slice(2));
  if (!src) {
    console.error('usage: npx tsx scripts/audit-common-names.ts <index.json | URL> [--before <index.json | URL>] [--sample 40] [--json]');
    process.exit(2);
  }
  const read = async (from: string) => JSON.parse(/^https?:/.test(from) ? await (await fetch(from)).text() : readFileSync(from, 'utf8')) as AuditEntry[];
  if (before) {
    const d = diffCommonNames(await read(before), await read(src), n);
    if (json) { console.log(JSON.stringify(d, null, 1)); return; }
    console.log(`${d.species} species in both indexes; ${d.changed} show another common name.`);
    console.log(`A sample of ${d.sample.length}, before -> after:`);
    for (const s of d.sample) console.log(`  ${s}`);
    return;
  }
  const a = auditCommonNames(await read(src), n);
  if (json) { console.log(JSON.stringify(a, null, 1)); return; }
  console.log(`${a.species} species, ${a.withCommon} with a common name; the rule changes ${a.changed} (${a.setBack} set back, ${a.spellingOnly} spelling only, ${a.bySources} by sources).`);
  console.log(`A sample of ${a.sample.length}, before -> after:`);
  for (const s of a.sample) console.log(`  ${s}`);
}

if (process.argv[1]?.endsWith('audit-common-names.ts')) void main();

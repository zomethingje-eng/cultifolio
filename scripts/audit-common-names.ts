/**
 * The audit of the common-name rule (round sixty-one, decision 7), to run on the live index before the deploy that
 * changes it, and to read: how many species would show another common name than they show now, why, and a sample.
 *
 *   npx tsx scripts/audit-common-names.ts <index.json | https://cultifolio.com/api/index> [--sample 40] [--json]
 *   npx tsx scripts/audit-common-names.ts <index.json after> --before <index.json before> [--sample 40] [--json]
 *   npx tsx scripts/audit-common-names.ts --dossiers <static/s/v2> [--sample 40] [--json]
 *
 * With `--dossiers`, it reads every dossier of a corpus and its index.json, and says what the rules of this checkout
 * would change in that index before `--index` is run: the headlines and the names shown under a title that change, by
 * cause, with a sample; the older names the search gains; and the names whose spelling the audit flags (a fragment, a
 * trailing full stop, an unmatched bracket), which are shown as sources wrote them (round sixty-seven; triage-66 N1, N3,
 * N5 to N7, N9). With `--before`, the run fails when a species' photographs dropped to none or its climate turned
 * refused between the two indexes (triage-66 N4).
 *
 * With `--before`, it says what changed between two built indexes instead: the species whose shown common name differs,
 * and a sample. That is how to see what the `--names` step changed: the rule alone, run on the old index, cannot see
 * the preferred flags and source counts the step brings (round sixty-two; the verification review's search 18).
 *
 * An index carries each species' English names as `common` then `commons`, in the order a rule kept them, and not GBIF's
 * `preferred` flag or source counts, which only the dossiers keep (since the `--names` step of round sixty-two). So the
 * audit reads the index's names as GBIF's list with neither: it measures rules 1, 2, 2a and 5 and the spelling (a list
 * split into its names, the genus and binomial set-back, a bare genus word after a longer name, the grouping of
 * spellings and the capital first letter) exactly, and rules 3 and 4
 * (preferred, most sources) only as far as two spellings of one name stand for two sources. Run on an index the rule
 * itself built, it reports what the rule changes of its own order, which is nothing for most species: it is meant for
 * an index built under an older rule. The index built after the `--names` step reads the dossiers' own flags.
 */
import { readFileSync, existsSync } from 'node:fs';
import { englishNames, indexNames, generaOf, bareGenus, nameKey, genericNoun, namesOf, nameFlags, olderNamesOf, type VernacularName } from '../src/lib/dossier/index-entry';
import { indexDrops } from '../src/lib/dossier/drops';

export type AuditEntry = { name: string; common?: string; commons?: string[]; key?: number; photos?: number; climate?: string };
export interface Audit {
  species: number;
  withCommon: number;
  changed: number;
  /** Of the changed: the old name was a list of several names in one, now read as its names (round sixty-three, N1). */
  split: number;
  /** Of the changed: the old name was a bare genus word ("Aloe"), now after a longer name (round sixty-three, N2). */
  bare: number;
  /** Of the changed: the old name was set back (it names another genus, is a semicolon list, or is shaped like a binomial). */
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
  let withCommon = 0, split = 0, bare = 0, setBack = 0, spellingOnly = 0, bySources = 0;
  const changes: string[] = [];
  for (const e of idx) {
    if (!e.common) continue;
    withCommon++;
    const before = e.common;
    const v = [before, ...(e.commons ?? [])].map((name) => ({ name, lang: 'eng' }));
    const after = englishNames(v, { genus: e.name, genera }).common;
    if (after === before) continue;
    changes.push(`${e.name}: "${before}" -> "${after}"`);
    if (before.includes(',')) split++;
    else if (bareGenus(before, { genus: e.name, genera }) && !(after && bareGenus(after, { genus: e.name, genera }))) bare++;
    else if (after && key(after) === key(before)) spellingOnly++;
    else if (englishNames([{ name: before, lang: 'eng' }, { name: after ?? '', lang: 'eng' }], { genus: e.name, genera }).common !== before) setBack++;
    else bySources++;
  }
  const step = changes.length / Math.max(1, sampleSize);
  const sample = changes.length <= sampleSize ? changes : Array.from({ length: sampleSize }, (_, i) => changes[Math.floor(i * step)]);
  return { species: idx.length, withCommon, changed: changes.length, split, bare, setBack, spellingOnly, bySources, sample };
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

/** A dossier as the audit reads it: its names, and the key the index knows it by. */
export type AuditDossier = { key: number; name: { scientific: string; vernacular?: VernacularName[]; synonyms?: string[] } };
export interface DossierAudit {
  species: number;
  /** Headlines that change, by cause: the counts sum to `changed`. */
  changed: number;
  causes: Record<string, number>;
  /** Species whose first four shown names (the line under the title) change. */
  shownChanged: number;
  /** Older names the search reads beyond the six shown, and the species that have any. */
  older: { names: number; species: number };
  /** Pooled spellings the search reads and the page never shows (`indexNames`), and the species that have any (round sixty-nine; triage-68 N2). */
  spellings: { names: number; species: number; sample: string[] };
  /** Shown names the audit flags, by flag, with a sample each. */
  flags: Record<string, { n: number; sample: string[] }>;
  /** An evenly spread sample of the changed headlines, "Genus species: before -> after (cause)". */
  sample: string[];
}
/** The genus words round sixty-nine allowed as English nouns (triage-68 N2), for the cause of a changed headline. */
const N2_NOUNS = new Set(['acacia', 'anemone', 'aralia', 'geranium', 'petunia', 'verbena']);
const lastWord = (s: string) => (s.trim().split(/[\s-]+/).pop() ?? '').toLowerCase();
const words = (s: string) => s.trim().split(/[\s-]+/).filter(Boolean).length;
const spread = <T>(xs: T[], n: number) => (xs.length <= n ? xs : Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]));
/** Why a headline changed, the first cause that explains it. */
function causeOf(before: string | undefined, after: string | undefined, sci: string, v: VernacularName[], scope: { genus: string; genera: Set<string> }): string {
  const o = before ?? '';
  if (!before) return 'a headline where there was none';
  if (!after) return 'no headline now';
  // A closed spelling that wins a tie is the botanical or the commoner one: round sixty-nine's open-on-tie rule comes after both (round seventy; triage-69 N4).
  if (nameKey(o) === nameKey(after)) return o.toLowerCase() === after.toLowerCase() ? 'capitals (N6)' : words(after) > words(o) ? 'the open spelling on a tie (triage-68 N2)' : words(after) < words(o) ? 'the botanical or commoner spelling on a tie (triage-69 N4)' : 'spelling of the same name (N5, N6)';
  if (N2_NOUNS.has(lastWord(after))) return 'a genus English uses as a noun (triage-68 N2)';
  if (genericNoun(o)) return 'a generic noun set back (N3)';
  if (nameKey(o) === nameKey(sci.split(' ').slice(0, 2).join(' '))) return 'the species\' own binomial set back (N3)';
  if (!/[\s-]/.test(o.trim()) && !v.some((x) => x.lang === 'eng' && typeof x.name === 'string' && namesOf(x.name).length === 1 && nameKey(x.name) === nameKey(o))) return 'one word given only in a list (N7)';
  const flagged = v.some((x) => x.preferred && x.lang === 'eng' && typeof x.name === 'string' && namesOf(x.name).some((n) => nameKey(n) === nameKey(o)));
  if (flagged && englishNames(v.map((x) => ({ ...x, preferred: false })), scope).common === after) return 'more sources over a preferred flag (N3)';
  return 'sources pooled across spellings (N5)';
}
export function auditDossiers(index: Array<AuditEntry & { key: number }>, dossierOf: (key: number) => AuditDossier | null, sampleSize = 40): DossierAudit {
  const genera = generaOf(index.map((e) => e.name));
  const causes: Record<string, number> = {};
  const changes: string[] = [];
  const flags: Record<string, { n: number; sample: string[] }> = {};
  let shownChanged = 0, olderNames = 0, olderSpecies = 0, species = 0, spellingNames = 0, spellingSpecies = 0;
  const spellingSample: string[] = [];
  for (const e of index) {
    const d = dossierOf(e.key);
    if (!d) continue;
    species++;
    const v = d.name.vernacular ?? [];
    const scope = { genus: e.name, genera };
    const r = englishNames(v, scope);
    if (r.common !== e.common) {
      const c = causeOf(e.common, r.common, e.name, v, scope);
      causes[c] = (causes[c] ?? 0) + 1;
      changes.push(`${e.name}: "${e.common ?? '(none)'}" -> "${r.common ?? '(none)'}" (${c})`);
    }
    const four = (x: { common?: string; commons?: string[] }) => [x.common, ...(x.commons ?? [])].slice(0, 4).join('; ');
    if (four(r) !== four(e)) shownChanged++;
    for (const n of [r.common, ...(r.commons ?? [])]) {
      if (!n) continue;
      const alone = v.some((x) => x.lang === 'eng' && typeof x.name === 'string' && namesOf(x.name).length === 1 && nameKey(x.name) === nameKey(n));
      for (const f of nameFlags(n, alone)) {
        const x = (flags[f] ??= { n: 0, sample: [] });
        x.n++;
        if (x.sample.length < 12) x.sample.push(`${e.name}: "${n}"`);
      }
    }
    const { older } = olderNamesOf(d.name.scientific, d.name.synonyms ?? []);
    if (older.length) { olderSpecies++; olderNames += older.length; }
    const sp = indexNames(v, scope).spellings ?? [];
    if (sp.length) { spellingSpecies++; spellingNames += sp.length; if (spellingSample.length < 12) spellingSample.push(`${e.name}: ${sp.map((x) => `"${x}"`).join(', ')}`); }
  }
  return { species, changed: changes.length, causes, shownChanged, older: { names: olderNames, species: olderSpecies }, spellings: { names: spellingNames, species: spellingSpecies, sample: spellingSample }, flags, sample: spread(changes, sampleSize) };
}

/**
 * The arguments, in any order: the source (the first argument that is neither a flag nor the value of `--sample` or
 * `--before`), `--sample N` or `--sample=N`, `--before <index>` or `--before=<index>`, and `--json` (round sixty-two;
 * the corpus review, 10h: "--sample 40 index.json" read "40" as the source).
 */
export function auditArgs(args: string[]): { src?: string; sample: number; json: boolean; before?: string; dossiers?: string } {
  let src: string | undefined, sample = 40, before: string | undefined, dossiers: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const eq = /^--sample=(.*)$/.exec(a);
    if (eq) { sample = Number(eq[1]) || 40; continue; }
    if (a === '--sample') { sample = Number(args[i + 1]) || 40; i++; continue; }
    const be = /^--before=(.*)$/.exec(a);
    if (be) { before = be[1] || undefined; continue; }
    if (a === '--before') { before = args[i + 1]; i++; continue; }
    const ds = /^--dossiers=(.*)$/.exec(a);
    if (ds) { dossiers = ds[1] || undefined; continue; }
    if (a === '--dossiers') { dossiers = args[i + 1]; i++; continue; }
    if (a.startsWith('--')) continue;
    src ??= a;
  }
  return { src, sample, json: args.includes('--json'), ...(before ? { before } : {}), ...(dossiers ? { dossiers } : {}) };
}

async function main(): Promise<void> {
  const { src, sample: n, json, before, dossiers } = auditArgs(process.argv.slice(2));
  if (dossiers) {
    const idx = JSON.parse(readFileSync(`${dossiers}/index.json`, 'utf8')) as Array<AuditEntry & { key: number }>;
    const a = auditDossiers(idx, (key) => { const p = `${dossiers}/${key}.json`; return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as AuditDossier) : null; }, n);
    if (json) { console.log(JSON.stringify(a, null, 1)); return; }
    console.log(`${a.species} species; the rules of this checkout change ${a.changed} headlines and the names under ${a.shownChanged} titles.`);
    for (const [c, k] of Object.entries(a.causes).sort((x, y) => y[1] - x[1])) console.log(`  ${k}  ${c}`);
    console.log(`The search reads ${a.older.names} older names beyond the six shown, of ${a.older.species} species.`);
    console.log(`The search reads ${a.spellings.names} pooled spellings never shown, of ${a.spellings.species} species: ${a.spellings.sample.join('; ')}`);
    for (const [f, x] of Object.entries(a.flags)) console.log(`${x.n} shown names flagged ${f} (shown as the source wrote them): ${x.sample.join('; ')}`);
    console.log(`A sample of ${a.sample.length}, before -> after:`);
    for (const s of a.sample) console.log(`  ${s}`);
    return;
  }
  if (!src) {
    console.error('usage: npx tsx scripts/audit-common-names.ts <index.json | URL> [--before <index.json | URL>] [--sample 40] [--json], or --dossiers <static/s/v2>');
    process.exit(2);
  }
  const read = async (from: string) => JSON.parse(/^https?:/.test(from) ? await (await fetch(from)).text() : readFileSync(from, 'utf8')) as AuditEntry[];
  if (before) {
    const [was, now] = [await read(before), await read(src)];
    const d = diffCommonNames(was, now, n);
    // Photographs dropped to none, or a climate turned refused: the run fails, and the index is not uploaded (round sixty-seven; triage-66 N4).
    const lost = indexDrops(was as Array<AuditEntry & { key: number }>, now as Array<AuditEntry & { key: number }>);
    if (lost.length) process.exitCode = 1;
    if (json) { console.log(JSON.stringify({ ...d, lost }, null, 1)); return; }
    console.log(`${d.species} species in both indexes; ${d.changed} show another common name.`);
    console.log(`A sample of ${d.sample.length}, before -> after:`);
    for (const s of d.sample) console.log(`  ${s}`);
    if (lost.length) console.error(`\n${lost.length} species lost what the index before had; do not upload until each is understood:\n${lost.map((x) => `  ${x}`).join('\n')}`);
    return;
  }
  const a = auditCommonNames(await read(src), n);
  if (json) { console.log(JSON.stringify(a, null, 1)); return; }
  console.log(`${a.species} species, ${a.withCommon} with a common name; the rule changes ${a.changed} (${a.split} a list split into its names, ${a.bare} a bare genus word after a longer name, ${a.setBack} set back, ${a.spellingOnly} spelling only, ${a.bySources} by sources).`);
  console.log(`A sample of ${a.sample.length}, before -> after:`);
  for (const s of a.sample) console.log(`  ${s}`);
}

if (process.argv[1]?.endsWith('audit-common-names.ts')) void main();

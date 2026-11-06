/**
 * The GBIF keys whose records the list's species without a GBIF key read (round seventy-nine; the owner's decision on agent
 * K's offer, 2026-10-20). A species Kew accepts for which GBIF's backbone gives no one key (the list's lines whose last
 * column is "-") is never matched to GBIF by its name. But GBIF holds most of them as a synonym of another species (1,758
 * of 2,327), under a usage of their own name and author, and files the records identified by that name under that usage's
 * key. Round seventy-three's rule (`src/lib/dossier/extra-keys.ts`) reads Kew's synonymy, not GBIF's: a usage is this
 * plant's when its name and author is one Kew's file holds as this plant and of its entry's own type (the entry itself,
 * an orthographic variant filed under it, a name filed under it that Kew marks homotypic, or an autonym of one), and is
 * not another reference page's, nor filed by GBIF under one. Each key so taken is the page's, with Kew's reading of it;
 * each refused is listed with why.
 *
 * The keys go into every GBIF download request (`npm run bulk -- gbif-count | gbif-sql | gbif-media | gbif`), since the
 * download comes before the build, and the build reads their records into these pages (the map, the marker, the habitat
 * climate, the record counts): the page stays keyed by Kew's id, with no GBIF key of its own.
 *
 *   npx tsx scripts/kew-extra-keys.ts --bulk bulk --backbone bulk/backbone/simple.txt.gz [--list scripts/species-list.txt]
 *
 * Offline: Kew's `wcvp_names.csv` in the bulk folder and GBIF's backbone export (466 MB, read twice, a few minutes). Writes
 * `scripts/extra-keys-kew.txt` (committed; the download and the build read it), `extra-keys-kew-refused.txt`, and (round
 * eighty) `scripts/extra-keys-kew-none.txt` (committed; the build and `--fill kew-why` read it): why each page that reads no
 * key reads none, for its page to say.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { listExtraKeys } from './extra-keys-list';
import { formatExtraKeys, formatNoKeys, parseMerges, type NoKeyLine } from '../src/lib/dossier/extra-keys';
import { parseSpeciesList } from './select-species-lib';

export const KEW_EXTRA_KEYS = 'scripts/extra-keys-kew.txt';
/** Round eighty (R): why each page that reads no key reads none, for its page to say (the build and `--fill kew-why` read it). */
export const KEW_NO_KEYS = 'scripts/extra-keys-kew-none.txt';

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const bulk = arg('--bulk'), backbone = arg('--backbone'), listFile = arg('--list') ?? 'scripts/species-list.txt';
if (!bulk || !backbone) { console.error('usage: npx tsx scripts/kew-extra-keys.ts --bulk <dir with wcvp_names.csv> --backbone <simple.txt.gz> [--list scripts/species-list.txt]'); process.exit(2); }

const list = parseSpeciesList(readFileSync(listFile, 'utf8'));
const keyless = list.filter((e) => e.gbifKey == null && e.kewId);
const reference = new Set(list.flatMap((e) => (e.gbifKey != null ? [e.gbifKey] : [])));
console.log(`${listFile}: ${keyless.length} species without a GBIF key; the reference's ${reference.size} GBIF keys are the other pages`);
const infra = args.includes('--infra-from-holder');
const r = await listExtraKeys({ bulk, backbone, pages: keyless.map((e) => ({ key: null, id: e.pageId, name: { scientific: e.name, kew: { entry: e.kewId! } } })), merges: parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8')), reference, infraFromHolder: infra });
if (!r) { console.error(`no backbone export at ${backbone}`); process.exit(2); }
/*
 * `--infra-from-holder` (round eighty-six; review D's D6, the owner to decide on the count): the keys a variety or subspecies
 * GBIF files under another page's key would give a page without a GBIF key, when Kew's synonymy places it in that page's
 * plant (`extraKeysFor`'s `infraFromHolder`). Written alone to `extra-keys-infra.txt` in the project folder, each said with
 * the page that would leave its records out; nothing else is written. The build reads them only when told
 * (`--infra-keys extra-keys-infra.txt`), first with `--dry-run`.
 */
if (infra) {
  const out = arg('--out') ?? 'extra-keys-infra.txt';
  const taken = r.keys.filter((k) => k.from !== undefined);
  const byKeyName = new Map(list.flatMap((e) => (e.gbifKey != null ? [[e.gbifKey, `${e.name}${e.kewId ? ` (k${e.kewId})` : ''}`] as const] : [])));
  const nameOf = new Map(list.map((e) => [e.pageId, e.name] as const));
  writeFileSync(out, formatExtraKeys(taken, [
    "Round eighty-six (review D's D6): the keys of varieties and subspecies GBIF files under another page's key that Kew's synonymy places in a page without a GBIF key (scripts/kew-extra-keys.ts --infra-from-holder). Read by the build only with --infra-keys <this file>; the page named in the last but one column leaves their records out.",
    `Made ${new Date().toISOString().slice(0, 10)} from ${listFile} and GBIF's backbone export (${backbone.replace(/^.*[\\/]/, '')}): ${taken.length} keys on ${new Set(taken.map((k) => k.pageId)).size} pages.`,
    "page id, key, GBIF's name, GBIF's status, Kew's row, Kew's reading, how, -, the keys under it not read (or -), the page key GBIF files it under, the keys under it read with it (or -)"
  ]));
  for (const k of taken) console.log(`  ${nameOf.get((k.pageId ?? '') as never) ?? k.pageId} [${k.pageId}] would read GBIF's key ${k.key}, ${k.label} (Kew: ${k.kewLabel})${k.with?.length ? `, with ${k.with.length} key${k.with.length === 1 ? '' : 's'} under it` : ''}${k.except?.length ? `, not ${k.except.length} under it (${k.except.join(', ')})` : ''}; ${byKeyName.get(k.from!) ?? `the page of key ${k.from}`} would leave them out`);
  console.log(`  ${taken.length} keys on ${new Set(taken.map((k) => k.pageId)).size} pages → ${out}; nothing else written. Next: --keys <those pages and the pages named> --offline --grid climate --bulk bulk --infra-keys ${out} --dry-run`);
  process.exit(0);
}
const pages = new Set(r.keys.map((k) => k.pageId));
const day = /wcvp_names\.csv of (\d{4}-\d{2}-\d{2})/.exec(readFileSync(listFile, 'utf8'))?.[1] ?? 'a day not known';
writeFileSync(KEW_EXTRA_KEYS, formatExtraKeys(r.keys, [
  "The GBIF keys whose records the species list's species without a GBIF key read (round seventy-nine; the owner's decision on K's offer, 2026-10-20). scripts/kew-extra-keys.ts says the rule: round seventy-three's (src/lib/dossier/extra-keys.ts), Kew's synonymy read, never a name matched.",
  `Made ${new Date().toISOString().slice(0, 10)} by scripts/kew-extra-keys.ts from ${listFile} (Kew's file of ${day}) and GBIF's backbone export (${backbone.replace(/^.*[\\/]/, '')}): ${r.keys.length} keys on ${pages.size} of the ${keyless.length} pages without a GBIF key.`,
  "page id, key, GBIF's name, GBIF's status, Kew's row (plant_name_id), Kew's reading, how, - , the keys under it not read (or -)"
]));
// Round eighty (R): the pages that read no key, each with why, the pages GBIF files their names under named as the list names them.
const byKey = new Map(list.flatMap((e) => (e.gbifKey != null ? [[e.gbifKey, e] as const] : [])));
const none: NoKeyLine[] = r.none.map((x) => (x.under ? { ...x, under: x.under.map((h) => { const e = byKey.get(h.key); return { ...h, ...(e ? { name: `${e.name}${e.author ? ` ${e.author}` : ''}`, kew: !!e.kewId } : {}) }; }) } : x));
const kinds = new Map<string, number>();
for (const x of none) kinds.set(x.kind, (kinds.get(x.kind) ?? 0) + 1);
const kindWords = [...kinds].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(', ');
writeFileSync(KEW_NO_KEYS, formatNoKeys(none, [
  "Why each of the species list's species without a GBIF key that reads no key (scripts/extra-keys-kew.txt) reads none (round eighty, R): what GBIF's backbone holds of the names Kew's file gives it, by the same rule (noKeyFor, src/lib/dossier/extra-keys.ts). The build and --fill kew-why write it into the page (occurrences.unread), which says it.",
  `Made ${new Date().toISOString().slice(0, 10)} by scripts/kew-extra-keys.ts from ${listFile} (Kew's file of ${day}) and GBIF's backbone export (${backbone.replace(/^.*[\\/]/, '')}): ${none.length} pages, ${kindWords}.`,
  "page id, why (lumped: GBIF files the names under another page of the reference; other-type; pro-parte; other-author; none: no usage of any name; other), and as JSON: Kew's names counted, GBIF's names of the usages, the pages GBIF files them under (key, the names, the page's name, whether Kew accepts it)"
]));
writeFileSync('extra-keys-kew-refused.txt', r.refused.map((x) => `${x.pageId ?? x.page}\t${x.key}\t${x.label}\t${x.why}`).join('\n') + '\n');
const refusedPages = new Set(r.refused.map((x) => x.pageId).filter((x) => !pages.has(x)));
console.log(`  ${none.length} pages that read no key, ${kindWords} → ${KEW_NO_KEYS}`);
console.log(`  ${r.keys.length} keys on ${pages.size} pages → ${KEW_EXTRA_KEYS}; ${r.refused.length} keys refused (${refusedPages.size} pages with only refused keys) → extra-keys-kew-refused.txt; ${keyless.length - pages.size} pages read no key`);

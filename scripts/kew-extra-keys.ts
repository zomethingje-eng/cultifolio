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
 * `scripts/extra-keys-kew.txt` (committed; the download and the build read it) and `extra-keys-kew-refused.txt`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { listExtraKeys } from './extra-keys-list';
import { formatExtraKeys, parseMerges } from '../src/lib/dossier/extra-keys';
import { parseSpeciesList } from './select-species-lib';

export const KEW_EXTRA_KEYS = 'scripts/extra-keys-kew.txt';

const args = process.argv.slice(2);
const arg = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const bulk = arg('--bulk'), backbone = arg('--backbone'), listFile = arg('--list') ?? 'scripts/species-list.txt';
if (!bulk || !backbone) { console.error('usage: npx tsx scripts/kew-extra-keys.ts --bulk <dir with wcvp_names.csv> --backbone <simple.txt.gz> [--list scripts/species-list.txt]'); process.exit(2); }

const list = parseSpeciesList(readFileSync(listFile, 'utf8'));
const keyless = list.filter((e) => e.gbifKey == null && e.kewId);
const reference = new Set(list.flatMap((e) => (e.gbifKey != null ? [e.gbifKey] : [])));
console.log(`${listFile}: ${keyless.length} species without a GBIF key; the reference's ${reference.size} GBIF keys are the other pages`);
const r = await listExtraKeys({ bulk, backbone, pages: keyless.map((e) => ({ key: null, id: e.pageId, name: { scientific: e.name, kew: { entry: e.kewId! } } })), merges: parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8')), reference });
if (!r) { console.error(`no backbone export at ${backbone}`); process.exit(2); }
const pages = new Set(r.keys.map((k) => k.pageId));
const day = /wcvp_names\.csv of (\d{4}-\d{2}-\d{2})/.exec(readFileSync(listFile, 'utf8'))?.[1] ?? 'a day not known';
writeFileSync(KEW_EXTRA_KEYS, formatExtraKeys(r.keys, [
  "The GBIF keys whose records the species list's species without a GBIF key read (round seventy-nine; the owner's decision on K's offer, 2026-10-20). scripts/kew-extra-keys.ts says the rule: round seventy-three's (src/lib/dossier/extra-keys.ts), Kew's synonymy read, never a name matched.",
  `Made ${new Date().toISOString().slice(0, 10)} by scripts/kew-extra-keys.ts from ${listFile} (Kew's file of ${day}) and GBIF's backbone export (${backbone.replace(/^.*[\\/]/, '')}): ${r.keys.length} keys on ${pages.size} of the ${keyless.length} pages without a GBIF key.`,
  "page id, key, GBIF's name, GBIF's status, Kew's row (plant_name_id), Kew's reading, how, - , the keys under it not read (or -)"
]));
writeFileSync('extra-keys-kew-refused.txt', r.refused.map((x) => `${x.pageId ?? x.page}\t${x.key}\t${x.label}\t${x.why}`).join('\n') + '\n');
const refusedPages = new Set(r.refused.map((x) => x.pageId).filter((x) => !pages.has(x)));
console.log(`  ${r.keys.length} keys on ${pages.size} pages → ${KEW_EXTRA_KEYS}; ${r.refused.length} keys refused (${refusedPages.size} pages with only refused keys) → extra-keys-kew-refused.txt; ${keyless.length - pages.size} pages read no key`);

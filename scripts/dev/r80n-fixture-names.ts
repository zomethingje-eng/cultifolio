/**
 * Round eighty (N): gives the fixture page without a GBIF key (k457911, Hesperocyparis lusitanica) English names from
 * Wikidata, made by the round's own rule (`wikidataNames`) from two statements written for the test, and its index entry
 * the names the index builder gives them (`indexNames`). Run again after a merge that took another copy of either file:
 *
 *   npx tsx scripts/dev/r80n-fixture-names.ts
 *
 * The statements are made for the test: the live item, Q50843040, held no English name on 2026-10-21, so a live build
 * gives the page none (`wikidata.names` "none"). "Mexican cypress" is stated in USDA PLANTS (Q19636200); "Cedar of Goa"
 * has no reference. A second run changes nothing.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { wikidataNames, wdNamesRecord, fromWikidata, WD_NAMES, type WdNameStatement } from '../../src/lib/dossier/wikidata-names';
import { indexNames } from '../../src/lib/dossier/index-entry';

const DOSSIER = 'fixtures/dossiers/s/v3/k457911.json';
const INDEX = 'fixtures/dossiers/index.json';
export const FIXTURE_STATEMENTS: WdNameStatement[] = [
  { name: 'Mexican cypress', lang: 'en', rank: 'normal', refs: ['stated in Q19636200'] },
  { name: 'Cedar of Goa', lang: 'en', rank: 'normal', refs: [] }
];
const AT = '2026-10-21T09:00:00.000Z';

const d = JSON.parse(readFileSync(DOSSIER, 'utf8'));
const r = wikidataNames(FIXTURE_STATEMENTS, { scientific: d.name.scientific, synonyms: d.name.synonyms });
d.name.vernacular = [...d.name.vernacular.filter((v: { source?: string }) => !fromWikidata(v)), ...r.rows];
d.upstream[WD_NAMES] = wdNamesRecord(d.ids.wikidata, r, AT);
writeFileSync(DOSSIER, JSON.stringify(d));

const index = JSON.parse(readFileSync(INDEX, 'utf8')) as Array<Record<string, unknown>>;
const i = index.findIndex((e) => e.key === d.key);
const { common, commons, spellings, ...rest } = index[i] as Record<string, unknown>;
void common; void commons; void spellings;
const names = indexNames(d.name.vernacular, { genus: d.name.scientific.split(' ')[0] });
// The order the index builder writes: the names after the family.
const entry: Record<string, unknown> = {};
for (const [k, v] of Object.entries(rest)) {
  entry[k] = v;
  if (k === 'family') Object.assign(entry, names);
}
index[i] = entry;
writeFileSync(INDEX, JSON.stringify(index, null, 1)); // no line break at the end, as the file has none
console.log(`${DOSSIER}: ${r.rows.map((v) => v.name).join(', ')}; index: ${JSON.stringify(names)}`);

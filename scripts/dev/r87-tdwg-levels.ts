/**
 * Round eighty-seven (C1): the TDWG hierarchy the browse pages read (src/lib/browse/tdwg-levels.json), written from
 * TDWG's own tables and the repository's shapes file. Reads only the files it is given and writes the one file.
 *
 *   npx tsx scripts/dev/r87-tdwg-levels.ts <dir holding tblLevel1.txt … tblLevel4.txt and tblGazetteer.txt> [out.json]
 *
 * The tables are those of github.com/tdwg/wgsrpd, "109-488-1-ED/2nd Edition/" (Brummitt 2001, World Geographical Scheme
 * for Recording Plant Distributions, ed. 2), read on 8 November 2026; they are Latin-1 text, `*`-separated, with a
 * header line. What is written:
 *
 * - `l1`, `l2`, `l3`: every region of levels 1 to 3 with its code, its name and the code of the region above it. The
 *   level-3 names are the ones the index writes (src/lib/dossier/tdwg3.json, Kew's spelling: "Zaïre", "Surinam"); where
 *   TDWG's own table spells a name otherwise ("Zaire", "Suriname"), that spelling is an alias.
 * - `countries`: for each ISO 3166 country that a level-3 region holds part of, by scripts/tdwg3-shapes.json `countries`
 *   (round eighty: Natural Earth's states and provinces placed in TDWG's level-3 regions by TDWG's tables), the regions it
 *   holds whole (`own`: no other country in the region), the regions it shares and is the principal country of (`main`:
 *   more than half of the region's states and provinces in the shapes file's `places` are this country's), and the other
 *   regions it shares (`also`). A country preset ticks `own` and `main`; a country with neither ticks `also` (Croatia is
 *   part of TDWG's Yugoslavia). The names are Unicode CLDR's English names, as Node's Intl.DisplayNames gives them.
 * - `aliases`: other names of level-3 regions, each with its regions and where it is from: `t` TDWG's level-3 table, `4`
 *   a level-4 unit of TDWG's table, `g` TDWG's gazetteer (its names with a level-3 code, and their synonyms), `n` Natural
 *   Earth's states and provinces as the shapes file places them ("Limpopo" is in Northern Provinces). A name that is a
 *   level-3 region's own or a country's is no alias.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const out = process.argv[3] ?? 'src/lib/browse/tdwg-levels.json';
if (!dir) { console.error('usage: r87-tdwg-levels.ts <dir of the TDWG tables> [out.json]'); process.exit(1); }

const table = (name: string): string[][] => readFileSync(join(dir, name), 'latin1').split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => l.split('*').map((x) => x.trim()));
const code = (s: string) => String(Number(s.replace(',', '.'))); // "27,00" → "27"
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\bislands?\b/g, 'is').replace(/[^a-z0-9]+/g, ' ').trim();

const indexNames = JSON.parse(readFileSync('src/lib/dossier/tdwg3.json', 'utf8')) as Array<[string, string, ...number[]]>;
const shapes = JSON.parse(readFileSync('scripts/tdwg3-shapes.json', 'utf8')) as { countries: Record<string, string[]>; places: Record<string, string[]> };
const nameOf = new Map(indexNames.map((r) => [r[0], r[1]]));

const l1 = table('tblLevel1.txt').map(([c, n]) => [code(c), n] as [string, string]);
const l2 = table('tblLevel2.txt').map(([c, n, up]) => [code(c), n, code(up)] as [string, string, string]);
const l3rows = table('tblLevel3.txt');
const l3 = l3rows.map(([c, , up]) => {
  if (!nameOf.has(c)) throw new Error(`level-3 code ${c} of TDWG's table is not in tdwg3.json`);
  return [c, nameOf.get(c)!, code(up)] as [string, string, string];
});
if (l3.length !== indexNames.length) throw new Error(`TDWG's table has ${l3.length} level-3 regions, tdwg3.json ${indexNames.length}`);

const display = new Intl.DisplayNames(['en'], { type: 'region' });
const countries: Record<string, { name: string; own: string[]; main: string[]; also: string[] }> = {};
for (const [r, cs] of Object.entries(shapes.countries)) {
  const places = shapes.places[r] ?? [];
  for (const c of cs) {
    const x = (countries[c] ??= { name: display.of(c) ?? c, own: [], main: [], also: [] });
    if (cs.length === 1) x.own.push(r);
    else if (places.length && places.filter((p) => p.endsWith(`|${c}`)).length * 2 > places.length) x.main.push(r);
    else x.also.push(r);
  }
}
for (const x of Object.values(countries)) for (const k of ['own', 'main', 'also'] as const) x[k].sort();

const own = new Set([...l3.map((r) => fold(r[1])), ...Object.values(countries).map((c) => fold(c.name))]);
const aliases = new Map<string, { name: string; regions: Set<string>; from: Set<string> }>();
const alias = (name: string, region: string, from: string) => {
  const n = name.replace(/\s+/g, ' ').trim();
  if (!n || /\d/.test(n) || /^region\b/i.test(n) || own.has(fold(n)) || !nameOf.has(region)) return;
  const k = fold(n);
  const a = aliases.get(k) ?? { name: n, regions: new Set<string>(), from: new Set<string>() };
  a.regions.add(region); a.from.add(from);
  aliases.set(k, a);
};
for (const [c, n] of l3rows) alias(n, c, 't');
for (const [, n, c] of table('tblLevel4.txt')) alias(n, c, '4');
for (const row of table('tblGazetteer.txt')) {
  const [, n, , , c, , , , , syn] = row;
  if (!c) continue;
  alias(n, c, 'g');
  for (const s of (syn ?? '').split(';')) alias(s, c, 'g');
}
for (const [r, ps] of Object.entries(shapes.places)) for (const p of ps) alias(p.split('|')[0], r, 'n');

const json = {
  source: "TDWG, World Geographical Scheme for Recording Plant Distributions, 2nd edition (Brummitt 2001): tblLevel1.txt to tblLevel4.txt and tblGazetteer.txt of github.com/tdwg/wgsrpd, 109-488-1-ED/2nd Edition, read 8 November 2026. Level-3 names as Kew's checklist writes them (src/lib/dossier/tdwg3.json).",
  countriesSource: "ISO 3166 countries of each level-3 region from scripts/tdwg3-shapes.json (Natural Earth 1:10m states and provinces, public domain, placed in TDWG's level-3 regions by TDWG's tables; round eighty). A region is a country's own when no other country is in it, its main one when more than half of the region's states and provinces are the country's. Names: Unicode CLDR English, by Intl.DisplayNames.",
  aliasesSource: "t: TDWG's level-3 table's spelling; 4: a TDWG level-4 unit; g: TDWG's gazetteer, its names with a level-3 code and their synonyms; n: Natural Earth's states and provinces as scripts/tdwg3-shapes.json places them.",
  l1, l2, l3,
  countries: Object.fromEntries(Object.entries(countries).sort(([a], [b]) => a.localeCompare(b))),
  aliases: [...aliases.values()].sort((a, b) => a.name.localeCompare(b.name)).map((a) => [a.name, [...a.regions].sort(), [...a.from].sort().join('')])
};
writeFileSync(out, JSON.stringify(json) + '\n');
console.log(`${out}: ${l1.length} level-1, ${l2.length} level-2 and ${l3.length} level-3 regions; ${Object.keys(countries).length} countries; ${aliases.size} aliases`);

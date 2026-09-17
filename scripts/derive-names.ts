/**
 * Derive a large names list from evidence of what people actually grow.
 *
 *   npx tsx scripts/derive-names.ts --target 5000 --out names-5000.txt
 *
 * Two signals, merged:
 *   1. iNaturalist "captive/cultivated" observation counts per species, the
 *      broadest measure there is of what is in cultivation across every kind
 *      of grower, worldwide. The top of that list is the head of the
 *      distribution the corpus should cover.
 *   2. Every accepted species of the specialist genera in
 *      scripts/specialist-genera.txt (from the GBIF backbone), because a
 *      Namaqualand bulb will never out-observe a pothos and a reference for
 *      collectors has to be complete where collectors are.
 *
 * Excluded: families in scripts/excluded-families.txt (grasses, cereals,
 * brassicas, timber and the like, which are cultivated but not what this app
 * is for). Names are the backbone's accepted canonical names, so the corpus
 * build spends no time on synonyms. Writes the list, plus a CSV of what was
 * kept and why, so the pruning is a conversation and not a mystery.
 *
 * Runs on your PC (network). Results are cached in bulk/derive/ so a rerun
 * with a different --target is instant.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { makeFetcher } from '../src/lib/dossier/fetch';
import { mergeLists, type Candidate } from './derive-names-lib';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const target = Number(arg('--target', '5000'));
const out = arg('--out', 'names-derived.txt');
const CACHE = 'bulk/derive';
mkdirSync(CACHE, { recursive: true });
const f = makeFetcher();

const readList = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []);

/** iNaturalist: cultivated species counts under Plantae, paged. per_page × page is capped at 10,000 by iNat, which is the head we want. */
async function inatCultivated(): Promise<Candidate[]> {
  const cache = `${CACHE}/inat-cultivated.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const out: Candidate[] = [];
  for (let page = 1; page <= 20; page++) {
    const r = await f<{ results: Array<{ count: number; taxon: { id: number; name: string; rank: string; ancestor_ids: number[]; iconic_taxon_name?: string } }> }>(
      `https://api.inaturalist.org/v1/observations/species_counts?captive=true&taxon_id=47126&rank=species&quality_grade=research,needs_id&per_page=500&page=${page}`
    );
    if (r.status !== 'ok') {
      console.log(`  iNat page ${page}: ${r.status}${'detail' in r ? ' ' + r.detail : ''}; stopping here`);
      break;
    }
    if (!r.data.results.length) break;
    for (const x of r.data.results) if (x.taxon.rank === 'species') out.push({ name: x.taxon.name, why: 'inat', count: x.count, inatId: x.taxon.id });
    process.stdout.write(`\r  iNat: ${out.length} species…   `);
  }
  console.log();
  writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

/** GBIF backbone: every accepted species in a genus. */
async function genusSpecies(genus: string): Promise<Candidate[]> {
  const cache = `${CACHE}/genus-${genus}.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const m = await f<{ usageKey?: number; rank?: string; matchType?: string; canonicalName?: string; family?: string }>(`https://api.gbif.org/v1/species/match?rank=GENUS&name=${encodeURIComponent(genus)}`);
  if (m.status !== 'ok' || !m.data.usageKey || m.data.rank !== 'GENUS') {
    console.log(`  ${genus}: not a genus in the backbone (${m.status === 'ok' ? m.data.matchType : m.status})`);
    return [];
  }
  const out: Candidate[] = [];
  for (let offset = 0; offset < 5000; offset += 500) {
    const r = await f<{ results: Array<{ key: number; canonicalName?: string; family?: string; taxonomicStatus?: string }>; endOfRecords: boolean }>(
      `https://api.gbif.org/v1/species/search?highertaxonKey=${m.data.usageKey}&rank=SPECIES&status=ACCEPTED&datasetKey=d7dddbf4-2cf0-4f39-9b2a-bb099caae36c&limit=500&offset=${offset}`
    );
    if (r.status !== 'ok') break;
    for (const x of r.data.results) if (x.canonicalName && x.canonicalName.startsWith(genus + ' ')) out.push({ name: x.canonicalName, why: 'genus', family: x.family, gbifKey: x.key });
    if (r.data.endOfRecords) break;
  }
  writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

/** Family and accepted name for the iNat names come from a GBIF match; cached, since 10,000 matches is ~40 minutes at the polite rate. */
const matchCache = `${CACHE}/match.json`;
const matches: Record<string, { key: number | null; name?: string; family?: string }> = existsSync(matchCache) ? JSON.parse(readFileSync(matchCache, 'utf8')) : {};
async function resolve(c: Candidate): Promise<Candidate> {
  if (!(c.name in matches)) {
    const m = await f<{ usageKey?: number; acceptedUsageKey?: number; matchType?: string; canonicalName?: string; family?: string }>(`https://api.gbif.org/v1/species/match?strict=false&name=${encodeURIComponent(c.name)}`);
    matches[c.name] = m.status === 'ok' && m.data.usageKey && m.data.matchType !== 'NONE' && m.data.matchType !== 'HIGHERRANK' ? { key: m.data.acceptedUsageKey ?? m.data.usageKey, name: m.data.canonicalName, family: m.data.family } : { key: null };
    if (Object.keys(matches).length % 200 === 0) writeFileSync(matchCache, JSON.stringify(matches));
  }
  const t = matches[c.name];
  return { ...c, gbifKey: t.key ?? undefined, accepted: t.name, family: t.family };
}

async function main() {
  const genera = readList('scripts/specialist-genera.txt');
  const excludedFamilies = new Set(readList('scripts/excluded-families.txt').map((x) => x.toLowerCase()));
  console.log(`Target ${target}. ${genera.length} specialist genera, ${excludedFamilies.size} excluded families.`);

  console.log('iNaturalist cultivated counts…');
  const inat = await inatCultivated();
  console.log(`  ${inat.length} species with cultivated observations`);

  console.log('Specialist genera from the backbone…');
  const fromGenera: Candidate[] = [];
  for (const g of genera) {
    const sp = await genusSpecies(g);
    fromGenera.push(...sp);
    process.stdout.write(`\r  ${g}: ${sp.length}      `);
  }
  console.log(`\n  ${fromGenera.length} species in specialist genera`);

  console.log('Resolving iNat names against the backbone (cached)…');
  const resolved: Candidate[] = [];
  for (let i = 0; i < inat.length; i++) {
    resolved.push(await resolve(inat[i]));
    if (i % 100 === 0) process.stdout.write(`\r  ${i}/${inat.length}   `);
  }
  writeFileSync(matchCache, JSON.stringify(matches));
  console.log();

  const { list, report } = mergeLists(resolved, fromGenera, { target, excludedFamilies });
  writeFileSync(out, `# ${list.length} names derived ${new Date().toISOString().slice(0, 10)}: top cultivated species on iNaturalist plus every species of ${genera.length} specialist genera. See ${out}.csv for why each is here.\n` + list.join('\n') + '\n');
  writeFileSync(`${out}.csv`, 'name,family,why,cultivated_observations\n' + report.map((r) => `${r.name},${r.family ?? ''},${r.why},${r.count ?? ''}`).join('\n') + '\n');
  const byWhy = report.reduce<Record<string, number>>((m, r) => ((m[r.why] = (m[r.why] ?? 0) + 1), m), {});
  console.log(`${list.length} names → ${out} (${Object.entries(byWhy).map(([k, v]) => `${v} ${k}`).join(', ')}); ${out}.csv says why.`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

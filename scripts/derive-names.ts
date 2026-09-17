/**
 * Derive a large names list from evidence of what people actually grow.
 *
 *   npx tsx scripts/derive-names.ts --inat 2500 --out names.txt
 *
 * Two signals, merged:
 *   1. iNaturalist "captive/cultivated" observation counts per species, the
 *      broadest measure there is of what is in cultivation across every kind
 *      of grower, worldwide. The top of that list is the head of the
 *      distribution the corpus should cover.
 *   2. Every accepted species of the specialist genera in
 *      scripts/specialist-genera.txt (from WCVP, so run `npm run bulk -- wcvp` first), because a
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
 * with a different --inat is instant.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { makeFetcher } from '../src/lib/dossier/fetch';
import { mergeLists, indexWcvp, type Candidate, type WcvpLookup } from './derive-names-lib';

const args = process.argv.slice(2);
const arg = (k: string, d: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const inatShare = Number(arg('--inat', '2500'));
const out = arg('--out', 'names-derived.txt');
const CACHE = 'bulk/derive';
mkdirSync(CACHE, { recursive: true });
const f = makeFetcher();

const readList = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')) : []);

/**
 * iNaturalist: cultivated species counts under Plantae, paged. per_page × page
 * is capped at 10,000 by iNat, which is the head we want. No quality_grade
 * filter: captive observations are always "casual" on iNat, so asking for
 * research grade returns nothing. Hybrids (Hibiscus × rosa-sinensis is the
 * single most-observed cultivated plant) are counted and left out, since a
 * hybrid has no native range to build a page from.
 */
async function inatCultivated(): Promise<Candidate[]> {
  const cache = `${CACHE}/inat-cultivated.json`;
  if (existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, 'utf8')) as Candidate[];
    if (c.length) return c;
  }
  const out: Candidate[] = [];
  let hybrids = 0, infra = 0;
  for (let page = 1; page <= 20; page++) {
    const r = await f<{ total_results: number; results: Array<{ count: number; taxon: { id: number; name: string; rank: string } }> }>(
      `https://api.inaturalist.org/v1/observations/species_counts?captive=true&taxon_id=47126&per_page=500&page=${page}`
    );
    if (r.status !== 'ok') {
      console.log(`  iNat page ${page}: ${r.status}${'detail' in r ? ' ' + r.detail : ''}; stopping here`);
      break;
    }
    if (!r.data.results.length) break;
    for (const x of r.data.results) {
      if (x.taxon.rank === 'species') out.push({ name: x.taxon.name, why: 'inat', count: x.count, inatId: x.taxon.id });
      else if (x.taxon.rank === 'hybrid' || /×/.test(x.taxon.name)) hybrids++;
      else infra++;
    }
    process.stdout.write(`\r  iNat: ${out.length} species (${hybrids} hybrids and ${infra} below species left out) of ${r.data.total_results} taxa…   `);
  }
  console.log();
  if (out.length) writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

/** Lines of a large file without holding an array of them. */
function* fileLines(p: string): Generator<string> {
  const text = readFileSync(p, 'utf8');
  let at = 0;
  while (at < text.length) {
    let nl = text.indexOf('\n', at);
    if (nl < 0) nl = text.length;
    const line = text[nl - 1] === '\r' ? text.slice(at, nl - 1) : text.slice(at, nl);
    at = nl + 1;
    yield line;
  }
}

/** WCVP (bulk/wcvp_names.csv; `npm run bulk -- wcvp`): the specialist genera, and a resolver for every name Kew knows. */
function loadWcvp(genera: string[]): WcvpLookup {
  const p = 'bulk/wcvp_names.csv';
  if (!existsSync(p)) throw new Error(`${p} is missing. Run \`npm run bulk -- wcvp\` first; names are resolved against Kew's checklist.`);
  const w = indexWcvp(fileLines(p), new Set(genera));
  const got = new Set(w.genera.map((c) => c.name.split(' ')[0]));
  for (const g of genera) if (!got.has(g)) console.log(`  ${g}: no accepted species in WCVP (misspelt, or sunk into another genus?)`);
  return w;
}

/**
 * Family and accepted name for the iNat names: WCVP first (no network), the
 * GBIF backbone for the few names Kew does not carry; those matches are cached.
 */
const matchCache = `${CACHE}/match.json`;
const matches: Record<string, { key: number | null; name?: string; family?: string }> = existsSync(matchCache) ? JSON.parse(readFileSync(matchCache, 'utf8')) : {};
let viaWcvp = 0, viaGbif = 0;
async function resolve(c: Candidate, w: WcvpLookup): Promise<Candidate> {
  const k = w.resolve(c.name);
  if (k) {
    viaWcvp++;
    return { ...c, accepted: k.accepted, family: k.family };
  }
  if (!(c.name in matches)) {
    const m = await f<{ usageKey?: number; acceptedUsageKey?: number; matchType?: string; canonicalName?: string; family?: string }>(`https://api.gbif.org/v1/species/match?strict=false&name=${encodeURIComponent(c.name)}`);
    matches[c.name] = m.status === 'ok' && m.data.usageKey && m.data.matchType !== 'NONE' && m.data.matchType !== 'HIGHERRANK' ? { key: m.data.acceptedUsageKey ?? m.data.usageKey, name: m.data.canonicalName, family: m.data.family } : { key: null };
    if (Object.keys(matches).length % 200 === 0) writeFileSync(matchCache, JSON.stringify(matches));
  }
  viaGbif++;
  const t = matches[c.name];
  return { ...c, gbifKey: t.key ?? undefined, accepted: t.name, family: t.family };
}

async function main() {
  const genera = readList('scripts/specialist-genera.txt');
  const excludedFamilies = new Set(readList('scripts/excluded-families.txt').map((x) => x.toLowerCase()));
  console.log(`${genera.length} specialist genera (whole) plus the ${inatShare} most-cultivated species on iNaturalist; ${excludedFamilies.size} excluded families.`);

  console.log('Reading WCVP…');
  const w = loadWcvp(genera);
  const fromGenera = w.genera;
  console.log(`  ${w.names} names; ${fromGenera.length} accepted species in ${new Set(fromGenera.map((c) => c.name.split(' ')[0])).size} specialist genera`);

  console.log('iNaturalist cultivated counts…');
  const inat = await inatCultivated();
  console.log(`  ${inat.length} species with cultivated observations`);


  console.log('Resolving iNat names (WCVP, then the GBIF backbone for the rest)…');
  const resolved: Candidate[] = [];
  for (let i = 0; i < inat.length; i++) {
    resolved.push(await resolve(inat[i], w));
    if (i % 100 === 0) process.stdout.write(`\r  ${i}/${inat.length}   `);
  }
  writeFileSync(matchCache, JSON.stringify(matches));
  console.log(`\r  ${viaWcvp} by WCVP, ${viaGbif} by the backbone      `);

  const { list, report } = mergeLists(resolved, fromGenera, { inat: inatShare, excludedFamilies });
  writeFileSync(out, `# ${list.length} names derived ${new Date().toISOString().slice(0, 10)}: the ${inatShare} most-cultivated species on iNaturalist plus every accepted species of ${genera.length} specialist genera (WCVP). See ${out}.csv for why each is here.\n` + list.join('\n') + '\n');
  writeFileSync(`${out}.csv`, 'name,family,why,cultivated_observations\n' + report.map((r) => `${r.name},${r.family ?? ''},${r.why},${r.count ?? ''}`).join('\n') + '\n');
  const byWhy = report.reduce<Record<string, number>>((m, r) => ((m[r.why] = (m[r.why] ?? 0) + 1), m), {});
  console.log(`${list.length} names → ${out} (${Object.entries(byWhy).map(([k, v]) => `${v} ${k}`).join(', ')}); ${out}.csv says why.`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

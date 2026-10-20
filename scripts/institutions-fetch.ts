/**
 * The places where a plant record is a planted plant or a specimen filed at its keeper's address (round seventy-nine,
 * Q): botanic gardens and arboreta, herbaria and zoos, each with its coordinates, from Wikidata, whose data are CC0
 * (https://www.wikidata.org/wiki/Wikidata:Licensing). Writes scripts/institutions.txt, which the build reads
 * (src/lib/dossier/clean.ts): a record within the radius there of one of these places is left out of the range map,
 * the marker and the habitat climate, and counted.
 *
 *   npx tsx scripts/institutions-fetch.ts [--out scripts/institutions.txt]
 *
 * Asks Wikidata's query service three times, two seconds apart, with the project's USER_AGENT: items that are an
 * instance of botanical garden (Q167346, arboretum Q272231 is one of its subclasses), herbarium (Q181916) or zoo
 * (Q43501), or of any of their subclasses, or that carry an Index Herbariorum code (P5858) or a BGCI garden id (P5818);
 * each with every coordinate location (P625) it states. Nothing is matched by name. The file is committed, so the build
 * asks nothing; run this again to refresh it, and the build reads the new file.
 */
import { USER_AGENT } from '../src/lib/dossier/fetch';
import { writeAtomic } from './write-atomic';
import { INSTITUTION_KINDS, type InstitutionKind } from '../src/lib/dossier/clean';

const WDQS = 'https://query.wikidata.org/sparql';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One query a kind: its classes (and their subclasses), and the identifier properties that name an item of the kind. */
const QUERIES: Record<InstitutionKind, { classes: string[]; props: string[] }> = {
  'botanic garden': { classes: ['Q167346'], props: ['P5818'] },
  herbarium: { classes: ['Q181916'], props: ['P5858'] },
  zoo: { classes: ['Q43501'], props: [] }
};

export function queryFor(kind: InstitutionKind): string {
  const { classes, props } = QUERIES[kind];
  const arms = [...classes.map((c) => `{ ?i wdt:P31/wdt:P279* wd:${c} . }`), ...props.map((p) => `{ ?i wdt:${p} [] . }`)];
  return `SELECT DISTINCT ?i ?c WHERE { ${arms.join(' UNION ')} ?i wdt:P625 ?c . }`;
}

/** "Point(lon lat)" as Wikidata writes a coordinate on Earth; anything else (another globe's, a malformed one) is null. */
export function pointOf(wkt: string): [number, number] | null {
  const m = /^Point\(\s*(-?\d+(?:\.\d+)?(?:[eE]-?\d+)?)\s+(-?\d+(?:\.\d+)?(?:[eE]-?\d+)?)\s*\)$/.exec(wkt.trim());
  if (!m) return null;
  const lon = Number(m[1]), lat = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat, lon] : null;
}

async function ask(q: string): Promise<Array<{ i: { value: string }; c: { value: string; datatype?: string } }>> {
  let last = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${WDQS}?format=json&query=${encodeURIComponent(q)}`, { headers: { 'user-agent': USER_AGENT, accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(300_000) });
      if (res.ok) return ((await res.json()) as { results: { bindings: Array<{ i: { value: string }; c: { value: string } }> } }).results.bindings;
      last = `HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) break;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(15_000 * (attempt + 1));
  }
  throw new Error(`Wikidata's query service: ${last}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'scripts/institutions.txt';
  const rows = new Map<string, string>();
  const counts: string[] = [];
  for (const kind of INSTITUTION_KINDS) {
    const got = await ask(queryFor(kind));
    let n = 0;
    for (const b of got) {
      // A coordinate on another globe carries its globe's IRI before the point; only Earth's are bare.
      const p = pointOf(b.c.value);
      if (!p) continue;
      const id = b.i.value.replace(/^.*\/entity\//, '');
      const line = `${id}\t${kind}\t${p[0].toFixed(5)}\t${p[1].toFixed(5)}`;
      if (!rows.has(line)) n++;
      rows.set(line, line);
    }
    counts.push(`${n} ${kind}`);
    console.log(`  ${kind}: ${got.length} answers, ${n} places`);
    await sleep(2000);
  }
  const day = new Date().toISOString().slice(0, 10);
  const header = [
    `# Botanic gardens, herbaria and zoos with their coordinates: a plant record within the radius of one is a planted plant or a specimen placed at its keeper (src/lib/dossier/clean.ts). Written by scripts/institutions-fetch.ts on ${day}; run it again to refresh.`,
    `# Source: Wikidata (CC0, https://www.wikidata.org/wiki/Wikidata:Licensing), its query service on ${day}: items of botanical garden (Q167346), herbarium (Q181916) or zoo (Q43501) or a subclass, or with an Index Herbariorum code (P5858) or BGCI garden id (P5818), each with its coordinate locations (P625).`,
    `# ${counts.join(', ')}; ${rows.size} lines.`,
    '# item\tkind\tlatitude\tlongitude'
  ];
  writeAtomic(out, [...header, ...[...rows.values()].sort()].join('\n') + '\n');
  console.log(`  ${rows.size} places written to ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('institutions-fetch.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

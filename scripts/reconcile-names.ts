/**
 * Names the backbone refused, tried again under the other spellings WCVP
 * knows them by.
 *
 *   npm run reconcile -- bulk/report-rederive-2026-09-18.txt
 *   npm run reconcile -- static/s/v2/report.txt --out names-reconciled.txt
 *
 * A build refuses a name when GBIF's backbone offers only the genus for it
 * or nothing at all. Kew and GBIF do not always spell a species the same
 * way, or agree which name is the accepted one, so for each refused name
 * this reads WCVP (bulk/wcvp_names.csv) for its accepted name and every
 * species-rank synonym, and asks the backbone about each in turn. The first
 * spelling the backbone places at species rank gives the species the
 * backbone accepts for it, and that name goes into the output list with a
 * comment saying which WCVP name it stands for (a name the backbone holds as
 * a synonym would make an empty page: no records, range or photographs are
 * indexed under it; an accepted subspecies is taken up to its species). The
 * line carries the backbone key as well as the name, because the match
 * endpoint refuses a name with homonyms as ambiguous (Iris orientalis). A
 * species already in the corpus is reported, not listed again. The build
 * then runs on that list as usual:
 *
 *   npm run dossier -- names-reconciled.txt --grid climate --bulk bulk --skip inat,openalex
 *
 * The dossier that results carries the backbone's name, as every dossier
 * does; the WCVP name is among its synonyms. Nothing is invented: a name
 * with no spelling the backbone accepts stays refused, and the report says so.
 */
import { DOSSIER_V } from '../src/lib/dossier/schema';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { makeFetcher } from '../src/lib/dossier/fetch';
import { matchName, species } from '../src/lib/dossier/sources/gbif';
import { refusedNames, spellingsOf, candidates } from './reconcile-names-lib';

const args = process.argv.slice(2);
const reportPath = args.find((a) => !a.startsWith('--'));
const opt = (name: string, dflt: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const out = opt('out', 'names-reconciled.txt');
if (!reportPath || !existsSync(reportPath)) {
  console.error('usage: npm run reconcile -- <build report.txt> [--out names-reconciled.txt]');
  process.exit(2);
}
const wcvpPath = 'bulk/wcvp_names.csv';
if (!existsSync(wcvpPath)) {
  console.error(`${wcvpPath} is missing. Run \`npm run bulk -- wcvp\` first.`);
  process.exit(2);
}

function* fileLines(p: string): Generator<string> {
  const text = readFileSync(p, 'utf8');
  let at = 0;
  while (at < text.length) {
    let nl = text.indexOf('\n', at);
    if (nl < 0) nl = text.length;
    yield text[nl - 1] === '\r' ? text.slice(at, nl - 1) : text.slice(at, nl);
    at = nl + 1;
  }
}

async function main() {
  const refused = refusedNames(readFileSync(reportPath!, 'utf8'));
  console.log(`${refused.length} names refused in ${reportPath}`);
  if (!refused.length) return;
  console.log('Reading WCVP for their other spellings…');
  const spellings = spellingsOf(fileLines(wcvpPath), refused.map((r) => r.name));
  const f = makeFetcher();
  const lines: string[] = [`# Names the backbone refused under their WCVP spelling, offered under a spelling it accepts. ${new Date().toISOString().slice(0, 10)}.`];
  let found = 0, none = 0, unknown = 0, already = 0, refusedByHost = 0;
  // What the corpus already has, so a synonym that resolves to a species on disk is reported, not rebuilt.
  const idxPath = `static/s/v${DOSSIER_V}/index.json`;
  const onDisk = new Set<string>(existsSync(idxPath) ? (JSON.parse(readFileSync(idxPath, 'utf8')) as Array<{ key: number; name: string }>).flatMap((r) => [r.name.toLowerCase(), String(r.key)]) : []);
  const listed = new Set<number>(); // keys already written this run, so four synonyms of one species make one line
  for (const { name, reason } of refused) {
    const s = spellings.get(name)!;
    if (s.unknown) {
      unknown++;
      console.log(`  ${name}: not in WCVP (${reason})`);
      continue;
    }
    const tries = candidates(name, s);
    let hit: { key: number; name: string } | null = null;
    for (const t of tries) {
      const m = await matchName(f, t);
      if (m.status === 'refused' || m.status === 'error') {
        console.log(`  ${name}: backbone ${m.status} (${m.detail}); stopping here, run again later`);
        refusedByHost++;
        break;
      }
      if (m.status !== 'ok') continue;
      const got = (m.data.canonicalName ?? m.data.scientificName ?? '').toLowerCase();
      const epithet = t.split(' ')[1]?.toLowerCase();
      if (m.data.matchType === 'HIGHERRANK' || !/^species$/i.test(m.data.rank ?? '') || !epithet || !got.includes(epithet)) continue;
      // The backbone placed the spelling. What goes in the list is the species the backbone accepts for it:
      // a page under a name it holds as a synonym would have no records, no range and no photographs. An
      // accepted subspecies or variety is taken up to its species. The key goes in the list with the name,
      // because a name with homonyms (Iris orientalis) is refused by the match endpoint as ambiguous.
      if (/synonym/i.test(m.data.status ?? '') && m.data.acceptedUsageKey) {
        let a = await species(f, m.data.acceptedUsageKey);
        if (a.status === 'ok' && !/^species$/i.test(a.data.rank ?? '') && a.data.speciesKey) a = await species(f, a.data.speciesKey);
        if (a.status === 'refused' || a.status === 'error') {
          console.log(`  ${name}: backbone ${a.status} (${a.detail}); stopping here, run again later`);
          refusedByHost++;
          break;
        }
        if (a.status === 'ok' && /^species$/i.test(a.data.rank ?? '')) hit = { key: a.data.key, name: a.data.canonicalName ?? a.data.scientificName };
      } else hit = { key: m.data.acceptedUsageKey ?? m.data.usageKey, name: m.data.canonicalName ?? t };
      if (hit) break;
    }
    if (refusedByHost) break;
    if (hit && (onDisk.has(hit.name.toLowerCase()) || onDisk.has(String(hit.key)) || listed.has(hit.key))) {
      already++;
      console.log(`  ${name} → ${hit.name}, already in the corpus${listed.has(hit.key) ? ' list' : ''}`);
    } else if (hit) {
      found++;
      listed.add(hit.key);
      lines.push(`# for WCVP: ${name}${s.accepted !== name ? ` (Kew's accepted name: ${s.accepted})` : ''}`, `${hit.key} ${hit.name}`);
      console.log(`  ${name} → ${hit.name} [${hit.key}]`);
    } else {
      none++;
      console.log(`  ${name}: none of ${tries.length} other spelling${tries.length === 1 ? '' : 's'} placed at species rank${tries.length ? ` (tried ${tries.slice(0, 4).join(', ')}${tries.length > 4 ? ', …' : ''})` : ''}`);
    }
  }
  writeFileSync(out, lines.join('\n') + '\n');
  console.log(`\n${found} found another spelling → ${out}; ${already} resolve to a species already in the corpus; ${none} have none the backbone places; ${unknown} not in WCVP${refusedByHost ? '; stopped early, the backbone refused' : ''}.`);
  if (found) console.log(`Next: npm run dossier -- ${out} --grid climate --bulk bulk --skip inat,openalex`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

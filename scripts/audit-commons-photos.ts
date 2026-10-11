/**
 * What the read now leaves out of the corpus's Commons photographs, and which leads change, with no request and no
 * change to any file (round sixty-nine; triage-68 K1-K3, K5). The owner runs it before and after the deploy to check
 * the rules against his corpus:
 *   npx tsx scripts/audit-commons-photos.ts [dir]      # dir defaults to static/s/v2
 * It prints one line per Commons file not shown, with its reason, then the counts.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { commonsKind, leadOf } from '../src/lib/dossier/photo-kind';
import { readCommonsPhoto } from '../src/lib/dossier/photo-credit';
import { isGif } from '../src/lib/dossier/dedupe';
import { DOSSIER_V } from '../src/lib/dossier/schema';

type P = { src?: string; id: string; url: string; captive?: boolean; licence: string; attribution: string };
type D = { key: number; name: { scientific: string; synonyms?: string[] }; photos: P[] };

const dir = process.argv[2] ?? `static/s/v${DOSSIER_V}`;
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
const reasons = new Map<string, number>();
let commons = 0, hidden = 0, pd = 0, leads = 0;
for (const f of files) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as D;
  const names = { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [] };
  for (const p of d.photos ?? []) {
    if (p.src !== 'commons') continue;
    commons++;
    const read = readCommonsPhoto(p);
    const why = commonsKind(p.id, names) ?? (read ? null : 'no licence or author the rules read');
    if (read?.licence === 'pd' && p.licence === 'cc0') pd++;
    if (!why) continue;
    hidden++;
    const k = why.startsWith('filed under') ? 'filed under a category' : why;
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
    console.log(`${d.key}\t${d.name.scientific}\t${why}\t${p.id}`);
  }
  // The lead as the base chose it (the first photograph not flagged cultivated), against the rules now.
  const wild = (d.photos ?? []).filter((p) => !p.captive);
  const before = wild.find((p) => !isGif(p.url)) ?? (d.photos ?? []).find((p) => !isGif(p.url)) ?? wild[0] ?? d.photos?.[0];
  if (before?.id !== leadOf(d.photos ?? [], names)?.id) leads++;
}
console.log(`\n${hidden} of ${commons} Commons photographs not shown, across ${files.length} dossiers; ${leads} leads change (by K1 and K5); ${pd} read as public domain, not CC0`);
for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${why}`);

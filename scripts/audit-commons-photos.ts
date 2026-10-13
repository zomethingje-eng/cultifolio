/**
 * What the read now leaves out of the corpus's Commons photographs, and which leads change, with no request and no
 * change to any file (round sixty-nine; triage-68 K1-K3, K5). The owner runs it before and after the deploy to check
 * the rules against his corpus:
 *   npx tsx scripts/audit-commons-photos.ts [dir]      # dir defaults to static/s/v2
 * It prints one line per Commons file not shown, with its reason, then the counts. Since round seventy (REVIEW-TRIAGE-69
 * C1, C2) it reads the rules as the Worker does: with the reference's names from the index beside the dossiers (so an
 * uploader's slip is the species' only where the index holds no such name), and with each file's categories where the
 * build or `--fill commons-kind` kept them. It says how many files have no categories kept yet.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { commonsKind, leadOf, heldNamesOf, type HeldSource } from '../src/lib/dossier/photo-kind';
import { readCommonsPhoto } from '../src/lib/dossier/photo-credit';
import { isGif } from '../src/lib/dossier/dedupe';
import { DOSSIER_V } from '../src/lib/dossier/schema';

type P = { src?: string; id: string; url: string; thumb: string; captive?: boolean; licence: string; attribution: string; categories?: string[]; struck?: boolean };
type D = { key: number; name: { scientific: string; synonyms?: string[] }; photos: P[] };

const dir = process.argv[2] ?? `static/s/v${DOSSIER_V}`;
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)) : [];
// The reference's names, as the Worker reads them: the index written beside the dossiers. Without it no slip is read as the species'.
const index = existsSync(`${dir}/index.json`) ? (JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')) as HeldSource[]) : null;
const held = index ? heldNamesOf(index) : null;
if (!held) console.log(`no ${dir}/index.json: read without the reference's names, so no uploader's slip is read as the species'`);
const reasons = new Map<string, number>();
let commons = 0, hidden = 0, pd = 0, leads = 0, uncategorised = 0;
for (const f of files) {
  const d = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as D;
  const names = { scientific: d.name.scientific, synonyms: d.name.synonyms ?? [], key: d.key, held };
  for (const p of d.photos ?? []) {
    if (p.src !== 'commons') continue;
    commons++;
    if (!Array.isArray(p.categories)) uncategorised++;
    const read = readCommonsPhoto(p);
    const why = commonsKind(p.id, names, { categories: p.categories, struck: p.struck }) ?? (read ? null : 'no licence or author the rules read');
    if (read?.licence === 'pd' && p.licence === 'cc0') pd++;
    if (!why) continue;
    hidden++;
    const k = why.startsWith('filed under "') ? 'filed under a category' : why;
    reasons.set(k, (reasons.get(k) ?? 0) + 1);
    console.log(`${d.key}\t${d.name.scientific}\t${why}\t${p.id}`);
  }
  // The lead as the base chose it (the first photograph not flagged cultivated), against the rules now.
  const wild = (d.photos ?? []).filter((p) => !p.captive);
  const before = wild.find((p) => !isGif(p.url)) ?? (d.photos ?? []).find((p) => !isGif(p.url)) ?? wild[0] ?? d.photos?.[0];
  if (before?.id !== leadOf(d.photos ?? [], names)?.id) leads++;
}
console.log(`\n${hidden} of ${commons} Commons photographs not shown, across ${files.length} dossiers; ${leads} leads change (by K1 and K5); ${pd} read as public domain, not CC0`);
if (uncategorised) console.log(`${uncategorised} of the ${commons} have no categories kept: run --fill commons-kind, and the category rules read them too`);
for (const [why, n] of [...reasons].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${why}`);

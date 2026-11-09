/**
 * Round eighty-seven (the plan's B17; outside review B: 337 of 1,563 stored older-name strings not matched to a direct
 * checklist synonym): every page's shown older names sorted into kinds against Kew's names for its plant
 * (`src/lib/dossier/older-kinds.ts` says each kind). A report: reads the dossiers, changes none, and writes one file of the
 * names of kind `other`.
 *
 *   npx tsx scripts/dev/r87-older-kinds.ts [static/s/v3] [older-kinds-other.txt]
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { olderKinds, olderKindsLine } from '../../src/lib/dossier/older-kinds';

const dir = process.argv[2] ?? 'static/s/v3';
const out = process.argv[3] ?? 'older-kinds-other.txt';
const FILE = /^[kg]\d+\.json$/;
let unreadable = 0;
function* pages() {
  for (const f of readdirSync(dir)) {
    if (!FILE.test(f)) continue;
    try { yield JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { unreadable++; }
  }
}
const r = olderKinds(pages());
writeFileSync(out, r.others.join('\n') + (r.others.length ? '\n' : ''));
console.log(`${olderKindsLine(r)}; the ${r.others.length} of kind other, one a line → ${out}${unreadable ? `; ${unreadable} file${unreadable === 1 ? '' : 's'} not read` : ''}`);

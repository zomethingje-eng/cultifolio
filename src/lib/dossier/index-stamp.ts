/**
 * The index's stamp (round eighty-one, the owner's queued item "no index rebuild after a fill run that changed nothing";
 * review B's step 12 that repeats the index the fill's last run had just written). `--index`, and the index every fill
 * writes at its end, read every dossier and write the index, its products and the manifest: about 12 minutes at the full
 * list's 48,361 pages, written again on a day whose run stopped at once at the day's allowance, and again by the plan's
 * own `--index` after the fill's last run, which had just written it.
 *
 * Now each index written leaves a stamp, `cache/index-stamp.json` (never under static/, so never uploaded): a fingerprint
 * of what the index is made from, namely every dossier and genus record on disk by its name, size and time, the index and
 * the manifest as written, and the builder's code and data files (`src/lib/`, the files at the top of `scripts/`,
 * `package-lock.json`) by their content. An index asked for when the fingerprint is the stamp's is not written again: the
 * same code over the same files writes the same index. Any change at all (a dossier written, a file of the code changed by
 * a delivery, the manifest replaced) writes it as before, so a fix applied at index time still reaches the index. Deleting
 * the stamp writes the next index whatever. Rule 6: the stamp changes no page.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const INDEX_STAMP = 'cache/index-stamp.json';
const DOSSIER = /^[kg][1-9][0-9]*\.json$/;

/** Every file under a folder, sorted, as paths relative to `root`. */
function filesUnder(root: string, dir: string, keep: (name: string) => boolean, deep: boolean): string[] {
  const at = join(root, dir);
  if (!existsSync(at)) return [];
  const out: string[] = [];
  for (const e of readdirSync(at, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (deep) out.push(...filesUnder(root, rel, keep, deep)); }
    else if (e.isFile() && keep(e.name)) out.push(rel);
  }
  return out;
}

/**
 * What the index of `corpus` (e.g. `static/s/v3`) is made from, as one hash: the corpus's dossiers, genus records, index
 * and manifest by name, size and modification time (a dossier rewritten is a new time), and the code by content.
 */
export function indexFingerprint(root: string, corpus: string, code = root): string {
  const h = createHash('sha1');
  const dir = join(root, corpus);
  const corpusFiles = existsSync(dir) ? readdirSync(dir).filter((f) => DOSSIER.test(f) || f === 'index.json' || f === 'manifest.json').sort() : [];
  for (const f of [...corpusFiles.map((x) => `${corpus}/${x}`), ...filesUnder(root, `${corpus}/g`, (n) => n.endsWith('.json'), false)]) {
    const s = statSync(join(root, f));
    h.update(`${f}\t${s.size}\t${s.mtimeMs}\n`);
  }
  // The code by content, from the builder's own checkout (`code`), which is the project folder on the owner's PC.
  const files = [...filesUnder(code, 'src/lib', () => true, true), ...filesUnder(code, 'scripts', (n) => /\.(?:ts|mjs|js|json|txt)$/.test(n), false), ...(existsSync(join(code, 'package-lock.json')) ? ['package-lock.json'] : [])];
  for (const f of files) h.update(`${f}\t`).update(readFileSync(join(code, f))).update('\n');
  return h.digest('hex');
}

export interface IndexStamp { fingerprint: string; corpus: string; species: number; at: string }

/** The stamp left by the last index written, if it is whole. */
export function readStamp(root: string): IndexStamp | null {
  try {
    const s = JSON.parse(readFileSync(join(root, INDEX_STAMP), 'utf8')) as IndexStamp;
    return typeof s?.fingerprint === 'string' && typeof s.species === 'number' ? s : null;
  } catch { return null; }
}

/** Written whole, then renamed. A stamp not written only means the next index is written again. */
export function writeStamp(root: string, corpus: string, species: number, code = root, at = new Date().toISOString()): void {
  try {
    mkdirSync(join(root, 'cache'), { recursive: true });
    const p = join(root, INDEX_STAMP);
    writeFileSync(`${p}.tmp`, JSON.stringify({ fingerprint: indexFingerprint(root, corpus, code), corpus, species, at } satisfies IndexStamp));
    renameSync(`${p}.tmp`, p);
  } catch { /* not kept: the next index is written whatever */ }
}

/** The stamp, when the index on disk is the one the code and the files on disk would write now; else null. */
export function upToDate(root: string, corpus: string, code = root): IndexStamp | null {
  const s = readStamp(root);
  if (!s || s.corpus !== corpus || !existsSync(join(root, corpus, 'index.json')) || !existsSync(join(root, corpus, 'manifest.json'))) return null;
  return s.fingerprint === indexFingerprint(root, corpus, code) ? s : null;
}

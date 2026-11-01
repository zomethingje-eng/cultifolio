/**
 * The product files under `p/`, written whole and checked whole (round eighty-five; outside review A19 and A24's third).
 *
 * Every product is stored under the MD5 of its content (`src/lib/dossier/manifest.ts`), and `--index` kept a file whose
 * name was already on disk without reading it. Its write was a plain `writeFileSync`, so an `--index` stopped mid-write
 * (Ctrl-C, a crash, a power cut) left a file cut off under its own name, which every later `--index` kept, and
 * `--index-ready` passed: its stamp covers the dossiers, the index, the manifest and the code, not `p/`. The upload then
 * published it, and the Worker read a file that does not parse.
 *
 * Now:
 * - a product is written through `writeAtomic` (whole, or not at all), and a file already under its name is kept only
 *   when its size is the content's: a file cut off is shorter, and is written again;
 * - `--index-ready` reads every file the manifest names, and the search's key files its directories name, and passes
 *   only when each is there and is the content its name says (its MD5).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { writeAtomic, type AtomicFs } from './write-atomic';
import { corpusHashes, isManifest, type Manifest } from '../src/lib/dossier/manifest';

/** Writes `body` at `path` unless the file there is already whole; true when it wrote. */
export function writeProduct(path: string, body: string, fs?: AtomicFs): boolean {
  if (existsSync(path) && statSync(path).size === Buffer.byteLength(body, 'utf8')) return false;
  writeAtomic(path, body, fs);
  return true;
}

export interface ProductCheck {
  /** Files read and found whole. */
  whole: number;
  /** Files missing or not the content their name says, with why: at most the first 20, and how many in all. */
  bad: Array<{ file: string; why: string }>;
  badCount: number;
  /** Why no check could be made at all (no manifest, or one this build cannot read), or null. */
  none: string | null;
}

/**
 * Every product the corpus at `corpusDir` (`static/s/v3`) needs, read and hashed: those its manifest names, and the
 * search's key files their directories name. The manifest itself and the dossiers are the stamp's (`index-stamp.ts`).
 */
export function checkProducts(corpusDir: string): ProductCheck {
  const out: ProductCheck = { whole: 0, bad: [], badCount: 0, none: null };
  let m: Manifest | null = null;
  try {
    const raw = JSON.parse(readFileSync(`${corpusDir}/manifest.json`, 'utf8')) as unknown;
    m = isManifest(raw) ? raw : null;
    if (!m) out.none = `${corpusDir}/manifest.json is not a manifest this build reads`;
  } catch (e) {
    out.none = `${corpusDir}/manifest.json could not be read (${e instanceof Error ? e.message : String(e)})`;
  }
  if (!m) return out;
  const fileOf = (hash: string) => `${corpusDir}/p/${hash}.json`;
  const read = (hash: string): Buffer | null => { try { return readFileSync(fileOf(hash)); } catch { return null; /* missing: counted as bad below */ } };
  const bad = (file: string, why: string) => { out.badCount++; if (out.bad.length < 20) out.bad.push({ file, why }); };
  // The search's directories first, read as text to list the key files they name; a directory cut off is bad itself.
  const { hashes, missing } = corpusHashes(m, (h) => { const b = read(h); return b ? b.toString('utf8') : null; });
  const said = new Set(missing.map((name) => m!.files[name]));
  for (const name of missing) bad(`${name} (${m.files[name]})`, 'a search directory that is missing or does not parse');
  for (const h of hashes) {
    if (said.has(h)) continue;
    const b = read(h);
    if (!b) { bad(fileOf(h), 'missing'); continue; }
    const got = createHash('md5').update(b).digest('hex');
    if (got !== h) bad(fileOf(h), `its content's MD5 is ${got} (${b.length} bytes): cut off or changed`);
    else out.whole++;
  }
  return out;
}

/** The sentence `--index-ready` ends with when a product is not whole. */
export function productsSentence(c: ProductCheck): string {
  if (c.none) return `the products could not be checked: ${c.none}. Run npm run dossier -- --index first, then the upload again`;
  const list = c.bad.map((b) => `  ${b.file}: ${b.why}`).join('\n');
  return `${c.badCount} product file${c.badCount === 1 ? ' is' : 's are'} not the content ${c.badCount === 1 ? 'its name says' : 'their names say'} (a run of --index stopped while writing, most likely):\n${list}${c.badCount > c.bad.length ? `\n  … and ${c.badCount - c.bad.length} more` : ''}\nRun npm run dossier -- --index, which writes a file cut off again, then the upload again. A file the same size as its content but not it is not written again: delete it first.`;
}

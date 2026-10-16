/**
 * A file written whole or not at all (round seventy-two; REVIEW-TRIAGE-71 D3): the text goes to a temporary file beside
 * it, which is then renamed over it, so a run stopped by Ctrl-C, a crash or a power cut leaves the file as it was or as
 * it is now, never cut off. A dossier cut off mid-write was skipped by the scan and left out of the index without a word.
 * On Windows a reader that holds the file for a moment (an antivirus, the search indexer, an editor) can refuse the
 * rename: it is tried again a few times before the error is thrown, and the temporary file is removed.
 * Every writer of a dossier, the index or the manifest in the corpus script goes through it; a module that writes
 * dossiers itself should too.
 */
import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

export type AtomicFs = { writeFileSync: (p: string, s: string) => void; renameSync: (a: string, b: string) => void; unlinkSync: (p: string) => void };
const nodeFs: AtomicFs = { writeFileSync: (p, s) => writeFileSync(p, s), renameSync, unlinkSync };
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The temporary file's name: never a `<key>.json`, so no scan reads it, and the upload leaves `*.tmp` out. */
export const tmpOf = (path: string) => `${path}.${process.pid}.tmp`;

export function writeAtomic(path: string, text: string, fs: AtomicFs = nodeFs, tries = 6): void {
  const tmp = tmpOf(path);
  try {
    fs.writeFileSync(tmp, text);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* never made */ }
    throw e;
  }
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, path);
      return;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? '';
      if (i < tries - 1 && /^(EPERM|EACCES|EBUSY)$/.test(code)) { pause(50 * (i + 1)); continue; }
      try { fs.unlinkSync(tmp); } catch { /* gone already */ }
      throw e;
    }
  }
}

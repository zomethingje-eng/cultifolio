/**
 * Round eighty-nine: the answers of GBIF's occurrence search kept with the download (`src/lib/dossier/api-answers.ts`), in
 * `<bulk>/api-answers/`: one gzipped file an address (`<sha1 of the address>.json.gz`, holding the address, the day GBIF
 * answered and its answer whole), written whole then renamed, and `for.json`, the download they were kept for.
 *
 * They belong to one download and one list of the species left to the API path: when download.json's key or
 * api-path.txt changes, the answers kept are of another download, and are cleared before any is read (a dry run, which
 * writes nothing, reads none of them instead). `--no-api-answers` asks GBIF whatever is kept.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { AnswerStore } from '../src/lib/dossier/api-answers';

export const ANSWERS_DIR = 'api-answers';

/** The download the answers are for: download.json's key and the md5 of api-path.txt. */
function forWhat(bulk: string): { download: string; apiPath: string } {
  let download = 'none';
  try { download = String((JSON.parse(readFileSync(join(bulk, 'download.json'), 'utf8')) as { key?: string }).key ?? 'none'); } catch { /* no download.json */ }
  const p = join(bulk, 'api-path.txt');
  const apiPath = existsSync(p) ? createHash('md5').update(readFileSync(p)).digest('hex') : 'none';
  return { download, apiPath };
}

const fileOf = (url: string) => `${createHash('sha1').update(url).digest('hex')}.json.gz`;

/**
 * The store for `bulk`, and what it said when opened: answers of another download are cleared (`write`) or passed over
 * (a dry run).
 */
export function answerStore(bulk: string, write: boolean): { store: AnswerStore; note: string } {
  const dir = join(bulk, ANSWERS_DIR);
  const want = forWhat(bulk);
  let had: { download?: string; apiPath?: string } | null = null;
  try { had = JSON.parse(readFileSync(join(dir, 'for.json'), 'utf8')); } catch { had = null; }
  const same = !!had && had.download === want.download && had.apiPath === want.apiPath;
  const count = () => { try { return readdirSync(dir).filter((f) => f.endsWith('.json.gz')).length; } catch { return 0; } };
  let note: string;
  if (same) note = `${count()} answers of GBIF's occurrence search kept for the download ${want.download} (${dir})`;
  else if (!write) note = had ? `the answers in ${dir} are of another download (${had.download}) or another api-path.txt: none read (a dry run clears nothing)` : `no answers of GBIF's occurrence search kept yet in ${dir}`;
  else {
    const n = had ? count() : 0;
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* left: its for.json is replaced below, so none of it is read */ }
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'for.json'), JSON.stringify(want));
    note = had ? `the ${n} answers kept in ${dir} were of another download (${had.download}) or another api-path.txt: cleared; this build keeps the download ${want.download}'s` : `answers of GBIF's occurrence search kept from here on in ${dir}, for the download ${want.download}`;
  }
  const readable = same || write;
  const store: AnswerStore = {
    get(url) {
      if (!readable) return null;
      try {
        const kept = JSON.parse(gunzipSync(readFileSync(join(dir, fileOf(url)))).toString('utf8')) as { url: string; day: string; data: unknown };
        return kept.url === url && typeof kept.day === 'string' ? { day: kept.day, data: kept.data } : null;
      } catch {
        return null;
      }
    },
    set(url, day, data) {
      if (!write) return;
      const to = join(dir, fileOf(url));
      const tmp = `${to}.${process.pid}.tmp`;
      try { writeFileSync(tmp, gzipSync(JSON.stringify({ url, day, data }))); renameSync(tmp, to); } catch { try { rmSync(tmp, { force: true }); } catch { /* left */ } }
    }
  };
  return { store, note };
}

/**
 * The `--names` step of the corpus build (round sixty-two, decision 3; the corpus review, 7; A33; B): GBIF's
 * vernacular names asked afresh for every stored dossier, and only the dossier's vernacular block (with its upstream
 * record) rewritten. The live corpus was rebuilt from dossiers whose names were fetched before round sixty-one, which
 * merged case variants and kept neither GBIF's preferred flag nor a source count, so the common-name rule's steps 3 and 4
 * had nothing to read; a `--rederive` carries the old block, and rebuilding the index alone cannot recover them.
 *
 * Paced by the fetcher (the build's `makeFetcher` keeps its per-host pace and backs off on a 429), and resumable: a
 * dossier whose names this step has fetched carries `NAMES_MARK` in its upstream record and is not asked again, so a run
 * stopped by a refusal is restarted with the same command. A refusal stops the run (the fetch layer has already retried
 * and backed off); an error leaves that dossier as it was, to be asked on the next run. Kept apart from
 * build-dossiers.ts, which runs its build when imported, so a test can drive it against fixtures with no network.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { vernacular } from '../src/lib/dossier/sources/gbif';
import type { JsonFetcher } from '../src/lib/dossier/fetch';

/** The start of the upstream record's detail for names fetched by this step. */
export const NAMES_MARK = 'names fetched';

/**
 * The detail a build writes on its `gbif.vernacular` record (round sixty-two; the verification review's search 17). A
 * build that asked GBIF writes the step's mark with the day, and keeps a "truncated" detail after it; a build that
 * carried the name block (`carried`: the previous record's detail, for an offline re-derivation) keeps the mark the
 * block had and says it was carried. Any other record keeps its detail.
 */
export function vernacularMark(u: { status: string; at: string; detail?: string }, carried: { detail?: string } | null): string | undefined {
  if (carried) return carried.detail?.startsWith(NAMES_MARK) ? `${carried.detail.replace(/; carried by an offline re-derivation.*$/, '')}; carried by an offline re-derivation of ${u.at.slice(0, 10)}` : u.detail;
  if (u.status !== 'ok' && u.status !== 'none') return u.detail;
  return `${NAMES_MARK} ${u.at.slice(0, 10)}${u.detail?.startsWith('truncated') ? `; ${u.detail}` : ''}`;
}

export interface NamesRun {
  /** Dossiers whose names were fetched and written this run. */
  done: number;
  /** Of those, the ones whose list was longer than the pages asked (recorded "truncated" in the dossier). */
  truncated: number;
  /** Dossiers this step had already done (skipped). */
  kept: number;
  /** Dossiers whose request broke (left as they were; asked again next run). */
  errors: number;
  /** Dossiers not reached because GBIF refused; the run stopped there. */
  left: number;
  /** GBIF's refusal, when the run stopped on one. */
  refused?: string;
}

type Stored = { key: number; name: { vernacular: unknown[] }; upstream?: Record<string, { status: string; at: string; detail?: string }> };

export async function refetchNames(dir: string, f: JsonFetcher, opts: { now?: () => Date; progress?: (done: number, of: number) => void } = {}): Promise<NamesRun> {
  const now = opts.now ?? (() => new Date());
  const files = existsSync(dir) ? readdirSync(dir).filter((x) => /^\d+\.json$/.test(x)).sort((a, b) => parseInt(a) - parseInt(b)) : [];
  const run: NamesRun = { done: 0, truncated: 0, kept: 0, errors: 0, left: 0 };
  for (let i = 0; i < files.length; i++) {
    const path = `${dir}/${files[i]}`;
    let d: Stored;
    try {
      d = JSON.parse(readFileSync(path, 'utf8')) as Stored;
    } catch {
      continue; // a half-written file from a killed build: rebuilt when its name comes round
    }
    if (d.upstream?.['gbif.vernacular']?.detail?.startsWith(NAMES_MARK)) { run.kept++; continue; }
    const r = await vernacular(f, d.key);
    if (r.status === 'refused') {
      run.refused = r.detail;
      run.left = files.length - i;
      return run;
    }
    if (r.status === 'error') { run.errors++; continue; }
    const at = now().toISOString();
    const truncated = r.status === 'ok' ? r.truncated : undefined;
    d.name.vernacular = r.status === 'ok' ? r.data : [];
    d.upstream = d.upstream ?? {};
    d.upstream['gbif.vernacular'] = { status: r.status, at, detail: `${NAMES_MARK} ${at.slice(0, 10)}${truncated ? `; truncated: the first ${truncated} rows only` : ''}` };
    writeFileSync(path, JSON.stringify(d));
    run.done++;
    if (truncated) run.truncated++;
    opts.progress?.(run.done + run.kept, files.length);
  }
  return run;
}

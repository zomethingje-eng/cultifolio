/**
 * The pages an offline build could not derive again (round eighty-seven's review, S2 and S3): `--list-offline` writes
 * them to rebuild-offline.txt, for an online `--keys` build, from the dossiers on disk, as `--list-summaries-left` does.
 *
 * Before, the walk wrote rebuild-offline.txt itself, and only when a run finished: a walk killed and resumed lost the pages
 * of its first part, and a page whose range source was not asked but whose build before had no range to carry (no
 * dossier before it, or another key's) was never listed. Now a page is listed when its record says so: a range source
 * (GBIF's records, Kew's distribution) that the build did not ask ("skipped"), or a range, records and climate carried
 * from the build before because this build did not ask one ("this build: wcvp.distribution skipped (not asked: offline:
 * …)"). Each line says which, and the shapes rule its records were tested by when it is not the current one, as
 * `--check-ranges` finds them.
 */
import { carriedParts } from './schema';

/** The rows of the range's one derivation that a build asks a source for (`coreRefused` in the builder). */
const RANGE_SOURCES = ['gbif.occurrences', 'wcvp.distribution'] as const;
const SKIPPED = /\b(?:gbif\.occurrences|wcvp\.distribution) skipped\b/;

export interface OfflinePage {
  key: unknown;
  name: { scientific: string };
  upstream?: Record<string, { status?: string; detail?: string } | undefined>;
  occurrences?: { rangeRule?: string };
}

/** Why a page is to be built online, or null: a range source not asked, carried or not. */
export function offlineWhy(d: OfflinePage, rule: string): string | null {
  const up = d.upstream ?? {};
  let why: string | null = null;
  for (const k of RANGE_SOURCES) {
    const row = up[k];
    const p = carriedParts(row?.detail);
    // Carried as one snapshot: the carrying build's words name the source it did not ask.
    if (p?.now && SKIPPED.test(p.now)) { why = `the range, records and climate of the build of ${/\d{4}-\d{2}-\d{2}/.exec(p.origin)?.[0] ?? '?'} kept: this build: ${p.now}`; break; }
    // Not carried: the row itself says the source was not asked, and the page holds this build's derivation without it.
    if (row?.status === 'skipped' && !p) { why = `${k} not asked${row.detail ? ` (${row.detail})` : ''}; nothing carried`; break; }
  }
  if (!why) return null;
  const tested = d.occurrences?.rangeRule;
  return tested === rule ? why : `${why}; records tested by ${tested ? `shapes rule ${tested}, not ${rule}` : `a rule before ${rule}`}`;
}

/** The lines of rebuild-offline.txt: one "<id> <name>\t<why>" a page, as `--keys` reads it, sorted. */
export function offlinePages(pages: Iterable<OfflinePage>, rule: string): string[] {
  const out: string[] = [];
  for (const d of pages) {
    const why = offlineWhy(d, rule);
    if (why) out.push(`${String(d.key)} ${d.name.scientific}\t${why}`);
  }
  return out.sort();
}

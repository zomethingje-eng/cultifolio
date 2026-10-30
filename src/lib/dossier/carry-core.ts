/**
 * Whether a build carries the previous build's range, records, marker and climate as one snapshot (the builder's rule since
 * round sixty-seven: a source that refused, or that a re-derivation did not ask, leaves the last build's answer standing,
 * never piecemeal).
 *
 * Round eighty-four, G (review D4): never the records of another key. Xanthoceras sorbifolium lost GBIF's key 9479204 in
 * round eighty-one (GBIF files that key under a grass); built again from Kew's file with no key, its records were "not
 * asked" (skipped), and the snapshot of the build before, read under 9479204, was carried, so its page said "not checked"
 * over two points on its map and "3 in-range records". So the snapshot is carried only when the page's GBIF key is the one
 * the snapshot's records were read under, and never to a page that has no key to read records under at all.
 */
type Row = { status?: string } | undefined;
export interface CorePage { v?: number; ids?: { gbif?: number }; upstream?: Record<string, Row> }

export function carriesCore(prev: CorePage, d: CorePage, rederive: boolean): boolean {
  const core = ['gbif.occurrences', 'wcvp.distribution'];
  const st = (p: CorePage, k: string) => p.upstream?.[k]?.status ?? '';
  const notNow = core.filter((k) => ['refused', 'error', 'skipped'].includes(st(d, k)));
  if (!notNow.length) return false;
  const notAsked = notNow.every((k) => st(d, k) === 'skipped');
  const prevOk = core.every((k) => ['ok', 'none'].includes(st(prev, k)));
  const sameKey = (prev.ids?.gbif ?? null) === (d.ids?.gbif ?? null);
  const noKeyToRead = d.ids?.gbif == null && st(d, 'gbif.occurrences') === 'skipped';
  return prevOk && prev.v === d.v && (!rederive || notAsked) && sameKey && !noKeyToRead;
}

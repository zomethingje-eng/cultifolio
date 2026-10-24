/**
 * The rows of a page's record that are not "ok" and give no reason (round eighty-two, F; review 1's 7). Of the reviewer's
 * 565 such rows in 110 pages, most are not faults:
 *   - iNaturalist's rows a build left to the daily fill ("skipped"), which the fill answers;
 *   - a "none" that is the source's answer, said on the page as an absence of that source's: no Wikipedia article, no
 *     Commons file, no GBIF photograph or record, no paper, no iNaturalist taxon or photograph, and no habitat climate where
 *     the climate block says why.
 * What is left is the real remainder: a row the page cannot word, such as Bisnaga hamatacantha's range ("wcvp.distribution"
 * none, with 461 open records and no range) or a Wikidata "none" with no reason. From round eighty-two the build gives both
 * a reason (`gbif.distributions`'s `noKew`, `wikidataSaid`); `--list-no-reason` lists the pages built before, for a
 * rebuild. Pure: the builder gives it the dossiers.
 */
type Row = { status?: string; detail?: string };
export type NoReasonPage = { key: string; name: { scientific: string }; upstream?: Record<string, Row | undefined>; climate?: { status?: string; detail?: string } };

/** The sources whose "none" is an answer the page says as such (see above). */
const NONE_IS_AN_ANSWER = new Set(['wikipedia', 'commons', 'gbif.media', 'gbif.occurrences', 'openalex', 'inat.taxon', 'inat.photos.wild', 'inat.photos.cultivated']);

/** The sources of a page whose row is not "ok", gives no reason, and is not one of the cases above. */
export function rowsWithoutReason(d: NoReasonPage): string[] {
  const out: string[] = [];
  for (const [src, r] of Object.entries(d.upstream ?? {})) {
    if (!r || r.status === 'ok' || (r.detail ?? '').trim()) continue;
    if (src.startsWith('inat.') && r.status === 'skipped') continue;
    if (r.status === 'none' && NONE_IS_AN_ANSWER.has(src)) continue;
    if (src === 'climate' && (d.climate?.detail ?? '').trim()) continue;
    out.push(src);
  }
  return out.sort();
}

/** `rebuild-no-reason.txt`: "<id> <name>\t<sources>" a page, for `--keys`. */
export function noReasonLines(pages: Iterable<NoReasonPage>): { lines: string[]; by: Map<string, number> } {
  const lines: string[] = [];
  const by = new Map<string, number>();
  for (const d of pages) {
    const s = rowsWithoutReason(d);
    if (!s.length) continue;
    for (const x of s) by.set(x, (by.get(x) ?? 0) + 1);
    lines.push(`${d.key} ${d.name.scientific}\t${s.join(', ')}: not ok, and no reason given`);
  }
  return { lines: lines.sort(), by };
}

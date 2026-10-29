/**
 * Round eighty-three (C): the pages to derive again after two rules changed under the October 2026 repair.
 *
 * - The regions' shapes (`tdwg-shapes.ts`, `scripts/dev/r80a-tdwg-shapes.py`): Yugoslavia's shape was Croatia's and
 *   Macedonia's alone (TDWG's tables write YU and SL), Somalia's lacked Somaliland, Sudan's South Sudan, Palestine's the
 *   West Bank and Gaza, Cyprus's the north, and 570 islets were dropped by the simplification. A record there, inside its
 *   region's box, was taken out by the repair. The live dossiers no longer hold it; the corpus as the fill left it does
 *   (`backups/v3-<id>-filled`, tested by the boxes), so a page is listed when a record of that copy lies outside every
 *   native region's shape of the file before and inside one now.
 * - The default points (`default-points.ts`, `readRecords`): a record its dataset places to within 10 km is now kept. A page is listed
 *   when its record of the occurrences says records at a default point were left out (`defaultWords`), whose kind the
 *   dossier does not keep.
 *
 * Pure: the script reads the files.
 */
import type { RegionTester } from './tdwg-shapes';

export type RepairPage = { key: string; name: { scientific: string }; ids?: { gbif?: number }; distribution?: { native?: ReadonlyArray<{ code?: string }> }; occurrences?: { open?: ReadonlyArray<readonly [number, number, ...unknown[]]>; rangeTested?: boolean } };

/** The open records of a page (as the boxes left them) outside every native shape before and inside one now. */
export function shapesRegained(d: RepairPage, before: RegionTester, now: RegionTester): number {
  const codes = (d.distribution?.native ?? []).flatMap((r) => (r.code ? [r.code] : []));
  const open = d.occurrences?.open ?? [];
  if (!codes.length || !open.length || d.occurrences?.rangeTested === false) return 0;
  return open.filter((p) => !codes.some((c) => before.inRegion(p[0], p[1], c)) && codes.some((c) => now.inRegion(p[0], p[1], c))).length;
}

/** How many records the page's record of the occurrences says were left out at a default point (0 when none). */
export function defaultLeftOut(d: { upstream?: Record<string, { detail?: string } | undefined> }): number {
  const m = /(\d+) records? at a dataset's default point left out/.exec(d.upstream?.['gbif.occurrences']?.detail ?? '');
  return m ? Number(m[1]) : 0;
}

/** The regions whose shape differs between two shapes files (by their polygons as written). */
export function changedRegions(before: { shapes: Record<string, unknown> }, now: { shapes: Record<string, unknown> }): Set<string> {
  const codes = new Set([...Object.keys(before.shapes), ...Object.keys(now.shapes)]);
  return new Set([...codes].filter((c) => JSON.stringify(before.shapes[c] ?? null) !== JSON.stringify(now.shapes[c] ?? null)));
}

/**
 * The list: each page of the corpus now (`current`) with its reasons, by its key, or by its GBIF key for a page of the
 * copy whose id has changed since. A line is "key name<TAB>reasons", as `--keys` reads it. Without the copy (`copy`
 * null: the folder was deleted), a page is listed for the shapes when a native region's shape changed (`changed`) and
 * its record counts records outside the range (restricted ones included): more pages than the copy would list.
 */
export function repairList(current: Iterable<RepairPage & { upstream?: Record<string, { detail?: string } | undefined> }>, copy: Iterable<RepairPage> | null, before: RegionTester, now: RegionTester, changed?: ReadonlySet<string>): { lines: string[]; regained: number; defaults: number } {
  const why = new Map<string, { name: string; reasons: string[] }>();
  const byGbif = new Map<number, string>();
  let defaults = 0, regained = 0;
  for (const d of current) {
    why.set(d.key, { name: d.name.scientific, reasons: [] });
    if (d.ids?.gbif != null) byGbif.set(d.ids.gbif, d.key);
    const n = defaultLeftOut(d);
    if (n) { why.get(d.key)!.reasons.push(`${n} record${n === 1 ? '' : 's'} at a default point left out`); defaults++; }
    const out = (d.occurrences as { nOutsideRange?: number } | undefined)?.nOutsideRange ?? 0;
    const hit = copy === null && changed ? (d.distribution?.native ?? []).flatMap((r) => (r.code && changed.has(r.code) ? [r.code] : [])) : [];
    if (hit.length && out) { why.get(d.key)!.reasons.push(`the shape of ${hit.join(', ')} changed and ${out} record${out === 1 ? '' : 's'} lie outside the range`); regained++; }
  }
  for (const d of copy ?? []) {
    const key = why.has(d.key) ? d.key : d.ids?.gbif != null ? byGbif.get(d.ids.gbif) : undefined;
    if (!key) continue; // a page merged or pruned since
    const n = shapesRegained(d, before, now);
    if (n) { why.get(key)!.reasons.push(`${n} open record${n === 1 ? '' : 's'} inside a native region's shape now, outside them before`); regained++; }
  }
  const lines = [...why].filter(([, w]) => w.reasons.length).map(([k, w]) => `${k} ${w.name}\t${w.reasons.join('; ')}`).sort();
  return { lines, regained, defaults };
}

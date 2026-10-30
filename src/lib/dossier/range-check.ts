/**
 * Round eighty-four, G: the whole-corpus walk and the check after it (the owner's decision 2; reviews A1, B1, D2, D6).
 *
 * Two selective repairs missed pages: round eighty-two's listed only pages with an open record outside the shapes, round
 * eighty-three's only regained shapes and default points, and a page whose climate came from restricted records outside
 * its native regions (Aloe vera's in Fujairah, Ficus elastica's in the Sundarbans) was in neither. So every page is derived
 * again, offline, by this round's code, and then checked:
 *
 * - `walkList`: the pages not yet derived since the walk began (by `built`), so the walk, six or seven hours, is resumed
 *   where it stopped by writing the list again and running the same `--keys` line;
 * - `checkPage`: what is wrong with a page after it: its typical cell (where the climate's extremes and elevation are
 *   read, `climate.at`) outside every native region (the shape, or the box, with the range test's buffer and half a grid
 *   cell's diagonal: the cell's middle can lie that far from a record inside); its records tested before this round's
 *   rule (`occurrences.rangeRule`, absent on a page derived before it, or carried from a build before); an open record
 *   outside every native region.
 *
 * Pure: the script reads the files and says the lines.
 */
import type { RegionTester } from './tdwg-shapes';

/** Half the diagonal of the climate grid's cell (0.05°), in degrees: a cell's middle may lie this far from its record. */
export const CELL_SLACK_DEG = 0.036;

export interface CheckPage {
  key: string;
  name: { scientific: string };
  built?: string;
  distribution?: { native?: ReadonlyArray<{ code?: string; name?: string }> };
  occurrences?: { open?: ReadonlyArray<readonly [number, number, ...unknown[]]>; rangeTested?: boolean; rangeRule?: string; nOutsideRange?: number; nOpenInRange?: number; nRestrictedInRange?: number };
  climate?: { status?: string; at?: { lat: number; lon: number } };
  upstream?: Record<string, { status?: string; detail?: string } | undefined>;
}

/** The pages of the walk still to derive: every page built before the walk began (all of them, the first time). */
export function walkList(pages: Iterable<CheckPage>, since: string): { lines: string[]; done: number } {
  const lines: string[] = [];
  let done = 0;
  for (const d of pages) {
    if (d.built && d.built >= since) { done++; continue; }
    lines.push(`${d.key} ${d.name.scientific}`);
  }
  return { lines: lines.sort(), done };
}

export interface PageFaults {
  /** The typical cell is outside every native region. */
  cellOutside: boolean;
  /** The records were not tested by this round's rule. */
  oldRule: boolean;
  /** Open records outside every native region. */
  openOutside: number;
}

const codesOf = (d: CheckPage) => (d.distribution?.native ?? []).flatMap((r) => (r.code ? [r.code] : []));

/**
 * What the check finds on one page. `cell` tests the typical cell (a tester whose buffer is the range test's and
 * `CELL_SLACK_DEG`), `records` the open records (the range test's own); `rule`, this round's (`RANGE_RULE`).
 */
export function checkPage(d: CheckPage, cell: RegionTester, records: RegionTester, rule: string): PageFaults {
  const codes = codesOf(d);
  const tested = d.occurrences?.rangeTested !== false && codes.length > 0;
  const at = d.climate?.status === 'ok' ? d.climate.at : undefined;
  const cellOutside = tested && !!at && !codes.some((c) => cell.inRegion(at.lat, at.lon, c));
  // A page whose records were read (or carried) and tested against a range says by which rule; one that read none (no
  // GBIF key and no key from Kew's synonymy: its records "not checked") has none to say.
  const read = ['ok', 'none'].includes(d.upstream?.['gbif.occurrences']?.status ?? '');
  const oldRule = tested && read && d.occurrences?.rangeRule !== rule;
  const openOutside = tested ? (d.occurrences?.open ?? []).filter((p) => !codes.some((c) => records.inRegion(p[0], p[1], c))).length : 0;
  return { cellOutside, oldRule, openOutside };
}

/** The pages the check names in its output whatever they hold (review A1, B1, D2, A2): each must read as fixed. */
export const NAMED_CASES: ReadonlyArray<{ key: string; name: string; was: string }> = [
  { key: 'k298116', name: 'Aloe vera', was: 'typical cell 25.425 N, 56.175 E, in Fujairah (United Arab Emirates), outside Oman, its one native region' },
  { key: 'k2810307', name: 'Ficus elastica', was: 'typical cell 22.125 N, 88.575 E, in the Sundarbans of West Bengal, in none of its native regions' },
  { key: 'k307568', name: 'Galanthus nivalis', was: "typical cell 50.875 N, 5.475 E, in Belgian Limburg (introduced), let in by France's box" },
  { key: 'k124103', name: 'Melissa officinalis', was: 'typical cell 41.825 N, 2.525 E; 32 of its 38 open in-range records in Switzerland, Britain, Belgium, Luxembourg and Germany, where Kew holds it introduced' },
  { key: 'k2864797', name: 'Indigofera taiwaniana', was: "no climate: 14 of its Taiwanese records (Kenting, 21.927 N) outside Taiwan's box, whose south edge is 21.928 N" }
];

/** One named case as the check says it: what the page holds now, and whether that is the fix. */
export function caseLine(c: (typeof NAMED_CASES)[number], d: CheckPage | undefined, f: PageFaults | undefined, rule: string): { ok: boolean; line: string } {
  if (!d || !f) return { ok: false, line: `${c.name} (${c.key}): no dossier on disk under this id` };
  const at = d.climate?.status === 'ok' ? d.climate.at : undefined;
  const where = at ? `typical cell ${at.lat} N, ${at.lon} E, ${f.cellOutside ? 'OUTSIDE its native regions' : 'inside its native regions'}` : `no climate (${d.climate?.status ?? 'none'})`;
  const ok = !f.cellOutside && !f.oldRule && !f.openOutside;
  const recs = d.occurrences ? `; ${d.occurrences.nOpenInRange ?? 0} open and ${d.occurrences.nRestrictedInRange ?? 0} restricted records in range, ${d.occurrences.nOutsideRange ?? 0} outside` : '';
  return { ok, line: `${ok ? 'fixed' : 'NOT FIXED'}: ${c.name} (${c.key}): ${where}${recs}; records tested by ${d.occurrences?.rangeRule ? `shapes rule ${d.occurrences.rangeRule}` : `a rule before ${rule}`}. Before: ${c.was}.` };
}

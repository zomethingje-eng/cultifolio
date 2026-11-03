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
import { regionTester, grownBox, SHAPE_BUFFER_DEG, COAST_DEG, ISLAND_DEG, ADMISSIONS, type Admission, type RegionTester, type ShapesFile } from './tdwg-shapes';
import { TDWG3 } from './tdwg';
import { inBox } from '$core/geo';

/** Half the diagonal of the climate grid's cell (0.05°), in degrees: a cell's middle may lie this far from its record. */
export const CELL_SLACK_DEG = 0.036;

/**
 * The tester for a typical cell's middle: the range test's buffer and its coast reach, each widened by half the cell's
 * diagonal. A cell holding a record the coast rule took (an islet off Korea's west coast, 36.30 N 126.31 E) has its middle
 * up to that much further out to sea; testing the middle against the coast reach alone listed Semiaquilegia adoxoides,
 * whose records are in range (the owner's walk, 31 October 2026). Round eighty-five reads a cell by the reason the dossier
 * gives it (`cellReached`); this stays for a page derived before.
 */
export function cellTester(file: ShapesFile): RegionTester {
  return regionTester(file, SHAPE_BUFFER_DEG + CELL_SLACK_DEG, COAST_DEG + CELL_SLACK_DEG);
}

/**
 * How far a cell's middle may lie from a native region by the reason its best record was taken (round eighty-five; A23,
 * D4): a record strictly inside a shape puts its cell's middle within half the cell's diagonal of it; the margin, the coast
 * reach and an island add their own reach. So a typical cell whose middle lies on another region's land, further than half
 * a cell from every native shape (Aloe vera's at Khor Fakkan, 2 km inside Sharjah), is named, as the widened tester
 * could not (review D4: "true by construction").
 */
export const REACH_DEG: Readonly<Record<Admission, number>> = { strict: CELL_SLACK_DEG, buffer: SHAPE_BUFFER_DEG + CELL_SLACK_DEG, coast: COAST_DEG + CELL_SLACK_DEG, island: ISLAND_DEG + CELL_SLACK_DEG };

/**
 * Whether a cell's middle lies within its reason's reach of one of `codes` (an island's: or inside the region's box, grown
 * by half the cell's diagonal as every other reach is). The owner's check of 3 November 2026 named Peperomia leptostachya
 * and Pandanus tectorius for one cell each at 22.625 S, 152.825 W: records on Rimatara, which TDWG's Tubuai Is. holds but
 * Natural Earth does not draw, taken by the island rule inside Tubuai's box (west edge 152.823 W), with the cell's middle
 * 0.002 degrees past that edge.
 */
export function cellReached(t: RegionTester, lat: number, lon: number, codes: readonly string[], how: Admission): boolean {
  return codes.some((c) => Number.isFinite(t.reach(lat, lon, c, REACH_DEG[how])) || (how === 'island' && !!TDWG3[c] && inBox(lat, lon, grownBox(TDWG3[c], CELL_SLACK_DEG))));
}

export interface CheckPage {
  key: string;
  name: { scientific: string };
  built?: string;
  distribution?: { native?: ReadonlyArray<{ code?: string; name?: string }> };
  occurrences?: { open?: ReadonlyArray<readonly [number, number, ...unknown[]]>; rangeTested?: boolean; rangeRule?: string; nOutsideRange?: number; nOpenInRange?: number; nRestrictedInRange?: number; admitted?: Record<Admission, number>; edge?: Partial<Record<Exclude<Admission, 'strict'>, number[]>> };
  climate?: { status?: string; at?: { lat: number; lon: number }; cells?: number; admitted?: Record<Admission, number>; edge?: ReadonlyArray<readonly [number, number, Exclude<Admission, 'strict'>]> };
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
  /** The typical cell is outside every native region (by its reason's reach, round eighty-five). */
  cellOutside: boolean;
  /** The records were not tested by this round's rule. */
  oldRule: boolean;
  /** Open records outside every native region, by the border rule and their stated country. */
  openOutside: number;
  /** Round eighty-five (A23): contributing cells off the shapes (`climate.edge`) beyond their reason's reach. */
  edgeOutside: number;
  /** Round eighty-five: a page of this rule whose records or cells are not counted by reason (`admitted`), or whose counts do not add up. */
  uncounted: boolean;
  /** Round eighty-five: open records whose reason the check finds otherwise than the dossier gives it. */
  reasonDiffers: number;
  /**
   * Round eighty-five (review D4): the typical cell's middle lies on another region's land. Not a fault by itself (a cell
   * is 5 km across, and a record inside a native shape near a border can have its cell's middle over it); said, with
   * its reason, so the count is seen (D4: six of 634 before the border rule, each by the margin).
   */
  cellOnOtherLand?: { land: string[]; how: Admission };
  /** The records' and the climate cells' reasons, as the dossier gives them (for the corpus's totals). */
  admitted?: Record<Admission, number>;
  cellsAdmitted?: Record<Admission, number>;
}

const codesOf = (d: CheckPage) => (d.distribution?.native ?? []).flatMap((r) => (r.code ? [r.code] : []));

/**
 * What the check finds on one page. `cell` tests a page derived before round eighty-five's typical cell (a tester whose
 * buffer is the range test's and `CELL_SLACK_DEG`); `records` is the range test's own; `rule`, this round's (`RANGE_RULE`).
 * A page of this round's rule is read by the reasons it keeps: every contributing cell off the shapes is tested by its
 * reason's reach (`climate.edge`), the typical cell by its own, and every open record again by the border rule with its
 * stated country, its reason compared with the dossier's.
 */
export function checkPage(d: CheckPage, cell: RegionTester, records: RegionTester, rule: string): PageFaults {
  const codes = codesOf(d);
  const tested = d.occurrences?.rangeTested !== false && codes.length > 0;
  const at = d.climate?.status === 'ok' ? d.climate.at : undefined;
  const current = d.occurrences?.rangeRule === rule;
  const edge: ReadonlyArray<readonly [number, number, Exclude<Admission, 'strict'>]> = d.climate?.status === 'ok' ? (d.climate.edge ?? []) : [];
  const howAt: Admission = (at && edge.find((e) => e[0] === at.lat && e[1] === at.lon)?.[2]) || 'strict';
  const cellOutside = tested && !!at && (current ? !cellReached(records, at.lat, at.lon, codes, howAt) : !codes.some((c) => cell.inRegion(at.lat, at.lon, c)));
  // A page whose records were read (or carried) and tested against a range says by which rule; one that read none (no
  // GBIF key and no key from Kew's synonymy: its records "not checked") has none to say.
  const read = ['ok', 'none'].includes(d.upstream?.['gbif.occurrences']?.status ?? '');
  const oldRule = tested && read && !current;
  const open = d.occurrences?.open ?? [];
  let openOutside = 0, reasonDiffers = 0;
  if (tested) {
    const said = new Map<number, Admission>();
    for (const h of ADMISSIONS) if (h !== 'strict') for (const i of d.occurrences?.edge?.[h] ?? []) said.set(i, h);
    open.forEach((p, i) => {
      const got = records.admit(p[0], p[1], codes, typeof p[3] === 'string' ? p[3] : null);
      if (!got) openOutside++;
      else if (current && got.how !== (said.get(i) ?? 'strict')) reasonDiffers++;
    });
  }
  const edgeOutside = tested && current ? edge.filter((e) => !cellReached(records, e[0], e[1], codes, e[2])).length : 0;
  const sum = (a?: Record<Admission, number>) => (a ? ADMISSIONS.reduce((n, h) => n + (a[h] ?? 0), 0) : -1);
  const o = d.occurrences;
  const recordsIn = (o?.nOpenInRange ?? 0) + (o?.nRestrictedInRange ?? 0);
  const uncounted = tested && current && read && (!o?.admitted || sum(o.admitted) < recordsIn || (d.climate?.status === 'ok' && (!d.climate.admitted || sum(d.climate.admitted) !== d.climate.cells)));
  const land = at && tested ? records.landOf(at.lat, at.lon) : [];
  const cellOnOtherLand = land.length && !land.some((c) => codes.includes(c)) ? { land, how: howAt } : undefined;
  return { cellOutside, oldRule, openOutside, edgeOutside, uncounted, reasonDiffers, ...(cellOnOtherLand ? { cellOnOtherLand } : {}), ...(o?.admitted ? { admitted: o.admitted } : {}), ...(d.climate?.status === 'ok' && d.climate.admitted ? { cellsAdmitted: d.climate.admitted } : {}) };
}

/** The pages the check names in its output whatever they hold (review A1, B1, D2, A2): each must read as fixed. */
export const NAMED_CASES: ReadonlyArray<{ key: string; name: string; was: string; needs?: 'climate' }> = [
  { key: 'k298116', name: 'Aloe vera', was: 'typical cell 25.425 N, 56.175 E, in Fujairah (United Arab Emirates), outside Oman, its one native region; then (round eighty-four) 25.325 N, 56.325 E at Khor Fakkan, Sharjah, by the margin of Oman\'s Madha enclave' },
  // Round eighty-five (the owner's decisions 1 and 2; reviews D4, A3, A5, B1).
  { key: 'k525228', name: 'Dracaena trifasciata', was: 'typical cell 2.475 S, 28.875 E, in Rwanda 2 km from Bukavu, by the margin of Zaire' },
  { key: 'k303171', name: 'Cordyline fruticosa', was: 'an open record at Tweed Heads, 28.230 S, 153.473 E, inside New South Wales, by the margin of Queensland' },
  { key: 'k291500', name: 'Xeronema callistemon', was: 'no climate: its records on the Poor Knights, 21 km off the drawn coast, outside the range', needs: 'climate' },
  { key: 'k2453705', name: 'Veronica bollonsii', was: 'no climate: 24 of its records on islands off Northland outside the range', needs: 'climate' },
  { key: 'k2810307', name: 'Ficus elastica', was: 'typical cell 22.125 N, 88.575 E, in the Sundarbans of West Bengal, in none of its native regions' },
  { key: 'k307568', name: 'Galanthus nivalis', was: "typical cell 50.875 N, 5.475 E, in Belgian Limburg (introduced), let in by France's box" },
  { key: 'k124103', name: 'Melissa officinalis', was: 'typical cell 41.825 N, 2.525 E; 32 of its 38 open in-range records in Switzerland, Britain, Belgium, Luxembourg and Germany, where Kew holds it introduced' },
  { key: 'k2864797', name: 'Indigofera taiwaniana', was: "no climate: 14 of its Taiwanese records (Kenting, 21.927 N) outside Taiwan's box, whose south edge is 21.928 N" }
];

/** Counts by reason, as the check says them: "120 inside, 4 by the margin, 1 off a coast, 0 on an island". */
export function reasonWords(a: Partial<Record<Admission, number>>): string {
  return `${a.strict ?? 0} inside, ${a.buffer ?? 0} by the margin, ${a.coast ?? 0} off a coast, ${a.island ?? 0} on an island`;
}

/** One named case as the check says it: what the page holds now, and whether that is the fix. */
export function caseLine(c: (typeof NAMED_CASES)[number], d: CheckPage | undefined, f: PageFaults | undefined, rule: string): { ok: boolean; line: string } {
  if (!d || !f) return { ok: false, line: `${c.name} (${c.key}): no dossier on disk under this id` };
  const at = d.climate?.status === 'ok' ? d.climate.at : undefined;
  const where = at ? `typical cell ${at.lat} N, ${at.lon} E, ${f.cellOutside ? 'OUTSIDE its native regions' : 'inside its native regions'}` : `no climate (${d.climate?.status ?? 'none'})`;
  const ok = !f.cellOutside && !f.oldRule && !f.openOutside && !f.edgeOutside && !f.uncounted && !f.reasonDiffers && (c.needs !== 'climate' || d.climate?.status === 'ok');
  const by = f.admitted ? ` (${reasonWords(f.admitted)})` : '';
  const recs = d.occurrences ? `; ${d.occurrences.nOpenInRange ?? 0} open and ${d.occurrences.nRestrictedInRange ?? 0} restricted records in range${by}, ${d.occurrences.nOutsideRange ?? 0} outside` : '';
  return { ok, line: `${ok ? 'fixed' : 'NOT FIXED'}: ${c.name} (${c.key}): ${where}${recs}; records tested by ${d.occurrences?.rangeRule ? `shapes rule ${d.occurrences.rangeRule}` : `a rule before ${rule}`}. Before: ${c.was}.` };
}

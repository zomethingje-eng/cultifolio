/**
 * "At home, aim for" (round eighty-seven, derived agent; the plan's C10, the owner's mockup LookSpecies): targets for a
 * grower, each worked out by stated arithmetic from the page's own habitat figures, and each row saying its arithmetic
 * and its source. No sentence is generated; every word is one of the fixed words here around the page's figures.
 *
 *   - Winter nights: the coldest month's mean nightly low (the month whose median low is lowest), 10th to 90th percentile
 *     across the range's cells (CHELSA V2.1, 1981–2010), with the record low beside it where the page shows one (NASA
 *     POWER's daily series).
 *   - Summer days: the warmest month's mean daily high, the same way.
 *   - Grow light: the PPFD that gives the year's mean daily light integral in a photoperiod of `hours` (14 unless the
 *     reader chooses 12 or 16): PPFD = DLI × 1,000,000 ÷ (hours × 3,600), the DLI the mean of the twelve monthly medians
 *     (open sky: CHELSA's solar radiation at 2.07 mol of PAR per MJ, as the climate's figures are).
 *   - Humidity: the lowest and highest of the twelve monthly median relative humidities, only where every month holds one
 *     (CHELSA's hurs); otherwise the row says none is worked out.
 *
 * Computed here from the dossier's climate, as the stage-2 contract allows (`atHome`): no stored field.
 */
import { tempN, tempUnit, type Units } from '$core/units';

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COUNT = new Intl.NumberFormat('en-US');

export const PHOTOPERIODS = [12, 14, 16] as const;
export type Photoperiod = (typeof PHOTOPERIODS)[number];
export const DEFAULT_HOURS: Photoperiod = 14;

/** The page's words under the table: the owner's, as the mockup gives them. */
export const AT_HOME_NOTE = 'A starting point worked out from where it grows wild, not tested in cultivation. The light is the open sky’s; a plant among rocks or shrubs gets less.';

type M = { tmax: number; tmin: number; dli?: number; rh?: number };
export interface AtHomeClimate {
  status: string;
  cells?: number;
  months?: M[];
  p10?: M[];
  p90?: M[];
  extremes?: { minAbs: number; years: number } | null;
}

export interface AimRow {
  /** The row's name ("Winter nights"). */
  k: string;
  /** The target ("6–8 °C"), or the words that none is worked out. */
  v: string;
  /** The arithmetic and the source. */
  how: string;
  /** False where the row holds no figure (the humidity row on a page without it). */
  figure: boolean;
}

/** PPFD, µmol/m²/s, of a daily light integral (mol/m²/day) given over `hours`. */
export const ppfdOf = (dli: number, hours: number) => (dli * 1_000_000) / (hours * 3_600);

const r1 = (x: number) => Math.round(x * 10) / 10;
/** A range of two temperatures in the reader's unit: "6–8 °C", or one figure where they round alike. */
function tRange(lo: number, hi: number, u: Units, digits = 0): string {
  const a = tempN(lo, u, digits), b = tempN(hi, u, digits);
  return a === b ? `${a} ${tempUnit(u)}` : `${a}–${b} ${tempUnit(u)}`;
}

const CHELSA = 'CHELSA V2.1, 1981–2010';

/** The rows, or null where the page has no habitat climate to work them out from. */
export function atHomeRows(c: AtHomeClimate | null | undefined, u: Units, hours: number = DEFAULT_HOURS): AimRow[] | null {
  if (!c || c.status !== 'ok' || !c.months || c.months.length !== 12 || !c.p10 || !c.p90) return null;
  const m = c.months, p10 = c.p10, p90 = c.p90;
  const cells = c.cells ?? 0;
  const spread = (i: number, f: 'tmin' | 'tmax') => cells > 1
    ? `10th to 90th percentile across the ${COUNT.format(cells)} cells of the range, median ${tempN(m[i][f], u, 1)} ${tempUnit(u)}`
    : `the one cell of the range`;
  const cold = m.reduce((b, x, i) => (x.tmin < m[b].tmin ? i : b), 0);
  const hot = m.reduce((b, x, i) => (x.tmax > m[b].tmax ? i : b), 0);
  const rows: AimRow[] = [];
  const record = c.extremes && Number.isFinite(c.extremes.minAbs)
    ? `; its coldest night on record was ${tempN(c.extremes.minAbs, u, 1)} ${tempUnit(u)} (NASA POWER, daily lows over ${c.extremes.years} years at the typical spot)`
    : '; no record low is shown for this page';
  rows.push({ k: 'Winter nights', v: tRange(p10[cold].tmin, p90[cold].tmin, u), how: `the ${MONTH[cold]} mean nightly low, ${spread(cold, 'tmin')} (${CHELSA})${record}`, figure: true });
  rows.push({ k: 'Summer days', v: tRange(p10[hot].tmax, p90[hot].tmax, u), how: `the ${MONTH[hot]} mean daily high, ${spread(hot, 'tmax')} (${CHELSA})`, figure: true });
  const dlis = m.map((x) => x.dli);
  if (dlis.every((x): x is number => typeof x === 'number' && Number.isFinite(x))) {
    const dli = dlis.reduce((a, x) => a + x, 0) / 12;
    const shownDli = r1(dli);
    // The PPFD of the DLI as shown, so the row's arithmetic gives the row's figure.
    const ppfd = Math.round(ppfdOf(shownDli, hours));
    rows.push({ k: `Grow light, ${hours} h a day`, v: `${COUNT.format(ppfd)} µmol/m²/s`, how: `the year’s mean daily light, ${shownDli.toFixed(1)} mol/m²/day (the twelve monthly medians averaged; open sky, ${CHELSA} solar radiation at 2.07 mol of PAR per MJ), × 1,000,000 ÷ (${hours} × 3,600)`, figure: true });
  } else {
    rows.push({ k: 'Grow light', v: 'none worked out', how: 'the habitat figures hold no daily light for every month, so none is worked out', figure: false });
  }
  const rhs = m.map((x) => x.rh);
  if (rhs.every((x): x is number => typeof x === 'number' && Number.isFinite(x))) {
    const lo = Math.round(Math.min(...rhs)), hi = Math.round(Math.max(...rhs));
    rows.push({ k: 'Humidity', v: lo === hi ? `${lo}%` : `${lo}–${hi}%`, how: `the lowest and highest of the twelve monthly median relative humidities (${CHELSA}); a figure about the air, saying nothing of how the plant takes water`, figure: true });
  } else {
    rows.push({ k: 'Humidity', v: 'none worked out', how: 'the habitat figures hold no humidity, so none is worked out', figure: false });
  }
  return rows;
}

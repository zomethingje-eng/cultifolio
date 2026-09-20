/**
 * The cultivation sheet: the habitat figures a grower compares a bench with,
 * each with its source, and the readings two fixed rules make of the rain and
 * temperature curves, each labelled as a reading. Every row states its
 * sentence and where the sentence came from. Nothing on the sheet says what
 * the plant does, wants or tolerates, or what to do to it: those are practice,
 * and the sheet keeps to what was derived.
 *
 * Inputs: the dossier's median year at the habitat (CHELSA, across the
 * envelope cells), optionally its 10th and 90th percentile years, the
 * extremes (NASA POWER at the typical cell), and the care archetype, which
 * supplies one figure: a conventional group minimum for the cold floor.
 */
import { frostWording } from './extremes';
import { archFor, type ArchGuess } from './arch';

export interface Month {
  tmax: number;
  tmin: number;
  tmean: number;
  precipMm: number;
  dli?: number;
  rh?: number;
}
export interface Extremes {
  minAbs: number;
  minP01: number;
  maxP99: number;
  frostDaysPerYear: number;
  frostNights?: number;
  years: number;
  lapseAppliedM?: number;
}
export interface SheetInput {
  scientific: string;
  /** The dossier's climate status when it is not ok, so a note can say which kind of absence it is. */
  climateStatus?: 'ok' | 'pending' | 'refused' | 'none';
  /** 10th and 90th percentile of the per-cell annual rain totals, when the dossier carries them. */
  annualP10?: number | null;
  annualP90?: number | null;
  family?: string | null;
  /** The median year across the envelope cells. */
  months?: Month[] | null;
  /** The 10th and 90th percentile years, when the dossier carries them: the range the species is recorded in. */
  p10?: Month[] | null;
  p90?: Month[] | null;
  extremes?: Extremes | null;
  /** Habitat latitude (the map marker's), for the hemisphere. */
  lat?: number | null;
  /** The grower's latitude, if known: the one-sentence shorts print months for that hemisphere. */
  readerLat?: number | null;
}

export interface Row {
  /** The card this row belongs in. */
  card: string;
  k: string;
  s: string;
  why: string;
  /** Rests on this species' own habitat figures (as opposed to the archetype table). */
  hab: boolean;
  /**
   * The row in one sentence, written by the same rule at the same moment as
   * the row, so a condensed note is the rows and can never say something the
   * cards do not. Absent when the row is not worth a sentence in a summary.
   */
  short?: string;
}

export interface Year {
  /** What the rain rule read: a winter or summer growing season, or none ('even'); 'cool' when there was no rainy season to read and the temperature rule named the cooler half instead. */
  grow: 'winter' | 'summer' | 'even' | 'cool';
  /** Under 120 mm a year: no rainy season to read. `growMonths` then holds the temperature rule's reading, the cooler half. */
  fog: boolean;
  /** 70% of the rain takes eight months or more: no season. */
  spread: boolean;
  /** The rain has a sharp season but the temperature curve is flat (under 4 °C between the warmest and coldest month): the growing-season rule infers nothing from it. */
  flat: boolean;
  /** Under 120 mm and a flat curve too: no rainy season to read and no cooler half worth naming; `growMonths` is empty. */
  none: boolean;
  /**
   * Whether the months may be shifted six months for the other hemisphere. A flat temperature curve, or a habitat within
   * 10° of the equator, has no thermal season to reverse, so the shift rule does not apply and the months stay the habitat's.
   */
  shiftable: boolean;
  /** Habitat months (1–12) the reading names, in habitat time. May be two runs (a bimodal season). */
  growMonths: number[];
  /** The same months shifted six months, for the opposite hemisphere. */
  shifted: number[];
  south: boolean;
  wetMm: number;
  annualMm: number;
  /** Mean temperature of the wet months and of the year, and the year's range, °C. */
  wetT: number;
  meanT: number;
  rangeT: number;
  driest: number;
  wettest: number;
}

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const mon = (m: number) => MON[(m - 1 + 12) % 12];

/**
 * A set of months as its circular runs, in words. One run: "March to May",
 * "November to February" (wrapping the year). Two runs (a bimodal season):
 * "March to April and September to October". Short style for a label:
 * "Mar–May", "Mar–Apr, Sep–Oct". The sheet and the label both format through
 * here, so the two can never disagree about a season.
 */
export function runs(ms: number[], style: 'long' | 'short' = 'long'): string {
  const set = new Set(ms.filter((m) => m >= 1 && m <= 12));
  if (!set.size) return '';
  if (set.size === 12) return 'all year';
  const N = style === 'long' ? MON : MON3;
  const dash = style === 'long' ? ' to ' : '–';
  // Starts: members whose predecessor is not a member. Walk each run to its end.
  const starts = [...set].filter((m) => !set.has(((m - 2 + 12) % 12) + 1));
  const found = starts.map((start) => {
    let end = start;
    while (set.has((end % 12) + 1) && (end % 12) + 1 !== start) end = (end % 12) + 1;
    return { start, end, wraps: end < start };
  });
  // Calendar order; a run that wraps the year holds January and so comes first.
  found.sort((a, b) => (a.wraps ? 0 : a.start) - (b.wraps ? 0 : b.start));
  const out = found.map(({ start, end }) => (start === end ? N[start - 1] : `${N[start - 1]}${dash}${N[end - 1]}`));
  if (out.length === 1) return out[0];
  return style === 'long' ? out.slice(0, -1).join(', ') + ' and ' + out[out.length - 1] : out.join(', ');
}

/** The long form of `runs`, kept under its old name. */
export const span = (ms: number[]) => runs(ms, 'long');

/** The months in the reader's hemisphere: the habitat's own when both lie on the same side of the equator, else shifted. */
export const forReader = (year: Year, readerLat: number | null | undefined) => (!year.shiftable || ((readerLat ?? 40) < 0) === year.south ? year.growMonths : year.shifted);

/**
 * The growing year: what two fixed rules read from the rain and temperature
 * curves of the median year. The rain rule: the wet season is the smallest
 * set of months carrying 70% of the year's rain; a wet season cooler than the
 * year's mean is called winter, warmer summer. Eight or more wet months is no
 * season; so is a flat temperature curve (under 4 °C of range), whatever the
 * rain does; under 120 mm a year there is no rainy season to read at all, and
 * the temperature rule names the cooler half instead. A reading of curves.
 */
export function growingYear(months: Month[], lat: number | null | undefined): Year | null {
  if (months.length !== 12) return null;
  const annual = months.reduce((a, m) => a + m.precipMm, 0);
  const wettest = months.reduce((b, m, i) => (m.precipMm > months[b].precipMm ? i : b), 0) + 1;
  const driest = months.reduce((b, m, i) => (m.precipMm < months[b].precipMm ? i : b), 0) + 1;
  const order = [...months.keys()].sort((a, b) => months[b].precipMm - months[a].precipMm);
  let wet: number[] = [];
  let cum = 0;
  for (const i of order) {
    wet.push(i + 1);
    cum += months[i].precipMm;
    if (annual > 0 && cum >= annual * 0.7) break;
  }
  wet.sort((a, b) => a - b);
  const meanT = months.reduce((a, m) => a + m.tmean, 0) / 12;
  const rangeT = Math.max(...months.map((m) => m.tmean)) - Math.min(...months.map((m) => m.tmean));
  const fog = annual < 120;
  let none = false;
  if (fog) {
    // The cooler six months, but only when they are cooler: with every month within a degree of every other the six
    // are chosen by calendar order alone, which is not a season, and the rule names none.
    const byT = [...months.keys()].sort((a, b) => months[a].tmean - months[b].tmean);
    const coolT = byT.slice(0, 6).reduce((a, i) => a + months[i].tmean, 0) / 6;
    const warmT = byT.slice(6).reduce((a, i) => a + months[i].tmean, 0) / 6;
    none = warmT - coolT < 1;
    wet = none ? [] : byT.slice(0, 6).map((i) => i + 1).sort((a, b) => a - b);
  }
  const wetT = wet.length ? wet.reduce((a, m) => a + months[m - 1].tmean, 0) / wet.length : meanT;
  const wetMm = wet.reduce((a, m) => a + months[m - 1].precipMm, 0);
  const spread = !fog && wet.length >= 8;
  const flat = !fog && !spread && rangeT < 4;
  // Winter or summer by the wet season's mean against the year's: within half a degree neither word is earned, and the
  // season is called even rather than given a half of the year it does not have.
  const grow: Year['grow'] = fog ? 'cool' : spread || flat ? 'even' : wetT < meanT - 0.5 ? 'winter' : wetT > meanT + 0.5 ? 'summer' : 'even';
  const south = (lat ?? 0) < 0;
  const shiftable = !none && !flat && rangeT >= 4 && Math.abs(lat ?? 40) >= 10;
  const shifted = shiftable ? wet.map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b) : wet;
  return { grow, fog, none, shiftable, spread, flat, growMonths: wet, shifted, south, wetMm, annualMm: annual, wetT, meanT, rangeT, driest, wettest };
}

const T = (c: number) => `${Math.round(c)} °C`;
const T1 = (c: number) => `${c.toFixed(1)} °C`;
const RAIN = (mm: number) => `${Math.round(mm)} mm`;

/** What the cold floor is: the quantity, the figure, and any raising by the archetype table, all in one sentence. */
export function coldFloor(m: Month[] | null, ex: Extremes | null, guess: ArchGuess | null): { floor: number; s: string; short: string; hab: boolean } | null {
  const minC = guess?.arch.minC ?? null;
  let floor: number | null = null;
  let quantity = '';
  let quantityShort = '';
  if (ex) {
    floor = ex.minP01;
    quantity = `the 1st-percentile night over ${ex.years} years at the typical cell (NASA POWER)`;
    quantityShort = '1st-percentile habitat night, NASA POWER';
  } else if (m) {
    const i = m.reduce((b, x, j) => (x.tmin < m[b].tmin ? j : b), 0);
    floor = m[i].tmin;
    quantity = `the coldest month's mean night, ${mon(i + 1)}, in the median year (CHELSA); no daily extremes are on file`;
    quantityShort = `coldest month's mean night, CHELSA`;
  }
  if (floor == null && minC == null) return null;
  if (floor == null) {
    return { floor: minC!, s: `Cold floor: ${T(minC!)}, the archetype table's conventional minimum for a ${guess!.arch.lab.toLowerCase()} (grouped by ${guess!.why}); no habitat figure is on file for this species.`, short: `Cold floor ${T(minC!)} (conventional for a ${guess!.arch.lab.toLowerCase()}, archetype table).`, hab: false };
  }
  if (minC != null && minC > floor) {
    return { floor: minC, s: `Cold floor: ${T(minC)}. The habitat figure, ${quantity}, is ${T1(floor)}; the archetype table's conventional minimum for a ${guess!.arch.lab.toLowerCase()} (grouped by ${guess!.why}) is ${T(minC)}, which is higher, and the floor rule takes the higher.`, short: `Cold floor ${T(minC)} (archetype minimum for a ${guess!.arch.lab.toLowerCase()}, above the ${T1(floor)} habitat night).`, hab: true };
  }
  return { floor, s: `Cold floor: ${T1(floor)}, which is ${quantity}${minC != null ? `; the archetype table's minimum for a ${guess!.arch.lab.toLowerCase()}, ${T(minC)}, is lower and does not raise it` : ''}.`, short: `Cold floor ${T1(floor)} (${quantityShort}).`, hab: true };
}

export function cultivationSheet(input: SheetInput): { rows: Row[]; arch: ArchGuess | null; year: Year | null } {
  const rows: Row[] = [];
  const add = (card: string, k: string, s: string, why: string, hab = false, short?: string) => rows.push({ card, k, s, why, hab, short });
  const guess = archFor(input.scientific, input.family);
  const m = input.months && input.months.length === 12 ? input.months : null;
  const p10 = input.p10 && input.p10.length === 12 ? input.p10 : null;
  const p90 = input.p90 && input.p90.length === 12 ? input.p90 : null;
  const ex = input.extremes ?? null;
  const year = m ? growingYear(m, input.lat) : null;
  const dlis = m ? m.map((x) => x.dli).filter((x): x is number => x != null) : [];
  const ENV = 'median year across the envelope cells, CHELSA';

  /* ---- its year ---- */
  if (m && year) {
    const home = year.south ? 'southern' : 'northern';
    const away = year.south ? 'northern' : 'southern';
    const at = runs(year.growMonths);
    const shifted = runs(year.shifted);
    const reader = runs(forReader(year, input.readerLat));
    const readerSide = (input.readerLat ?? 40) < 0 ? 'southern' : 'northern';
    const nearEq = Math.abs(input.lat ?? 40) < 10;
    const hemi = year.shiftable
      ? `Months are the habitat's, ${home} hemisphere; shifted six months for a ${away}-hemisphere collection: ${shifted}.`
      : `Months are the habitat's, ${home} hemisphere${nearEq ? ', within 10° of the equator' : ''}; with ${nearEq ? 'no thermal season there' : 'a flat temperature curve'} there is no season to reverse, so they are not shifted for a collection elsewhere.`;
    // What the reader-side clause says: the shifted months in their hemisphere, or the habitat's own when no shift applies.
    const forYou = year.shiftable ? `${reader} in the ${readerSide} hemisphere` : `${at} at the habitat (not shifted)`;
    let s: string;
    let short: string;
    if (year.none) {
      s = `Rain at the habitat is ${RAIN(year.annualMm)} a year (${ENV}). Under 120 mm the rain rule reads no rainy season, and the growing-season rule infers nothing from it. The temperature curve moves ${year.rangeT.toFixed(1)} °C between the warmest and coldest month and the coolest six months are within a degree of the warmest six, so the temperature rule names no cooler half either.`;
      short = `Rain rule: no rainy season to read (${RAIN(year.annualMm)} a year); the temperature curve is flat (${year.rangeT.toFixed(1)} °C of range), so no cooler half is named.`;
    } else if (year.fog) {
      s = `Rain at the habitat is ${RAIN(year.annualMm)} a year (${ENV}). Under 120 mm the rain rule reads no rainy season, and the growing-season rule infers nothing from it. The temperature rule reads the cooler six months as ${at}. ${hemi}`;
      short = `Rain rule: no rainy season to read (${RAIN(year.annualMm)} a year); the temperature rule's cooler six months are ${forYou}.`;
    } else if (year.spread) {
      s = `The rain rule reads no season: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) takes ${year.growMonths.length} months, ${at}. Mean temperature moves ${year.rangeT.toFixed(1)} °C between the warmest and coldest month. ${hemi}`;
      short = `Rain rule: no season, 70% of the rain takes ${year.growMonths.length} months (${forYou}).`;
    } else if (year.flat) {
      s = `The rain rule reads a sharp season: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) falls in ${at}. The temperature curve is flat, ${year.rangeT.toFixed(1)} °C between the warmest and coldest month, so the growing-season rule does not infer a growing season from it. ${hemi}`;
      short = `Rain rule: a sharp rainy season, ${forYou}; the temperature curve is flat (${year.rangeT.toFixed(1)} °C of range), so no growing season is inferred.`;
    } else if (year.grow === 'even') {
      s = `The rain rule reads a rainy season with no name: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) falls in ${at}, whose mean temperature, ${T1(year.wetT)}, is within half a degree of the year's, ${T1(year.meanT)}, so it is neither the cooler nor the warmer part of the year. ${hemi}`;
      short = `Rain rule: a rainy season, ${forYou}, at the year's mean temperature, so called neither winter nor summer.`;
    } else {
      s = `The rain rule reads a ${year.grow} growing season: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) falls in ${at}, ${year.grow === 'winter' ? 'cooler' : 'warmer'} than the year (wet-season mean ${T1(year.wetT)} against a yearly mean of ${T1(year.meanT)}). ${hemi}`;
      short = `Rain rule: a ${year.grow} growing season, ${forYou}${year.shiftable ? ` (${at} at the habitat, ${home})` : ''}.`;
    }
    add('Its year', 'Its year', s, `Read from the median year of CHELSA monthly rainfall and mean temperature across the envelope cells: the rain rule takes the smallest set of months carrying 70% of the rain and calls it winter when its mean is more than half a degree below the year's, summer when more than half a degree above, and neither in between; the temperature rule, used only under 120 mm, names the cooler six months when they are at least a degree cooler than the other six. Months are shifted for the other hemisphere only where the temperature curve gives a season to reverse. A reading of the curves, not an observation of the plant.`, true, short);

    /* ---- rain ---- */
    const dry = m.filter((x) => x.precipMm < 5).length;
    const wetSpanText = year.fog ? '' : `, ${RAIN(year.wetMm)} of it ${at}`;
    add('Rain', 'Rain', `${RAIN(year.annualMm)} a year at the habitat${wetSpanText}. Wettest month ${mon(year.wettest)} at ${RAIN(m[year.wettest - 1].precipMm)}, driest ${mon(year.driest)} at ${RAIN(m[year.driest - 1].precipMm)}${dry ? `; ${dry} month${dry === 1 ? '' : 's'} under 5 mm` : ''}${input.annualP10 != null && input.annualP90 != null && Math.round(input.annualP10) !== Math.round(input.annualP90) ? `. Across the envelope cells the year's total runs ${RAIN(input.annualP10)} to ${RAIN(input.annualP90)} (10th to 90th percentile of each cell's own year)` : ''} (${ENV}; habitat calendar, ${home} hemisphere).`, `CHELSA monthly precipitation, ${ENV.replace(', CHELSA', '')}. The rain that falls where the species is recorded; nothing about how the plant takes water.`, true, `Habitat rain ${RAIN(year.annualMm)} a year, wettest ${mon(year.wettest)} at ${RAIN(m[year.wettest - 1].precipMm)}, driest ${mon(year.driest)} at ${RAIN(m[year.driest - 1].precipMm)} (habitat calendar, ${home} hemisphere).`);
  }

  /* ---- light ---- */
  if (dlis.length) {
    const lo = Math.round(Math.min(...dlis)), hi = Math.round(Math.max(...dlis));
    const lo10 = p10 ? p10.map((x) => x.dli).filter((x): x is number => x != null) : [];
    const hi90 = p90 ? p90.map((x) => x.dli).filter((x): x is number => x != null) : [];
    const rlo = lo10.length ? Math.round(Math.min(...lo10)) : lo, rhi = hi90.length ? Math.round(Math.max(...hi90)) : hi;
    // The cells' spread, stated as what it is: the lowest 10th-percentile month to the highest 90th-percentile month. Omitted when it adds nothing.
    const range = lo10.length && hi90.length && (rlo !== lo || rhi !== hi) ? `; the lowest 10th-percentile month across the cells is ${rlo}, the highest 90th-percentile month ${rhi}` : '';
    add('Light', 'Light', `Open sky over the habitat: ${lo} to ${hi} mol/m²/day across the year (daily light integral, ${ENV}${range}).`, 'CHELSA shortwave radiation at each envelope cell, a daily-mean flux taken to a daily total and converted at 2.07 mol of PAR per MJ. The sky over the habitat, measured; what reaches a plant under a rock, a shrub or a shade cloth is not.', true, `Open sky over the habitat: ${lo} to ${hi} mol/m²/day.`);
  }

  /* ---- warmth ---- */
  if (m) {
    const coldI = m.reduce((b, x, j) => (x.tmin < m[b].tmin ? j : b), 0);
    const hotI = m.reduce((b, x, j) => (x.tmax > m[b].tmax ? j : b), 0);
    const bits: string[] = [];
    if (ex) {
      const frost = frostWording(ex);
      bits.push(`Coldest: the 1st-percentile night over ${ex.years} years at the typical cell is ${T1(ex.minP01)}, the absolute minimum ${T1(ex.minAbs)}, ${frost} (NASA POWER daily minima). Warmest: the 99th-percentile day is ${T1(ex.maxP99)}.`);
    }
    const spread10 = p10 && p90 ? ` (across the envelope cells ${T1(p10[coldI].tmin)} to ${T1(p90[coldI].tmin)})` : '';
    bits.push(`Monthly means: coldest night ${T1(m[coldI].tmin)} in ${mon(coldI + 1)}${spread10}, warmest day ${T1(m[hotI].tmax)} in ${mon(hotI + 1)} (${ENV}).`);
    const floor = coldFloor(m, ex, guess);
    if (floor) bits.push(floor.s);
    add('Warmth and air', 'Temperature', bits.join(' '), `${ex ? `NASA POWER daily minima and maxima 1981–2024 at the typical cell${ex.lapseAppliedM ? ', lapse-corrected to its elevation' : ', without lapse correction'}; ` : ''}CHELSA monthly means, ${ENV}. The cold floor is the figure named in its sentence${guess?.arch.minC != null ? `, and the archetype table's group minimum where that is higher` : ''}. Not a measured survival limit for any plant in a pot.`, true, floor?.short);
    const rhs = m.map((x) => x.rh).filter((x): x is number => x != null);
    if (rhs.length) add('Warmth and air', 'Humidity', `Relative humidity at the habitat: ${Math.round(Math.min(...rhs)) === Math.round(Math.max(...rhs)) ? `${Math.round(Math.min(...rhs))}% all year` : `${Math.round(Math.min(...rhs))} to ${Math.round(Math.max(...rhs))}% across the year`} (monthly means, ${ENV}). A figure about the air, saying nothing about how the plant takes water.`, `CHELSA relative humidity, ${ENV.replace(', CHELSA', '')}.`, true);
  } else {
    const floor = coldFloor(null, ex, guess);
    if (floor) add('Warmth and air', 'Temperature', floor.s, `The archetype table's conventional minimum for the group; no habitat figure is on file for this species.`, false, floor.short);
  }

  return { rows, arch: guess, year };
}

export const CARD_ORDER = ['Its year', 'Rain', 'Light', 'Warmth and air'];

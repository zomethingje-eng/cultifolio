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
 * extremes (NASA POWER at a typical spot in the range), and the care archetype, which
 * supplies one figure: a convention for growing the group indoors, with no source,
 * shown apart from the habitat's figures and never changing the cold floor (round
 * sixty; self-review 3).
 */
import { frostWording } from './extremes';
import { MON3 } from './months';
import { archFor, conventionOf, type ArchGuess } from './arch';
import { temp, deltaT, rain, ruleRain, ruleDeltaT, METRIC, type Units } from './units';

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
  /** The median year across the grid cells of the range. */
  months?: Month[] | null;
  /** The 10th and 90th percentile years, when the dossier carries them: the range the species is recorded in. */
  p10?: Pick<Month, 'tmin' | 'dli'>[] | null;
  p90?: Pick<Month, 'tmin' | 'dli'>[] | null;
  extremes?: Extremes | null;
  /** Why there are no extremes, when there are none: 'refused' (the source did not answer when the dossier was built) is said as not checked, never as none on file (round sixteen, 7). */
  extremesStatus?: 'ok' | 'none' | 'refused' | 'skipped' | 'sea' | null;
  /** Habitat latitude (the map marker's), for the hemisphere. */
  lat?: number | null;
  /** The grower's latitude, if known: the one-sentence shorts print months for that hemisphere. */
  readerLat?: number | null;
  /** The reader's units; every figure in every sentence follows it. Metric when unset. */
  units?: Units;
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
  /**
   * The same sentence in a grower's words, fact first, and the rule and source it rests on apart, for the page to set in
   * grey after it (round fifty-eight; the first-impression review). Written by the same rule at the same moment as `s`
   * and `short`; a reading of the figures, never advice.
   */
  plain?: { lead: string; rule: string };
}

export interface Year {
  /** What the rain rule read: a winter or summer growing season, or none ('even'); 'cool' when there was no rainy season to read and the temperature rule named the cooler half instead. */
  grow: 'winter' | 'summer' | 'even' | 'cool';
  /** Under 120 mm a year: no rainy season to read. `growMonths` then holds the temperature rule's reading, the cooler half. */
  fog: boolean;
  /** 70% of the rain takes eight months or more: no short rainy season is read (a long rainy season may still be one). */
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

/**
 * Every month whose figure shows the same as the highest (or lowest) as printed, calendar order, 0-based. A tie names every
 * month it holds: "warmest day 22 °C in January" was said of a year whose February was as warm, on every surface (round
 * sixty-one; visitor 5). `fmt` is the surface's own formatter, so a tie is a tie in what the reader sees.
 */
export function tiedMonths(values: number[], hi: boolean, fmt: (v: number) => string = (v) => String(v)): number[] {
  if (!values.length) return [];
  const best = values.reduce((b, v, i) => ((hi ? v > values[b] : v < values[b]) ? i : b), 0);
  const shown = fmt(values[best]);
  return values.map((v, i) => (fmt(v) === shown ? i : -1)).filter((i) => i >= 0);
}

/** Months by 0-based index as words: "January", "January and February", "Jan, Feb and Mar"; "every month" for all twelve. */
export function monthNames(idx: number[], style: 'long' | 'short' = 'long'): string {
  if (idx.length >= 12) return 'every month';
  const xs = idx.map((i) => (style === 'long' ? MON : MON3)[((i % 12) + 12) % 12]);
  return xs.length < 2 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
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

// The reader's units, set at the top of cultivationSheet() from its input and read by every formatter below: one
// setting, so a card and its short form are never in different units. Metric until a sheet says otherwise.
let U: Units = METRIC;
const T = (c: number) => temp(c, U, 0);
const T1 = (c: number) => temp(c, U, 1);
const DT = (dc: number) => deltaT(dc, U, 1);
const RAIN = (mm: number) => rain(mm, U);

/**
 * The cold figure a page leads with, with its provenance. `habitat` is the 1st-percentile night when the daily extremes
 * are on file (`kind: 'night'`, a cold floor), else the coldest month's mean night from CHELSA (`kind: 'mean'`, named
 * as what it is and never as a floor), else null. `convention` is the archetype table's figure for the group, which has
 * no source: it is said apart, as a convention, and never raises or replaces the habitat figure (round sixty;
 * self-review 3, words 1: "the floor rule takes the higher" put 10 °C over a -3 °C Puya night).
 */
export interface ColdFloor {
  habitat: number | null;
  kind: 'night' | 'mean' | null;
  convention: { minC: number; group: string; why: string; text: string } | null;
  s: string;
  short: string;
  hab: boolean;
  plain: { lead: string; rule: string };
}
/** Why there is no daily extremes series, as its own sentence: a refusal is "not checked", never an absence (rule 2). */
export const extremesWhy = (exStatus?: SheetInput['extremesStatus']): string =>
  exStatus === 'refused' ? 'The daily extremes were not checked: NASA POWER did not answer when this page was built.' : exStatus === 'skipped' ? 'The daily extremes were not asked for when this page was built.' : exStatus === 'sea' ? 'The daily extremes were read at a weather cell that is mostly sea and are not used.' : 'No daily extremes are on file.';
const extremesWhyShort = (exStatus?: SheetInput['extremesStatus']): string =>
  exStatus === 'refused' ? 'the daily extremes were not checked' : exStatus === 'skipped' ? 'the daily extremes were not asked for' : exStatus === 'sea' ? 'the daily extremes fell on a sea cell and are not used' : 'no daily extremes on file';
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/**
 * Why there is no habitat figure at all, by the dossier's climate status: a source that did not answer, or a build still to
 * run, is said as that and never as "on file", which is said of a species with none derivable (round sixty-one; visitor 4,
 * rule 2: an epiphyte whose climate source refused was told "No habitat figure is on file").
 */
const noHabitat = (st?: SheetInput['climateStatus']) =>
  st === 'refused'
    ? { s: 'The habitat climate was not checked: a source did not answer when this page was built, so no cold floor is read.', short: 'Habitat climate not checked', lead: 'Habitat climate not checked, so no cold floor is read.' }
    : st === 'pending'
      ? { s: 'The habitat climate is pending: it has not been derived yet, so no cold floor is read.', short: 'Habitat climate pending', lead: 'Habitat climate pending, so no cold floor is read.' }
      : { s: 'No habitat figure is on file for this species, so no cold floor is read.', short: 'No habitat cold figure on file', lead: 'No habitat cold figure on file.' };
export function coldFloor(m: Month[] | null, ex: Extremes | null, guess: ArchGuess | null, units: Units = U, exStatus?: SheetInput['extremesStatus'], climateStatus?: SheetInput['climateStatus']): ColdFloor | null {
  U = units;
  const conv = guess && guess.arch.minC != null ? { minC: guess.arch.minC, group: guess.arch.many ?? guess.arch.lab.toLowerCase(), why: guess.why, text: conventionOf(guess.arch, T)! } : null;
  if (ex) {
    const f = ex.minP01;
    return { habitat: f, kind: 'night', convention: conv, s: `Cold floor: ${T1(f)}, which is the 1st-percentile night over ${ex.years} years at a typical spot in the range (NASA POWER).`, short: `Cold floor ${T1(f)} (1st-percentile habitat night, NASA POWER).`, hab: true, plain: { lead: `Cold floor ${T1(f)}: one night in a hundred at a typical spot in the range is colder.`, rule: `NASA POWER, ${ex.years} years` } };
  }
  if (m) {
    // A month's mean night is not a floor: it is the mean of a month's lows, above the nights a floor is read from. Headed
    // "Cold floor" over a sea notice that printed a colder figure, it told a grower the coast was safer than it is (round
    // thirty-seven, R1-2). It is named as what it is wherever it stands in, and why there are no extremes is its own
    // sentence, so the figure's sentence keeps its verb (round sixty; words 9).
    const i = m.reduce((b, x, j) => (x.tmin < m[b].tmin ? j : b), 0);
    const f = m[i].tmin;
    // Every month that ties for the coldest night, as printed (round sixty-one; visitor 5).
    const at = monthNames(tiedMonths(m.map((x) => x.tmin), false, T1));
    return { habitat: f, kind: 'mean', convention: conv, s: `Cold floor: none read. The nearest figure is ${T1(f)}, the coldest month's mean night, ${at}, in the median year (CHELSA); a month's mean night is warmer than the nights a floor is read from. ${extremesWhy(exStatus)}`, short: `Coldest mean night ${T1(f)} (coldest month's mean night, CHELSA; no floor read).`, hab: true, plain: { lead: `Coldest month's mean night ${T1(f)}, not a cold floor: ${extremesWhyShort(exStatus)}.`, rule: 'CHELSA' } };
  }
  if (!conv) return null;
  // No habitat figure at all: the convention alone, said as a convention with no source, and no floor (round sixty).
  const none = noHabitat(climateStatus);
  return { habitat: null, kind: null, convention: conv, s: `${none.s} Apart from the habitat, ${conv.text} (archetype table, by ${conv.why}).`, short: `${none.short}; ${conv.text} (archetype table).`, hab: false, plain: { lead: `${none.lead} ${cap(conv.text)}.`, rule: 'archetype table' } };
}

/**
 * Months tied for a place: "wettest month March at 40 mm", or "wettest months (3 at 40 mm)" when several share the figure
 * as printed, and nothing named at all when every month does (round sixty; words 20: "wettest January at 0 mm, driest
 * January at 0 mm" named one of seven tied months).
 */
function extremeMonths(m: Month[], idx: number, fmt: (v: number) => string, word: 'wettest' | 'driest'): string {
  const v = fmt(m[idx].precipMm);
  const n = m.filter((x) => fmt(x.precipMm) === v).length;
  return n > 1 ? `${word} months (${n} at ${v})` : `${word} month ${mon(idx + 1)} at ${v}`;
}

export function cultivationSheet(input: SheetInput): { rows: Row[]; arch: ArchGuess | null; year: Year | null; floor: ColdFloor | null } {
  U = input.units ?? METRIC;
  const rows: Row[] = [];
  const add = (card: string, k: string, s: string, why: string, hab = false, short?: string, plain?: Row['plain']) => rows.push({ card, k, s, why, hab, short, plain });
  const guess = archFor(input.scientific, input.family);
  let floorOut: ColdFloor | null = null;
  const m = input.months && input.months.length === 12 ? input.months : null;
  const p10 = input.p10 && input.p10.length === 12 ? input.p10 : null;
  const p90 = input.p90 && input.p90.length === 12 ? input.p90 : null;
  const ex = input.extremes ?? null;
  const year = m ? growingYear(m, input.lat) : null;
  const dlis = m ? m.map((x) => x.dli).filter((x): x is number => x != null) : [];
  const ENV = 'median year across the grid cells of the range, CHELSA';

  /* ---- its year ---- */
  if (m && year) {
    const home = year.south ? 'southern' : 'northern';
    const away = year.south ? 'northern' : 'southern';
    const at = runs(year.growMonths);
    const shifted = runs(year.shifted);
    const reader = runs(forReader(year, input.readerLat));
    const readerSide = (input.readerLat ?? 40) < 0 ? 'southern' : 'northern';
    const nearEq = Math.abs(input.lat ?? 40) < 10;
    // The rule the code applies, said as that rule: under 4 °C of range, or within 10° of the equator, the shift does not
    // apply. "No thermal season there there" asserted a fact of an 8 °C curve that only its latitude was tested for
    // (round sixty; words 8).
    const hemi = year.shiftable
      ? `Months are the habitat's, ${home} hemisphere; shifted six months for a ${away}-hemisphere collection: ${shifted}.`
      : nearEq
        ? `Months are the habitat's, ${home} hemisphere. The habitat lies within 10° of the equator, where the shift rule does not apply, so they are not shifted for a collection elsewhere.`
        : `Months are the habitat's, ${home} hemisphere. The temperature curve moves under ${ruleDeltaT(4, U)} between the warmest and coldest month, where the shift rule does not apply, so they are not shifted for a collection elsewhere.`;
    // What the reader-side clause says: the shifted months in their hemisphere, or the habitat's own when no shift applies.
    const forYou = year.shiftable ? `${reader} in the ${readerSide} hemisphere` : `${at} at the habitat (not shifted)`;
    let s: string;
    let short: string;
    let lead: string;
    // The reader's months first, the habitat's once in brackets: one hemisphere per sentence (round fifty-eight).
    const yours = year.shiftable ? `${reader}${reader !== at ? ` (${at} at the habitat)` : ''}` : `${at} (the habitat's months, not shifted)`;
    if (year.none) {
      s = `Rain at the habitat is ${RAIN(year.annualMm)} a year (${ENV}). Under ${ruleRain(120, U)} the rain rule reads no rainy season, and the growing-season rule infers nothing from it. The temperature curve moves ${DT(year.rangeT)} between the warmest and coldest month and the coolest six months are within a degree of the warmest six, so the temperature rule names no cooler half either.`;
      short = `Rain rule: no rainy season to read (${RAIN(year.annualMm)} a year); the temperature curve is flat (${DT(year.rangeT)} of range), so no cooler half is named.`;
      lead = `${RAIN(year.annualMm)} of rain a year, under the rule's ${ruleRain(120, U)}, and an even temperature: no season to read.`;
    } else if (year.fog) {
      s = `Rain at the habitat is ${RAIN(year.annualMm)} a year (${ENV}). Under ${ruleRain(120, U)} the rain rule reads no rainy season, and the growing-season rule infers nothing from it. The temperature rule reads the cooler six months as ${at}. ${hemi}`;
      short = `Rain rule: no rainy season to read (${RAIN(year.annualMm)} a year); the temperature rule's cooler six months are ${forYou}.`;
      lead = `${RAIN(year.annualMm)} of rain a year, under the rule's ${ruleRain(120, U)}, so no rainy season is read; the cooler six months are ${yours}.`;
    } else if (year.spread) {
      // What the rule reads: the rain is spread, so no short rainy season; eight wet months can still be a long one (round sixty; the round forty-two review).
      s = `The rain rule reads no short rainy season: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) takes ${year.growMonths.length} months, ${at}. Mean temperature moves ${DT(year.rangeT)} between the warmest and coldest month. ${hemi}`;
      short = `Rain rule: rain spread over ${year.growMonths.length} months, so no short rainy season (${forYou}).`;
      lead = `Rain spread over ${year.growMonths.length} months: no short rainy season; ${RAIN(year.annualMm)} a year.`;
    } else if (year.flat) {
      s = `The rain rule reads a sharp season: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) falls in ${at}. The temperature curve is flat, ${DT(year.rangeT)} between the warmest and coldest month, so the growing-season rule does not infer a growing season from it. ${hemi}`;
      short = `Rain rule: a sharp rainy season, ${forYou}; the temperature curve is flat (${DT(year.rangeT)} of range), so no growing season is inferred.`;
      lead = `A sharp rainy season, ${yours}, in a year of even temperature.`;
    } else if (year.grow === 'even') {
      s = `The rain rule reads a rainy season with no name: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) falls in ${at}, whose mean temperature, ${T1(year.wetT)}, is within ${U === 'us' ? 'a degree Fahrenheit (half a degree Celsius)' : 'half a degree'} of the year's, ${T1(year.meanT)}, so it is neither the cooler nor the warmer part of the year. ${hemi}`;
      short = `Rain rule: a rainy season, ${forYou}, at the year's mean temperature, so called neither winter nor summer.`;
      lead = `A rainy season, ${yours}, neither the cool nor the warm half of the year.`;
    } else {
      s = `The rain rule reads a ${year.grow} growing season: 70% of the year's rain (${RAIN(year.wetMm)} of ${RAIN(year.annualMm)}) falls in ${at}, ${year.grow === 'winter' ? 'cooler' : 'warmer'} than the year (wet-season mean ${T1(year.wetT)} against a yearly mean of ${T1(year.meanT)}). ${hemi}`;
      // The habitat's months once, and only when they differ from the reader's (round sixty; words 7).
      short = `Rain rule: a ${year.grow} growing season, ${forYou}${year.shiftable && reader !== at ? ` (${at} at the habitat, ${home})` : ''}.`;
      lead = `Wet ${year.grow === 'winter' ? 'winters' : 'summers'}: the rain comes ${yours}, read as a ${year.grow} growing season.`;
    }
    add('Seasons', 'Its year', s, `Read from the median year of CHELSA monthly rainfall and mean temperature across the grid cells of the range: the rain rule takes the smallest set of months carrying 70% of the rain and calls it winter when its mean is more than ${U === 'us' ? 'a degree Fahrenheit (0.5 °C)' : 'half a degree'} below the year's, summer when more than that above, and neither in between; the temperature rule, used only under ${ruleRain(120, U)}, names the cooler six months when they are at least ${U === 'us' ? '1.8 °F (1 °C)' : 'a degree'} cooler than the other six. Months are shifted for the other hemisphere only where the temperature curve moves ${ruleDeltaT(4, U)} or more and the habitat lies 10° or more from the equator. A reading of the curves, not an observation of the plant.`, true, short, { lead, rule: year.fog || year.none ? 'rain and temperature rules, CHELSA' : 'rain rule, CHELSA' });

    /* ---- rain ---- */
    const dry = m.filter((x) => x.precipMm < 5).length;
    const wetSpanText = year.fog ? '' : `, ${RAIN(year.wetMm)} of it ${at}`;
    const even = m.every((x) => RAIN(x.precipMm) === RAIN(m[0].precipMm));
    const wd = even ? `The same in every month, ${RAIN(m[0].precipMm)}` : `${cap(extremeMonths(m, year.wettest - 1, RAIN, 'wettest'))}, ${extremeMonths(m, year.driest - 1, RAIN, 'driest')}`;
    // The source in a sentence of its own: "under 0.20 in (5 mm) (median year …)" was two brackets in a row (round sixty; words 20).
    add('Rain', 'Rain', `${RAIN(year.annualMm)} a year at the habitat${wetSpanText}. ${wd}${dry ? `; ${dry} month${dry === 1 ? '' : 's'} under ${ruleRain(5, U)}` : ''}.${input.annualP10 != null && input.annualP90 != null && Math.round(input.annualP10) !== Math.round(input.annualP90) ? ` Across the grid cells of the range the year's total runs ${RAIN(input.annualP10)} to ${RAIN(input.annualP90)}, the 10th to 90th percentile of each cell's own year.` : ''} Habitat calendar, ${home} hemisphere; ${ENV}.`, `CHELSA monthly precipitation, ${ENV.replace(', CHELSA', '')}. The rain that falls where the species is recorded; nothing about how the plant takes water.`, true, `Habitat rain ${RAIN(year.annualMm)} a year, ${even ? `the same in every month` : `${extremeMonths(m, year.wettest - 1, RAIN, 'wettest')}, ${extremeMonths(m, year.driest - 1, RAIN, 'driest')}`} (CHELSA; habitat calendar, ${home} hemisphere).`, { lead: `${RAIN(year.annualMm)} of rain a year${dry ? `, ${dry === 12 ? 'every month' : `${dry} month${dry === 1 ? '' : 's'}`} under ${ruleRain(5, U)}` : ''}.`, rule: 'CHELSA' });
  }

  /* ---- light ---- */
  if (dlis.length) {
    const lo = Math.round(Math.min(...dlis)), hi = Math.round(Math.max(...dlis));
    const lo10 = p10 ? p10.map((x) => x.dli).filter((x): x is number => x != null) : [];
    const hi90 = p90 ? p90.map((x) => x.dli).filter((x): x is number => x != null) : [];
    const rlo = lo10.length ? Math.round(Math.min(...lo10)) : lo, rhi = hi90.length ? Math.round(Math.max(...hi90)) : hi;
    // The cells' spread, stated as what it is: the lowest 10th-percentile month to the highest 90th-percentile month. Omitted when it adds nothing.
    const range = lo10.length && hi90.length && (rlo !== lo || rhi !== hi) ? `; the lowest 10th-percentile month across the cells is ${rlo}, the highest 90th-percentile month ${rhi}` : '';
    add('Light', 'Light', `Open sky over the habitat: ${lo} to ${hi} mol/m²/day across the year (daily light integral, ${ENV}${range}).`, 'CHELSA shortwave radiation at each envelope cell, a daily-mean flux taken to a daily total and converted at 2.07 mol of PAR per MJ. The sky over the habitat, measured; what reaches a plant under a rock, a shrub or a shade cloth is not.', true, `Open sky over the habitat: ${lo} to ${hi} mol/m²/day (CHELSA shortwave).`, { lead: `Open-sky light of ${lo} to ${hi} DLI across the year.`, rule: 'CHELSA shortwave' });
  }

  /* ---- warmth ---- */
  if (m) {
    const coldI = m.reduce((b, x, j) => (x.tmin < m[b].tmin ? j : b), 0);
    const hotI = m.reduce((b, x, j) => (x.tmax > m[b].tmax ? j : b), 0);
    const bits: string[] = [];
    if (ex) {
      const frost = frostWording(ex);
      bits.push(`Coldest: the 1st-percentile night over ${ex.years} years at a typical spot in the range is ${T1(ex.minP01)}, the absolute minimum ${T1(ex.minAbs)}, ${frost} (NASA POWER daily minima). Warmest: the 99th-percentile day is ${T1(ex.maxP99)}.`);
    }
    const spread10 = p10 && p90 ? ` (across the grid cells of the range ${T1(p10[coldI].tmin)} to ${T1(p90[coldI].tmin)})` : '';
    // Every month that ties, as printed, for the coldest night and the warmest day (round sixty-one; visitor 5).
    const coldAt = monthNames(tiedMonths(m.map((x) => x.tmin), false, T1));
    const hotAt = monthNames(tiedMonths(m.map((x) => x.tmax), true, T1));
    bits.push(`Monthly means: coldest night ${T1(m[coldI].tmin)} in ${coldAt}${spread10}, warmest day ${T1(m[hotI].tmax)} in ${hotAt} (${ENV}).`);
    floorOut = coldFloor(m, ex, guess, U, input.extremesStatus);
    const floor = floorOut;
    if (floor) bits.push(floor.s);
    // The series' own length, never a fixed "1981–2024" (round sixty; words 20); the convention is never part of the floor (round sixty).
    add('Warmth and air', 'Temperature', bits.join(' '), `${ex ? `NASA POWER daily minima and maxima over ${ex.years} years at a typical spot in the range${ex.lapseAppliedM ? ', lapse-corrected to its elevation' : ', without lapse correction'}; ` : ''}CHELSA monthly means, ${ENV.replace(', CHELSA', '')}. ${ex ? 'The cold floor is the 1st-percentile night named in its sentence.' : 'No cold floor is read without a daily extremes series; the mean night named in its sentence is not one.'} Not a measured survival limit for any plant in a pot.`, true, floor?.short, floor?.plain);
    const rhs = m.map((x) => x.rh).filter((x): x is number => x != null);
    if (rhs.length) add('Warmth and air', 'Humidity', `Relative humidity at the habitat: ${Math.round(Math.min(...rhs)) === Math.round(Math.max(...rhs)) ? `${Math.round(Math.min(...rhs))}% all year` : `${Math.round(Math.min(...rhs))} to ${Math.round(Math.max(...rhs))}% across the year`} (monthly means, ${ENV}). A figure about the air, saying nothing about how the plant takes water.`, `CHELSA relative humidity, ${ENV.replace(', CHELSA', '')}.`, true);
  } else {
    floorOut = coldFloor(null, ex, guess, U, undefined, input.climateStatus);
    const floor = floorOut;
    // Which kind of absence, said as the sentence says it: not checked, pending, or none on file (round sixty-one; visitor 4).
    const absent = input.climateStatus === 'refused' ? 'the habitat climate was not checked (a source did not answer)' : input.climateStatus === 'pending' ? 'the habitat climate is pending' : 'no habitat figure is on file for this species';
    if (floor) add('Warmth and air', 'Temperature', floor.s, `The archetype table's convention for growing the group indoors, which gives no source; ${absent}, so no cold floor is read.`, false, floor.short, floor.plain);
  }

  return { rows, arch: guess, year, floor: floorOut };
}

export const CARD_ORDER = ['Seasons', 'Rain', 'Light', 'Warmth and air'];

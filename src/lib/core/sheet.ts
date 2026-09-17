/**
 * The cultivation sheet: what to do with the plant, worked out on the page
 * from what the page already shows. Every row states its sentence and where
 * the sentence came from, and rows that rest on this species' own habitat
 * figures are marked apart from rows that are conventional practice for its
 * kind of plant. It produces no prose it cannot source.
 *
 * Inputs: the dossier's monthly climate at the habitat centre (CHELSA), the
 * extremes (NASA POWER), and the care archetype (species → genus → family).
 */
import { archFor, WATER_Q_LAB, WATER_Q_NOTE, type ArchGuess } from './arch';

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
  years: number;
}
export interface SheetInput {
  scientific: string;
  family?: string | null;
  months?: Month[] | null;
  extremes?: Extremes | null;
  /** Habitat centre latitude, for the hemisphere. */
  lat?: number | null;
  /** The grower's latitude, if known: the one-sentence shorts print growing months for that hemisphere. */
  readerLat?: number | null;
}

export interface Row {
  /** The card this row belongs in. */
  card: string;
  k: string;
  s: string;
  why: string;
  /** Rests on this species' own habitat figures (as opposed to its archetype). */
  hab: boolean;
  /**
   * The row in one sentence, written by the same rule at the same moment as
   * the row, so a condensed note is the rows and can never say something the
   * cards do not. Absent when the row is not worth a sentence in a summary.
   */
  short?: string;
}

export interface Year {
  /** 'winter' | 'summer' | 'even' */
  grow: 'winter' | 'summer' | 'even';
  /** Under 120 mm a year: there was no rainy season to read, so the growing months were read from temperature (the cooler half). Says nothing about fog or how the plant takes water. */
  fog: boolean;
  /** Habitat months (1–12) carrying the growing season, in habitat time. */
  growMonths: number[];
  /** The same season as it falls in the opposite hemisphere. */
  shifted: number[];
  south: boolean;
  wetMm: number;
  annualMm: number;
  driest: number;
  wettest: number;
}

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const mon = (m: number) => MON[(m - 1 + 12) % 12];

/** A run of months as words: "March to May", "November to February". Wraps the year. */
export function span(ms: number[]): string {
  if (!ms.length) return '';
  const set = new Set(ms);
  // find a start that is not preceded by a member
  let start = ms[0];
  for (const m of ms) if (!set.has(((m - 2 + 12) % 12) + 1)) start = m;
  const run: number[] = [];
  let cur = start;
  while (set.has(cur) && run.length < 12) {
    run.push(cur);
    cur = (cur % 12) + 1;
  }
  if (run.length === 12) return 'all year';
  if (run.length === 1) return mon(run[0]);
  return `${mon(run[0])} to ${mon(run[run.length - 1])}`;
}

/**
 * The growing year, from the shape of the rain and temperature curves.
 * Growth follows water in the places these plants come from; the question is
 * whether the water comes in the warm half of the year or the cool half.
 */
export function growingYear(months: Month[], lat: number | null | undefined): Year | null {
  if (months.length !== 12) return null;
  const annual = months.reduce((a, m) => a + m.precipMm, 0);
  const wettest = months.reduce((b, m, i) => (m.precipMm > months[b].precipMm ? i : b), 0) + 1;
  const driest = months.reduce((b, m, i) => (m.precipMm < months[b].precipMm ? i : b), 0) + 1;
  // The wet season is the smallest set of months that carries 70% of the year's rain. Four months
  // that do is a sharp season; nine months that do is no season at all.
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
  const range = Math.max(...months.map((m) => m.tmean)) - Math.min(...months.map((m) => m.tmean));
  // Under 120 mm a year there is no rainy season to read, so the growing season is read from temperature
  // instead: the cooler half. That is a reading of the curves; it says nothing about how the plant gets its water.
  const fog = annual < 120;
  if (fog) wet = [...months.keys()].sort((a, b) => months[a].tmean - months[b].tmean).slice(0, 6).map((i) => i + 1).sort((a, b) => a - b);
  const wetT = wet.reduce((a, m) => a + months[m - 1].tmean, 0) / wet.length;
  const wetMm = wet.reduce((a, m) => a + months[m - 1].precipMm, 0);
  // Little seasonality in either curve: no strict rest to speak of.
  const even = !fog && (range < 4 || wet.length >= 8);
  const grow: Year['grow'] = even ? 'even' : wetT < meanT - 0.5 ? 'winter' : 'summer';
  const south = (lat ?? 0) < 0;
  const shifted = wet.map((m) => ((m + 5) % 12) + 1).sort((a, b) => a - b);
  return { grow, fog, growMonths: wet, shifted, south, wetMm, annualMm: annual, driest, wettest };
}

const T = (c: number) => `${Math.round(c)} °C`;
const range8 = (m: Month[]) => Math.max(...m.map((x) => x.tmean)) - Math.min(...m.map((x) => x.tmean)) >= 8;
const wetSpanCool = (m: Month[]) => span([...m.keys()].sort((a, b) => m[a].tmean - m[b].tmean).slice(0, 6).map((i) => i + 1).sort((a, b) => a - b));
const RAIN = (mm: number) => `${Math.round(mm)} mm`;

export function cultivationSheet(input: SheetInput): { rows: Row[]; arch: ArchGuess | null; year: Year | null } {
  const rows: Row[] = [];
  const add = (card: string, k: string, s: string, why: string, hab = false, short?: string) => rows.push({ card, k, s, why, hab, short });
  // Months are printed for the reader's hemisphere when a reader latitude is given; otherwise habitat time.
  const readerSouth = (input.readerLat ?? 40) < 0;
  const guess = archFor(input.scientific, input.family);
  const arch = guess?.arch ?? null;
  const m = input.months && input.months.length === 12 ? input.months : null;
  const ex = input.extremes ?? null;
  const year = m ? growingYear(m, input.lat) : null;
  const dlis = m ? m.map((x) => x.dli).filter((x): x is number => x != null) : [];

  /* ---- light ---- */
  if (dlis.length) {
    const lo = Math.round(Math.min(...dlis)), hi = Math.round(Math.max(...dlis));
    const level = arch?.exposure ?? 'full';
    const target = level === 'shade' ? Math.round(hi * 0.25) : level === 'part' ? Math.round(hi * 0.5) : hi;
    add(
      'Light',
      'Light',
      (level === 'shade'
        ? 'Keep it out of direct sun and well back from a fixture: it sits shaded in habitat, and full output will bleach it.'
        : level === 'part'
          ? 'Bright shade, or a window it never gets full sun through: it grows in partial shade in habitat, well under open sunlight.'
          : 'Give it as much light as you can indoors. It grows in the open, and almost nothing in a house is too bright for it.') +
        ` The open sky over its habitat delivers ${lo} to ${hi} mol/m²/day across the year${level === 'full' ? '' : `, of which a plant in its shade sees perhaps ${target}`}; a south window in winter manages 5 to 10, and a good grow light 15 to 25 over twelve hours.`,
      `Daily light integral from CHELSA solar radiation at the habitat centre, month by month; exposure ${guess ? `assumed from ${guess.arch.lab.toLowerCase()} (${guess.why})` : 'assumed full, nothing on record says otherwise'}. A starting point, not a measurement of any plant in a pot.`,
      true,
      (level === 'shade' ? 'Keep it out of direct sun' : level === 'part' ? 'Bright shade or a window without full sun' : 'As much light as you can give it') + ` (open sky over its habitat ${lo} to ${hi} mol/m²/day${level === 'full' ? '' : ', of which it sees a fraction'}; a good grow light gives 15 to 25).`
    );
  } else if (arch) {
    add('Light', 'Light', `Conventionally ${arch.dli[0]} to ${arch.dli[1]} mol/m²/day for a ${arch.lab.toLowerCase()}, stated as a band because that is the resolution conventional advice has.`, `What a ${arch.lab.toLowerCase()} usually wants; no habitat radiation figure is available for this species.`, false, `Light: ${arch.dli[0]} to ${arch.dli[1]} mol/m²/day is the usual band for a ${arch.lab.toLowerCase()}.`);
  }

  /* ---- water and the year ---- */
  if (m && year) {
    const wetSpan = span(year.growMonths);
    const shiftedSpan = span(year.shifted);
    const dryMonths = m.filter((x) => x.precipMm < 5).length;
    const rain =
      year.annualMm < 120
        ? `Its habitat gets ${RAIN(year.annualMm)} a year${dryMonths ? `, ${dryMonths} months of it with under 5 mm` : ''}: almost no rain at all, and a pot that stays wet is nothing like where it comes from. (How such plants take their water in habitat, fog, dew or deep roots, is not something rainfall figures can say.)`
        : year.annualMm < 400
          ? `Its habitat gets ${RAIN(year.annualMm)} a year, ${RAIN(year.wetMm)} of it ${wetSpan}. Water in that season; outside it, let the pot dry through and stay dry.`
          : `Its habitat gets ${RAIN(year.annualMm)} a year, most of it ${wetSpan}, with the driest month (${mon(year.driest)}) at ${RAIN(m[year.driest - 1].precipMm)}. It is not a desert plant, whatever the leaves suggest.`;
    // The short repeats the posture the card opens with (the archetype's), then the rainfall figure: the same two facts, in that order.
    const posture = arch ? arch.water.split('. ')[0] + '.' : '';
    const rainShort =
      year.annualMm < 120
        ? `Its habitat gets ${RAIN(year.annualMm)} a year, so keep the pot far drier than the calendar suggests.`
        : year.annualMm < 400
          ? `Its habitat gets ${RAIN(year.annualMm)} a year, ${RAIN(year.wetMm)} of it in the growing season; soak it then and let it dry between.`
          : `Its habitat gets ${RAIN(year.annualMm)} a year, so it is not a desert plant.`;
    add('Water', 'Water', (arch ? arch.water + ' ' : '') + rain, `Monthly rainfall from CHELSA at the habitat centre${arch ? `; the watering posture is what a ${arch.lab.toLowerCase()} wants, inferred from ${guess!.why}` : ''}.`, true, [posture, rainShort].filter(Boolean).join(' '));

    const seasonWord = year.grow === 'winter' ? 'a winter grower' : year.grow === 'summer' ? 'a summer grower' : 'not strongly seasonal';
    const home = year.south ? 'southern' : 'northern';
    const away = year.south ? 'northern' : 'southern';
    const restSpan = span([...Array(12).keys()].map((i) => i + 1).filter((mm) => !year.growMonths.includes(mm)));
    const restShifted = span([...Array(12).keys()].map((i) => i + 1).filter((mm) => !year.shifted.includes(mm)));
    const readerGrow = readerSouth === year.south ? year.growMonths : year.shifted;
    const readerRest = [...Array(12).keys()].map((i) => i + 1).filter((mm) => !readerGrow.includes(mm));
    add(
      'Its year',
      'Its year',
      year.grow === 'even'
        ? `The rainfall curve at the habitat centre has no sharp season (${year.growMonths.length} months carry 70% of the year's rain)${range8(m) ? `, and the temperature curve is what divides the year: the cooler months are ${wetSpanCool(m)}. Growers usually find a plant from such a place grows then and slows in the heat, but that is practice, not something these figures show` : ' and the temperature barely moves, so the figures give no season to expect'}. Water when it is growing and ease off when it is not, and let the plant, not the calendar, say which.`
        : year.fog
          ? `The habitat centre gets ${RAIN(year.annualMm)} a year, too little to have a rainy season to read, so the growing months here are read from the temperature curve instead: the cooler half, ${wetSpan} at home in the ${home} hemisphere, ${shiftedSpan} in a ${away}-hemisphere collection. That is a reading of two curves, not a record of when this plant grows; water lightly in those months and hardly at all outside them, and let the plant correct the calendar.`
          : `At home in the ${home} hemisphere it is ${seasonWord}: the rain comes ${wetSpan}, the ${year.grow === 'winter' ? 'cool' : 'warm'} half of its year, and it rests ${restSpan}. In a ${away}-hemisphere collection the same plant grows ${shiftedSpan} and rests ${restShifted}; most keep habitat timing for a year or two after import and then drift to the local calendar. Rest means dry, bright, moving air, and no feed.`,
      `Read from the shape of the rainfall and temperature curves at the habitat centre (CHELSA): the growing season is the smallest run of months carrying 70% of the rain, or, under 120 mm a year, the cooler half. A reading of the curves, not an observation of the plant.`,
      true,
      year.grow === 'even'
        ? 'No sharp season in the habitat rainfall: it slows in the extremes rather than stopping, so let the plant rather than the calendar say when to water.'
        : year.fog
          ? `Almost no rain at home (${Math.round(year.annualMm)} mm a year), so its growing months are read from temperature: the cooler half, ${span(readerGrow)} where you are.`
          : `A ${year.grow} grower: where you are it grows ${span(readerGrow)} and rests ${span(readerRest)}, dry, bright and unfed.`
    );
  } else if (arch) {
    add('Water', 'Water', arch.water, `The posture for a ${arch.lab.toLowerCase()}, inferred from ${guess!.why}. No habitat rainfall figure is available for this species.`, false, arch.water.split('. ')[0] + '.');
  }

  /* ---- warmth ---- */
  if (m || arch) {
    const bits: string[] = [];
    let floor: number | null = null;
    if (ex) floor = ex.minP01;
    else if (m) floor = Math.min(...m.map((x) => x.tmin));
    if (floor != null && arch?.minC != null && floor < arch.minC) floor = arch.minC;
    if (floor != null) {
      const tested = ex ? `the 1st-percentile night over ${ex.years} years at the habitat centre (absolute minimum ${T(ex.minAbs)}${ex.frostDaysPerYear >= 1 ? `, ${Math.round(ex.frostDaysPerYear)} frost nights a year` : ex.frostDaysPerYear > 0 ? ', frost rarer than yearly' : ', no frost recorded'})` : 'the coldest monthly mean minimum at the habitat centre';
      bits.push(`Keep it above ${T(Math.max(floor, ex && ex.frostDaysPerYear < 1 && floor < 4 ? 4 : floor))} unless you have better information for this plant: a cautious floor worked back from ${tested}, not a tested limit for it in a pot.${ex && ex.frostDaysPerYear >= 10 ? ' It meets real frost at home, so a dry plant will take a few degrees below that; a wet one will not.' : ''}`);
    }
    if (arch?.maxC != null) bits.push(`Above about ${T(arch.maxC)} growth stalls long before anything looks wrong, which is why heat gets blamed on watering.`);
    else if (ex) bits.push(`Its hottest days at home reach ${T(ex.maxP99)}; a closed greenhouse or a car window will beat that, and that is what scorches.`);
    if (bits.length) {
      const shownFloor = floor != null ? Math.max(floor, ex && ex.frostDaysPerYear < 1 && floor < 4 ? 4 : floor) : null;
      add('Warmth and air', 'Temperature', bits.join(' '), `${ex ? 'NASA POWER daily minima 1981–2024, lapse-corrected to the habitat centre' : m ? 'CHELSA monthly means at the habitat centre' : 'Conventional practice'}${arch?.minC != null ? `, held up to ${T(arch.minC)} because a ${arch.lab.toLowerCase()} has no dormancy to meet the cold in` : ''}. Not a measured survival limit.`, !!(m || ex), shownFloor != null ? `Keep it above ${T(shownFloor)}${ex && ex.frostDaysPerYear >= 10 ? '; dry, it takes a few degrees less, wet it does not' : ''}: a cautious floor from habitat cold, not a tested limit.` : undefined);
    }
  }

  /* ---- air ---- */
  if (arch) {
    const rhs = m ? m.map((x) => x.rh).filter((x): x is number => x != null) : [];
    const habRh = rhs.length ? Math.round(rhs.reduce((a, b) => a + b, 0) / rhs.length) : null;
    add(
      'Warmth and air',
      'Air',
      arch.rh != null
        ? `Aim for ${arch.rh}% humidity or better at the plant. A heated room in winter sits nearer 25–30%, which is the usual reason one of these browns at the leaf edges while the watering looks perfectly reasonable. Grouping plants, a wet gravel tray or a humidifier all work; misting does not.${habRh != null ? ` Habitat averages ${habRh}%.` : ''}`
        : `Humidity is not worth chasing for this one. What it wants is air movement and a mix that drains.${habRh != null ? ` Habitat averages ${habRh}% relative humidity${habRh >= 60 ? ', which is humid air, not wet soil: a figure about the atmosphere, saying nothing about how the plant takes water.' : '.'}` : ''}`,
      `What a ${arch.lab.toLowerCase()} wants${habRh != null ? '; the habitat figure is CHELSA relative humidity at the centre' : ''}.`,
      habRh != null,
      arch.rh != null ? `It wants ${arch.rh}% humidity or better, which a heated room in winter does not give.` : undefined
    );
    if (arch.waterQ !== 'any') add('Water', 'What you water it with', `${WATER_Q_LAB[arch.waterQ]}. ${WATER_Q_NOTE[arch.waterQ]}`, 'A requirement of the group, not of this species specifically.', false, `${WATER_Q_LAB[arch.waterQ]}.`);
  }

  /* ---- feeding and repotting ---- */
  if (arch) {
    add(
      'Feeding and repotting',
      'Feeding',
      arch.feedD === 0 ? 'Do not feed it. Fertiliser in the substrate is one of the standard ways to kill this group.' : `Feed it about every ${arch.feedD} days while it is growing, and not at all once it winds down. Feeding a plant that has stopped pushes growth it cannot support and leaves salts in a pot nothing is drinking from.`,
      `The usual interval for a ${arch.lab.toLowerCase()}.`,
      false,
      arch.feedD === 0 ? 'Never feed it.' : `Feed every ${arch.feedD} days in growth and not at all at rest.`
    );
    add(
      'Feeding and repotting',
      'Repotting',
      `Repot roughly every ${arch.repotD >= 730 ? Math.round(arch.repotD / 365) + ' years' : Math.round(arch.repotD / 30) + ' months'}. ${arch.repotD <= 550 ? 'This group outgrows a pot or breaks down its substrate fast, and leaving it is a slow decline rather than a sudden one.' : 'There is no hurry with this group; disturbing the roots costs more than a tight pot does.'}`,
      `What a ${arch.lab.toLowerCase()} usually wants.`,
      false,
      `Repot about every ${arch.repotD >= 730 ? Math.round(arch.repotD / 365) + ' years' : Math.round(arch.repotD / 30) + ' months'}.`
    );
    add('What goes after it', 'Pests', `${arch.pests}. None of them die in one pass, since a spray kills the adults and not the eggs, so a second application about ${arch.reTreatD} days later is the whole treatment rather than an optional extra.`, 'The pests this kind of plant mostly gets, and the usual hatch interval.');
  }

  return { rows, arch: guess, year };
}

export const CARD_ORDER = ['Its year', 'Water', 'Light', 'Warmth and air', 'Feeding and repotting', 'What goes after it'];

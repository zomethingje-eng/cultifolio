/**
 * The geometry of a climograph: temperature lines over rain bars on one
 * twelve-month axis, with the envelope's 10th–90th percentile span drawn as a
 * band around each median. Pure: takes the dossier's climate block, returns
 * numbers and path strings; the Svelte component only places them. Nothing is
 * smoothed, and no figure is drawn that the dossier does not carry: a species
 * with one cell has no band, a dry month has no bar, and an extreme is a tick
 * only when POWER answered.
 */
import { MON3 } from '$core/months';
import { r1 } from '$core/num';
import { cToF, mmToIn, temp, rain as rainF, METRIC, type Units, dryLabel } from '$core/units';
import { tiedMonths, monthNames } from '$core/sheet';

export interface MonthFigures {
  tmax: number;
  tmin: number;
  precipMm: number;
  dli?: number;
  rh?: number;
}
export interface ClimoInput {
  months: MonthFigures[];
  p10: MonthFigures[];
  p90: MonthFigures[];
  cells: number;
  extremes?: { minAbs: number; maxP99: number; years: number } | null;
}

export interface Tick {
  y: number;
  label: string;
}
export interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The p10–p90 whisker, when it differs from the median. */
  lo?: number;
  hi?: number;
}
export interface Climograph {
  width: number;
  height: number;
  /** Left edge of the plot area and its width; month columns divide it evenly. */
  left: number;
  plotW: number;
  monthX: number[];
  months: string[];
  temp: {
    top: number;
    height: number;
    ticks: Tick[];
    dayLine: string;
    nightLine: string;
    /** Empty when the envelope has no span (one cell, or identical cells). */
    dayBand: string;
    nightBand: string;
    zeroY: number | null;
    /**
     * POWER extremes at a typical spot in the range, as heights only: the record minimum and the 99th-percentile day carry no
     * date, so they are drawn as marks at the right edge of the panel, never under a month.
     */
    minAbs: { y: number; label: string } | null;
    maxP99: { y: number; label: string } | null;
    /** The three consecutive months around the coldest month's mean nightly low, shaded as the habitat's cold quarter. */
    coldQuarter: { x: number; w: number; wraps: boolean; x2?: number; w2?: number };
    /** Where "cold quarter" is written: clear of the extremes' labels and the frost label (round sixty-two; V22). */
    quarterLabel: { x: number; y: number };
  };
  rain: {
    top: number;
    height: number;
    ticks: Tick[];
    bars: Bar[];
    /** No month reaches a millimetre: the panel says so instead of drawing nothing. */
    dry: boolean;
    max: number;
  };
  /** Daily light integral and relative humidity as two sparklines, each on its own scale, or null when the dossier has neither. */
  strip: { top: number; height: number; dli: { path: string; lo: number; hi: number } | null; rh: { path: string; lo: number; hi: number } | null } | null;
  hasBand: boolean;
  /** A plain-language reading of the chart for assistive technology, built from the same figures. */
  alt: string;
  /** The units the axes are labelled in. */
  units: Units;
}

const MONTHS = MON3;

/** A tick step giving roughly four to six ticks over a span, from a fixed set so the axes look alike across species. */
function step(span: number, steps: number[]): number {
  for (const s of steps) if (span / s <= 6) return s;
  return steps[steps.length - 1];
}

export function climograph(c: ClimoInput, width = 720, units: Units = METRIC): Climograph {
  const us = units === 'us';
  const left = 40, right = 12, gap = 10;
  const plotW = width - left - right;
  const colW = plotW / 12;
  const monthX = MONTHS.map((_, i) => left + colW * (i + 0.5));
  const has = (k: 'dli' | 'rh') => c.months.every((m) => m[k] != null);
  const strip = has('dli') || has('rh');
  const tempH = 170, rainH = 100, stripH = strip ? 56 : 0;
  const tempTop = 12;
  const rainTop = tempTop + tempH + gap + 14;
  const stripTop = rainTop + rainH + gap + 14;
  const height = (strip ? stripTop + stripH : rainTop + rainH) + 22;

  /* ---- temperature ---- */
  const nightLo = Math.min(...c.p10.map((m) => m.tmin), ...c.months.map((m) => m.tmin));
  const dayHi = Math.max(...c.p90.map((m) => m.tmax), ...c.months.map((m) => m.tmax));
  const lo = Math.min(nightLo, c.extremes?.minAbs ?? nightLo);
  const hi = Math.max(dayHi, c.extremes?.maxP99 ?? dayHi);
  // Axis ticks are laid out in the reader's unit so they land on round numbers there; the geometry stays in °C.
  const dLo = us ? cToF(lo) : lo, dHi = us ? cToF(hi) : hi;
  const tStep = step(dHi - dLo, us ? [10, 20, 40] : [5, 10, 20]);
  const dtLo = Math.floor((dLo - 1) / tStep) * tStep;
  const dtHi = Math.ceil((dHi + 1) / tStep) * tStep;
  const tLo = us ? (dtLo - 32) / 1.8 : dtLo;
  const tHi = us ? (dtHi - 32) / 1.8 : dtHi;
  const ty = (v: number) => tempTop + ((tHi - v) / (tHi - tLo)) * tempH;
  const tTicks: Tick[] = [];
  for (let v = dtLo; v <= dtHi; v += tStep) tTicks.push({ y: ty(us ? (v - 32) / 1.8 : v), label: `${v}°` });
  const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${r1(monthX[i])},${r1(ty(v))}`).join(' ');
  const band = (hiV: number[], loV: number[]) => {
    if (hiV.every((v, i) => Math.abs(v - loV[i]) < 0.05)) return '';
    const fwd = hiV.map((v, i) => `${i ? 'L' : 'M'}${r1(monthX[i])},${r1(ty(v))}`).join(' ');
    const back = [...loV].reverse().map((v, i) => `L${r1(monthX[11 - i])},${r1(ty(v))}`).join(' ');
    return `${fwd} ${back} Z`;
  };
  const dayBand = band(c.p90.map((m) => m.tmax), c.p10.map((m) => m.tmax));
  const nightBand = band(c.p90.map((m) => m.tmin), c.p10.map((m) => m.tmin));
  const coldest = c.months.reduce((b, m, i) => (m.tmin < c.months[b].tmin ? i : b), 0);
  const warmest = c.months.reduce((b, m, i) => (m.tmax > c.months[b].tmax ? i : b), 0);
  // Months that tie for the coldest night, as printed: when they are one run, the cold quarter is centred on the run's
  // middle month rather than on its first (round sixty-one; visitor 5). Ties that are not one run keep the first.
  const tf = (v: number) => temp(v, units);
  const coldTies = tiedMonths(c.months.map((m) => m.tmin), false, tf);
  const coldRun = (() => {
    const set = new Set(coldTies);
    if (set.size < 2 || set.size >= 12) return null;
    const starts = coldTies.filter((i) => !set.has((i + 11) % 12));
    if (starts.length !== 1) return null;
    return (starts[0] + Math.floor((set.size - 1) / 2)) % 12;
  })();
  const centre = coldRun ?? coldest;
  const q0 = (centre + 11) % 12; // the month before the coldest
  const wraps = q0 > 9; // Nov–Jan or Dec–Feb: two rectangles
  const coldQuarter = wraps
    ? { x: left + colW * q0, w: colW * (12 - q0), wraps: true, x2: left, w2: colW * (3 - (12 - q0)) }
    : { x: left + colW * q0, w: colW * 3, wraps: false };

  // "Cold quarter" written where it touches no other label: at a phone's width the record low's label ran into it
  // (round sixty-two; the self-review's N10, V22). Widths are estimated at the 11 px label size, a little generously;
  // the label tries the panel's foot, then its head, then each line up from the foot, in the quarter and then (when it
  // wraps) in its other part; at a phone's width the extremes' labels span nearly the whole panel at both ends.
  const xsLabels: { x0: number; x1: number; y: number }[] = [];
  const edge = left + plotW - 14;
  const extW = (t: string) => t.length * 6.2;
  if (c.extremes) {
    const lab = (v: number, t: string) => xsLabels.push({ x0: edge - extW(t), x1: edge, y: ty(v) + 3.5 });
    lab(c.extremes.minAbs, `${temp(c.extremes.minAbs, units, 1)} lowest night in ${c.extremes.years} years, NASA POWER`);
    lab(c.extremes.maxP99, `${temp(c.extremes.maxP99, units, 1)} 99th-percentile day, NASA POWER`);
  }
  if (tLo < 0 && tHi > 0) xsLabels.push({ x0: left + plotW - 2 - 40, x1: left + plotW - 2, y: ty(0) - 4 });
  const QW = 92; // "COLD QUARTER", upper case and spaced
  const clear = (x: number, y: number) => x + QW <= left + plotW && xsLabels.every((b) => b.x1 < x - 2 || b.x0 > x + QW + 2 || Math.abs(b.y - y) > 14);
  const qxs = [coldQuarter.x + 4, ...(coldQuarter.wraps ? [left + 4] : [])];
  const qys = [tempTop + tempH - 5, tempTop + 13, ...Array.from({ length: Math.floor((tempH - 30) / 14) }, (_, i) => tempTop + tempH - 19 - 14 * i)];
  const quarterLabel = (() => {
    for (const y of qys) for (const x of qxs) if (clear(x, y)) return { x, y };
    return { x: qxs[0], y: qys[0] };
  })();

  /* ---- rain ---- */
  const rMax = Math.max(...c.p90.map((m) => m.precipMm), ...c.months.map((m) => m.precipMm));
  const dry = rMax < 1;
  const rDisp = us ? mmToIn(rMax) : rMax;
  const rStep = step(Math.max(rDisp, us ? 0.5 : 10), us ? [0.5, 1, 2, 5, 10, 20] : [10, 25, 50, 100, 200, 500]);
  const rHiDisp = Math.max(rStep, Math.ceil(rDisp / rStep) * rStep);
  const rHi = us ? rHiDisp * 25.4 : rHiDisp;
  const ry = (v: number) => rainTop + rainH - (v / rHi) * rainH;
  const rTicks: Tick[] = [];
  for (let v = 0; v <= rHiDisp + 1e-9; v += rStep) rTicks.push({ y: ry(us ? v * 25.4 : v), label: String(+v.toFixed(2)) });
  const barW = colW * 0.56;
  const bars: Bar[] = c.months.map((m, i) => {
    const p10 = c.p10[i].precipMm, p90 = c.p90[i].precipMm;
    const span = p90 - p10 > 0.5;
    return { x: r1(monthX[i] - barW / 2), y: r1(ry(m.precipMm)), w: r1(barW), h: r1(rainTop + rainH - ry(m.precipMm)), ...(span ? { lo: r1(ry(p10)), hi: r1(ry(p90)) } : {}) };
  });

  /* ---- DLI and RH strip ---- */
  let stripOut: Climograph['strip'] = null;
  if (strip) {
    const spark = (vals: number[]) => {
      const a = Math.min(...vals), b = Math.max(...vals);
      const y = (v: number) => stripTop + 6 + (b === a ? 0.5 : (b - v) / (b - a)) * (stripH - 12);
      return { path: vals.map((v, i) => `${i ? 'L' : 'M'}${r1(monthX[i])},${r1(y(v))}`).join(' '), lo: a, hi: b };
    };
    stripOut = {
      top: stripTop,
      height: stripH,
      dli: has('dli') ? spark(c.months.map((m) => m.dli as number)) : null,
      rh: has('rh') ? spark(c.months.map((m) => m.rh as number)) : null
    };
  }

  const hasBand = !!(dayBand || nightBand || bars.some((b) => b.lo != null));
  // The bars' own total, named as such: the chart draws monthly medians, and their sum is not the median of the cells'
  // yearly totals the rain card shows when the dossier has it (round sixty-three; REVIEW-TRIAGE-61).
  const rainYear = c.months.reduce((a, m) => a + m.precipMm, 0);
  // Day and night ranges each from their own series: the coolest day is not always in the coldest-night month.
  const dayLo = c.months.reduce((b, m, i) => (m.tmax < c.months[b].tmax ? i : b), 0);
  const nightHi = c.months.reduce((b, m, i) => (m.tmin > c.months[b].tmin ? i : b), 0);
  const flatT = c.months[warmest].tmax - c.months[dayLo].tmax < 1 && c.months[nightHi].tmin - c.months[coldest].tmin < 1;
  // The wettest month named only when it is one month: on a tie, how many share it (round sixty; words 20).
  const wetI = c.months.reduce((b, m, i) => (m.precipMm > c.months[b].precipMm ? i : b), 0);
  const wetAs = rainF(c.months[wetI].precipMm, units);
  const wetTied = c.months.filter((m) => rainF(m.precipMm, units) === wetAs).length;
  const wettest = wetTied === 12 ? 'the same in every month' : wetTied > 1 ? `the wettest months (${wetTied} at ${wetAs})` : `the wettest month ${MONTHS[wetI]}`;
  // Each end of each range names every month that ties for it, as printed (round sixty-one; visitor 5: "to 22 °C in Jan"
  // of a year whose February was as warm).
  const at = (vals: number[], hi: boolean) => monthNames(tiedMonths(vals, hi, tf), 'short');
  const days = c.months.map((m) => m.tmax), nights = c.months.map((m) => m.tmin);
  const alt =
    (flatT
      ? `A flat year: mean daily high about ${temp(c.months[warmest].tmax, units)} and mean nightly low about ${temp(c.months[coldest].tmin, units)} in every month, so the cold quarter is shaded by rounding only. `
      : `Mean daily high from ${temp(c.months[dayLo].tmax, units)} in ${at(days, false)} to ${temp(c.months[warmest].tmax, units)} in ${at(days, true)}; mean nightly low from ${temp(c.months[coldest].tmin, units)} in ${at(nights, false)} to ${temp(c.months[nightHi].tmin, units)} in ${at(nights, true)}. The cold quarter, ${MONTHS[q0]} to ${MONTHS[(centre + 1) % 12]}, is the three months around the coldest month's mean nightly low${coldTies.length < 2 || coldTies.length >= 12 ? '' : coldRun != null ? `, centred on the ${coldTies.length} months in a row that tie for it` : `, around the first of the ${coldTies.length} months that tie for it`}. `) +
    (dry ? `${dryLabel(units)[0].toUpperCase()}${dryLabel(units).slice(1)} of rain.` : `${rainF(rainYear, units)} of rain a year (the twelve monthly medians added), ${wettest}.`) +
    (hasBand ? ` The bands show the 10th to 90th percentile across ${c.cells} habitat cells.` : c.cells > 1 ? ` The ${c.cells} habitat cells agree to within rounding.` : '') +
    (c.extremes ? ` Over ${c.extremes.years} years at a typical spot in the range (NASA POWER) the absolute minimum was ${temp(c.extremes.minAbs, units, 1)} and the 99th-percentile day ${temp(c.extremes.maxP99, units, 1)}; neither is dated to a month.` : '') +
    (strip ? ` Beneath: ${has('dli') ? 'daily light integral' : ''}${has('dli') && has('rh') ? ' and ' : ''}${has('rh') ? 'relative humidity' : ''} through the year, each on its own scale.` : '');

  return {
    width,
    height,
    left,
    plotW,
    monthX: monthX.map(r1),
    months: MONTHS,
    temp: {
      top: tempTop,
      height: tempH,
      ticks: tTicks.map((t) => ({ y: r1(t.y), label: t.label })),
      dayLine: line(c.months.map((m) => m.tmax)),
      nightLine: line(c.months.map((m) => m.tmin)),
      dayBand,
      nightBand,
      zeroY: tLo < 0 && tHi > 0 ? r1(ty(0)) : null,
      // Each extreme names its source on the chart itself, and "years", not "yrs" (round sixty; the round forty-two review, A9).
      // No "(undated)", which read as an error to a stranger: the mark's place at the edge, in no month, says it (round sixty-one; visitor 14).
      minAbs: c.extremes ? { y: r1(ty(c.extremes.minAbs)), label: `${temp(c.extremes.minAbs, units, 1).replace(/ °[CF]$/, '°')} lowest night in ${c.extremes.years} years, NASA POWER` } : null,
      maxP99: c.extremes ? { y: r1(ty(c.extremes.maxP99)), label: `${temp(c.extremes.maxP99, units, 1).replace(/ °[CF]$/, '°')} 99th-percentile day, NASA POWER` } : null,
      coldQuarter: { ...coldQuarter, x: r1(coldQuarter.x), w: r1(coldQuarter.w), ...(coldQuarter.x2 != null ? { x2: r1(coldQuarter.x2), w2: r1(coldQuarter.w2!) } : {}) },
      quarterLabel: { x: r1(quarterLabel.x), y: r1(quarterLabel.y) }
    },
    rain: { top: rainTop, height: rainH, ticks: rTicks.map((t) => ({ y: r1(t.y), label: t.label })), bars, dry, max: rMax },
    strip: stripOut,
    hasBand,
    alt,
    units
  };
}

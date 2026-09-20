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
     * POWER extremes at the typical cell, as heights only: the record minimum and the 99th-percentile day carry no
     * date, so they are drawn as marks at the right edge of the panel, never under a month.
     */
    minAbs: { y: number; label: string } | null;
    maxP99: { y: number; label: string } | null;
    /** The three consecutive months around the coldest night, shaded as the habitat's cold quarter. */
    coldQuarter: { x: number; w: number; wraps: boolean; x2?: number; w2?: number };
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
}

const MONTHS = MON3;

/** A tick step giving roughly four to six ticks over a span, from a fixed set so the axes look alike across species. */
function step(span: number, steps: number[]): number {
  for (const s of steps) if (span / s <= 6) return s;
  return steps[steps.length - 1];
}

export function climograph(c: ClimoInput, width = 720): Climograph {
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
  const tStep = step(hi - lo, [5, 10, 20]);
  const tLo = Math.floor((lo - 1) / tStep) * tStep;
  const tHi = Math.ceil((hi + 1) / tStep) * tStep;
  const ty = (v: number) => tempTop + ((tHi - v) / (tHi - tLo)) * tempH;
  const tTicks: Tick[] = [];
  for (let v = tLo; v <= tHi; v += tStep) tTicks.push({ y: ty(v), label: `${v}°` });
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
  const q0 = (coldest + 11) % 12; // the month before the coldest
  const wraps = q0 > 9; // Nov–Jan or Dec–Feb: two rectangles
  const coldQuarter = wraps
    ? { x: left + colW * q0, w: colW * (12 - q0), wraps: true, x2: left, w2: colW * (3 - (12 - q0)) }
    : { x: left + colW * q0, w: colW * 3, wraps: false };

  /* ---- rain ---- */
  const rMax = Math.max(...c.p90.map((m) => m.precipMm), ...c.months.map((m) => m.precipMm));
  const dry = rMax < 1;
  const rStep = step(Math.max(rMax, 10), [10, 25, 50, 100, 200, 500]);
  const rHi = Math.max(rStep, Math.ceil(rMax / rStep) * rStep);
  const ry = (v: number) => rainTop + rainH - (v / rHi) * rainH;
  const rTicks: Tick[] = [];
  for (let v = 0; v <= rHi; v += rStep) rTicks.push({ y: ry(v), label: String(v) });
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
  const rainYear = c.months.reduce((a, m) => a + m.precipMm, 0);
  // Day and night ranges each from their own series: the coolest day is not always in the coldest-night month.
  const dayLo = c.months.reduce((b, m, i) => (m.tmax < c.months[b].tmax ? i : b), 0);
  const nightHi = c.months.reduce((b, m, i) => (m.tmin > c.months[b].tmin ? i : b), 0);
  const flatT = c.months[warmest].tmax - c.months[dayLo].tmax < 1 && c.months[nightHi].tmin - c.months[coldest].tmin < 1;
  const alt =
    (flatT
      ? `A flat year: mean day about ${c.months[warmest].tmax.toFixed(0)} °C and mean night about ${c.months[coldest].tmin.toFixed(0)} °C in every month, so the cold quarter is shaded by rounding only. `
      : `Mean day from ${c.months[dayLo].tmax.toFixed(0)} °C in ${MONTHS[dayLo]} to ${c.months[warmest].tmax.toFixed(0)} °C in ${MONTHS[warmest]}; mean night from ${c.months[coldest].tmin.toFixed(0)} °C in ${MONTHS[coldest]} to ${c.months[nightHi].tmin.toFixed(0)} °C in ${MONTHS[nightHi]}. The cold quarter, ${MONTHS[q0]} to ${MONTHS[(coldest + 1) % 12]}, is the three months around the coldest night. `) +
    (dry ? 'No month reaches a millimetre of rain.' : `${rainYear.toFixed(0)} mm of rain a year, most in ${MONTHS[c.months.reduce((b, m, i) => (m.precipMm > c.months[b].precipMm ? i : b), 0)]}.`) +
    (hasBand ? ` The bands show the 10th to 90th percentile across ${c.cells} habitat cells.` : c.cells > 1 ? ` The ${c.cells} habitat cells agree to within rounding.` : '') +
    (c.extremes ? ` Over ${c.extremes.years} years at the typical cell the absolute minimum was ${c.extremes.minAbs.toFixed(1)} °C and the 99th-percentile day ${c.extremes.maxP99.toFixed(1)} °C; neither is dated to a month.` : '') +
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
      minAbs: c.extremes ? { y: r1(ty(c.extremes.minAbs)), label: `${c.extremes.minAbs.toFixed(1)}° lowest night in ${c.extremes.years} yrs (undated)` } : null,
      maxP99: c.extremes ? { y: r1(ty(c.extremes.maxP99)), label: `${c.extremes.maxP99.toFixed(1)}° 99th-percentile day (undated)` } : null,
      coldQuarter: { ...coldQuarter, x: r1(coldQuarter.x), w: r1(coldQuarter.w), ...(coldQuarter.x2 != null ? { x2: r1(coldQuarter.x2), w2: r1(coldQuarter.w2!) } : {}) }
    },
    rain: { top: rainTop, height: rainH, ticks: rTicks.map((t) => ({ y: r1(t.y), label: t.label })), bars, dry, max: rMax },
    strip: stripOut,
    hasBand,
    alt
  };
}

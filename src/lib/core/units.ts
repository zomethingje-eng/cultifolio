/**
 * Units of display. Everything stored, exported and derived is metric (°C,
 * mm); this is the one place a figure is turned into the reader's unit, so
 * a sentence is never half converted. Two settings, not three: a grower who
 * reads Fahrenheit reads inches. Differences of temperature convert by 1.8
 * alone (a 4 °C range is a 7.2 °F range, not 39.2), which is the mistake
 * this module exists to make once, here, and nowhere else.
 */
export type Units = 'metric' | 'us';
export const METRIC: Units = 'metric';
export const US: Units = 'us';

export const cToF = (c: number) => c * 1.8 + 32;
export const fToC = (f: number) => (f - 32) / 1.8;
export const mmToIn = (mm: number) => mm / 25.4;
export const inToMm = (i: number) => i * 25.4;

export const tempUnit = (u: Units) => (u === 'us' ? '°F' : '°C');
export const rainUnit = (u: Units) => (u === 'us' ? 'in' : 'mm');

/** `toFixed` that never prints "-0": a night of -0.3 °C shown to no decimals is 0 °C, not a minus with nothing behind it. */
export function fixed(x: number, digits: number): string {
  const s = x.toFixed(digits);
  return /^-0(\.0*)?$/.test(s) ? s.slice(1) : s;
}
/** A temperature, from °C, with `digits` decimals: "6.5 °C" or "43.7 °F". */
export function temp(c: number, u: Units, digits = 0): string {
  return `${fixed(u === 'us' ? cToF(c) : c, digits)} ${tempUnit(u)}`;
}
/** The number alone, for an axis or a card value: "43.7". */
export function tempN(c: number, u: Units, digits = 0): string {
  return fixed(u === 'us' ? cToF(c) : c, digits);
}
/** A difference of temperatures, from °C: "4.0 °C" or "7.2 °F". No offset. */
export function deltaT(dc: number, u: Units, digits = 1): string {
  return `${(u === 'us' ? dc * 1.8 : dc).toFixed(digits)} ${tempUnit(u)}`;
}
/** Rain, from mm: "72 mm" or "2.8 in"; under an inch two decimals, under 10 mm one. */
export function rain(mm: number, u: Units): string {
  if (u === 'us') {
    const i = mmToIn(mm);
    return `${i < 1 ? i.toFixed(2) : i.toFixed(1)} in`;
  }
  return `${mm < 10 && mm !== Math.round(mm) ? mm.toFixed(1) : Math.round(mm).toLocaleString('en-US')} mm`;
}
/** The number alone: "2.8". */
export function rainN(mm: number, u: Units): string {
  return rain(mm, u).replace(/ (mm|in)$/, '');
}
/** A rule's metric threshold, with the metric figure kept beside the converted one so the rule stays checkable: "4.7 in (120 mm)". */
export function ruleRain(mm: number, u: Units): string {
  return u === 'us' ? `${rain(mm, u)} (${mm} mm)` : `${mm} mm`;
}
export function ruleDeltaT(dc: number, u: Units): string {
  return u === 'us' ? `${deltaT(dc, u, dc === Math.round(dc) ? 1 : 1)} (${dc} °C)` : `${dc} °C`;
}

/** The units a first visit gets: US for an en-US reader, metric for everyone else. */
/** The climograph's dry-panel label: the millimetre threshold, in the reader's units, with the rule's own figure kept. */
export const dryLabel = (u: Units) => (u === 'us' ? 'no month reaches 0.04 in (1 mm)' : 'no month reaches a millimetre');

export function unitsForLocale(lang: string | null | undefined): Units {
  return /^en-US\b/i.test((lang ?? '').split(',')[0].trim()) ? 'us' : 'metric';
}
export function parseUnits(v: string | null | undefined): Units | null {
  return v === 'us' || v === 'metric' ? v : null;
}

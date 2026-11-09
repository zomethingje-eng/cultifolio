/**
 * The Walter–Lieth reading of a year (round eighty-seven): which months are arid by the climate diagram of Walter and
 * Lieth (Klimadiagramm-Weltatlas, Jena: VEB Gustav Fischer, 1960–1967), whose scale sets 10 °C against 20 mm of rain, so a
 * month whose rain in millimetres is under twice its mean temperature in °C is drawn as an arid one (the rain curve below
 * the temperature curve). Only the reading: the page's climograph keeps its own two panels and scales, and drawing the
 * diagram's one shared scale there would be a second chart, not a line.
 *
 * Read from the same median year as the climograph (each month's median across the range's cells).
 */
export interface WalterLieth {
  /** Month indexes (0 = January) whose rain is under twice the mean temperature. */
  arid: number[];
  /** For each month, its rain and twice its mean temperature, as compared. */
  months: Array<{ p: number; twoT: number }>;
}

export function walterLieth(months: ReadonlyArray<{ tmean: number; precipMm: number }> | null | undefined): WalterLieth | null {
  if (!months || months.length !== 12 || !months.every((m) => Number.isFinite(m?.tmean) && Number.isFinite(m?.precipMm))) return null;
  const rows = months.map((m) => ({ p: m.precipMm, twoT: Math.round(2 * m.tmean * 10) / 10 }));
  return { arid: rows.flatMap((r, i) => (r.p < r.twoT ? [i] : [])), months: rows };
}

/**
 * Runs of consecutive months, wrapping December to January: [[5, 8]] for June to September, [[10, 1]] for November to
 * February, [[0, 11]] for every month.
 */
export function monthRuns(ix: readonly number[]): Array<[number, number]> {
  if (!ix.length) return [];
  if (ix.length === 12) return [[0, 11]];
  const on = new Set(ix);
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 12; i++) {
    if (!on.has(i) || on.has((i + 11) % 12)) continue; // a run starts where the month before is not in it
    let j = i;
    while (on.has((j + 1) % 12)) j = (j + 1) % 12;
    out.push([i, j]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

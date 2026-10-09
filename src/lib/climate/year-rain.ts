/**
 * The year's rain a page shows, and which figure it is (round sixty-three; REVIEW-TRIAGE-61's deferred list). A dossier
 * built since round sixty-three carries the median of the range's cells' own yearly totals (`annualRain.p50`, the middle
 * total, or halfway between the two middle totals when the cells are even in number, so not always a total any one cell
 * has; round sixty-three, the fix pass, R2 2); one built before carries only the twelve monthly medians, whose sum is shown labelled as that,
 * never as a median. The rain rule and the sheet's season still read the median year's months and their total, since
 * "70% of the year's rain" must be a share of the months it adds up.
 */
export interface YearRain {
  mm: number;
  /** True for the median of the cells' yearly totals; false for the twelve monthly medians added. */
  cells: boolean;
}

export function yearRain(months: ReadonlyArray<{ precipMm: number }>, annualRain?: { p50?: number | null } | null): YearRain {
  const p50 = annualRain?.p50;
  return typeof p50 === 'number' && Number.isFinite(p50) ? { mm: p50, cells: true } : { mm: months.reduce((a, m) => a + m.precipMm, 0), cells: false };
}

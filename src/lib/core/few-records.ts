/**
 * A habitat climate read from few records (round eighty-two; the owner's decision on the independent review's 40 and
 * the audit's 5): marked, never hidden. A page whose climate rests on fewer than `FEW_RECORDS` records, or on fewer
 * than `FEW_CELLS` grid cells, says "from few records" on its at-a-glance figures and in its climate section, with the
 * two counts; every figure stays as it was.
 *
 * The line, measured on the live corpus a27e34d376199544 (round eighty-two, agent U): the reviewers' copies of 504 live
 * dossiers with a climate (docs/review-81's walk, /tmp/claude-0/rev81r/D-s and B-s), weighted by the live index's own
 * count of open in-range records over its 37,788 pages with a climate (the index's `open` matched each sampled
 * dossier's `nOpenInRange`, 504 of 504). Pages each candidate marks, of 37,788:
 *
 *   fewer than 5 records     about 1,290      fewer than 5 cells     about 1,500
 *   fewer than 10 records    about 3,890      fewer than 10 cells    about 4,810
 *   fewer than 12 records    about 4,820      12 records or 5 cells  about 4,880
 *   fewer than 20 records    about 6,830      20 records or 10 cells about 7,030
 *
 * At the merge (M), the same line on the larger sample, the 5,825 climate pages of both reviewers' copies, read from each
 * dossier's own `climate.records` and `climate.cells` (the index's `open`, which U weighted by, is the open in-range records,
 * not the climate's own count: they agree on 115 of the 5,825) and weighted by the live index's `open` in powers of two:
 * fewer than 12 records about 4,330, fewer than 5 cells about 1,940, 12 records or 5 cells about 4,390 (11.6%). The page
 * says about 4,400.
 *
 * Twelve records was already the page's line ("under a dozen records behind these figures", since round sixty), and five
 * cells adds the pages whose many records fall in a handful of cells (a cell holds at least one record, so fewer than
 * five cells with twelve records or more is rare: one of the 504). The build reads no climate from fewer than three
 * cells, so the least a marked page has is three records in three cells: Iris zagrica, Haemanthus pumilio's four cells
 * and Peperomia graveolens's four records, the review's examples, are each marked.
 */
export const FEW_RECORDS = 12;
export const FEW_CELLS = 5;

/** The two counts of a climate read from few records, or null when it is not one (or there is no climate). */
export function fewRecords(c: { status: string; records?: number | null; cells?: number | null } | null | undefined): { records: number; cells: number } | null {
  if (!c || c.status !== 'ok' || typeof c.records !== 'number' || typeof c.cells !== 'number') return null;
  return c.records < FEW_RECORDS || c.cells < FEW_CELLS ? { records: c.records, cells: c.cells } : null;
}

/** The mark's sentence, with the counts: what the figures rest on, and the line, never advice. */
export function fewRecordsSentence(f: { records: number; cells: number }): string {
  const rec = `${f.records} record${f.records === 1 ? '' : 's'}`;
  const cel = `${f.cells} grid cell${f.cells === 1 ? '' : 's'}`;
  return `From few records: this habitat climate is read from ${rec} in ${cel}; a page says so under ${FEW_RECORDS} records or ${FEW_CELLS} cells, and shows the figures as read.`;
}

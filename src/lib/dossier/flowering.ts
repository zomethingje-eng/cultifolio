/**
 * Flowering by month (round eighty-seven, stage 2; links agent): for each page with an iNaturalist taxon, iNaturalist's
 * research-grade observations of wild plants (not captive) annotated "Flowering" (term 12, value 13), counted by the
 * month they were observed in (`floweringUrl` in sources/inat.ts, one request a taxon), and the day it was read.
 *
 *   - `--fill flowering` asks each page whose taxon was not read yet, or was read for another taxon, or was asked and not
 *     answered; a page read is passed by, so a run that stops resumes (`--again` asks every page).
 *   - Paced as every iNaturalist request is (`fetch.ts`: one every 2 s, 30 a minute, half iNaturalist's "60 requests per
 *     minute or lower"), and counted in iNaturalist's day (`day-budget.ts`, 4,000 a UTC day across every fill), so the
 *     fill stops at the day's allowance as `--fill credits` does, exit 3, and the same command the next day goes on.
 *   - Rule 2: a page never asked has no `flowering` and says "not asked"; one asked and not answered keeps the day and why
 *     (`unanswered`) and says "not checked"; twelve zeros is iNaturalist's answer, said as that, never "does not flower".
 *   - A request held back (the day's allowance spent, a host cooling after a throttle) was not asked: nothing is written for
 *     the page, and the run stops.
 *
 * Pure but for the fetcher and the store.
 */
import type { JsonFetcher } from './fetch';
import type { DossierStore } from './corpus-run';
import type { Flowering } from './schema';
import { floweringUrl, floweringMonths } from './sources/inat';

export type FloweringPage = { key: string; name: { scientific: string }; ids: { inat?: number }; flowering?: Flowering };

/** Whether the fill asks a page: it has a taxon, and its flowering was not read for that taxon (or `again`). */
export function floweringWanted(d: Pick<FloweringPage, 'ids' | 'flowering'>, again = false): boolean {
  const t = d.ids?.inat;
  if (typeof t !== 'number') return false;
  return again || !d.flowering || d.flowering.taxon !== t || !d.flowering.months;
}

/** A refusal that held the request back, so nothing was asked: the day's allowance, or a host cooling (`fetch.ts`). */
export const heldBack = (detail: string | undefined): boolean => /today's allowance of \d+ requests is spent|not asked again|not asked for a while/.test(detail ?? '');

export type FloweringRead = { months: number[] } | { unanswered: string } | { held: string };

/** One taxon's histogram. */
export async function readFlowering(f: JsonFetcher, taxon: number): Promise<FloweringRead> {
  const r = await f<unknown>(floweringUrl(taxon));
  if (r.status === 'ok') {
    const m = floweringMonths(r.data);
    return m ? { months: m } : { unanswered: "iNaturalist's answer held no count for each month" };
  }
  if (r.status === 'none') return { unanswered: 'iNaturalist answered with nothing' };
  const detail = r.detail ?? r.status;
  return heldBack(detail) ? { held: detail } : { unanswered: detail };
}

export interface FloweringCounts { pages: number; asked: number; read: number; zero: number; unanswered: number; noTaxon: number; before: number; held?: string; lines: string[] }

/** After this many requests in a row not answered, the run stops (the host is down or throttling): the rest are not asked. */
export const STOP_AFTER_FAILURES = 5;

/**
 * Every page on the store the fill wants, asked in turn and written as it is answered. `progress` is called after each
 * page asked. Returns the counts; `held` is set when the run stopped at a request held back.
 */
export async function fillFlowering(store: DossierStore, f: JsonFetcher, day: string, opts: { again?: boolean; progress?: (c: FloweringCounts) => void } = {}): Promise<FloweringCounts> {
  const c: FloweringCounts = { pages: 0, asked: 0, read: 0, zero: 0, unanswered: 0, noTaxon: 0, before: 0, lines: [] };
  let failedRun = 0;
  for (const file of store.files()) {
    let d: FloweringPage;
    try { d = store.read<FloweringPage>(file); } catch { continue; }
    c.pages++;
    if (typeof d.ids?.inat !== 'number') { c.noTaxon++; continue; }
    if (!floweringWanted(d, opts.again)) { c.before++; continue; }
    const taxon = d.ids.inat;
    const r = await readFlowering(f, taxon);
    if ('held' in r) { c.held = r.held; break; }
    c.asked++;
    if ('months' in r) {
      failedRun = 0;
      c.read++;
      if (r.months.every((n) => n === 0)) c.zero++;
      d.flowering = { taxon, months: r.months, read: day };
    } else {
      failedRun++;
      c.unanswered++;
      c.lines.push(`${d.name.scientific} [${d.key}]: iNaturalist taxon ${taxon} not answered: ${r.unanswered}`);
      // The day and why are kept with the taxon, and a count read before for this taxon stays (it is not lost to a refusal).
      d.flowering = d.flowering?.taxon === taxon && d.flowering.months ? d.flowering : { taxon, read: day, unanswered: r.unanswered };
    }
    store.write(file, d);
    opts.progress?.(c);
    if (failedRun >= STOP_AFTER_FAILURES) { c.held = `${STOP_AFTER_FAILURES} requests in a row not answered`; break; }
  }
  return c;
}

/** The fill's last line (rule 6): what it read, and what is left. */
export function floweringLine(c: FloweringCounts, day: string, left: number): string {
  return `  ${c.asked} pages asked of iNaturalist on ${day}: ${c.read} read (${c.zero} with no flowering observation of a wild plant), ${c.unanswered} not answered; ${c.before} read before and passed by; ${c.noTaxon} with no iNaturalist taxon, not asked${c.held ? `; stopped: ${c.held}` : ''}; ${left} left to ask${left ? ': run --fill flowering again (after midnight UTC if the allowance is spent); it asks only what is left' : ''}.`;
}

/** How many pages the fill still wants (its line's "left"). */
export function floweringLeft(store: DossierStore): number {
  let n = 0;
  for (const file of store.files()) { try { if (floweringWanted(store.read<FloweringPage>(file))) n++; } catch { /* unreadable: the listing says so elsewhere */ } }
  return n;
}

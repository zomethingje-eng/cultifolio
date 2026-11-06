/**
 * `--fill cultigens --bulk <dir> [--dry-run]` (round eighty-six; review D's D1): every page whose Kew entry Kew lists only
 * as a cultigen ("as a cultigen from Peru") says so, and reads no habitat climate (`core/cultigen.ts`). Offline, from Kew's
 * names file: the page's entry is its own id (`k<plant_name_id>`) or the entry `--fill kew-names` stored for it. Kew's text
 * is kept where the ranges' rule keeps it (`distribution.kew.area`, quoted on the page), one read of Kew's field. The page
 * keeps its range (the region the crop comes from, which the page now says "as a cultigen") and its records; its climate
 * becomes "none" with Kew's words as the reason, and the daily extremes' row goes with it. The build applies the same rule
 * (`build.ts`, `build-kew.ts`), so a page derived again stays so. `dry` counts and writes nothing. Pure: the step streams
 * Kew's file and reads and writes the dossiers.
 */
import { cultigenClimateWhy, cultigenOf } from '../core/cultigen';

type Row = { status: string; at: string; detail?: string; asOf?: string };
export type CultigenPage = {
  key: string;
  name: { scientific: string; kew?: { entry?: string } };
  distribution: { kew?: { lifeform?: string; climate?: string; area?: string } };
  climate: { status: string; detail?: string; records?: number; cells?: number; place?: string };
  upstream: Record<string, Row | undefined>;
};
export interface CultigenCounts { read: number; changed: number; climates: number; lines: string[]; noLonger: string[] }

/** The Kew entry a page is read by: its own id, else the entry stored for it. */
export const entryOfPage = (d: Pick<CultigenPage, 'key' | 'name'>): string | undefined => (/^k\d+$/.test(d.key) ? d.key.slice(1) : d.name.kew?.entry);

/** One page against Kew's area text for its entry (`text`, undefined when Kew does not list it as a cultigen). True when it changed (or, dry, would). */
export function applyCultigen(d: CultigenPage, text: string | undefined, at: string, c: CultigenCounts, dry = false): boolean {
  c.read++;
  const had = cultigenOf(d.distribution.kew?.area);
  if (!text) {
    if (had) c.noLonger.push(`${d.name.scientific} [${d.key}]: Kew's file no longer lists it as a cultigen ("${had}"): rebuild it (--keys) to read its climate`);
    return false;
  }
  const why = cultigenClimateWhy(text);
  if (had === text && d.climate.status === 'none' && d.climate.detail === why) return false;
  const was = d.climate.status === 'ok' ? `its habitat climate (${d.climate.records ?? '?'} records in ${d.climate.cells ?? '?'} cells${d.climate.place ? `, the typical spot in ${d.climate.place}` : ''}) ${dry ? 'would no longer be' : 'no longer'} shown` : `its climate ${d.climate.status}${d.climate.detail ? ` (${d.climate.detail.slice(0, 80)})` : ''}, now said as a cultigen's`;
  c.changed++;
  if (d.climate.status === 'ok') c.climates++;
  c.lines.push(`${d.name.scientific} [${d.key}]: Kew: "${text}"; ${was}`);
  if (dry) return true;
  d.distribution.kew = { ...(d.distribution.kew ?? {}), area: text };
  d.climate = { status: 'none', detail: why };
  d.upstream.climate = { status: 'none', at, detail: why };
  delete d.upstream['climate.extremes'];
  return true;
}

/**
 * A build's `--dry-run` (round eighty-six; review D's D6, and every rule that changes data): each page derived in memory
 * and compared with the page on disk, never written, in one line: its records in range, and its climate's figures, before
 * and after, so the owner sees what a rule would change before anything is written.
 */
type Clim = { status: string; detail?: string; records?: number; cells?: number; place?: string; months?: Array<{ tmin: number; tmax: number; precipMm: number }>; annualRain?: { p50?: number | null } | null };
export type DryPage = { key: unknown; name: { scientific: string }; occurrences: { nOpenInRange: number; nRestrictedInRange?: number; keys?: Array<{ key: number; n: number }> }; climate: Clim };

import { yearRain } from '../climate/year-rain';

const r1 = (x: number) => Math.round(x * 10) / 10;
/** A climate in a few figures: its records and cells, the typical spot, the coldest month's mean nightly low, the warmest's mean high, and the rain a year. */
export function climateWords(c: Clim | undefined): string {
  if (!c) return 'none on disk';
  if (c.status !== 'ok') return `${c.status}${c.detail ? ` (${c.detail.length > 90 ? `${c.detail.slice(0, 87)}…` : c.detail})` : ''}`;
  const ms = c.months ?? [];
  const low = ms.length ? r1(Math.min(...ms.map((m) => m.tmin))) : null;
  const high = ms.length ? r1(Math.max(...ms.map((m) => m.tmax))) : null;
  // The climate's yearly rain is the median of its cells' own totals (`annualRain.p50`), else the months' sum (`year-rain.ts`);
  // the object itself was printed ("rain [object Object] mm"), the owner's first dry run of round eighty-six.
  const rain = ms.length || c.annualRain?.p50 != null ? Math.round(yearRain(ms, c.annualRain).mm) : null;
  return `${c.records ?? '?'} records in ${c.cells ?? '?'} cells${c.place ? `, typical spot ${c.place}` : ''}${low != null ? `, coldest month's mean low ${low} °C` : ''}${high != null ? `, warmest month's mean high ${high} °C` : ''}${rain != null ? `, rain ${rain} mm a year` : ''}`;
}

/** The line a dry run says of one page: what the build would change, or that it would change neither. */
export function dryLine(prev: DryPage | null | undefined, d: DryPage): string {
  const rec = (p: DryPage | null | undefined) => (p ? `${p.occurrences.nOpenInRange} open + ${p.occurrences.nRestrictedInRange ?? 0} restricted in range` : 'no page on disk');
  const keys = (p: DryPage | null | undefined) => (p?.occurrences.keys ?? []).map((k) => `${k.n} of key ${k.key}`).join(', ');
  const was = climateWords(prev?.climate), now = climateWords(d.climate);
  const same = rec(prev) === rec(d) && was === now && keys(prev) === keys(d);
  return `${d.name.scientific} [${String(d.key)}]: ${same ? `unchanged (${rec(d)}; climate ${now})` : `records ${rec(prev)} → ${rec(d)}${keys(prev) !== keys(d) ? ` (other keys: ${keys(prev) || 'none'} → ${keys(d) || 'none'})` : ''}; climate ${was} → ${now}`}`;
}

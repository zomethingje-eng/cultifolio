/**
 * The lens's Outdoors view, in words (round 126; SPECIES 20): the reader's site set against the habitat, figure by
 * figure. Every line names two figures, the reader's and the habitat's, and none says what the plant will do, want, need
 * or tolerate (rule 3). A line whose input is missing is not drawn. The site's months are the reader's calendar; the
 * habitat's are its own, and the comparison of a month is of the same season (`shift`, as the year panel moves them).
 *
 * The site's yearly lowest night is not compared: the site's tiles hold monthly normals only (docs/PLAN-SITE-CLIMATE.md,
 * option A), as the hand-off allows.
 */
import type { SiteMonth } from './site-climate';
import { dayLengths } from './day-length';

const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
type HabitatMonth = { tmin: number; precipMm: number };
export type OutdoorsLine = { k: 'floor' | 'rain' | 'day'; text: string };
export const CLOSING = 'It compares. It does not say what the plant will do.';

/** Months (0 to 11) as runs of names: "November to April", "June", "March and April; October". */
export function monthRunsText(ms: number[]): string {
  if (!ms.length) return '';
  const set = new Set(ms);
  if (set.size === 12) return 'every month';
  // start each run after a month not in the set, so a run across December and January stays one run
  const start = [...Array(12).keys()].find((m) => set.has(m) && !set.has((m + 11) % 12)) ?? ms[0];
  const runs: number[][] = [];
  for (let i = 0; i < 12; i++) {
    const m = (start + i) % 12;
    if (!set.has(m)) continue;
    const last = runs[runs.length - 1];
    if (last && last[last.length - 1] === (m + 11) % 12) last.push(m); else runs.push([m]);
  }
  return runs.map((r) => (r.length === 1 ? MONTH[r[0]] : r.length === 2 ? `${MONTH[r[0]]} and ${MONTH[r[1]]}` : `${MONTH[r[0]]} to ${MONTH[r[r.length - 1]]}`)).join('; ');
}

export function outdoorsLines(o: {
  site: SiteMonth[]; siteLat: number; habitat: HabitatMonth[]; habitatLat: number; floorC: number | null;
  temp: (c: number) => string; mm: (n: number) => string;
}): OutdoorsLine[] {
  const out: OutdoorsLine[] = [];
  if (o.floorC != null) {
    const below = o.site.map((m, k) => (m.tmin < o.floorC! ? k : -1)).filter((k) => k >= 0);
    out.push({ k: 'floor', text: below.length
      ? `${below.length} ${below.length === 1 ? 'month' : 'months'}: your average night is below its cold floor (${o.temp(o.floorC)}): ${monthRunsText(below)}.`
      : `In no month is your average night below its cold floor (${o.temp(o.floorC)}).` });
  }
  const yours = o.site.reduce((a, m) => a + m.precipMm, 0), its = o.habitat.reduce((a, m) => a + m.precipMm, 0);
  const yDry = Math.min(...o.site.map((m) => m.precipMm)), yWet = Math.max(...o.site.map((m) => m.precipMm));
  const iDry = Math.min(...o.habitat.map((m) => m.precipMm)), iWet = Math.max(...o.habitat.map((m) => m.precipMm));
  const second = yDry > iWet ? ` Your driest month (${o.mm(yDry)}) is wetter than its wettest (${o.mm(iWet)}).` : yWet < iDry ? ` Your wettest month (${o.mm(yWet)}) is drier than its driest (${o.mm(iDry)}).` : '';
  out.push({ k: 'rain', text: `Your rain a year: ${o.mm(yours)}; its habitat's: ${o.mm(its)}.${second}` });
  const yd = dayLengths(o.siteLat), id = dayLengths(o.habitatLat);
  const span = (d: number[]) => `${Math.min(...d).toFixed(1)} to ${Math.max(...d).toFixed(1)} h`;
  out.push({ k: 'day', text: `Your day length: ${span(yd)} through the year; its habitat's: ${span(id)}.` });
  return out;
}

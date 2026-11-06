/**
 * The range rule's dry run (round eighty-six; outside review B's 6 and the plan's B2: "dry run reports records and
 * climates lost per page before anything is written"). `--dry-run` derives every listed page again offline, as the walk
 * does, and writes nothing: no dossier, no index, no cache. For each page it compares what this code derives with the
 * dossier on disk (round eighty-five's walk), and counts each record's reason by the rule before (`POLICY_R85`) and by this
 * one, as the build tests it (`RangeAudit`): records admitted and dropped, native regions gained and lost, climates gained
 * and lost, and typical spots moved.
 *
 * Pure: the script hands it the two dossiers and the page's tally, and writes the lines.
 */
import type { Admission, AdmissionBy } from './admission-policy';

/** A page as the dry run reads it: the parts of a dossier the range rule decides. */
export interface DryPage {
  key: string;
  name: { scientific: string };
  distribution?: { native?: ReadonlyArray<{ code?: string; name: string }> };
  occurrences?: { nOpenInRange?: number; nRestrictedInRange?: number; nOutsideRange?: number; admitted?: Partial<Record<Admission, number>>; rangeRule?: string };
  climate?: { status?: string; detail?: string; cells?: number; records?: number; at?: { lat: number; lon: number }; place?: string };
}

/** Each record's reason before and after, weighted by the records at its coordinate: "buffer>out:no-country" → 3. */
export type RangeTally = Map<string, number>;

/** The audit's `tally` for one page (`RangeAudit['tally']` in `build.ts`). */
export function tallyInto(t: RangeTally): (before: Admission | null, after: Admission | null, n: number, rec: { country: boolean; state: boolean; by?: AdmissionBy }) => void {
  return (before, after, n, rec) => {
    if (before === after) return;
    const k = `${before ?? 'out'}>${after ?? 'out'}${rec.by ? `:${rec.by}` : ''}${!rec.country ? ':no-country' : rec.state ? ':state' : ''}`;
    t.set(k, (t.get(k) ?? 0) + n);
  };
}

const REASON: Record<string, string> = { strict: 'inside', buffer: 'by the margin', coast: 'off a coast', island: 'on an island', out: 'out' };
const BY: Record<string, string> = { border: 'across a border', 'border-state': 'across a border, by its stated state', 'minor-island': 'on a minor island', 'country-reach': 'by its country within the island reach', box: "by its country inside the region's box" };
/** A tally's key in words: "out → by the margin (across a border)", "by the margin → out (no country stated)". */
export function transitionWords(k: string): string {
  const [move, ...flags] = k.split(':');
  const [b, a] = move.split('>');
  const notes = flags.flatMap((f) => (f === 'no-country' ? ['no country stated'] : f === 'state' ? ['a state stated'] : BY[f] ? [BY[f]] : []));
  return `${REASON[b] ?? b} → ${REASON[a] ?? a}${notes.length ? ` (${notes.join('; ')})` : ''}`;
}

/** What the rule changes on one page. */
export interface PageChange {
  key: string;
  name: string;
  /** In-range records by the dossier's own count, before (on disk) and after (derived now). */
  records: [number, number];
  /** Records the new rule takes in, and drops, by the tally; and those in by another reason. */
  gained: number;
  dropped: number;
  moved: number;
  /** The tally's transitions, each in words with its count, largest first. */
  by: Array<[string, number]>;
  /** Native regions this derivation has that the disk's has not, and the reverse (a range read otherwise: Stapelia hirsuta). */
  regions: { added: string[]; removed: string[] };
  /** The climate: undefined where the run derived none (no --grid). */
  climate?: { change: 'gained' | 'lost' | 'kept' | 'none'; before: string; after: string; cells: [number | null, number | null]; detail?: string };
  /** The typical spot, where both have one and it moved. */
  spot?: { from: { lat: number; lon: number; place?: string }; to: { lat: number; lon: number; place?: string }; km: number };
}

const inRange = (p: DryPage | null): number => {
  const o = p?.occurrences;
  if (!o) return 0;
  const a = o.admitted;
  return a ? (a.strict ?? 0) + (a.buffer ?? 0) + (a.coast ?? 0) + (a.island ?? 0) : (o.nOpenInRange ?? 0) + (o.nRestrictedInRange ?? 0);
};
const codesOf = (p: DryPage | null) => (p?.distribution?.native ?? []).map((r) => r.code || r.name);
const km = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** The change on one page: `prev` the dossier on disk (null for a page not there), `next` this derivation, `tally` its records. */
export function pageChange(prev: DryPage | null, next: DryPage, tally: RangeTally, withClimate: boolean): PageChange {
  let gained = 0, dropped = 0, moved = 0;
  for (const [k, n] of tally) {
    const [b, a] = k.split(':')[0].split('>');
    if (b === 'out' && a !== 'out') gained += n;
    else if (a === 'out' && b !== 'out') dropped += n;
    else if (a !== b) moved += n;
  }
  const by = [...tally].map(([k, n]) => [transitionWords(k), n] as [string, number]).sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]));
  const was = new Set(codesOf(prev)), now = new Set(codesOf(next));
  const regions = { added: [...now].filter((c) => !was.has(c)).sort(), removed: [...was].filter((c) => !now.has(c)).sort() };
  const out: PageChange = { key: next.key, name: next.name.scientific, records: [inRange(prev), inRange(next)], gained, dropped, moved, by, regions };
  if (withClimate) {
    const b = prev?.climate?.status ?? 'none', a = next.climate?.status ?? 'none';
    const change = b === 'ok' && a === 'ok' ? 'kept' : a === 'ok' ? 'gained' : b === 'ok' ? 'lost' : 'none';
    out.climate = { change, before: b, after: a, cells: [prev?.climate?.cells ?? null, next.climate?.cells ?? null], ...(change === 'lost' && next.climate?.detail ? { detail: next.climate.detail } : {}) };
    const f = prev?.climate?.status === 'ok' ? prev.climate.at : undefined, t = next.climate?.status === 'ok' ? next.climate.at : undefined;
    if (f && t && (f.lat !== t.lat || f.lon !== t.lon)) out.spot = { from: { ...f, ...(prev?.climate?.place ? { place: prev.climate.place } : {}) }, to: { ...t, ...(next.climate?.place ? { place: next.climate.place } : {}) }, km: Math.round(km(f, t) * 10) / 10 };
  }
  return out;
}

/** Whether the rule changes anything on the page. */
export const changed = (c: PageChange): boolean => c.gained > 0 || c.dropped > 0 || c.moved > 0 || c.records[0] !== c.records[1] || c.regions.added.length > 0 || c.regions.removed.length > 0 || (!!c.climate && (c.climate.change === 'gained' || c.climate.change === 'lost' || c.climate.cells[0] !== c.climate.cells[1])) || !!c.spot;

const n = (x: number) => x.toLocaleString('en-US');
const at = (p: { lat: number; lon: number; place?: string }) => `${p.lat}, ${p.lon}${p.place ? ` (${p.place})` : ''}`;

/** One page's line, "<id> <name>\t<what changes>", as `--keys` reads a line (the notes after the tab are passed by); null when nothing changes. */
export function changeLine(c: PageChange): string | null {
  if (!changed(c)) return null;
  const parts: string[] = [];
  if (c.records[0] !== c.records[1] || c.gained || c.dropped || c.moved) parts.push(`records in range ${n(c.records[0])} → ${n(c.records[1])}${c.gained ? `, +${n(c.gained)} admitted` : ''}${c.dropped ? `, −${n(c.dropped)} dropped` : ''}${c.moved ? `, ${n(c.moved)} in by another reason` : ''}${c.by.length ? ` (${c.by.map(([w, k]) => `${w}: ${n(k)}`).join('; ')})` : ''}`);
  if (c.regions.added.length || c.regions.removed.length) parts.push(`native regions${c.regions.added.length ? ` +${c.regions.added.join(' +')}` : ''}${c.regions.removed.length ? ` −${c.regions.removed.join(' −')}` : ''}`);
  if (c.climate && c.climate.change !== 'kept' && c.climate.change !== 'none') parts.push(`climate ${c.climate.change.toUpperCase()}: ${c.climate.before} → ${c.climate.after}${c.climate.cells[1] != null ? ` (${c.climate.cells[1]} cells)` : ''}${c.climate.detail ? ` (${c.climate.detail})` : ''}`);
  else if (c.climate && c.climate.cells[0] !== c.climate.cells[1] && c.climate.change === 'kept') parts.push(`climate cells ${c.climate.cells[0]} → ${c.climate.cells[1]}`);
  if (c.spot) parts.push(`typical spot moved ${c.spot.km} km: ${at(c.spot.from)} → ${at(c.spot.to)}`);
  return `${c.key} ${c.name}\t${parts.join('; ')}`;
}

/** The run's totals, said at its end. */
export class DryRunTotals {
  pages = 0;
  changedPages = 0;
  gained = 0;
  dropped = 0;
  moved = 0;
  pagesGaining = 0;
  pagesDropping = 0;
  regionsChanged = 0;
  climateGained = 0;
  climateLost = 0;
  cellsChanged = 0;
  spotsMoved = 0;
  spotsMoved10 = 0;
  by = new Map<string, number>();
  add(c: PageChange): void {
    this.pages++;
    if (!changed(c)) return;
    this.changedPages++;
    this.gained += c.gained;
    this.dropped += c.dropped;
    this.moved += c.moved;
    if (c.gained) this.pagesGaining++;
    if (c.dropped) this.pagesDropping++;
    if (c.regions.added.length || c.regions.removed.length) this.regionsChanged++;
    if (c.climate?.change === 'gained') this.climateGained++;
    if (c.climate?.change === 'lost') this.climateLost++;
    if (c.climate?.change === 'kept' && c.climate.cells[0] !== c.climate.cells[1]) this.cellsChanged++;
    if (c.spot) { this.spotsMoved++; if (c.spot.km >= 10) this.spotsMoved10++; }
    for (const [w, k] of c.by) this.by.set(w, (this.by.get(w) ?? 0) + k);
  }
  lines(withClimate: boolean): string[] {
    const out = [
      `${n(this.pages)} pages derived, nothing written; ${n(this.changedPages)} change under this rule`,
      `records: +${n(this.gained)} admitted on ${n(this.pagesGaining)} pages, −${n(this.dropped)} dropped on ${n(this.pagesDropping)} pages, ${n(this.moved)} in by another reason`,
      ...[...this.by].sort((a, b) => b[1] - a[1]).map(([w, k]) => `    ${w}: ${n(k)}`),
      `native ranges read otherwise: ${n(this.regionsChanged)} pages`
    ];
    if (withClimate) out.push(`climates: ${n(this.climateGained)} gained, ${n(this.climateLost)} lost, ${n(this.cellsChanged)} kept with other cells; typical spots moved: ${n(this.spotsMoved)} (${n(this.spotsMoved10)} by 10 km or more)`);
    else out.push('climates: not derived in this run (no --grid); run the pages listed with --grid climate to see climates and typical spots');
    return out;
  }
}

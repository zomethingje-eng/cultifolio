import type { Dossier } from '$dossier/schema';

/**
 * A sheet: what a plant's page, a label and a batch need of its species, and nothing a species page shows beyond that:
 * the name, the family, a thumbnail, the marker's latitude and the climate the care rules read (the median year to a
 * tenth, the 10th and 90th percentile night and light, the extremes, the counts). About 2 KB a species raw, 80 bytes
 * gzipped, against a 50 KB dossier, served by hash bucket so a device never names or keys the species it grows.
 */
type Ok = Extract<Dossier['climate'], { status: 'ok' }>;
export type SheetMonth = { tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number };
export type SheetClimate =
  | { status: 'ok'; cells: number; records: number; at: { lat: number }; months: SheetMonth[]; p10: Pick<SheetMonth, 'tmin' | 'dli'>[]; p90: Pick<SheetMonth, 'tmin' | 'dli'>[]; extremes?: Ok['extremes']; extremesStatus?: Ok['extremesStatus'] }
  | { status: 'pending' | 'none' | 'refused'; detail?: string };
export type Sheet = {
  key: number;
  slug: string;
  name: { scientific: string; family?: string };
  thumb?: string;
  centroid: { lat: number } | null;
  /** The habitat's latitude for the season rules: the marker's, else the typical cell's; null only without a climate. A label printed from a sheet without a marker was six months off before this existed (round twelve, 1). */
  habitatLat: number | null;
  climate: SheetClimate;
};

const r1 = (x: number) => Math.round(x * 10) / 10;
const slimYear = (y: Ok['months']): SheetMonth[] => y.map((m) => ({ tmax: r1(m.tmax), tmin: r1(m.tmin), tmean: r1(m.tmean), precipMm: r1(m.precipMm), ...(m.dli != null ? { dli: r1(m.dli) } : {}), ...(m.rh != null ? { rh: r1(m.rh) } : {}) }));
const slimSpan = (y: Ok['months']) => y.map((m) => ({ tmin: r1(m.tmin), ...(m.dli != null ? { dli: r1(m.dli) } : {}) }));

export function sheetOf(d: Dossier, thumb?: string): Sheet {
  const c = d.climate;
  return {
    key: d.key,
    slug: d.slug,
    name: { scientific: d.name.scientific, family: d.name.family },
    thumb,
    centroid: d.centroid ? { lat: d.centroid.lat } : null,
    habitatLat: d.centroid?.lat ?? (c.status === 'ok' ? c.at.lat : null),
    climate: c.status === 'ok'
      ? { status: 'ok', cells: c.cells, records: c.records, at: { lat: c.at.lat }, months: slimYear(c.months), p10: slimSpan(c.p10), p90: slimSpan(c.p90), ...(c.extremes ? { extremes: c.extremes } : {}), ...(c.extremesStatus && c.extremesStatus !== 'ok' ? { extremesStatus: c.extremesStatus } : {}) }
      : { status: c.status, ...(c.detail ? { detail: c.detail } : {}) }
  };
}

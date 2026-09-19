/**
 * The ClimateProvider the dossier builder calls with a species' in-range
 * records. Normals come from range reads of the packed CHELSA grid, one per
 * distinct cell, summarised as a median year and a 10th–90th percentile
 * envelope; extremes from a cached NASA POWER series at the typical cell,
 * lapse-corrected to that cell's elevation. Every number says where it came from.
 */
import type { JsonFetcher } from '$dossier/fetch';
import type { Climate } from '$dossier/schema';

type ClimateOk = Extract<Climate, { status: 'ok' }>;
import type { ClimateProvider } from '$dossier/build';
import type { GridSource } from './source';
import { decodeCell, cellOf, type ClimateVar } from './grid';
import { fetchPowerSeries, extremesFor, powerCell, type PowerSeries } from './power';

/** PAR is ~45% of shortwave and 4.6 µmol/J, so 1 MJ/m²/day of rsds ≈ 2.07 mol/m²/day of PAR. */
export const DLI_PER_MJ = 2.07;

export interface PowerCache {
  get(id: string): Promise<PowerSeries | null>;
  set(id: string, s: PowerSeries): Promise<void>;
}

export const memoryPowerCache = (): PowerCache => {
  const m = new Map<string, PowerSeries>();
  return { get: async (k) => m.get(k) ?? null, set: async (k, v) => void m.set(k, v) };
};

export interface ProviderOptions {
  grid: GridSource;
  fetcher: JsonFetcher;
  powerCache?: PowerCache;
  /** Skip POWER (offline or quick builds). Extremes are then absent, and say so. */
  noExtremes?: boolean;
}

type Month = { tmax: number; tmin: number; tmean: number; precipMm: number; dli?: number; rh?: number; vpdKpa?: number; windMs?: number };
const VARS = ['tmax', 'tmin', 'tmean', 'precipMm', 'dli', 'rh', 'vpdKpa', 'windMs'] as const;

/** Linear-interpolated percentile of a sorted array; q in [0, 1]. */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Month-by-month percentile across cells: each variable independently, absent where any cell lacks it. */
function monthStat(cells: Month[][], q: number): Month[] {
  return Array.from({ length: 12 }, (_, i) => {
    const out: Record<string, number | undefined> = {};
    for (const k of VARS) {
      const xs = cells.map((c) => c[i][k]).filter((x): x is number => typeof x === 'number');
      out[k] = xs.length === cells.length ? +quantile([...xs].sort((a, b) => a - b), q).toFixed(k === 'vpdKpa' ? 2 : k === 'precipMm' || k === 'rh' ? 0 : 1) : undefined;
    }
    return out as Month;
  });
}

export function makeClimateProvider(o: ProviderOptions): ClimateProvider {
  const cache = o.powerCache ?? memoryPowerCache();

  /** One cell's twelve months, or null for sea, ice, or outside the grid. */
  async function readCell(lat: number, lon: number): Promise<{ id: string; months: Month[]; elevationM?: number } | null> {
    const cell = await o.grid.cell(lat, lon);
    if (!cell) return null;
    const h = await o.grid.header();
    const v = decodeCell(h, cell.buf);
    const need: ClimateVar[] = ['tasmax', 'tasmin', 'tas', 'pr'];
    if (!v.months.every((m) => need.every((k) => typeof m[k] === 'number'))) return null;
    const months = v.months.map((m) => ({
      tmax: r1(m.tasmax!),
      tmin: r1(m.tasmin!),
      tmean: r1(m.tas!),
      precipMm: Math.round(m.pr!),
      dli: m.rsds != null ? r1(m.rsds * DLI_PER_MJ) : undefined,
      rh: m.hurs != null ? Math.round(m.hurs) : undefined,
      vpdKpa: m.vpd != null ? r2(m.vpd / 1000) : undefined,
      windMs: m.sfcWind != null ? r1(m.sfcWind) : undefined
    }));
    return { id: cell.id, months, elevationM: v.elevationM };
  }

  /** Daily extremes at one point, lapse-corrected to its cell's elevation unless that elevation is below sea level (a coastal cell averaged with sea floor). */
  async function extremesAt(lat: number, lon: number, elevationM: number | undefined, src: { extremes?: string; elevation?: string }): Promise<ClimateOk['extremes']> {
    if (o.noExtremes) {
      src.extremes = 'extremes skipped in this build';
      return undefined;
    }
    const pc = powerCell(lat, lon);
    let ps = await cache.get(pc.id);
    if (!ps) {
      const r = await fetchPowerSeries(o.fetcher, lat, lon);
      if (r.status === 'ok') {
        ps = r.data;
        await cache.set(pc.id, ps);
      } else {
        src.extremes = `NASA POWER ${r.status === 'none' ? 'has no series here' : 'did not answer (' + r.detail + ')'}; extremes not derived`;
        return undefined;
      }
    }
    // ETOPO's cell mean over a coastline includes sea floor; a negative "elevation" would warm every extreme. No lapse then, and say so.
    const target = elevationM != null && elevationM >= 0 ? elevationM : undefined;
    const e = extremesFor(ps, target);
    if (!e.usable) {
      src.extremes = `NASA POWER series too short (${e.extremes.years} years); extremes not derived`;
      return undefined;
    }
    src.extremes = `NASA POWER (MERRA-2) daily 1981–2024, cell ${ps.cell}${e.deltaM ? `, lapse-corrected ${e.deltaM > 0 ? '+' : ''}${e.deltaM} m at 6.5 °C/km` : elevationM != null && elevationM < 0 ? ', no lapse correction (the cell mean elevation is below sea level: a coastal cell)' : ''}`;
    return { years: e.extremes.years, minAbs: r1(e.extremes.minAbs), minP01: r1(e.extremes.minP01), maxP99: r1(e.extremes.maxP99), frostDaysPerYear: r1(e.extremes.frostDaysPerYear), lapseAppliedM: e.deltaM };
  }

  return {
    async envelope(points): Promise<Climate> {
      const h = await o.grid.header().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      if ('error' in h) return { status: 'refused', detail: `climate grid unavailable: ${h.error}` };
      // One read per distinct cell: a site visited a hundred times is one cell of climate, not a hundred votes.
      const byCell = new Map<string, { lat: number; lon: number }>();
      for (const [lat, lon] of points) {
        const id = cellOf(h, lat, lon).id;
        if (!byCell.has(id)) byCell.set(id, { lat, lon });
      }
      const read: Array<{ id: string; lat: number; lon: number; months: Month[]; elevationM?: number }> = [];
      let sea = 0;
      try {
        for (const [, p] of byCell) {
          const c = await readCell(p.lat, p.lon);
          if (c) read.push({ ...c, lat: p.lat, lon: p.lon });
          else sea++;
        }
      } catch (e) {
        return { status: 'refused', detail: `climate grid unavailable: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (read.length < 3) return { status: 'none', detail: `only ${read.length} distinct land cell${read.length === 1 ? '' : 's'} of the climate grid hold${read.length === 1 ? 's' : ''} an in-range record${sea ? ` (${sea} at sea or ice)` : ''}; three are needed for an envelope` };
      const years = read.map((c) => c.months);
      const months = monthStat(years, 0.5), p10 = monthStat(years, 0.1), p90 = monthStat(years, 0.9);
      // The typical cell: the one whose coldest night of the year is nearest the median coldest night.
      const coldest = (y: Month[]) => Math.min(...y.map((m) => m.tmin));
      const medCold = quantile(read.map((c) => coldest(c.months)).sort((a, b) => a - b), 0.5);
      const typical = read.reduce((a, b) => (Math.abs(coldest(b.months) - medCold) < Math.abs(coldest(a.months) - medCold) ? b : a));
      const src: ClimateOk['src'] = {
        normals: `CHELSA V2.1 1981–2010 climatology, ${h.cell}° cells (each the mean of ~${Math.round((h.cell / 0.008333) ** 2)} 1 km pixels)`,
        envelope: `median and 10th–90th percentile of each month across the ${read.length} distinct grid cells holding the ${points.length} in-range records; extremes and elevation at the typical cell ${typical.id} (coldest night nearest the median)`,
        elevation: typical.elevationM != null ? `ETOPO 2022, ${Math.round(typical.elevationM)} m (cell mean)` : undefined
      };
      const extremes = await extremesAt(typical.lat, typical.lon, typical.elevationM, src);
      return { status: 'ok', cells: read.length, records: points.length, cell: typical.id, at: { lat: +typical.lat.toFixed(3), lon: +typical.lon.toFixed(3) }, months, p10, p90, extremes, src };
    },
    async at(lat, lon): Promise<Climate> {
      // One point: an envelope of one cell, for the plant page's bench comparison and for tests.
      let c;
      try {
        c = await readCell(lat, lon);
      } catch (e) {
        return { status: 'refused', detail: `climate grid unavailable: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (!c) return { status: 'none', detail: 'no land climate at this point (outside the grid, sea or ice)' };
      const h = await o.grid.header();
      const src: ClimateOk['src'] = {
        normals: `CHELSA V2.1 1981–2010 climatology, ${h.cell}° cell ${c.id} (mean of ~${Math.round((h.cell / 0.008333) ** 2)} 1 km pixels)`,
        envelope: 'one cell: median and percentiles coincide',
        elevation: c.elevationM != null ? `ETOPO 2022, ${Math.round(c.elevationM)} m (cell mean)` : undefined
      };
      const extremes = await extremesAt(lat, lon, c.elevationM, src);
      return { status: 'ok', cells: 1, records: 1, cell: c.id, at: { lat: +lat.toFixed(3), lon: +lon.toFixed(3) }, months: c.months, p10: c.months, p90: c.months, extremes, src };
    }
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * The ClimateProvider the dossier builder calls with a habitat centroid.
 * Normals come from one range read of the packed CHELSA grid; extremes from
 * a cached NASA POWER series, lapse-corrected to the grid cell's elevation.
 * Every number says where it came from.
 */
import type { JsonFetcher } from '$dossier/fetch';
import type { Climate } from '$dossier/schema';

type ClimateOk = Extract<Climate, { status: 'ok' }>;
import type { ClimateProvider } from '$dossier/build';
import type { GridSource } from './source';
import { decodeCell, type ClimateVar } from './grid';
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

const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function makeClimateProvider(o: ProviderOptions): ClimateProvider {
  const cache = o.powerCache ?? memoryPowerCache();
  return {
    async at(lat, lon): Promise<Climate> {
      let cell;
      try {
        cell = await o.grid.cell(lat, lon);
      } catch (e) {
        return { status: 'refused', detail: `climate grid unavailable: ${e instanceof Error ? e.message : String(e)}` };
      }
      if (!cell) return { status: 'none', detail: 'habitat centre is outside the climate grid' };
      const h = await o.grid.header();
      const v = decodeCell(h, cell.buf);
      const need: ClimateVar[] = ['tasmax', 'tasmin', 'tas', 'pr'];
      const monthsOk = v.months.every((m) => need.every((k) => typeof m[k] === 'number'));
      if (!monthsOk) return { status: 'none', detail: 'no land climate at the habitat centre (sea or ice cell)' };

      const months = v.months.map((m, i) => ({
        tmax: r1(m.tasmax!),
        tmin: r1(m.tasmin!),
        tmean: r1(m.tas!),
        precipMm: Math.round(m.pr!),
        dli: m.rsds != null ? r1(m.rsds * DLI_PER_MJ) : undefined,
        rh: m.hurs != null ? Math.round(m.hurs) : undefined,
        vpdKpa: m.vpd != null ? r2(m.vpd / 1000) : undefined,
        windMs: m.sfcWind != null ? r1(m.sfcWind) : undefined,
        _days: DAYS[i]
      }));

      const src: { normals: string; extremes?: string; elevation?: string } = {
        normals: `CHELSA V2.1 1981–2010 climatology, ${h.cell}° cell ${cell.id} (mean of ~${Math.round((h.cell / 0.008333) ** 2)} 1 km pixels)`,
        elevation: v.elevationM != null ? `ETOPO 2022, ${Math.round(v.elevationM)} m (cell mean)` : undefined
      };

      let extremes: ClimateOk['extremes'] = undefined;
      if (!o.noExtremes) {
        const pc = powerCell(lat, lon);
        let ps = await cache.get(pc.id);
        if (!ps) {
          const r = await fetchPowerSeries(o.fetcher, lat, lon);
          if (r.status === 'ok') {
            ps = r.data;
            await cache.set(pc.id, ps);
          } else src.extremes = `NASA POWER ${r.status === 'none' ? 'has no series here' : 'did not answer (' + r.detail + ')'}; extremes not derived`;
        }
        if (ps) {
          const e = extremesFor(ps, v.elevationM);
          if (e.usable) {
            extremes = { years: e.extremes.years, minAbs: r1(e.extremes.minAbs), minP01: r1(e.extremes.minP01), maxP99: r1(e.extremes.maxP99), frostDaysPerYear: r1(e.extremes.frostDaysPerYear), lapseAppliedM: e.deltaM };
            src.extremes = `NASA POWER (MERRA-2) daily 1981–2024, cell ${ps.cell}${e.deltaM ? `, lapse-corrected ${e.deltaM > 0 ? '+' : ''}${e.deltaM} m at 6.5 °C/km` : ''}`;
          } else src.extremes = `NASA POWER series too short (${e.extremes.years} years); extremes not derived`;
        }
      } else src.extremes = 'extremes skipped in this build';

      return { status: 'ok', cell: cell.id, months: months.map(({ _days, ...m }) => m), extremes, src };
    }
  };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

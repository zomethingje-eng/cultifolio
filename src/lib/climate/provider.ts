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
import type { ClimateProvider, EnvelopeOptions } from '$dossier/build';
import type { Admission } from '$dossier/tdwg-shapes';
/** The reasons a record is in range, best first (`Admission`): a cell keeps its best record's. */
const ADMISSIONS: ReadonlyArray<Admission> = ['strict', 'buffer', 'coast', 'island'];
import type { GridSource } from './source';
import { decodeCell, cellOf, cellCentre, type ClimateVar } from './grid';
import { fetchPowerSeries, extremesFor, powerCell, type PowerSeries } from './power';
import { yearLows } from './year-lows';
import { quantile } from '$core/extremes';
import { r1 } from '$core/num';

/** PAR is ~45% of shortwave and 4.6 µmol/J, so 1 MJ/m²/day of rsds ≈ 2.07 mol/m²/day of PAR. */
const DLI_PER_MJ = 2.07;

export interface PowerCache {
  get(id: string): Promise<PowerSeries | null>;
  set(id: string, s: PowerSeries): Promise<void>;
}

const memoryPowerCache = (): PowerCache => {
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

  /**
   * One cell's twelve months, or null for sea, ice, or outside the grid. Land is the elevation layer: CHELSA carries
   * temperatures and rain over the ocean (20 °C days in the mid-Atlantic), so a cell with figures is not a land cell; the
   * packer masks sea pixels before averaging ETOPO, so a cell with no land in it has no elevation. The known exceptions
   * are the few basins whose whole cell lies below sea level (Death Valley's floor, the Qattara and Turfan depressions,
   * the Caspian shore), which read as sea here.
   */
  async function readCell(lat: number, lon: number, drawnLand?: EnvelopeOptions['drawnLand']): Promise<{ id: string; months: Month[]; elevationM?: number; drawn?: true } | null> {
    const cell = await o.grid.cell(lat, lon);
    if (!cell) return null;
    const h = await o.grid.header();
    const v = decodeCell(h, cell.buf);
    // Round eighty-six (the Howea finding): a cell the elevation layer reads as sea, where a native region's drawn land
    // (its shape or a minor island) lies, is an island narrower than ETOPO's 60″ pixels: Lord Howe Island, 1 to 2 km across,
    // whose north-western cell held 6 of Howea belmoreana's records and was left out as sea, so the page had two land cells
    // and no climate. It is read for its CHELSA months, with no elevation (so no height correction), and said so.
    let drawn: true | undefined;
    if (v.elevationM == null) {
      if (!drawnLand) return null;
      const c = cellOf(h, lat, lon), m = cellCentre(h, c.row, c.col), half = h.cell / 2;
      if (!drawnLand({ s: m.lat - half, w: m.lon - half, n: m.lat + half, e: m.lon + half })) return null;
      drawn = true;
    }
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
    return { id: cell.id, months, ...(v.elevationM != null ? { elevationM: v.elevationM } : {}), ...(drawn ? { drawn } : {}) };
  }

  /** Daily extremes at one point, lapse-corrected to its cell's elevation (the land's: scripts/pack-climate.py leaves the sea floor out). A negative elevation, which only a grid packed before that could give, is not corrected for. */
  async function extremesAt(lat: number, lon: number, elevationM: number | undefined, src: { extremes?: string; elevation?: string }): Promise<{ extremes: ClimateOk['extremes']; status: NonNullable<ClimateOk['extremesStatus']> }> {
    if (o.noExtremes) {
      src.extremes = 'extremes skipped in this build';
      return { extremes: undefined, status: 'skipped' };
    }
    const pc = powerCell(lat, lon);
    let ps = await cache.get(pc.id);
    if (!ps) {
      const r = await fetchPowerSeries(o.fetcher, lat, lon);
      if (r.status === 'ok') {
        ps = r.data;
        await cache.set(pc.id, ps);
      } else {
        // A refusal is kept apart from an absence: it is marked on the dossier, so the next build asks again, and the page says
        // "not checked" rather than "none on file" (round sixteen, 7).
        // Worded by what the source did (round sixty-seven; triage-66 S8, R45-11): a refusal as "refused the request", a
        // failure as "did not answer"; both are kept as not checked.
        src.extremes = `NASA POWER ${r.status === 'none' ? 'has no series here' : r.status === 'refused' ? 'refused the request (' + r.detail + ')' : 'did not answer (' + r.detail + ')'}; extremes not derived`;
        return { extremes: undefined, status: r.status === 'none' ? 'none' : 'refused' };
      }
    }
    // A grid packed before scripts/pack-climate.py masked the sea took a coastal cell's mean over the sea floor; a negative
    // "elevation" would warm every extreme. No lapse then, and say so (the grid packed since gives no such cell).
    const target = elevationM != null && elevationM >= 0 ? elevationM : undefined;
    const e = extremesFor(ps, target);
    if (!e.usable) {
      src.extremes = `NASA POWER series too short (${e.extremes.years} years); extremes not derived`;
      return { extremes: undefined, status: 'none' };
    }
    // Every case says what was done about elevation: corrected, or not, and why not. Chosen by whether both elevations
    // exist, not by the difference: a correction of 0 m is a correction, and it fell through to "POWER gave no cell
    // elevation" (round sixty-two; outside review A3).
    const lapse = target != null && ps.elevationM != null
      ? `, lapse-corrected ${e.deltaM > 0 ? '+' : ''}${e.deltaM} m at 6.5 °C/km`
      : elevationM != null && elevationM < 0
        ? ', no lapse correction (the cell mean elevation is below sea level: a coastal cell)'
        : elevationM == null
          ? ', no lapse correction (no cell elevation on file)'
          : ', no lapse correction (POWER gave no cell elevation)';
    src.extremes = `NASA POWER (MERRA-2) daily 1981–2024, cell ${ps.cell}${lapse}`;
    // The frost figure is kept as the count and the exact rate: rounding the rate to a decimal turned one night in forty years into none.
    // Each year's lowest night too (round eighty-seven; `year-lows.ts`), by the same correction: the habitat's hardiness
    // zone is the mean of these (`$dossier/hardiness`), which the record low alone cannot give.
    const lows = yearLows(ps.series, e.deltaM);
    return { extremes: { years: e.extremes.years, minAbs: r1(e.extremes.minAbs), minP01: r1(e.extremes.minP01), maxP99: r1(e.extremes.maxP99), frostDaysPerYear: +e.extremes.frostDaysPerYear.toFixed(3), frostNights: e.extremes.frostNights, lapseAppliedM: e.deltaM, ...(lows ? { lows } : {}) }, status: 'ok' };

  }

  /**
   * How much of the NASA POWER cell (0.5° × 0.625°) around a point is land, by a 5 × 5 sample of the climate grid, each
   * point judged as readCell judges it (by the elevation layer). The first two corpora built with this rule found every
   * cell 100% land: the first sample tested whether the grid had a cell there, and the file grid has one for every
   * point in its extent; the second tested whether it held figures, and CHELSA has figures over the sea.
   */
  async function landFractionAround(lat: number, lon: number): Promise<number> {
    const pc = powerCell(lat, lon);
    let land = 0, n = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
      const la = pc.lat - 0.25 + (i + 0.5) * 0.1, lo = pc.lon - 0.3125 + (j + 0.5) * 0.125;
      if (la > 90 || la < -90) continue;
      n++;
      try {
        if (await readCell(la, lo)) land++;
      } catch {
        /* outside the grid counts as not land */
      }
    }
    return n ? land / n : 0;
  }

  return {
    async envelope(points, opts?: EnvelopeOptions): Promise<Climate> {
      const h = await o.grid.header().catch((e) => ({ error: e instanceof Error ? e.message : String(e) }));
      if ('error' in h) return { status: 'refused', detail: `climate grid unavailable: ${h.error}` };
      // One read per distinct cell: a site visited a hundred times is one cell of climate, not a hundred votes. The cell is
      // known by its centre, never by a record's coordinate: a restricted record's position is not published, and the
      // typical cell's position on the page is the cell's, which any record in it shares.
      // Each cell keeps the best reason one of its records is in range by (round eighty-five; A23): strict before the margin,
      // the margin before the coast reach, the coast reach before an island.
      const byCell = new Map<string, { lat: number; lon: number; n: number; how: Admission }>();
      for (const [lat, lon, how = 'strict'] of points) {
        const c = cellOf(h, lat, lon);
        const e = byCell.get(c.id);
        if (e) { e.n++; if (ADMISSIONS.indexOf(how) < ADMISSIONS.indexOf(e.how)) e.how = how; }
        else byCell.set(c.id, { ...cellCentre(h, c.row, c.col), n: 1, how });
      }
      const read: Array<{ id: string; lat: number; lon: number; n: number; how: Admission; months: Month[]; elevationM?: number; drawn?: true }> = [];
      let sea = 0;
      try {
        for (const [, p] of byCell) {
          const c = await readCell(p.lat, p.lon, opts?.drawnLand);
          if (c) read.push({ ...c, lat: p.lat, lon: p.lon, n: p.n, how: p.how });
          else sea++;
        }
      } catch (e) {
        return { status: 'refused', detail: `climate grid unavailable: ${e instanceof Error ? e.message : String(e)}` };
      }
      // The points are the in-range records placed to within 10 km (`forClimate`), and the words say so: "only 1 distinct
      // land cell holds an in-range record" was false of Pachypodium succulentum's 468 records, 467 of them placed worse
      // (round seventy-two, B: 912 of the 1,073 pages with this reason).
      if (read.length < 3) return { status: 'none', detail: `only ${read.length} distinct land cell${read.length === 1 ? '' : 's'} of the climate grid hold${read.length === 1 ? 's' : ''} an in-range record placed to within 10 km${sea ? ` (${sea} at sea or ice)` : ''}; three are needed for an envelope` };
      // A species with records on both sides of the equator in strength has no one calendar: a January median over both
      // sides is a month no place has. Only cells poleward of 10° count as being on a side (within 10° of the equator
      // there is no temperature season to reverse, as /about/how says of the rain rule; an Andean species from 5° N to
      // 5° S is one climate, not two, and round thirty-one's rule split it and threw half its range away: round
      // thirty-three, 8). When the smaller side has three such cells and a fifth of them, its poleward cells are left
      // out, the split is recorded, and the page says so; the equatorial cells stay in whichever way (round thirty-one, 1).
      // Round eighty-five (G; review D8): whenever both sides hold such cells, however few on the smaller side. Round
      // thirty-one split only at three cells and a fifth; below that the smaller side's cells stayed in the median and could
      // be the typical cell, so 39 pages showed months of one hemisphere and a typical spot in the other (Physalis viscosa:
      // the spot 20.8° N, the coldest month July). A side's calendar is one calendar.
      const northPole = read.filter((c) => c.lat >= 10), southPole = read.filter((c) => c.lat <= -10);
      const sided = northPole.length + southPole.length;
      const minor = Math.min(northPole.length, southPole.length);
      let hemispheres: ClimateOk['hemispheres'];
      let used = read;
      if (minor >= 1) {
        const useNorth = northPole.length >= southPole.length;
        used = read.filter((c) => (useNorth ? c.lat > -10 : c.lat < 10));
        hemispheres = { north: northPole.length, south: southPole.length, used: useNorth ? 'north' : 'south', equatorial: read.length - sided }; // the cells within 10° of the equator, which stay in (round thirty-five, R2-5)
        if (used.length < 3) return { status: 'none', detail: `only ${used.length} distinct land cell${used.length === 1 ? '' : 's'} of the climate grid on the ${useNorth ? 'north' : 'south'}ern side of the equator hold${used.length === 1 ? 's' : ''} an in-range record placed to within 10 km (${northPole.length} poleward of 10° north, ${southPole.length} poleward of 10° south: the two sides' seasons are not combined); three are needed for an envelope` };
      }
      const records = used.reduce((a, c) => a + c.n, 0); // the records in the cells the envelope reads, not every in-range record (round thirty-three, 4)
      const drawnN = used.filter((c) => c.drawn).length;
      const years = used.map((c) => c.months);
      const months = monthStat(years, 0.5), p10 = monthStat(years, 0.1), p90 = monthStat(years, 0.9);
      // Annual rain per cell, then its percentiles: a sum of monthly percentiles would add months from different cells' years.
      // The median of the cells' own years is the year's rain the pages show (round sixty-three; REVIEW-TRIAGE-61's deferred
      // list). Each percentile is interpolated between the two nearest totals, so with an even number of cells the median is
      // halfway between the two middle ones, not a total any cell has; the pages do not claim it is (the fix pass, R2 2).
      const annual = years.map((y) => y.reduce((a, m) => a + m.precipMm, 0)).sort((a, b) => a - b);
      const annualRain = { p10: r1(quantile(annual, 0.1)), p90: r1(quantile(annual, 0.9)), p50: r1(quantile(annual, 0.5)) };
      // The typical cell: the one whose coldest month's mean night is nearest the median of that across cells. Monthly means are
      // what the grid holds; the coldest single night is a POWER figure, read there afterwards.
      const coldest = (y: Month[]) => Math.min(...y.map((m) => m.tmin));
      // Round eighty-seven's review of stage 2 (S4): the stage's rule that chose the typical cell among the cells holding an
      // iNaturalist research-grade record (review D's D2, the Poor Knights lily) is taken out. Research grade is "not
      // marked captive", not "marked wild", so it chose by what no source states; the typical cell is every cell's again,
      // and D2 (Xeronema callistemon) stays held open in the record.
      const { typical, landFraction, tried, tied } = await typicalOf(used, coldest, landFractionAround);
      const src: ClimateOk['src'] = {
        normals: `CHELSA V2.1 1981–2010 climatology, ${h.cell}° cells (each the mean of ~${Math.round((h.cell / 0.008333) ** 2)} 1 km pixels)`,
        envelope: `median and 10th–90th percentile of each month across the ${used.length} distinct grid cells holding ${records} of the ${points.length} in-range records${drawnN ? ` (${drawnN} of them ${drawnN === 1 ? 'a cell' : 'cells'} the elevation layer reads as sea, read for the native region's land the regions' shapes draw in ${drawnN === 1 ? 'it' : 'them'}: an island narrower than the layer's 60″ pixels; no elevation there)` : ''}${sea ? ` (${sea} further cell${sea === 1 ? '' : 's'} with records at sea, by the elevation layer, left out)` : ''}${hemispheres ? ` on the ${hemispheres.used}ern side of the equator (${hemispheres.north} cells poleward of 10° north, ${hemispheres.south} poleward of 10° south: the two sides' seasons are not combined, and cells within 10° of the equator stay in)` : ''}; extremes and elevation at the typical cell ${typical.id} (its coldest month's mean nightly low nearest the median across cells${tied > 1 ? `; the ${tied} cells within ${TYPICAL_TIE_C} °C of the nearest count as equally near, and of those the one holding the most records is taken` : ''}${landFraction < 0.5 ? `, though its NASA POWER cell is only ${Math.round(landFraction * 100)}% land and none of the ${tried} next candidates within 2 °C of the median was mostly land` : ''}); its position is the cell centre`,
        elevation: typical.elevationM != null ? `ETOPO 2022, ${Math.round(typical.elevationM)} m (cell mean)` : undefined
      };
      const { extremes, status: extremesStatus } = await extremesAt(typical.lat, typical.lon, typical.elevationM, src);
      const admitted = { strict: 0, buffer: 0, coast: 0, island: 0 };
      for (const c of used) admitted[c.how]++;
      const edge = used.filter((c) => c.how !== 'strict').map((c) => [+c.lat.toFixed(3), +c.lon.toFixed(3), c.how] as [number, number, Exclude<Admission, 'strict'>]);
      return { status: 'ok', cells: used.length, records, cell: typical.id, ...(points.some((p) => p[2]) ? { admitted, ...(edge.length ? { edge } : {}) } : {}), at: { lat: +typical.lat.toFixed(3), lon: +typical.lon.toFixed(3) }, months, p10, p90, annualRain, extremes, extremesStatus, ...(hemispheres ? { hemispheres } : {}), ...(sea ? { seaCells: sea } : {}), landFraction: r2(landFraction), src };
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
      const { extremes, status: extremesStatus } = await extremesAt(lat, lon, c.elevationM, src);
      return { status: 'ok', cells: 1, records: 1, cell: c.id, at: { lat: +lat.toFixed(3), lon: +lon.toFixed(3) }, months: c.months, p10: c.months, p90: c.months, extremes, extremesStatus, src };
    }
  };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Round ninety: how near the median coldest night two cells must be to count as equally typical. Among such cells the one
 * holding the most records is taken, so a few records more, which move the median by a tenth of a degree, no longer move a
 * wide-ranging plant's typical spot across the world (stage 2's dry run: Medicago lupulina from Shandong to Bern, 8,591 km,
 * on 774 → 778 records; Oplismenus undulatifolius from Turin to Kōchi; 24 of its 79 moves over 1,000 km). Before, equals
 * were decided by the order the records came in.
 */
export const TYPICAL_TIE_C = 0.5;

/**
 * The typical cell of a set of cells (round thirty-one, thirty-three): the one nearest the median coldest-month night whose
 * NASA POWER cell is mostly land; the candidates are tried nearest first, up to twelve and only while their coldest night
 * is within 2 °C of the median, and when none is mostly land the nearest stands. Out of `envelope` since round
 * eighty-seven. Round ninety: "nearest" first takes every cell within `TYPICAL_TIE_C` of the nearest, the most recorded of
 * them first (then the nearer, then the cell's id), and the rest after by nearness.
 */
async function typicalOf<C extends { id: string; lat: number; lon: number; n: number; months: Array<{ tmin: number }> }>(cells: C[], coldest: (y: C['months']) => number, landFractionAround: (lat: number, lon: number) => Promise<number>): Promise<{ typical: C; landFraction: number; tried: number; tied: number }> {
  const medCold = quantile(cells.map((c) => coldest(c.months)).sort((a, b) => a - b), 0.5);
  const dist = (c: C) => Math.abs(coldest(c.months) - medCold);
  const d0 = Math.min(...cells.map(dist));
  const byId = (a: C, b: C) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const isNear = (c: C) => dist(c) <= d0 + TYPICAL_TIE_C + 1e-9;
  const near = cells.filter(isNear).sort((a, b) => b.n - a.n || dist(a) - dist(b) || byId(a, b));
  const rest = cells.filter((c) => !isNear(c)).sort((a, b) => dist(a) - dist(b) || byId(a, b));
  // The typical cell is the one nearest the median coldest night whose NASA POWER cell is mostly land: a POWER cell
  // (0.5°) over a coast or an island is averaged with the sea, and its extremes are the sea's, not the plant's
  // (round thirty-one, 2). A fog-belt coast must not hand its cold floor to a mountain cell a few places down the list
  // (round thirty-three, 7); when none is mostly land the nearest stands and its fraction is written, so the page can say it.
  const byNearness = [...near, ...rest];
  const nearest = byNearness[0];
  let typical = nearest;
  const nearestLand = await landFractionAround(nearest.lat, nearest.lon);
  let landFraction = nearestLand;
  let tried = 0;
  for (const c of byNearness.slice(1, 12)) {
    if (landFraction >= 0.5 || Math.abs(coldest(c.months) - medCold) > 2) break;
    tried++;
    const f = await landFractionAround(c.lat, c.lon);
    if (f >= 0.5) { typical = c; landFraction = f; }
  }
  if (landFraction < 0.5) { typical = nearest; landFraction = nearestLand; }
  return { typical, landFraction, tried, tied: near.length };
}

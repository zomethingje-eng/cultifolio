/**
 * The packed climate grid.
 *
 * One file, `climate.grid`, holds every layer for every cell of a 0.05°
 * global grid, interleaved per cell, so a climate lookup is ONE range read of
 * `layers × 2` bytes. A sidecar `climate.json` describes the layers, their
 * scale factors and the grid geometry. Shape changes bump `v`.
 *
 * Cell (row, col): row 0 is the northernmost band (lat 90..89.95), col 0 the
 * westernmost (lon -180..-179.95). Values are int16 little-endian; NODATA is
 * -32768. Sources: CHELSA V2.1 1981–2010 climatologies (CC0) and ETOPO 2022
 * 60″ surface elevation (public domain), resampled by mean.
 */

export const GRID_V = 1 as const;
export const NODATA = -32768;

export interface LayerSpec {
  /** e.g. "tasmax_01", "elev" */
  id: string;
  var: string;
  month?: number; // 1..12
  /** physical = raw * scale (+ offset) */
  scale: number;
  offset: number;
  unit: string;
}

export interface GridHeader {
  v: typeof GRID_V;
  built: string;
  cell: number; // degrees, 0.05
  cols: number; // 7200
  rows: number; // 3600
  north: number; // 90
  west: number; // -180
  nodata: number;
  bytesPerValue: 2;
  layers: LayerSpec[];
  sources: string[];
}

export const CLIMATE_VARS = ['tasmax', 'tasmin', 'tas', 'pr', 'rsds', 'hurs', 'vpd', 'sfcWind'] as const;
export type ClimateVar = (typeof CLIMATE_VARS)[number];

/** The quantisation the packer uses; the header carries it, this is the default it writes. */
export const QUANT: Record<ClimateVar | 'elev', { scale: number; unit: string }> = {
  tasmax: { scale: 0.1, unit: '°C' },
  tasmin: { scale: 0.1, unit: '°C' },
  tas: { scale: 0.1, unit: '°C' },
  pr: { scale: 1, unit: 'mm/month' },
  rsds: { scale: 0.01, unit: 'MJ/m²/day' },
  hurs: { scale: 0.1, unit: '%' },
  vpd: { scale: 1, unit: 'Pa' },
  sfcWind: { scale: 0.01, unit: 'm/s' },
  elev: { scale: 1, unit: 'm' }
};

export function defaultLayers(): LayerSpec[] {
  const out: LayerSpec[] = [];
  for (const v of CLIMATE_VARS) for (let m = 1; m <= 12; m++) out.push({ id: `${v}_${String(m).padStart(2, '0')}`, var: v, month: m, scale: QUANT[v].scale, offset: 0, unit: QUANT[v].unit });
  out.push({ id: 'elev', var: 'elev', scale: 1, offset: 0, unit: 'm' });
  return out;
}

export function cellOf(h: GridHeader, lat: number, lon: number): { row: number; col: number; index: number; id: string } {
  // A point on a grid line belongs to the cell it is the edge of; a hair of tolerance keeps float error from moving it north or west.
  const EPS = 1e-9;
  const row = Math.min(h.rows - 1, Math.max(0, Math.floor((h.north - lat) / h.cell + EPS)));
  let l = ((((lon + 180) % 360) + 360) % 360) - 180;
  const col = Math.min(h.cols - 1, Math.max(0, Math.floor((l - h.west) / h.cell + EPS)));
  return { row, col, index: row * h.cols + col, id: `${row}:${col}` };
}

/** The centre of a cell, to three decimals: what a page may print for it. */
export function cellCentre(h: GridHeader, row: number, col: number): { lat: number; lon: number } {
  return { lat: +(h.north - (row + 0.5) * h.cell).toFixed(3), lon: +(h.west + (col + 0.5) * h.cell).toFixed(3) };
}

export function byteRange(h: GridHeader, index: number): { offset: number; length: number } {
  const length = h.layers.length * h.bytesPerValue;
  return { offset: index * length, length };
}

export interface CellValues {
  /** physical values by layer id; missing when NODATA */
  values: Record<string, number>;
  elevationM?: number;
  months: Array<Partial<Record<ClimateVar, number>>>; // 12 entries
  complete: boolean;
}

export function decodeCell(h: GridHeader, buf: ArrayBuffer): CellValues {
  const dv = new DataView(buf);
  const values: Record<string, number> = {};
  const months: Array<Partial<Record<ClimateVar, number>>> = Array.from({ length: 12 }, () => ({}));
  let missing = 0;
  h.layers.forEach((L, i) => {
    const raw = dv.getInt16(i * 2, true);
    if (raw === h.nodata) {
      missing++;
      return;
    }
    const v = raw * L.scale + L.offset;
    values[L.id] = v;
    if (L.month) months[L.month - 1][L.var as ClimateVar] = v;
  });
  const elev = values.elev;
  return { values, elevationM: elev, months, complete: missing === 0 };
}

/** Test/packer helper: encode one cell from physical values. */
export function encodeCell(h: GridHeader, values: Record<string, number | undefined>): ArrayBuffer {
  const buf = new ArrayBuffer(h.layers.length * 2);
  const dv = new DataView(buf);
  h.layers.forEach((L, i) => {
    const v = values[L.id];
    const raw = v === undefined || Number.isNaN(v) ? h.nodata : Math.max(-32767, Math.min(32767, Math.round((v - L.offset) / L.scale)));
    dv.setInt16(i * 2, raw, true);
  });
  return buf;
}

export function makeHeader(opts: Partial<GridHeader> = {}): GridHeader {
  return {
    v: GRID_V,
    built: new Date().toISOString(),
    cell: 0.05,
    cols: 7200,
    rows: 3600,
    north: 90,
    west: -180,
    nodata: NODATA,
    bytesPerValue: 2,
    layers: defaultLayers(),
    sources: ['CHELSA V2.1 climatologies 1981–2010 (Karger et al. 2017; EnviDat, CC0)', 'ETOPO 2022 60″ surface (NOAA NCEI, public domain)'],
    ...opts
  };
}

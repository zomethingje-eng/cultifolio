/**
 * The reader's site climate (round 126; SPECIES 20, the lens's Outdoors view): the square the site falls in, the cell
 * within it, and the twelve months of that cell, read from the site's own tiles (`/api/site-climate`; scripts/
 * site-tiles.ts). Only the square's corner is sent; the cell is found here, on the device.
 */
export const NODATA = -32768;
const PER = 20; // cells a degree
const VALUES = 36; // tasmax ×12, tasmin ×12, pr ×12

export type SiteMonth = { tmax: number; tmin: number; precipMm: number };

/** The square holding a point: its south-west corner, whole degrees. */
export function squareOf(lat: number, lon: number): { lat: number; lon: number } {
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  return { lat: Math.min(89, Math.max(-90, Math.floor(lat))), lon: Math.min(179, Math.max(-180, Math.floor(l))) };
}

/** The cell holding a point within its square's tile: row 0 the northern band, column 0 the western. */
export function cellIn(lat: number, lon: number): { row: number; col: number } {
  const sq = squareOf(lat, lon);
  const l = ((((lon + 180) % 360) + 360) % 360) - 180;
  const row = Math.min(PER - 1, Math.max(0, Math.floor((sq.lat + 1 - lat) * PER + 1e-9)));
  const col = Math.min(PER - 1, Math.max(0, Math.floor((l - sq.lon) * PER + 1e-9)));
  return { row, col };
}

/** A cell's twelve months from a tile's bytes (unpacked), or null for a cell of sea. Scales as the grid stores them. */
export function monthsOf(tile: Uint8Array, row: number, col: number): SiteMonth[] | null {
  const dv = new DataView(tile.buffer, tile.byteOffset, tile.byteLength);
  const at = (row * PER + col) * VALUES * 2;
  if (at + VALUES * 2 > tile.byteLength) return null;
  const v = (k: number) => dv.getInt16(at + k * 2, true);
  if (v(0) === NODATA) return null;
  return Array.from({ length: 12 }, (_, m) => ({ tmax: v(m) / 10, tmin: v(12 + m) / 10, precipMm: v(24 + m) }));
}

/** Asks the site for the square and reads the site's cell; 'sea' when the square or the cell holds no land. */
export async function siteClimate(lat: number, lon: number, fetcher: typeof fetch = fetch): Promise<SiteMonth[] | 'sea' | 'unreached'> {
  const sq = squareOf(lat, lon);
  let r: Response;
  try { r = await fetcher(`/api/site-climate?sq=${sq.lat},${sq.lon}`); } catch { return 'unreached'; }
  if (r.status === 404) return 'sea';
  if (!r.ok || !r.body) return 'unreached';
  try {
    const bytes = new Uint8Array(await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
    const { row, col } = cellIn(lat, lon);
    return monthsOf(bytes, row, col) ?? 'sea';
  } catch { return 'unreached'; }
}

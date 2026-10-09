/**
 * Where the grid bytes come from. The reader only ever asks for one cell's
 * byte range, so any store that can serve a range works: a local file (the
 * corpus build on your PC, scripts/file-grid.ts) or memory (tests). The R2 and
 * HTTP sources had no caller and went in round sixty-two (the round-sixty
 * triage review's merge leftovers, decision 11): the site reads no grid.
 */
import type { GridHeader } from './grid';
import { byteRange, cellOf } from './grid';

export interface GridSource {
  header(): Promise<GridHeader>;
  /** Raw bytes for the cell containing lat/lon, or null if outside the grid. */
  cell(lat: number, lon: number): Promise<{ id: string; buf: ArrayBuffer } | null>;
}

/** In-memory source for tests: a Map of cell id → buffer. */
export function memoryGridSource(h: GridHeader, cells: Map<string, ArrayBuffer>): GridSource {
  return {
    header: async () => h,
    async cell(lat, lon) {
      const c = cellOf(h, lat, lon);
      const buf = cells.get(c.id);
      return buf ? { id: c.id, buf } : null;
    }
  };
}

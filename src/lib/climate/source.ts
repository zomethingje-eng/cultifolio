/**
 * Where the grid bytes come from. The reader only ever asks for one cell's
 * byte range, so any store that can serve a range works: R2 (production),
 * a local file (the corpus build on your PC), or an HTTP URL (tests, mirrors).
 */
import type { GridHeader } from './grid';
import { byteRange, cellOf } from './grid';

export interface GridSource {
  header(): Promise<GridHeader>;
  /** Raw bytes for the cell containing lat/lon, or null if outside the grid. */
  cell(lat: number, lon: number): Promise<{ id: string; buf: ArrayBuffer } | null>;
}

/** Cloudflare R2: one ranged GET per cell. */
export function r2GridSource(bucket: R2Bucket, key = 'climate/v1/climate.grid', headerKey = 'climate/v1/climate.json'): GridSource {
  let hp: Promise<GridHeader> | null = null;
  const header = () => {
    if (!hp)
      hp = bucket.get(headerKey).then(async (o) => {
        if (!o) throw new Error('climate.json missing from R2');
        return (await o.json()) as GridHeader;
      });
    return hp;
  };
  return {
    header,
    async cell(lat, lon) {
      const h = await header();
      const c = cellOf(h, lat, lon);
      const r = byteRange(h, c.index);
      const o = await bucket.get(key, { range: { offset: r.offset, length: r.length } });
      if (!o) return null;
      return { id: c.id, buf: await o.arrayBuffer() };
    }
  };
}

/** Any URL that honours Range (R2 public bucket, a local static server, S3). */
export function httpGridSource(gridUrl: string, headerUrl: string, fetchImpl: typeof fetch = fetch): GridSource {
  let hp: Promise<GridHeader> | null = null;
  const header = () => {
    if (!hp) hp = fetchImpl(headerUrl).then((r) => r.json() as Promise<GridHeader>);
    return hp;
  };
  return {
    header,
    async cell(lat, lon) {
      const h = await header();
      const c = cellOf(h, lat, lon);
      const r = byteRange(h, c.index);
      const res = await fetchImpl(gridUrl, { headers: { range: `bytes=${r.offset}-${r.offset + r.length - 1}` } });
      if (res.status !== 206 && res.status !== 200) return null;
      const buf = await res.arrayBuffer();
      return { id: c.id, buf: buf.byteLength > r.length ? buf.slice(r.offset, r.offset + r.length) : buf };
    }
  };
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

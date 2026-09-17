/** Node-only grid source: a local climate.grid + climate.json (the corpus build on your PC). */
import { open, readFile } from 'node:fs/promises';
import type { GridHeader } from '../src/lib/climate/grid';
import { byteRange, cellOf } from '../src/lib/climate/grid';
import type { GridSource } from '../src/lib/climate/source';

export function fileGridSource(gridPath: string, headerPath: string): GridSource {
  let hp: Promise<GridHeader> | null = null;
  const header = (): Promise<GridHeader> => {
    if (!hp) hp = readFile(headerPath, 'utf8').then((t: string) => JSON.parse(t) as GridHeader);
    return hp;
  };
  let fhp: ReturnType<typeof open> | null = null;
  const fh = () => (fhp ??= open(gridPath, 'r'));
  return {
    header,
    async cell(lat, lon) {
      const h = await header();
      const c = cellOf(h, lat, lon);
      const r = byteRange(h, c.index);
      const f = await fh();
      const buf = new Uint8Array(r.length);
      const { bytesRead } = await f.read(buf, 0, r.length, r.offset);
      if (bytesRead !== r.length) return null;
      return { id: c.id, buf: buf.buffer };
    }
  };
}

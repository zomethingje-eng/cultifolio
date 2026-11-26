/**
 * The reader's site climate, cut from the climate grid (round 126; SPECIES 20, the lens's Outdoors view;
 * docs/PLAN-SITE-CLIMATE.md, option A).
 *
 * The species pages' habitat climates are read from `climate/climate.grid` (CHELSA V2.1 1981–2010, CC0, at 0.05°). The
 * Outdoors view sets the reader's site against them, so the site's figures come from the same grid, cut into one file per
 * one-degree square holding land: 20 × 20 cells × 36 values (the twelve months of tasmax, tasmin and pr), int16 little
 * endian in that order per cell, NODATA for a cell of sea (no elevation), gzipped. The browser asks the site for one square (about
 * 110 km across), never its point, and no third party.
 *
 * Usage: npx tsx scripts/site-tiles.ts --grid climate [--out bulk/site-tiles] [--dry-run]
 * The dry run reads the whole grid and prints the squares and the bytes they would take, writing nothing.
 */
import { openSync, readSync, readFileSync, mkdirSync, writeFileSync, closeSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const arg = (k: string) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const gridDir = arg('--grid') ?? 'climate';
const outDir = arg('--out') ?? 'bulk/site-tiles';
const dry = process.argv.includes('--dry-run');

type Layer = { id: string; var: string; month?: number };
const h = JSON.parse(readFileSync(join(gridDir, 'climate.json'), 'utf8')) as { cols: number; rows: number; cell: number; north: number; west: number; nodata: number; layers: Layer[]; built: string };
const L = h.layers.length;
const want: number[] = [];
for (const v of ['tasmax', 'tasmin', 'pr']) for (let m = 1; m <= 12; m++) {
  const i = h.layers.findIndex((l) => l.var === v && l.month === m);
  if (i < 0) throw new Error(`climate.json has no ${v} for month ${m}`);
  want.push(i);
}
// Land is where the grid holds an elevation (ETOPO's surface): over the sea CHELSA's fields have values and the elevation
// is NODATA, and a sea cell's figures are not a site's.
const ELEV = h.layers.findIndex((l) => l.var === 'elev');
if (ELEV < 0) throw new Error('climate.json has no elevation layer');
const PER = Math.round(1 / h.cell); // cells a degree: 20
if (Math.abs(PER * h.cell - 1) > 1e-9) throw new Error(`the grid's cell (${h.cell}°) does not divide a degree`);
const bandBytes = PER * h.cols * L * 2;
const fd = openSync(join(gridDir, 'climate.grid'), 'r');
const band = Buffer.alloc(bandBytes);
if (!dry) mkdirSync(outDir, { recursive: true });

let squares = 0, raw = 0, packed = 0, sea = 0;
const started = Date.now();
for (let b = 0; b < h.rows / PER; b++) {
  readSync(fd, band, 0, bandBytes, b * bandBytes);
  const south = Math.round(h.north - (b + 1));
  for (let s = 0; s < h.cols / PER; s++) {
    const west = Math.round(h.west + s);
    const tile = Buffer.alloc(PER * PER * want.length * 2);
    let land = false;
    for (let r = 0; r < PER; r++) for (let c = 0; c < PER; c++) {
      const cell = (r * h.cols + s * PER + c) * L * 2;
      const at = (r * PER + c) * want.length * 2;
      const isLand = band.readInt16LE(cell + ELEV * 2) !== h.nodata;
      if (isLand) land = true;
      for (let k = 0; k < want.length; k++) tile.writeInt16LE(isLand ? band.readInt16LE(cell + want[k] * 2) : h.nodata, at + k * 2);
    }
    if (!land) { sea++; continue; }
    const gz = gzipSync(tile, { level: 9 });
    squares++; raw += tile.length; packed += gz.length;
    if (!dry) writeFileSync(join(outDir, `${south}_${west}.bin.gz`), gz);
  }
  if (b % 20 === 19) console.log(`  ${b + 1} of ${h.rows / PER} bands: ${squares} squares holding land so far, ${(packed / 1e6).toFixed(1)} MB packed`);
}
closeSync(fd);
const mb = (n: number) => (n / 1e6).toFixed(1);
console.log(`${dry ? 'dry run: ' : ''}${squares} one-degree squares holding land (${sea} of sea left out), ${mb(raw)} MB raw, ${mb(packed)} MB gzipped${dry ? '' : `, written to ${outDir}`}; the grid of ${h.built}; ${((Date.now() - started) / 1000).toFixed(0)} s`);
console.log(`at R2's $0.015 a GB-month: $${((packed / 1e9) * 0.015).toFixed(4)} a month`);

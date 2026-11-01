/**
 * Round eighty-five, agent U: outside review A19 and A24's third. An `--index` stopped while writing a product file left it
 * cut off under its own name (`p/<md5>.json`); every later `--index` kept it, since a file already under its name was
 * never read, and `--index-ready` passed, since its stamp does not cover `p/`. Now a product is written whole or not at
 * all, a file cut off is written again, and `--index-ready` reads every product the manifest names, the search's key
 * files among them, and refuses one that is not the content its name says.
 *
 * On r85base `scripts/product-files.ts` did not exist: the writer was `if (existsSync(path)) kept; else writeFileSync`,
 * which keeps the cut-off file below, and nothing checked the products.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildProducts } from '$dossier/products';
import { corpusHashes } from '$dossier/manifest';
import type { IndexEntry } from '$lib/server/dossiers';
import { synthIndex } from './helpers/corpus-synth';
import { writeProduct, checkProducts, productsSentence } from '../../scripts/product-files';

let dir = '';
let manifestText = '';
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'r85u-products-'));
  const idx = synthIndex(400).idx as unknown as IndexEntry[];
  const text = JSON.stringify(idx, null, 1);
  mkdirSync(join(dir, 'p'), { recursive: true });
  const built = buildProducts(idx, text, () => new Map(), '2026-10-31T00:00:00Z', [], undefined, (hash, body) => { writeProduct(join(dir, 'p', `${hash}.json`), body); });
  for (const [name, body] of built.files) writeProduct(join(dir, 'p', `${built.manifest.files[name]}.json`), body);
  manifestText = JSON.stringify(built.manifest, null, 1);
  writeFileSync(join(dir, 'manifest.json'), manifestText);
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('a product file is written whole, and one cut off is written again (A19, A24)', () => {
  it('a file already whole is kept; one cut off under its name is written again; nothing is left beside it', () => {
    const p = join(dir, 'p', 'feedfacefeedface.json');
    const body = JSON.stringify({ rows: Array.from({ length: 200 }, (_, i) => `row ${i}`) });
    expect(writeProduct(p, body)).toBe(true);
    expect(writeProduct(p, body)).toBe(false); // whole: kept, not written again
    writeFileSync(p, body.slice(0, 100)); // what a stopped run leaves
    expect(writeProduct(p, body)).toBe(true); // r85base: kept for good
    expect(readFileSync(p, 'utf8')).toBe(body);
    expect(readdirSync(join(dir, 'p')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    rmSync(p);
  });
});

describe('--index-ready reads every product the manifest names (A19, A24)', () => {
  it('a corpus whose products are whole passes, the search key files counted', () => {
    const c = checkProducts(dir);
    expect(c.none).toBeNull();
    expect(c.badCount).toBe(0);
    const m = JSON.parse(manifestText);
    const all = corpusHashes(m, (h) => { try { return readFileSync(join(dir, 'p', `${h}.json`), 'utf8'); } catch { return null; } }).hashes;
    expect(c.whole).toBe(all.size);
    expect(all.size).toBeGreaterThan(Object.keys(m.files).length); // the key files the directories name, besides the manifest's own
  });
  it('a product cut off, one missing, and a search directory cut off are each refused, and named', () => {
    const m = JSON.parse(manifestText) as { files: Record<string, string> };
    const sheet = join(dir, 'p', `${m.files['index.json']}.json`);
    const whole = readFileSync(sheet);
    const dirName = Object.keys(m.files).find((n) => /^search\/(?:top|\d+)\.json$/.test(n))!;
    const dirFile = join(dir, 'p', `${m.files[dirName]}.json`);
    const dirWhole = readFileSync(dirFile);
    const gone = join(dir, 'p', `${m.files['genera.json']}.json`);
    const goneWhole = readFileSync(gone);
    try {
      writeFileSync(sheet, whole.subarray(0, whole.length >> 1));
      writeFileSync(dirFile, dirWhole.subarray(0, 10));
      rmSync(gone);
      const c = checkProducts(dir);
      expect(c.badCount).toBe(3);
      const said = productsSentence(c);
      expect(said).toContain(`${m.files['index.json']}.json: its content's MD5 is`);
      expect(said).toContain(`${m.files['genera.json']}.json: missing`);
      expect(said).toContain(`${dirName} (${m.files[dirName]}): a search directory that is missing or does not parse`);
      expect(said).toContain('Run npm run dossier -- --index');
      // --index's writer puts back the two it can: the cut-off and the missing file, by their size.
      expect(writeProduct(sheet, whole.toString('utf8'))).toBe(true);
      expect(writeProduct(gone, goneWhole.toString('utf8'))).toBe(true);
      expect(writeProduct(dirFile, dirWhole.toString('utf8'))).toBe(true);
      expect(checkProducts(dir).badCount).toBe(0);
      expect(statSync(sheet).size).toBe(whole.length);
    } finally {
      writeFileSync(sheet, whole);
      writeFileSync(dirFile, dirWhole);
      writeFileSync(gone, goneWhole);
    }
  });
  it('no manifest, or one this build cannot read, is no pass', () => {
    const empty = mkdtempSync(join(tmpdir(), 'r85u-none-'));
    try {
      expect(checkProducts(empty).none).toMatch(/could not be read/);
      writeFileSync(join(empty, 'manifest.json'), '{"v":1}');
      expect(checkProducts(empty).none).toMatch(/not a manifest this build reads/);
      expect(productsSentence(checkProducts(empty))).toMatch(/^the products could not be checked/);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

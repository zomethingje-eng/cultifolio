/**
 * Round eighty-eight (the speed round, 3): the bulk files read once. Streaming the 62 GB occurrence download down to the
 * 35 M rows a build keeps, and the photographs' 85 M rows, took about 75 minutes on the owner's PC, again for every step
 * that read them. The sealed sample (`OccIndex`) and the photographs (`MediaIndex`) are kept here after the first read, in
 * `<bulk>/.cache/occ-<key>/`, and the next build reads them back in a minute or two.
 *
 * The key is everything that decides what is kept: each file read (its path, size and modified time, and the md5 of its
 * first and last 64 MB), the download's record (download.json, media-download.json), the cap, the keys wanted and the keys
 * read under others, and the code that reads them (bulk.ts, bulk-load.ts and this file, by their hash). Any of them
 * different, and the files are read again, as before. Only the newest cache is kept.
 *
 * A dry run reads a cache and writes none (round eighty-six: a dry run writes nothing).
 */
import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, writeSync, fstatSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OccIndex, MediaIndex, type OccDump } from '../src/lib/dossier/bulk';

export const CACHE_DIR = '.cache';
/** The cache's own format; a change to it is a new key. */
const FORMAT = 1;
const EDGE = 64 * 1024 * 1024;

/** A file's fingerprint: path, size, modified time, and the md5 of its first and last 64 MB (a whole md5 of 62 GB is minutes). */
export function fileMark(path: string): string {
  const st = statSync(path);
  const h = createHash('md5');
  const fd = openSync(path, 'r');
  try {
    const take = (at: number, n: number) => { const b = Buffer.alloc(n); const got = readSync(fd, b, 0, n, at); h.update(b.subarray(0, got)); };
    take(0, Math.min(EDGE, st.size));
    if (st.size > EDGE) take(Math.max(EDGE, st.size - EDGE), Math.min(EDGE, st.size - EDGE));
  } finally {
    closeSync(fd);
  }
  return `${path}|${st.size}|${Math.round(st.mtimeMs)}|${h.digest('hex')}`;
}

/** The code that decides what is kept, by its text. */
function codeMark(): string {
  const h = createHash('sha1');
  for (const rel of ['../src/lib/dossier/bulk.ts', './bulk-load.ts', './bulk-cache.ts']) {
    const p = fileURLToPath(new URL(rel, import.meta.url));
    h.update(existsSync(p) ? readFileSync(p) : Buffer.from(`no ${rel}`));
  }
  return h.digest('hex');
}

/** The cache's key for one read of the download. */
export function cacheKey(o: { files: string[]; records: string[]; cap: number; wanted?: Set<number>; under?: ReadonlyMap<number, readonly number[]> }): string {
  const h = createHash('sha1');
  h.update(`format ${FORMAT}\n`);
  h.update(`code ${codeMark()}\n`);
  for (const f of o.files) h.update(`file ${fileMark(f)}\n`);
  for (const r of o.records) h.update(`record ${existsSync(r) ? readFileSync(r) : 'none'}\n`);
  h.update(`cap ${o.cap}\n`);
  h.update(`wanted ${o.wanted ? [...o.wanted].sort((a, b) => a - b).join(',') : 'all'}\n`);
  h.update(`under ${o.under ? [...o.under].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${[...v].sort((a, b) => a - b).join('+')}`).join(',') : 'none'}\n`);
  return h.digest('hex').slice(0, 20);
}

/** What a load gave, beside the indexes: kept so a build read from the cache says what one read from the files said. */
export interface LoadNote {
  format: 'dwca' | 'sql' | 'csv';
  photos: string;
  mediaDoi?: string;
  mediaDay?: string;
  rows: number;
  imageRows?: number;
}
export type Loaded = { occ: OccIndex; media: MediaIndex | null; format: 'dwca' | 'sql' | 'csv'; photos: string; mediaDoi?: string; mediaDay?: string };

const ROW_HEAD = 16;

/** Writes the cache for `key`, whole, then in place of any other. Never throws: a cache not written is read again next time. */
export function writeCache(bulk: string, key: string, loaded: Loaded, note: LoadNote): string | null {
  const root = join(bulk, CACHE_DIR);
  const final = join(root, `occ-${key}`);
  const tmp = join(root, `occ-${key}.part-${process.pid}`);
  try {
    mkdirSync(tmp, { recursive: true });
    const d = loaded.occ.dump();
    const fd = openSync(join(tmp, 'rows.bin'), 'w');
    try {
      const head = Buffer.alloc(ROW_HEAD);
      for (const k of d.keys) {
        const rows = d.rows(k);
        head.writeDoubleLE(k, 0);
        head.writeUInt32LE(rows.byteLength, 8);
        head.writeUInt32LE(0, 12);
        writeSync(fd, head);
        if (rows.byteLength) writeSync(fd, rows);
      }
    } finally {
      closeSync(fd);
    }
    const { rows: _rows, keys, ...rest } = d;
    void _rows;
    writeFileSync(join(tmp, 'occ.json'), JSON.stringify({ ...rest, keys }));
    if (loaded.media) {
      const m = loaded.media.dump();
      writeFileSync(join(tmp, 'media.ndjson'), [JSON.stringify({ seq: m.seq }), ...m.owners.map((o) => JSON.stringify(o))].join('\n') + '\n');
    }
    writeFileSync(join(tmp, 'note.json'), JSON.stringify({ ...note, media: !!loaded.media, key }));
    if (existsSync(final)) rmSync(final, { recursive: true, force: true });
    renameSync(tmp, final);
    for (const other of readdirSync(root)) if (other !== `occ-${key}` && other.startsWith('occ-')) rmSync(join(root, other), { recursive: true, force: true });
    return final;
  } catch (e) {
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* left: removed by the next cache written */ }
    console.log(`  the bulk cache was not written (${e instanceof Error ? e.message : String(e)}): the files are read again next time`);
    return null;
  }
}

/** The load the cache holds for `key`, or null when it holds none (or one that cannot be read whole). */
export function readCache(bulk: string, key: string, wanted?: Set<number>, under?: ReadonlyMap<number, readonly number[]>): { loaded: Loaded; note: LoadNote } | null {
  const dir = join(bulk, CACHE_DIR, `occ-${key}`);
  if (!existsSync(join(dir, 'note.json'))) return null;
  try {
    const note = JSON.parse(readFileSync(join(dir, 'note.json'), 'utf8')) as LoadNote & { media: boolean; key: string };
    if (note.key !== key) return null;
    const meta = JSON.parse(readFileSync(join(dir, 'occ.json'), 'utf8')) as Omit<OccDump, 'rows'>;
    const fd = openSync(join(dir, 'rows.bin'), 'r');
    let occ: OccIndex;
    try {
      // First the headers alone, each key's place in the file; then each key's rows read as the index takes them, so no
      // more than one key's bytes are held beside the index (the file is 2.8 GB for the whole list).
      const size = fstatSync(fd).size;
      const head = Buffer.alloc(ROW_HEAD);
      const where = new Map<number, [at: number, n: number]>();
      let at = 0;
      while (at < size) {
        if (readSync(fd, head, 0, ROW_HEAD, at) !== ROW_HEAD) throw new Error('rows.bin ends inside a header');
        const k = head.readDoubleLE(0), n = head.readUInt32LE(8);
        if (at + ROW_HEAD + n > size) throw new Error("rows.bin ends inside a key's rows");
        where.set(k, [at + ROW_HEAD, n]);
        at += ROW_HEAD + n;
      }
      if (where.size !== meta.keys.length || meta.keys.some((k) => !where.has(k))) throw new Error('rows.bin does not hold the keys occ.json names');
      occ = OccIndex.restore(meta, meta.keys, (k) => {
        const [from, n] = where.get(k)!;
        const b = new Uint8Array(n);
        if (n && readSync(fd, b, 0, n, from) !== n) throw new Error(`rows.bin: key ${k} could not be read whole`);
        return b;
      }, wanted, under);
    } finally {
      closeSync(fd);
    }
    let media: MediaIndex | null = null;
    if (note.media) {
      const lines = readFileSync(join(dir, 'media.ndjson'), 'utf8').split('\n').filter(Boolean);
      const { seq } = JSON.parse(lines[0]) as { seq: number };
      media = MediaIndex.restore({ seq, owners: lines.slice(1).map((l) => JSON.parse(l)) }, occ.withMedia, occ.mediaRank, occ.mediaTaxon);
    }
    return { loaded: { occ, media, format: note.format, photos: note.photos, mediaDoi: note.mediaDoi, mediaDay: note.mediaDay }, note };
  } catch (e) {
    console.log(`  the bulk cache in ${dir} could not be read (${e instanceof Error ? e.message : String(e)}): the files are read instead`);
    return null;
  }
}

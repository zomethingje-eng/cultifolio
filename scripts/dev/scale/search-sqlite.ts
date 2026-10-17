/**
 * The search's postings as an SQLite database (what a D1 database would hold), built from an index with the app's own
 * `buildPostings` and `queryPlan`, and asked the plans of a list of real queries (docs/SCALE-STUDY.md section 2). Prints
 * the database's size, the build's rows, and per query the rows a D1 bill would count as read and the time SQLite took
 * here. D1 is SQLite, so the rows are D1's; the time is this machine's, without D1's network hop.
 *
 *   node --experimental-sqlite --import tsx scripts/dev/scale/search-sqlite.ts <index.json> <db file>
 */
import { readFileSync, statSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { buildPostings, queryPlan } from '../../../src/lib/core/postings';
import type { IndexEntry } from '../../../src/lib/dossier/index-entry';

const [file, dbFile] = process.argv.slice(2);
const idx = JSON.parse(readFileSync(file, 'utf8')) as IndexEntry[];
rmSync(dbFile, { force: true });
const db = new DatabaseSync(dbFile);
db.exec(`PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
CREATE TABLE doc (pos INTEGER PRIMARY KEY, body TEXT NOT NULL);
CREATE TABLE post (key TEXT NOT NULL, pos INTEGER NOT NULL, PRIMARY KEY (key, pos)) WITHOUT ROWID;`);
let t = performance.now();
const posted = buildPostings(idx, 1);
const ins = db.prepare('INSERT INTO post VALUES (?, ?)');
const insDoc = db.prepare('INSERT INTO doc VALUES (?, ?)');
let rows = 0;
db.exec('BEGIN');
for (const body of posted.values()) for (const [k, xs] of Object.entries(body)) for (const p of xs) { ins.run(k, p); rows++; }
// The doc a ranking reads: the search's fields only.
idx.forEach((e, i) => insDoc.run(i, JSON.stringify({ name: e.name, common: e.common, commons: e.commons, spellings: e.spellings, family: e.family, origin: e.origin, syn: e.syn, older: e.older, photos: e.photos })));
db.exec('COMMIT');
const buildMs = Math.round(performance.now() - t);
db.exec('VACUUM');
const size = statSync(dbFile).size;
const queries = ['aloe', 'aloe vera', 'cop cin', 'copiapoa cinerea', 'silver', 'string of pearls', 'mammillaria', 'cactus', 'echeveria', 'rose', 'monstera deliciosa', 'snake plant', 'conophitum', 'hoya', 'japanese maple', 'phalaenopsis', 'south africa', 'ab'];
const out: Array<Record<string, unknown>> = [];
for (const q of queries) {
  const plan = queryPlan(q);
  // the exact pass: per word the union of its keys' postings, then the intersection over words, then the docs
  const words = plan.exact.map((keys) => `SELECT pos FROM post WHERE key IN (${keys.map(() => '?').join(',')})`);
  const sql = `SELECT pos, body FROM doc WHERE pos IN (${words.join(' INTERSECT ')})`;
  const args = plan.exact.flat();
  const read = plan.exact.map((keys) => db.prepare(`SELECT count(*) n FROM post WHERE key IN (${keys.map(() => '?').join(',')})`).get(...keys) as { n: number });
  t = performance.now();
  const got = db.prepare(sql).all(...args);
  const ms = performance.now() - t;
  const postingRows = read.reduce((a, r) => a + r.n, 0);
  out.push({ q, postingRows, candidates: got.length, rowsRead: postingRows + got.length, ms: Math.round(ms * 10) / 10, bytes: got.reduce((a, r) => a + String((r as { body: string }).body).length, 0) });
}
console.log(JSON.stringify({ file, species: idx.length, postRows: rows, dbBytes: size, buildMs, queries: out }));

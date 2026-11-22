// The photographs copied to the site's own bucket (round 109; the first hand-off's round 6; docs/PLAN-109.md).
//
//   node --import tsx scripts/img-copy.ts [--hours N] [--dry-run] [--relist] [--retry-gone]
//   (or the corpus step's `img` line, which runs it under corpus-step.lock: scripts/corpus-plan-r109-img.txt)
//
// Reads the corpus on disk (static/s/v<N>: the index and every dossier, as the site reads them, `parseDossier` with the
// index's held names) for every photograph address a page or an index row can ask (`pageWanted`, `rowWanted`), and each
// address's copy (`imgKey`). Copies what the bucket does not hold yet: each fetched once from its source, naming the site
// (Commons answers 429 to a client that does not), a few at a time per host, written a batch at a time to
// bulk/img/batch-<n>/ and copied up with rclone to r2img:cultifolio-img (`--no-check-dest`: what is up is already known,
// so no request asks the bucket first), each copy kept a year by any cache (`immutable`: a copy's path is its source's
// address, which changes when the photograph does). The disk never holds more than a few batches.
//
// Resumable: each batch's paths are added to bulk/img/done.txt once rclone has copied it, and a run asks only what is not
// there. `--relist` reads the bucket's own list in its place (rclone lsf), for a done list lost or in doubt.
//
// Said as it is (rule 2): a source that answers 404 or 410 has no such photograph now (bulk/img/gone.txt, with the day;
// asked again only with --retry-gone, and the next build drops or replaces it); any other answer, or none, is "not
// answered", asked again by the next run. A host that does not answer 20 times running is left for this run, and said.
// `--hours N` stops starting new fetches after N hours, so the day's fills can have the lock; the run says what is left,
// and "run this again" (exit 3, the corpus step's "unfinished"). The pages are not changed: they ask the sources until
// round 111 switches them, once every copy is up.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { parseDossier, DOSSIER_V } from '../src/lib/dossier/schema';
import { heldNamesOf } from '../src/lib/dossier/photo-kind';
import { pageWanted, rowWanted } from '../src/lib/dossier/img-wanted';
import { imgKey } from '../src/lib/core/img';
import { takeLock } from './run-lock.mjs';

export const REMOTE = 'r2img:cultifolio-img';
export const CLIENT = 'Cultifolio/1.0 (https://cultifolio.com/about)';
export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** Requests at once to each host: iNaturalist's open-data bucket is Amazon S3, made for bulk reads; the others are asked gently. */
export const LANES: Record<string, number> = { 'inaturalist-open-data.s3.amazonaws.com': 12, 'static.inaturalist.org': 2, 'upload.wikimedia.org': 2, 'api.gbif.org': 3 };
const HOST_GIVES_UP = 20;
const MAX_BYTES = 20 * 1024 * 1024;

export type Answer = { status: number; type?: string | null; bytes?: Uint8Array; retryAfterS?: number } | null;
export type Exec = (cmd: string, args: string[], onOutput: (s: string) => void) => Promise<number>;
export type CopyOptions = {
  root: string;
  fetchImg?: (url: string) => Promise<Answer>;
  exec?: Exec;
  log?: (s: string) => void;
  now?: () => number;
  hours?: number;
  dryRun?: boolean;
  relist?: boolean;
  retryGone?: boolean;
  batchFiles?: number;
  /** How long a lane waits after a 429 with no Retry-After, in ms (a test gives 0). */
  backoffMs?: number;
  /** Requests at once per host (LANES), and how many running not answered leave a host for the run (20): a test's own. */
  lanes?: Record<string, number>;
  giveUpAfter?: number;
};

/** Every copy the corpus on disk needs: path → the source address it is fetched from. */
export function wantedOf(root: string, say: (s: string) => void): { want: Map<string, string>; pages: number; rows: number; unreadable: string[]; uncopied: Map<string, number> } {
  const dir = join(root, `static/s/v${DOSSIER_V}`);
  const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8').replace(/^﻿/, '')) as Array<{ key: string; name: string; thumb?: string }>;
  const held = heldNamesOf(index as never);
  const want = new Map<string, string>();
  const uncopied = new Map<string, number>();
  const add = (url: string) => {
    const k = imgKey(url);
    if (k) { if (!want.has(k)) want.set(k, url); return; }
    let host = 'not an address';
    try { host = new URL(url).host; } catch { /* said as not an address */ }
    uncopied.set(host, (uncopied.get(host) ?? 0) + 1);
  };
  let rows = 0;
  for (const e of index) { const u = rowWanted(e); if (u.length) rows++; u.forEach(add); }
  const unreadable: string[] = [];
  let pages = 0;
  const files = readdirSync(dir).filter((f) => /^[kg][1-9][0-9]*\.json$/.test(f));
  for (const [i, f] of files.entries()) {
    try { pageWanted(parseDossier(JSON.parse(readFileSync(join(dir, f), 'utf8').replace(/^﻿/, '')), held)).forEach(add); pages++; }
    catch { unreadable.push(f); }
    if ((i + 1) % 5000 === 0) say(`  ${i + 1} of ${files.length} pages read…\n`);
  }
  return { want, pages, rows, unreadable, uncopied };
}

const readLines = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean) : []);

async function realFetch(url: string): Promise<Answer> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': CLIENT, Accept: 'image/*' }, signal: AbortSignal.timeout(60_000), redirect: 'follow' });
    const ra = Number(r.headers.get('retry-after'));
    if (!r.ok) { await r.body?.cancel(); return { status: r.status, retryAfterS: Number.isFinite(ra) && ra > 0 ? ra : undefined }; }
    const len = Number(r.headers.get('content-length'));
    if (len > MAX_BYTES) { await r.body?.cancel(); return { status: 413 }; }
    const bytes = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, type: r.headers.get('content-type'), bytes };
  } catch { return null; }
}

function realExec(cmd: string, args: string[], onOutput: (s: string) => void): Promise<number> {
  return new Promise((res) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (b) => onOutput(String(b)));
    p.stderr.on('data', (b) => onOutput(String(b)));
    p.on('error', (e) => { onOutput(`  ${cmd}: ${e.message}\n`); res(127); });
    p.on('close', (c) => res(c ?? 1));
  });
}

/** The rclone command a batch goes up by. */
export const uploadArgs = (dir: string): string[] => ['copy', dir, REMOTE, '--no-check-dest', '--transfers', '48', '--checkers', '16', '--header-upload', `Cache-Control: ${CACHE_CONTROL}`, '--s3-no-check-bucket', '--stats-one-line', '--stats', '60s'];

/** The run: 0 when every copy is up, 3 when some are left (run this again), 1 when rclone failed. */
export async function copyImages(o: CopyOptions): Promise<{ code: number; line: string; copied: number; left: number }> {
  const { root, fetchImg = realFetch, exec = realExec, log = (s) => process.stdout.write(s), now = Date.now, batchFiles = 2000, backoffMs = 30_000, lanes: laneCount = LANES, giveUpAfter = HOST_GIVES_UP } = o;
  const t0 = now();
  const work = join(root, 'bulk/img');
  mkdirSync(work, { recursive: true });
  const doneFile = join(work, 'done.txt');
  const goneFile = join(work, 'gone.txt');
  for (const f of readdirSync(work)) if (/^batch-\d+$/.test(f)) rmSync(join(work, f), { recursive: true, force: true }); // a batch a run left half up is fetched again

  log(`Reading the corpus on disk for every photograph a page or an index row can ask…\n`);
  const { want, pages, rows, unreadable, uncopied } = wantedOf(root, log);
  log(`  ${want.size} copies wanted: from ${pages} pages and ${rows} index rows${unreadable.length ? `; ${unreadable.length} dossiers could not be read (${unreadable.slice(0, 5).join(', ')}${unreadable.length > 5 ? ', …' : ''}), their photographs not listed` : ''}.\n`);
  if (uncopied.size) log(`  not copied, a host or a kind of file this step does not copy (the page keeps the source's address): ${[...uncopied].map(([h, n]) => `${h} ${n}`).join(', ')}.\n`);

  if (o.relist || !existsSync(doneFile)) {
    log(`  reading what the bucket holds: rclone lsf -R --files-only ${REMOTE}…\n`);
    let listed = '';
    const code = await exec('rclone', ['lsf', '-R', '--files-only', REMOTE], (s) => { listed += s; });
    if (code !== 0) { const line = `img: the bucket's list could not be read (rclone exit ${code}): nothing was copied.`; log(`${line}\n`); return { code: 1, line, copied: 0, left: want.size }; }
    writeFileSync(doneFile, listed.split(/\r?\n/).filter(Boolean).map((l) => `${l}\n`).join(''));
  }
  const done = new Set(readLines(doneFile));
  const gone = new Map(readLines(goneFile).map((l) => l.split('\t')).map(([k, ...r]) => [k, r]));
  const todo: Array<[string, string]> = [];
  let before = 0, goneHeld = 0;
  for (const [k, u] of want) {
    if (done.has(k)) before++;
    else if (gone.has(k) && !o.retryGone) goneHeld++;
    else todo.push([k, u]);
  }
  log(`  ${before} up already; ${goneHeld} gone at their source when last asked (not asked again; --retry-gone asks); ${todo.length} to copy.\n`);
  if (o.dryRun) {
    const byHost = new Map<string, number>();
    for (const [, u] of todo) { const h = new URL(u).host; byHost.set(h, (byHost.get(h) ?? 0) + 1); }
    const line = `img (dry run): ${want.size} wanted, ${before} up already, ${goneHeld} gone at source, ${todo.length} to copy (${[...byHost].map(([h, n]) => `${h} ${n}`).join(', ')}); nothing fetched or copied.`;
    log(`${line}\n`);
    return { code: 0, line, copied: 0, left: todo.length };
  }

  // Each host's own queue and lanes.
  const queues = new Map<string, Array<[string, string]>>();
  for (const t of todo) { const h = new URL(t[1]).host; if (!queues.has(h)) queues.set(h, []); queues.get(h)!.push(t); }
  const deadline = o.hours ? now() + o.hours * 3600_000 : Infinity; // from the first fetch, not from the corpus's reading
  let batchNo = 0, batch = { dir: join(work, `batch-${batchNo}`), keys: [] as string[] };
  const ready: Array<typeof batch> = [];
  let uploading = null as Promise<void> | null, failed = null as string | null;
  let copied = 0, bytes = 0, unanswered = 0, goneNow = 0, timeUp = false;
  const leftHosts: string[] = [];
  const upOne = async (b: typeof batch) => {
    const code = await exec('rclone', uploadArgs(b.dir), (s) => log(s.replace(/^/gm, '    ')));
    if (code !== 0) { failed = `rclone copy exit ${code}`; return; }
    appendFileSync(doneFile, b.keys.map((k) => `${k}\n`).join(''));
    copied += b.keys.length;
    rmSync(b.dir, { recursive: true, force: true });
    log(`  ${copied} copied this run (${(bytes / 1048576).toFixed(0)} MB fetched), ${unanswered} not answered, ${goneNow} gone at source; ${Math.round((now() - t0) / 60000)} min.\n`);
  };
  const pump = () => {
    if (uploading || !ready.length || failed) return;
    const b = ready.shift()!;
    uploading = upOne(b).finally(() => { uploading = null; pump(); });
  };
  const rotate = () => {
    if (!batch.keys.length) return;
    ready.push(batch);
    batch = { dir: join(work, `batch-${++batchNo}`), keys: [] };
    pump();
  };
  const lane = async (host: string, q: Array<[string, string]>, fails: { run: number }) => {
    for (;;) {
      if (failed) return;
      if (now() >= deadline) { timeUp = true; return; }
      if (fails.run >= giveUpAfter) return;
      while (ready.length > 2 && !failed) await new Promise((r) => setTimeout(r, 200)); // the disk holds a few batches, never the bucket
      const t = q.shift();
      if (!t) return;
      const [k, u] = t;
      let a: Answer = null;
      for (let tries = 0; tries < 3; tries++) {
        a = await fetchImg(u);
        if (a?.status !== 429 && a?.status !== 503) break;
        await new Promise((r) => setTimeout(r, a?.retryAfterS ? Math.min(a.retryAfterS, 300) * 1000 : backoffMs));
      }
      if (a && (a.status === 404 || a.status === 410)) { appendFileSync(goneFile, `${k}\t${a.status}\t${new Date(now()).toISOString().slice(0, 10)}\t${u}\n`); goneNow++; fails.run = 0; continue; }
      if (!a || a.status !== 200 || !a.bytes?.length || !/^image\//.test(a.type ?? '') || a.bytes.length > MAX_BYTES) { unanswered++; fails.run++; continue; }
      fails.run = 0;
      const p = join(batch.dir, k);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, a.bytes);
      batch.keys.push(k);
      bytes += a.bytes.length;
      if (batch.keys.length >= batchFiles) rotate();
    }
  };
  const lanes: Promise<void>[] = [];
  for (const [host, q] of queues) {
    const fails = { run: 0 };
    const all = Array.from({ length: laneCount[host] ?? 1 }, () => lane(host, q, fails));
    lanes.push(Promise.all(all).then(() => { if (fails.run >= giveUpAfter) leftHosts.push(`${host} (${giveUpAfter} requests running not answered)`); }));
  }
  await Promise.all(lanes);
  rotate();
  while ((uploading || ready.length) && !failed) { pump(); await (uploading ?? Promise.resolve()); }
  if (failed) {
    const line = `img: stopped: ${failed}; ${copied} copied this run, the batch not copied is fetched again by the next run.`;
    log(`${line}\n`);
    return { code: 1, line, copied, left: todo.length - copied };
  }
  const left = todo.length - copied - goneNow;
  const why = [timeUp ? `the run's ${o.hours} hours are up` : '', leftHosts.length ? `left for this run: ${leftHosts.join(', ')}` : ''].filter(Boolean).join('; ');
  const line = `img: ${want.size} copies wanted, ${before} up before this run, ${copied} copied this run (${(bytes / 1048576).toFixed(0)} MB), ${goneNow + goneHeld} gone at their source, ${unanswered} not answered; ${left} left${left ? `${why ? ` (${why})` : ''}: run this again` : ''}.`;
  log(`${line}\n`);
  return { code: left ? 3 : 0, line, copied, left };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const opt = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
  const lock = takeLock('.', `img-copy ${argv.join(' ')}`.trim(), { parent: process.ppid }) as { ok: boolean; sentence?: string; release?: () => void };
  if (!lock.ok) { process.stdout.write(`${lock.sentence}\n`); process.exit(2); }
  copyImages({ root: process.cwd(), hours: opt('--hours') ? Number(opt('--hours')) : undefined, dryRun: argv.includes('--dry-run'), relist: argv.includes('--relist'), retryGone: argv.includes('--retry-gone') })
    .then((r) => { lock.release?.(); process.exit(r.code); }, (e) => { lock.release?.(); process.stdout.write(`img: failed: ${e instanceof Error ? e.stack : String(e)}\n`); process.exit(1); });
}

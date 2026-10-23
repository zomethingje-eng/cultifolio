/**
 * Round eighty-one, agent B: the corpus step (review B4, B5, B6, B7).
 *   - B5: `--status` changes nothing: with a step line of the plan changed, it renamed corpus-step.json aside, and the next
 *     daily run started the plan again at step 1 (the backup, then the 19-hour build). Now it reads only, and says what a
 *     run would do.
 *   - B6: one run at a time. Two daily commands a second apart both ran the fill; a step typed by hand ran beside a run.
 *     Now corpus-step.lock: a second run refuses and says which run holds it; a lock left by a run that ended is taken.
 *   - B4: `--backup <label>` copies the corpus on disk aside without touching the plan's record, and `--compare <folder>`
 *     says what differs, as a review stop says it.
 *   - B7: a stopped upload says the site is half new until it is run again, and to run it again at once.
 * Each case FAILED on r81base: there --status renames the record, two runs both run, --backup and --compare are not
 * known (the plan runs instead), and a stopped upload says only "paste the end of corpus-step.log back".
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
// @ts-ignore a plain .mjs module
import { run, stopSentence } from '../../scripts/corpus-step.mjs';

const lockMod = await import('../../scripts/run-lock.mjs' as string).catch(() => null);
const FULL = '# the full build\nbackup\ndossier --fill inat --bulk bulk\ndossier --index\nreview corpus-step.log\nupload\n';
const sha = (s: string) => createHash('sha1').update(s).digest('hex');

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'r81b-step-'));
  mkdirSync(join(root, 'static/s/v3'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', built: 'x', species: 1, buckets: 32, postings: 64, files: {} }));
  writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'k1' }]));
  writeFileSync(join(root, 'static/s/v3/k1.json'), JSON.stringify({ v: 3, key: 'k1', upstream: { 'inat.photos.cultivated': { status: 'ok', detail: 'x' } } }));
  writeFileSync(join(root, 'scripts/corpus-plan-full.txt'), FULL);
  // The owner's PC: step 1 done, the fill under way.
  writeFileSync(join(root, 'corpus-step.json'), JSON.stringify({ plan: sha(FULL), planFile: 'scripts/corpus-plan-full.txt', backupDir: 'backups/v3-aaaa1111', corpusBefore: 'aaaa1111', steps: [
    { line: 'backup', status: 'done' }, { line: 'dossier --fill inat --bulk bulk', status: 'unfinished' }, { line: 'dossier --index', status: 'to do' }, { line: 'review corpus-step.log', status: 'to do' }, { line: 'upload', status: 'to do' }
  ] }, null, 1));
  const builder: string[] = [];
  let out = '';
  let gate: Promise<void> | null = null;
  const go = (argv: string[], o: { rclone?: number } = {}) => run({ root, argv, exec: async (c: string, args: string[], onOutput: (s: string) => void) => { const i = args.indexOf('scripts/build-dossiers.ts'); if (i >= 0) { builder.push(args.slice(i + 1).join(' ')); if (gate) await gate; } if (c === 'rclone') return o.rclone ?? 0; onOutput('  done.\n'); return 0; }, fetchCorpus: async () => 'aaaa1111', fetchLive: async () => ({ keyless: true }), log: (s: string) => { out += s; }, waitMs: 0, heap: { mb: 1, why: 'test' } });
  return { root, go, builder, out: () => out, hold: () => { let open!: () => void; gate = new Promise((r) => { open = r; }); return () => { gate = null; open(); }; } };
}

describe('B5: --status changes nothing', () => {
  it('a plan whose step line changed: the record stays where it is, and the run it would make is said', async () => {
    const t = setup();
    const record = readFileSync(join(t.root, 'corpus-step.json'), 'utf8');
    writeFileSync(join(t.root, 'scripts/corpus-plan-full.txt'), FULL.replace('dossier --index', 'dossier --index --quick'));
    expect(await t.go(['--plan', 'scripts/corpus-plan-full.txt', '--status'])).toBe(0);
    // r81base: corpus-step.json renamed to corpus-step.<day>.<n>.json.
    expect(readFileSync(join(t.root, 'corpus-step.json'), 'utf8')).toBe(record);
    expect(readdirSync(t.root).filter((f) => /^corpus-step\..+\.json$/.test(f) && f !== 'corpus-step.json')).toEqual([]);
    expect(existsSync(join(t.root, 'corpus-step.log'))).toBe(false);
    expect(t.out()).toMatch(/Note: the steps of scripts\/corpus-plan-full\.txt are not those of the run recorded .*a run now would put the record aside and start the plan again at step 1\. If that is not meant, put the plan file back as it was\. --status changed nothing\./);
    // The plan put back: --status shows the run where it was (r81base: every line "to do").
    writeFileSync(join(t.root, 'scripts/corpus-plan-full.txt'), FULL);
    const before = t.out().length;
    await t.go(['--plan', 'scripts/corpus-plan-full.txt', '--status']);
    expect(t.out().slice(before)).toMatch(/ 1\. done {8}backup\n 2\. unfinished  dossier --fill inat --bulk bulk\n/);
  });
  it('a comment changed only: the run where it was, no note (guard)', async () => {
    const t = setup();
    writeFileSync(join(t.root, 'scripts/corpus-plan-full.txt'), '# another comment\n' + FULL);
    await t.go(['--plan', 'scripts/corpus-plan-full.txt', '--status']);
    expect(t.out()).toMatch(/ 2\. unfinished  dossier --fill inat --bulk bulk/);
    expect(t.out()).not.toMatch(/Note:/);
    expect(JSON.parse(readFileSync(join(t.root, 'corpus-step.json'), 'utf8')).plan).toBe(sha(FULL)); // not even the hash written
  });
});

describe('B6: one run at a time', () => {
  it('a second run while the first runs refuses, saying which holds the lock; the first finishes, and the lock goes with it', async () => {
    const t = setup();
    const open = t.hold();
    const first = t.go(['--plan', 'scripts/corpus-plan-full.txt']);
    await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(join(t.root, 'corpus-step.lock'))).toBe(true);
    const second = await t.go(['--plan', 'scripts/corpus-plan-full.txt']);
    expect(second).toBe(2); // r81base: it runs the fill a second time
    expect(t.out()).toMatch(/Another run holds corpus-step\.lock in this folder: "node scripts\/corpus-step\.mjs --plan scripts\/corpus-plan-full\.txt" \(process \d+.*\)\. Nothing was run\./);
    open();
    expect(await first).toBe(2); // the review stop
    expect(t.builder).toEqual(['--fill inat --bulk bulk', '--index']); // once each, by the first run alone
    expect(existsSync(join(t.root, 'corpus-step.lock'))).toBe(false);
  });
  it('a lock left by a run that ended (a PC switched off) is taken, and said', async () => {
    const t = setup();
    writeFileSync(join(t.root, 'corpus-step.lock'), JSON.stringify({ pid: 2 ** 22 + 12345, what: 'node scripts/corpus-step.mjs', at: '2026-10-24T00:02:00.000Z', boot: 0, host: 'x' }));
    // another machine's name is held; the same machine's dead process is not
    expect(lockMod!.held({ pid: 2 ** 22 + 12345, host: 'elsewhere' }, { host: 'here' })).toBe(true);
    writeFileSync(join(t.root, 'corpus-step.lock'), JSON.stringify({ pid: 2 ** 22 + 12345, what: 'node scripts/corpus-step.mjs', at: '2026-10-24T00:02:00.000Z' }));
    expect(await t.go(['--plan', 'scripts/corpus-plan-full.txt'])).toBe(2);
    expect(t.out()).toMatch(/corpus-step\.lock was left by a run that has ended \(process 4206649, "node scripts\/corpus-step\.mjs"\): taken for this run\./);
    expect(t.builder).toEqual(['--fill inat --bulk bulk', '--index']);
  });
  it('a builder step typed by hand while a run holds the lock refuses; the run\'s own child is let through', () => {
    const t = setup();
    const root = resolve('.');
    // A live process that is not the builder's parent, as a corpus step running in another window.
    const other = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore' });
    writeFileSync(join(t.root, 'corpus-step.lock'), JSON.stringify({ pid: other.pid, what: 'node scripts/corpus-step.mjs --plan scripts/corpus-plan-full.txt', at: '2026-10-24T00:02:00.000Z' }));
    const r = spawnSync(process.execPath, ['--import', pathToFileURL(join(root, 'node_modules/tsx/dist/loader.mjs')).href, join(root, 'scripts/build-dossiers.ts'), '--index'], { cwd: t.root, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(root, 'tsconfig.json') } });
    expect(r.status).toBe(2); // r81base: 0, the index written beside the run
    expect(r.stderr).toMatch(/Another run holds corpus-step\.lock in this folder: "node scripts\/corpus-step\.mjs --plan scripts\/corpus-plan-full\.txt"/);
    expect(r.stdout).not.toMatch(/index: \d+ species/);
    // As the corpus step's child (its parent holds the lock), the same step runs.
    expect(lockMod!.takeLock(t.root, 'x', { pid: 999999, parent: 999999 }).ok).toBe(false); // guard: held by a live other
    expect(lockMod!.takeLock(t.root, 'x', { parent: other.pid }).ok).toBe(true);
    other.kill();
  }, 120_000);
});

describe('B4: a copy of the filled corpus, and what the repair changed against it', () => {
  it('--backup filled copies the corpus aside and leaves the record; --compare says what differs, and the rows left "error"', async () => {
    const t = setup();
    const record = readFileSync(join(t.root, 'corpus-step.json'), 'utf8');
    expect(await t.go(['--backup', 'filled'])).toBe(0);
    expect(t.builder).toEqual([]); // r81base: the plan runs
    expect(readFileSync(join(t.root, 'backups/v3-aaaa1111-filled/k1.json'), 'utf8')).toBe(readFileSync(join(t.root, 'static/s/v3/k1.json'), 'utf8'));
    expect(readFileSync(join(t.root, 'corpus-step.json'), 'utf8')).toBe(record);
    expect(t.out()).toMatch(/done: backups\/v3-aaaa1111-filled\. To see what changed since: node scripts\/corpus-step\.mjs --compare backups\/v3-aaaa1111-filled/);
    // A second --backup keeps the first copy.
    await t.go(['--backup', 'filled']);
    expect(t.out()).toMatch(/backups\/v3-aaaa1111-filled is there already: the copy made before is kept/);
    // The repair changes one page and leaves a row "error".
    writeFileSync(join(t.root, 'static/s/v3/k1.json'), JSON.stringify({ v: 3, key: 'k1', upstream: { 'inat.photos.cultivated': { status: 'error', detail: 'api.inaturalist.org 500' } } }));
    const before = t.out().length;
    expect(await t.go(['--compare', 'backups/v3-aaaa1111-filled'])).toBe(0);
    expect(t.out().slice(before)).toMatch(/^The corpus on disk against backups\/v3-aaaa1111-filled \(corpus on disk aaaa1111, was aaaa1111; 1 species; 1 dossier differs from the backup of corpus aaaa1111 \(k1\); 1 page holds a row a source did not answer \("error": inat\.photos\.cultivated 1; k1\)/);
    rmSync(t.root, { recursive: true, force: true });
  });
});

describe('B7: a stopped upload says the site is half new, and to run it again at once', () => {
  it('the stop, as the run says it', async () => {
    const t = setup();
    const st = JSON.parse(readFileSync(join(t.root, 'corpus-step.json'), 'utf8'));
    for (const s of st.steps) if (s.line !== 'upload') s.status = 'done';
    writeFileSync(join(t.root, 'corpus-step.json'), JSON.stringify(st));
    expect(await t.go(['--plan', 'scripts/corpus-plan-full.txt'], { rclone: 1 })).toBe(1);
    expect(t.out()).toMatch(/the dossiers go up first and the manifest last: until the manifest is up, the site serves each new dossier as it arrives under the old corpus's index and search/);
    expect(t.out()).toMatch(/Stopped at "upload": it failed \(rclone copy exit 1\)\. The site now serves the dossiers copied so far under the old corpus's index, search and manifest .* run the same command again now, and it copies only what is not up yet, then the manifest: node scripts\/corpus-step\.mjs --plan scripts\/corpus-plan-full\.txt\./);
    // Any other step's failure is said as before (guard).
    expect(stopSentence({ line: 'dossier --index', kind: 'dossier' }, { status: 'failed', why: 'exit 1' })).toBe('Stopped at "dossier --index": it failed (exit 1). Paste the last forty lines of corpus-step.log back. To try that step again: node scripts/corpus-step.mjs');
  });
});

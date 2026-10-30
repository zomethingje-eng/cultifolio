/**
 * Round eighty-four, G: the whole-corpus walk (the owner's decision 2) and what guards it, run as the owner runs them: the
 * builder in a folder of its own.
 *
 * - `--list-walk` names every page, then only those not derived since the walk began, so a walk that stops is resumed.
 * - `--check-ranges`, after the walk and before the upload: a page whose typical cell lies outside its native regions, or
 *   whose records were not tested by this round's rule, is listed, the review's five cases are said one by one, and the
 *   command fails; on pages that are right, it passes. Aloe vera's and Galanthus nivalis's dossiers are the live ones.
 * - B11: a listing that meets a dossier it cannot read names it and stops, writing nothing.
 * - A21: `--index-ready` fails while the index is not the one the dossiers on disk would write, and the upload step stops
 *   on it with nothing uploaded.
 * - A1, B1: no page is built without the regions' shapes.
 *
 * FAILS on r84base: none of `--list-walk`, `--check-ranges` or `--index-ready` exists (the builder takes them for a build),
 * `--list-range-shapes` passes the unreadable dossier by and exits 0, the upload runs rclone over any index, and a build
 * starts without the shapes.
 */
import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { run, EXIT } from '../../scripts/corpus-step.mjs';

const ROOT = resolve('.');
// Each test runs the builder in a folder of its own: seconds each, more on a busy machine.
vi.setConfig({ testTimeout: 180_000 });
const LIVE = '/tmp/claude-0/rev84r/D-s/dos';
const builder = (cwd: string, ...args: string[]) => spawnSync(process.execPath, ['--import', pathToFileURL(join(ROOT, 'node_modules/tsx/dist/loader.mjs')).href, join(ROOT, 'scripts/build-dossiers.ts'), ...args], { cwd, encoding: 'utf8', env: { ...process.env, TSX_TSCONFIG_PATH: join(ROOT, 'tsconfig.json') } });

function folder(pages: Record<string, unknown>, shapes = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'r84g-'));
  mkdirSync(join(dir, 'static/s/v3'), { recursive: true });
  mkdirSync(join(dir, 'scripts'));
  if (shapes) copyFileSync(join(ROOT, 'scripts/tdwg3-shapes.json'), join(dir, 'scripts/tdwg3-shapes.json'));
  for (const [f, d] of Object.entries(pages)) writeFileSync(join(dir, 'static/s/v3', f), typeof d === 'string' ? d : JSON.stringify(d));
  return dir;
}
/** A page as the check reads it: its native regions, its typical cell and its records' rule. */
const page = (key: string, name: string, codes: string[], at: [number, number] | null, rule: string | null, built = '2026-10-21T10:00:00.000Z') => ({
  key, name: { scientific: name }, built,
  distribution: { native: codes.map((code) => ({ code })) },
  occurrences: { open: at ? [[at[0], at[1], 2020, null, 'HUMAN_OBSERVATION', 'by']] : [], nOpenInRange: at ? 1 : 0, nRestrictedInRange: 0, nOutsideRange: 0, rangeTested: true, ...(rule ? { rangeRule: rule } : {}) },
  climate: at ? { status: 'ok', at: { lat: at[0], lon: at[1] } } : { status: 'none' },
  upstream: { 'gbif.occurrences': { status: 'ok' } }
});
/** The five cases as the walk should leave them: each typical cell inside its native regions, each page by rule r84. */
const fixed = {
  'k298116.json': page('k298116', 'Aloe vera', ['OMA'], [23.075, 57.625], 'r84'),
  'k2810307.json': page('k2810307', 'Ficus elastica', ['ASS', 'BAN', 'EHM', 'MYA'], [24.875, 91.875], 'r84'),
  'k307568.json': page('k307568', 'Galanthus nivalis', ['AUT', 'FRA', 'GER', 'SWI'], [48.125, 7.325], 'r84'),
  'k124103.json': page('k124103', 'Melissa officinalis', ['COR', 'FRA', 'SPA'], [42.175, 9.125], 'r84'),
  'k2864797.json': page('k2864797', 'Indigofera taiwaniana', ['TAI'], [21.925, 120.725], 'r84')
};

describe('--check-ranges, after the walk and before the upload', () => {
  it.skipIf(!existsSync(join(LIVE, 'k298116.json')))("the live Aloe vera and Galanthus nivalis are listed and said NOT FIXED; the command fails", () => {
    const dir = folder({ ...fixed, 'k298116.json': readFileSync(join(LIVE, 'k298116.json'), 'utf8'), 'k307568.json': readFileSync(join(LIVE, 'k307568.json'), 'utf8') });
    const r = builder(dir, '--check-ranges');
    expect(r.status, r.stderr).toBe(2);
    const list = readFileSync(join(dir, 'check-ranges.txt'), 'utf8');
    expect(list).toMatch(/^k298116 Aloe vera\ttypical cell 25\.425 N, 56\.175 E outside every native region; records not tested by shapes rule r84/m);
    expect(list).toMatch(/^k307568 Galanthus nivalis\ttypical cell 50\.875 N, 5\.475 E outside every native region; records not tested by shapes rule r84/m);
    expect(r.stdout).toContain('NOT FIXED: Aloe vera (k298116): typical cell 25.425 N, 56.175 E, OUTSIDE its native regions');
    expect(r.stdout).toContain('fixed: Indigofera taiwaniana (k2864797): typical cell 21.925 N, 120.725 E, inside its native regions');
    expect(r.stdout).toContain('Not ready to upload.');
  });
  it('the five cases right, every page inside its range: it passes, and says each one fixed', () => {
    const dir = folder(fixed);
    const r = builder(dir, '--check-ranges');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    for (const n of ['Aloe vera', 'Ficus elastica', 'Galanthus nivalis', 'Melissa officinalis', 'Indigofera taiwaniana']) expect(r.stdout).toMatch(new RegExp(`fixed: ${n} \\(k\\d+\\)`));
    expect(r.stdout).toContain('0 with a typical cell outside every native region, 0 whose records were not tested by rule r84');
    expect(r.stdout).toContain('ready to upload');
    expect(existsSync(join(dir, 'check-ranges.txt'))).toBe(false);
  });
  it('a page derived before the rule, its cell inside, is still listed: the walk did not reach it', () => {
    const dir = folder({ ...fixed, 'k1.json': page('k1', 'Aus bus', ['OMA'], [23.075, 57.625], null) });
    const r = builder(dir, '--check-ranges');
    expect(r.status).toBe(2);
    expect(readFileSync(join(dir, 'check-ranges.txt'), 'utf8')).toBe('k1 Aus bus\trecords not tested by shapes rule r84\n');
    // The merge: the pages listed are derived again online, since a page whose range was carried was one an offline build
    // could not read again (Monsonia lheritieri's, through GBIF's older names, on the live sample's walk).
    expect(r.stdout).toContain('derive them again with --keys check-ranges.txt --grid climate --bulk bulk --skip inat (not offline');
  });
});

describe('--list-walk: every page, then what is left', () => {
  it('names every page, then, the walk under way, only those not derived since it began; --again begins anew', () => {
    const dir = folder({ 'k1.json': page('k1', 'Aus bus', ['OMA'], null, null), 'k2.json': page('k2', 'Aus cus', ['OMA'], null, null) });
    let r = builder(dir, '--list-walk');
    expect(r.status, r.stderr).toBe(0);
    expect(readFileSync(join(dir, 'rebuild-walk.txt'), 'utf8')).toBe('k1 Aus bus\nk2 Aus cus\n');
    const since = JSON.parse(readFileSync(join(dir, 'walk.json'), 'utf8')).since as string;
    expect(r.stdout).toContain('0 pages derived since, 2 to derive');
    // The walk derives k1, then stops.
    writeFileSync(join(dir, 'static/s/v3/k1.json'), JSON.stringify(page('k1', 'Aus bus', ['OMA'], null, 'r84', since)));
    r = builder(dir, '--list-walk');
    expect(readFileSync(join(dir, 'rebuild-walk.txt'), 'utf8')).toBe('k2 Aus cus\n');
    expect(r.stdout).toContain('1 page derived since, 1 to derive');
    r = builder(dir, '--list-walk', '--again');
    expect(readFileSync(join(dir, 'rebuild-walk.txt'), 'utf8')).toBe('k1 Aus bus\nk2 Aus cus\n');
  });
});

describe('--walk: the same command resumes, and stops when nothing is left', () => {
  it('with every page derived since the walk began, it builds nothing and says the walk is done', () => {
    const dir = folder({ 'k1.json': page('k1', 'Aus bus', ['OMA'], null, 'r84', '2099-01-01T00:00:00.000Z') });
    writeFileSync(join(dir, 'walk.json'), JSON.stringify({ since: '2026-11-01T00:00:00.000Z', rule: 'r84' }));
    const r = builder(dir, '--walk', '--offline');
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('1 page derived since, 0 to derive → rebuild-walk.txt; the walk is done: run --index, then --check-ranges');
    expect(readFileSync(join(dir, 'rebuild-walk.txt'), 'utf8')).toBe('');
  });
  it('the plan the owner runs: the walk, the index, the check, a review, then the upload', () => {
    const plan = readFileSync(join(ROOT, 'scripts/corpus-plan-r84-walk.txt'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(' ').slice(0, 2).join(' '));
    expect(plan).toEqual(['backup', 'dossier --walk', 'dossier --fill', 'dossier --fill', 'dossier --index', 'dossier --check-ranges', 'review Read', 'upload', 'live-check']);
    // The merge: Kew's names and the varieties' names read for every page after the walk, whichever run derived it.
    expect(readFileSync(join(ROOT, 'scripts/corpus-plan-r84-walk.txt'), 'utf8')).toMatch(/^dossier --fill kew-names --bulk bulk\ndossier --fill gbif-infra --bulk bulk$/m);
  });
});

describe('B11: a listing stops on a dossier it cannot read', () => {
  it('--list-range-shapes names the file, exits 2 and writes no list', () => {
    const dir = folder({ 'k1.json': '{"key":', 'k2.json': page('k2', 'Aus cus', ['OMA'], [25.437, 56.168], null) });
    const r = builder(dir, '--list-range-shapes');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('1 dossier could not be read, so rebuild-shapes.txt would not be whole; it is not written');
    expect(r.stderr).toContain('k1.json:');
    expect(existsSync(join(dir, 'rebuild-shapes.txt'))).toBe(false);
  });
  it('--check-ranges and --list-walk the same', () => {
    const dir = folder({ ...fixed, 'k1.json': '{"key":' });
    expect(builder(dir, '--check-ranges').status).toBe(2);
    const w = builder(dir, '--list-walk');
    expect(w.status).toBe(2);
    expect(w.stderr).toContain('k1.json:');
    expect(existsSync(join(dir, 'rebuild-walk.txt'))).toBe(false);
  });
});

describe('A1, B1: no build without the regions\' shapes', () => {
  it('a build in a folder without scripts/tdwg3-shapes.json stops before it reads its list', () => {
    const dir = folder({}, false);
    writeFileSync(join(dir, 'keys.txt'), '');
    const r = builder(dir, '--keys', 'keys.txt', '--offline');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("scripts/tdwg3-shapes.json is not there: every record is tested against the native regions' shapes, so nothing is built without it");
  });
});

describe('A21: the upload refuses an index older than the dossiers', () => {
  it('--index-ready fails with no index written by this code over these files', () => {
    const r = builder(folder(fixed), '--index-ready');
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('run npm run dossier -- --index first');
  });
  it('the upload step stops on it: nothing goes to the bucket, and the stop names --index', async () => {
    const root = mkdtempSync(join(tmpdir(), 'r84g-up-'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'cccc3333', species: 1, files: {} }));
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'k1', gbif: 1 }]));
    copyFileSync(join(ROOT, 'scripts/corpus-plan-upload.txt'), join(root, 'scripts/corpus-plan-upload.txt'));
    const calls: string[] = [];
    let out = '';
    const exec = async (cmd: string, args: string[], onOutput: (s: string) => void) => { calls.push(`${cmd} ${args.join(' ')}`); if (args.includes('--index-ready')) { onOutput('  the index on disk is not the one the dossiers on disk would write\n'); return 2; } onOutput(''); return 0; };
    const code = await run({ root, argv: ['--plan', 'scripts/corpus-plan-upload.txt'], exec: exec as never, fetchCorpus: async () => 'cccc3333', fetchLive: async () => null, log: (s: string) => { out += s; }, waitMs: 0 });
    expect(code).toBe(EXIT.blocked);
    expect(calls.some((c) => c.startsWith('rclone'))).toBe(false);
    expect(out).toContain('the index on disk is older than the dossiers it would publish');
    expect(out).toContain('npm run dossier -- --index, then run: node scripts/corpus-step.mjs --plan scripts/corpus-plan-upload.txt');
  });
});

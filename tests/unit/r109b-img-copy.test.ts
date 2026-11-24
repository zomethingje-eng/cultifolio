/**
 * Round 109: the copy step (scripts/img-copy.ts) with a fake source and a fake rclone. What this proves:
 *
 * 1. Each copy is fetched once, written a batch at a time and copied up with its year-long Cache-Control and no check of
 *    the bucket first; a batch's paths reach the done list only once rclone has copied it.
 * 2. A source's 404 is said as gone, with the day, and not asked again; any other answer, or none, is "not answered",
 *    asked again by the next run, which asks only what is left (resumable).
 * 3. rclone failing stops the run and records nothing it did not copy; a host silent 20 times running is left for the
 *    run and said; the run's hours stop it with "run this again", which the corpus step reads as unfinished.
 *
 * On 32d681f there is no scripts/img-copy.ts and the corpus step knows no `img` line: every test FAILED.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { copyImages, CACHE_CONTROL, REMOTE, type Answer } from '../../scripts/img-copy';
import { parsePlan, classify, stopSentence } from '../../scripts/corpus-step.mjs';
import { imgKey } from '$core/img';

const JPEG = { status: 200, type: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]) };
let root: string;

const filesUnder = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? filesUnder(join(dir, f)).map((x) => `${f}/${x}`) : [f]));

/** A fake rclone: `lsf` lists the bucket, `copy` moves a batch's files into it. */
function fakeRclone(bucket: Set<string>, o: { failCopy?: boolean } = {}) {
  const calls: string[][] = [];
  const exec = async (cmd: string, args: string[], out: (s: string) => void) => {
    calls.push([cmd, ...args]);
    if (args[0] === 'lsf') { out([...bucket].map((k) => `${k}\n`).join('')); return 0; }
    if (args[0] === 'copy') { if (o.failCopy) return 1; for (const f of filesUnder(args[1])) bucket.add(f); return 0; }
    return 9;
  };
  return { exec, calls };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'r109b-'));
  const corpus = join(root, 'static/s/v3');
  mkdirSync(corpus, { recursive: true });
  const d = JSON.parse(readFileSync('fixtures/dossiers/s/v3/k457911.json', 'utf8'));
  writeFileSync(join(corpus, 'k457911.json'), JSON.stringify(d));
  writeFileSync(join(corpus, 'index.json'), JSON.stringify([{ key: 'k457911', name: d.name.scientific, thumb: d.photos[0].thumb }]));
});

describe('r109b the photographs copied a batch at a time, resumably', () => {
  it('copies each once, batches of three, each copied up with its Cache-Control and no check first', async () => {
    const bucket = new Set<string>();
    const { exec, calls } = fakeRclone(bucket);
    const asked: string[] = [];
    const r = await copyImages({ root, exec, fetchImg: async (u) => { asked.push(u); return JPEG; }, log: () => {}, batchFiles: 3 });
    expect(r.code).toBe(0);
    expect(r.left).toBe(0);
    expect(new Set(asked).size).toBe(asked.length);
    const done = readFileSync(join(root, 'bulk/img/done.txt'), 'utf8').trim().split('\n');
    expect(new Set(done)).toEqual(bucket);
    expect(done.length).toBe(asked.length);
    expect(asked.every((u) => bucket.has(imgKey(u)!))).toBe(true);
    const copies = calls.filter((c) => c[1] === 'copy');
    expect(copies.length).toBe(Math.ceil(asked.length / 3));
    for (const c of copies) { expect(c).toContain(REMOTE); expect(c).toContain('--no-check-dest'); expect(c).toContain(`Cache-Control: ${CACHE_CONTROL}`); }
    // The batches deleted once up; round 111's record of the run beside the list.
    expect(readdirSync(join(root, 'bulk/img'))).toEqual(['done.txt', 'last-run.json']);
    expect(r.line).toMatch(/ 0 left\.$/);
  });
  it('a 404 is gone, with the day, and not asked again; no answer is asked again by the next run, which asks only that', async () => {
    const bucket = new Set<string>();
    const { exec } = fakeRclone(bucket);
    let n = 0;
    const first = await copyImages({ root, exec, fetchImg: async (): Promise<Answer> => (++n === 1 ? { status: 404 } : n === 2 ? null : n === 3 ? { status: 200, type: 'text/html', bytes: new Uint8Array([60]) } : JPEG), log: () => {}, now: () => Date.UTC(2026, 10, 22), batchFiles: 3 });
    expect(first.code).toBe(3);
    expect(first.left).toBe(2);
    expect(first.line).toMatch(/1 gone at their source, 2 not answered; 2 left: run this again\.$/);
    expect(classify({ code: first.code, output: `${first.line}\n`, dropsWritten: false }).status).toBe('unfinished');
    const gone = readFileSync(join(root, 'bulk/img/gone.txt'), 'utf8').trim().split('\t');
    expect(gone.slice(1, 3)).toEqual(['404', '2026-11-22']);
    const asked: string[] = [];
    const second = await copyImages({ root, exec, fetchImg: async (u) => { asked.push(u); return JPEG; }, log: () => {}, batchFiles: 3 });
    expect(asked.length).toBe(2);
    expect(second.code).toBe(0);
    expect(second.line).toMatch(/1 gone at their source, 0 not answered; 0 left\.$/);
  });
  it('rclone failing stops the run, and the done list holds only what was copied', async () => {
    const r = await copyImages({ root, exec: fakeRclone(new Set(), { failCopy: true }).exec, fetchImg: async () => JPEG, log: () => {}, batchFiles: 3 });
    expect(r.code).toBe(1);
    expect(r.line).toMatch(/^img: stopped: rclone copy exit 1/);
    expect(readFileSync(join(root, 'bulk/img/done.txt'), 'utf8')).toBe('');
  });
  it('a host that does not answer many times running (20; 3 here) is left for this run, and said', async () => {
    const r = await copyImages({ root, exec: fakeRclone(new Set()).exec, fetchImg: async () => null, log: () => {}, batchFiles: 3, lanes: {}, giveUpAfter: 3 });
    expect(r.code).toBe(3);
    expect(r.line).toMatch(/left for this run: inaturalist-open-data\.s3\.amazonaws\.com \(3 requests running not answered\)\): run this again\.$/);
  });
  it("the run's hours: nothing new is started after them", async () => {
    let t = 0;
    const r = await copyImages({ root, exec: fakeRclone(new Set()).exec, fetchImg: async () => { t += 1800_000; return JPEG; }, now: () => t, hours: 1, log: () => {}, batchFiles: 3, lanes: {} });
    expect(r.code).toBe(3);
    expect(r.line).toMatch(/\(the run's 1 hours are up\): run this again\.$/);
    expect(existsSync(join(root, 'bulk/img/done.txt'))).toBe(true);
  });
  it('the corpus step knows the img line, and a stop of it says what is up stays up', () => {
    expect(parsePlan('img --hours 18\n')[0]).toMatchObject({ kind: 'img', args: ['--hours', '18'] });
    const s = stopSentence({ line: 'img --hours 18', kind: 'img' }, { status: 'unfinished', why: 'img: 4 left' }, 'node scripts/corpus-step.mjs --plan scripts/corpus-plan-r109-img.txt');
    expect(s).toContain('what is up stays up');
    expect(s).toContain('--plan scripts/corpus-plan-r109-img.txt');
  });
});

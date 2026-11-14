/**
 * Round ninety: each day's run of the daily plan uses both fills' allowances (the owner's decision of 13 November 2026).
 * `daily dossier <a fill>` marks one of the day's fills. One that stops unfinished (its day's allowance spent, or a source
 * that did not answer) hands over to the next daily step, which has an allowance of its own; the run stops before the
 * first step after them (the index, the upload) until every one has finished, saying "tomorrow, after midnight UTC" when
 * each has spent its allowance and "in an hour or so" when a source did not answer. A failure still stops at once. A fill
 * already finished is passed by.
 *
 * On d433142: FAILED. parsePlan threw on "daily dossier --fill flowering" ("is not a step this script knows"), and the
 * daily plan ran its steps one after another, so a day stopped at --fill flowering and --fill bhl was never asked: BHL's
 * 4,000 requests a day went unused for the eleven days of the flowering fill unless typed by hand.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parsePlan, dailyGate, dailySentence, EXIT } from '../../scripts/corpus-step.mjs';
import { floweringLine } from '../../src/lib/dossier/flowering';
import { bhlLine } from '../../src/lib/dossier/bhl';

const DAY = '2026-11-14';
const INAT_SPENT = `api.inaturalist.org: today's allowance of 4000 requests is spent (UTC ${DAY}); asked again tomorrow`;
const BHL_SPENT = `www.biodiversitylibrary.org: today's allowance of 4000 requests is spent (UTC ${DAY}); asked again tomorrow`;
// The fills' own last lines, as build-dossiers.ts prints them, so the runner is tested on their real wording.
const flowering = (o: { left: number; held?: string; unanswered?: number }) => `${floweringLine({ pages: 48375, asked: 4000, read: 3990, zero: 400, unanswered: o.unanswered ?? 0, noTaxon: 4410, before: 8000, lines: [], ...(o.held ? { held: o.held } : {}) } as never, DAY, o.left)}\n`;
const bhl = (o: { held?: string; unanswered?: number }) => `${bhlLine({ pages: 48375, asked: 4000, linked: 3100, none: 890, unanswered: o.unanswered ?? 0, notAskable: 8390, before: 4000, ...(o.held ? { held: o.held } : {}) } as never, DAY)}\n`;

const PLAN = 'daily dossier --fill flowering\ndaily dossier --fill bhl\ndossier --index\nupload\n';

describe('r90a 1: the plan line', () => {
  it('"daily dossier <args>" is a dossier step marked daily, its line kept whole', () => {
    const p = parsePlan(PLAN);
    expect(p[0]).toEqual({ line: 'daily dossier --fill flowering', kind: 'dossier', args: ['--fill', 'flowering'], daily: true });
    expect(p[2].daily).toBeUndefined();
  });
  it('daily goes before a dossier step only', () => {
    expect(() => parsePlan('daily review Read it.')).toThrow(/line 1: .*daily goes before a dossier step/);
    expect(() => parsePlan('dossier --index\ndaily upload')).toThrow(/line 2: /);
    expect(() => parsePlan('if-exists x.txt daily dossier --fill bhl')).toThrow(/line 1: /);
  });
  it('the gate: the daily steps just above a step, those unfinished', () => {
    const p = parsePlan('dossier --fill a\ndaily dossier --fill b\ndaily dossier --fill c\ndossier --index');
    const st = (...s: string[]) => s.map((status) => ({ status, why: `why ${status}` }));
    expect(dailyGate(p, st('unfinished', 'unfinished', 'done', 'to do'), 3)).toEqual([{ line: 'daily dossier --fill b', why: 'why unfinished' }]);
    expect(dailyGate(p, st('unfinished', 'done', 'done', 'to do'), 3)).toEqual([]); // step 1 is not daily: not the gate's
    expect(dailyGate(p, st('to do', 'unfinished', 'unfinished', 'to do'), 1)).toEqual([]);
  });
  it('the sentence: tomorrow when every allowance is spent, an hour when a source did not answer', () => {
    expect(dailySentence([{ line: 'daily dossier --fill bhl', why: BHL_SPENT }], 'dossier --index', 'C')).toBe(`Stopped before "dossier --index": the day's fills are not finished, and each has spent its day's allowance: "daily dossier --fill bhl" (${BHL_SPENT}). Nothing is lost and what was read stands. Run the same command again tomorrow, after midnight UTC: C`);
    expect(dailySentence([{ line: 'a', why: INAT_SPENT }, { line: 'b', why: '12 not answered' }], null, 'C')).toMatch(/^Stopped at the end of the plan: .*"b" \(12 not answered\)\. .*again in an hour or so .*: C$/);
  });
});

describe('r90a 2: the runner', () => {
  let root = '', out = '';
  let calls: string[] = [];
  const setup = (plan = PLAN) => {
    root = mkdtempSync(join(tmpdir(), 'r90a-'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', files: {} }));
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }]));
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), plan);
  };
  /** A day: each builder step's output and exit code by its arguments; the upload's commands answer 0. */
  const day = async (answers: Record<string, { out: string; code: number }>) => {
    out = ''; calls = [];
    const exec = async (cmd: string, args: string[], on: (s: string) => void) => {
      const i = args.indexOf('scripts/build-dossiers.ts');
      // svelte-kit sync (node) answers 0 unrecorded; the upload's rclone commands are recorded by name.
      if (i < 0) { if (cmd === 'rclone') calls.push('rclone'); return 0; }
      const key = args.slice(i + 1).join(' ');
      calls.push(key);
      const a = answers[key] ?? { out: '  done.\n', code: 0 };
      on(a.out);
      return a.code;
    };
    return run({ root, argv: [], exec, fetchCorpus: async () => 'aaaa1111', fetchLive: async () => null, log: (s: string) => { out += s; }, waitMs: 0, heap: { mb: 1024, why: 'test' } });
  };
  const status = () => JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8')).steps.map((s: { status: string }) => s.status);

  it('the flowering fill at its allowance hands over to BHL, and the run stops before the index: tomorrow', async () => {
    setup();
    const code = await day({ '--fill flowering': { out: flowering({ left: 30000, held: INAT_SPENT }), code: 3 }, '--fill bhl': { out: bhl({ held: BHL_SPENT }), code: 3 } });
    expect(calls).toEqual(['--fill flowering', '--fill bhl']);
    expect(code).toBe(EXIT.unfinished);
    expect(status()).toEqual(['unfinished', 'unfinished', 'to do', 'to do']);
    expect(out).toContain(`"daily dossier --fill flowering" stopped unfinished (`);
    expect(out).toContain("Going on to the next of the day's fills.");
    expect(out).toMatch(/Stopped before "dossier --index": the day's fills are not finished, and each has spent its day's allowance: "daily dossier --fill flowering" \(.*today's allowance of 4000 requests is spent.*\); "daily dossier --fill bhl" \(.*\)\. .*Run the same command again tomorrow, after midnight UTC: node scripts\/corpus-step\.mjs$/m);
    expect(readFileSync(join(root, 'corpus-step.log'), 'utf8')).toContain('Run the same command again tomorrow, after midnight UTC');
  });

  it('day by day: a fill that finishes is passed by after; the index and the upload only once both have finished', async () => {
    setup();
    await day({ '--fill flowering': { out: flowering({ left: 30000, held: INAT_SPENT }), code: 3 }, '--fill bhl': { out: bhl({ held: BHL_SPENT }), code: 3 } });
    // The second day: flowering finishes, BHL spends its day again.
    expect(await day({ '--fill flowering': { out: flowering({ left: 0 }), code: 0 }, '--fill bhl': { out: bhl({ held: BHL_SPENT }), code: 3 } })).toBe(EXIT.unfinished);
    expect(calls).toEqual(['--fill flowering', '--fill bhl']);
    expect(status()).toEqual(['done', 'unfinished', 'to do', 'to do']);
    expect(out).toMatch(/Stopped before "dossier --index": .*: "daily dossier --fill bhl" \(.*\)\. .*tomorrow, after midnight UTC/);
    expect(out).not.toMatch(/Stopped before .*--fill flowering"/);
    // The third: flowering is not asked again; BHL finishes, and the run goes on to the index and the upload.
    expect(await day({ '--fill bhl': { out: bhl({}), code: 0 } })).toBe(EXIT.done);
    expect(calls.filter((c) => c.startsWith('--'))).toEqual(['--fill bhl', '--index', '--index-ready']);
    expect(calls).toContain('rclone');
    expect(status()).toEqual(['done', 'done', 'done', 'done']);
  });

  it('a fill whose source did not answer still hands over; the stop says an hour, not tomorrow', async () => {
    setup();
    expect(await day({ '--fill flowering': { out: flowering({ left: 30000, held: '30 requests in a row not answered', unanswered: 30 }), code: 3 } })).toBe(EXIT.unfinished);
    expect(calls).toEqual(['--fill flowering', '--fill bhl']);
    expect(status()).toEqual(['unfinished', 'done', 'to do', 'to do']);
    expect(out).toMatch(/Stopped before "dossier --index": the day's fills are not finished: "daily dossier --fill flowering" .*run the same command again in an hour or so/);
  });

  it('a fill that fails stops the run at once, as any step does: the next fill is not run', async () => {
    setup();
    expect(await day({ '--fill flowering': { out: '  boom\n', code: 1 } })).toBe(EXIT.failed);
    expect(calls).toEqual(['--fill flowering']);
    expect(status()).toEqual(['failed', 'to do', 'to do', 'to do']);
    expect(out).toContain('Stopped at "daily dossier --fill flowering": it failed (exit 1).');
  });

  it('daily steps at the end of a plan: the run stops there until both have finished, never "every step is done"', async () => {
    setup('dossier --index\ndaily dossier --fill flowering\ndaily dossier --fill bhl\n');
    expect(await day({ '--fill bhl': { out: bhl({ held: BHL_SPENT }), code: 3 } })).toBe(EXIT.unfinished);
    expect(out).toMatch(/Stopped at the end of the plan: .*"daily dossier --fill bhl"/);
    expect(out).not.toContain('every step is done');
    expect(await day({})).toBe(EXIT.done);
    expect(calls).toEqual(['--fill bhl']);
  });

  it('a step without daily stops at its allowance as before (round seventy-nine\'s sentence)', async () => {
    setup('dossier --fill flowering\ndossier --fill bhl\n');
    expect(await day({ '--fill flowering': { out: flowering({ left: 30000, held: INAT_SPENT }), code: 3 } })).toBe(EXIT.unfinished);
    expect(calls).toEqual(['--fill flowering']);
    expect(out).toMatch(/Stopped at "dossier --fill flowering": the day's allowance is spent \(.*\)\. .*tomorrow, after midnight UTC/);
  });
});

describe('r90a 3: the daily plan', () => {
  const plan = parsePlan(readFileSync('scripts/corpus-plan-r87-daily.txt', 'utf8'));
  it('both fills are daily; the index, the review, the upload and the live check come after them and are not', () => {
    expect(plan.map((s) => [s.line.split(/\s+/).slice(0, 4).join(' '), !!s.daily])).toEqual([
      ['daily dossier --fill flowering', true], ['daily dossier --fill bhl', true], ['dossier --index', false],
      ['review Read the two', false], ['upload', false], ['live-check', false]
    ]);
  });
  it('it no longer tells the owner to type --fill bhl by hand', () => {
    expect(readFileSync('scripts/corpus-plan-r87-daily.txt', 'utf8')).not.toMatch(/type npm run dossier -- --fill bhl/);
  });
});

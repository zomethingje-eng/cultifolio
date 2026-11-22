/**
 * Round 110 (docs/PLAN-110.md): the daily plan's `each-day` line. What this proves:
 *
 * 1. A run of an `each-day` plan begun on an earlier UTC day that finished, or that stopped only at day's fills, starts
 *    again at step 1. On the same day it carries on where it was. One stopped at a review or a failure is never started
 *    over.
 * 2. In such a plan a fill that spent its day's allowance does not hold the index and the upload. The run ends saying
 *    the fill carries on tomorrow. Without `each-day` the round 90 gate holds as before.
 *
 * On 32d681f there is no `each-day`: parsePlan throws on the line ("is not a step this script knows"), and a finished
 * plan run again the next day only says "every step is done": FAILED.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parsePlan, eachDay, newDay, EXIT } from '../../scripts/corpus-step.mjs';
import { bhlLine } from '../../src/lib/dossier/bhl';

const bhlSpent = (day: string) => `${bhlLine({ pages: 48375, asked: 4000, linked: 3100, none: 890, unanswered: 0, notAskable: 8390, before: 4000, held: `www.biodiversitylibrary.org: today's allowance of 4000 requests is spent (UTC ${day}); asked again tomorrow` } as never, day)}\n`;
const PLAN = 'each-day\ndossier --grow 3\ndaily dossier --fill bhl\ndossier --index\nupload\n';

describe('r110b 1: the mark and the rule', () => {
  it('each-day marks the plan and is not a step', () => {
    expect(parsePlan(PLAN).map((s) => s.line)).toEqual(['dossier --grow 3', 'daily dossier --fill bhl', 'dossier --index', 'upload']);
    expect(eachDay(PLAN)).toBe(true);
    expect(eachDay('dossier --index # each-day\n')).toBe(false);
  });
  it('a new day starts again only after a run that finished or stopped at its fills', () => {
    const plan = parsePlan(PLAN);
    const st = (started: string, ...s: string[]) => ({ started, steps: s.map((status) => ({ status })) });
    expect(newDay(st('2026-11-22T20:00:00Z', 'done', 'unfinished', 'done', 'done'), plan, '2026-11-23')).toBe(true);
    expect(newDay(st('2026-11-23T01:00:00Z', 'done', 'unfinished', 'done', 'done'), plan, '2026-11-23')).toBe(false);
    expect(newDay(st('2026-11-22T20:00:00Z', 'done', 'done', 'review', 'to do'), plan, '2026-11-23')).toBe(false);
    expect(newDay(st('2026-11-22T20:00:00Z', 'unfinished', 'done', 'done', 'done'), plan, '2026-11-23')).toBe(false); // not a daily step
    expect(newDay(st('2026-11-22T20:00:00Z', 'done', 'done', 'failed', 'to do'), plan, '2026-11-23')).toBe(false);
  });
});

describe('r110b 2: the runner', () => {
  let root = '', out = '', calls: string[] = [];
  const setup = (plan: string) => {
    root = mkdtempSync(join(tmpdir(), 'r110b-'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', files: {} }));
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }]));
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), plan);
  };
  const runOn = async (day: string, answers: Record<string, { out: string; code: number }>) => {
    out = ''; calls = [];
    const exec = async (cmd: string, args: string[], on: (s: string) => void) => {
      const i = args.indexOf('scripts/build-dossiers.ts');
      if (i < 0) { if (cmd === 'rclone') calls.push('rclone'); return 0; }
      const key = args.slice(i + 1).join(' ');
      calls.push(key);
      const a = answers[key] ?? { out: '  done.\n', code: 0 };
      on(a.out);
      return a.code;
    };
    return run({ root, argv: [], exec, fetchCorpus: async () => 'aaaa1111', fetchLive: async () => null, log: (s: string) => { out += s; }, now: () => new Date(`${day}T02:00:00Z`), waitMs: 0, heap: { mb: 1024, why: 'test' } });
  };
  const status = () => JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8')).steps.map((s: { status: string }) => s.status);

  it("a fill that spent its allowance does not hold the upload; the next day's run starts at step 1", async () => {
    setup(PLAN);
    const code = await runOn('2026-11-23', { '--fill bhl': { out: bhlSpent('2026-11-23'), code: 3 } });
    expect(code).toBe(EXIT.done);
    // The upload ran: its three rclone lines, then the report of files the bucket holds and the corpus does not.
    expect(calls.slice(0, 7)).toEqual(['--grow 3', '--fill bhl', '--index', '--index-ready', 'rclone', 'rclone', 'rclone']);
    expect(status()).toEqual(['done', 'unfinished', 'done', 'done']);
    expect(out).toMatch(/the day's run is done\. The fills that spent their day's allowance carry on in tomorrow's run: "daily dossier --fill bhl"/);
    // The same day: nothing begins again; the fill is asked again (it stops at once on a spent allowance).
    await runOn('2026-11-23', { '--fill bhl': { out: bhlSpent('2026-11-23'), code: 3 } });
    expect(calls).toEqual(['--fill bhl']);
    // The next day: step 1 again.
    await runOn('2026-11-24', {});
    expect(out).toMatch(/is run each day: the run of 2026-11-23 ended, so today's starts at step 1/);
    expect(calls[0]).toBe('--grow 3');
    expect(status()).toEqual(['done', 'done', 'done', 'done']);
  });
  it('a run stopped at a review is not started over the next day', async () => {
    setup('each-day\ndossier --grow 3\nreview Read it.\nupload\n');
    expect(await runOn('2026-11-23', {})).toBe(EXIT.review);
    await runOn('2026-11-24', {});
    expect(calls).toEqual([]);
    expect(out).toMatch(/Review before going on/);
  });
  it('without each-day the gate holds: a spent fill stops the run before the index (round 90)', async () => {
    setup('dossier --grow 3\ndaily dossier --fill bhl\ndossier --index\nupload\n');
    expect(await runOn('2026-11-23', { '--fill bhl': { out: bhlSpent('2026-11-23'), code: 3 } })).toBe(EXIT.unfinished);
    expect(calls).toEqual(['--grow 3', '--fill bhl']);
  });
});

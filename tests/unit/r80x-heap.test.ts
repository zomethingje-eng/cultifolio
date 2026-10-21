/**
 * Round eighty, agent X: the builder's heap is sized from the machine (`builderHeap`), said on the step's first line, and
 * set by CULTIFOLIO_HEAP_MB where the owner wants another. Round seventy-nine's corpus step gave every build 8,192 MB,
 * whatever the PC, and the full build stopped at it ("JavaScript heap out of memory"). FAILED on r80base: no `builderHeap`.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as step from '../../scripts/corpus-step.mjs';

const GiB = 1024 ** 3;
const heap = (step as { builderHeap?: (total?: number, env?: Record<string, string | undefined>) => { mb: number; why: string } }).builderHeap;

describe('round eighty, X: the builder\'s heap', () => {
  it('the larger of 8,192 MB and 70% of the machine\'s memory, at most 32,768, or CULTIFOLIO_HEAP_MB', () => {
    expect(heap).toBeTypeOf('function');
    expect(heap!(8 * GiB, {}).mb).toBe(8192);
    expect(heap!(16 * GiB, {}).mb).toBe(11468);
    expect(heap!(32 * GiB, {}).mb).toBe(22937);
    expect(heap!(128 * GiB, {}).mb).toBe(32768);
    expect(heap!(16 * GiB, { CULTIFOLIO_HEAP_MB: '14000' })).toEqual({ mb: 14000, why: 'CULTIFOLIO_HEAP_MB' });
    expect(heap!(16 * GiB, { CULTIFOLIO_HEAP_MB: 'lots' }).mb).toBe(11468); // not a number: the machine's size
    expect(heap!(16 * GiB, {}).why).toBe("70% of this machine's 16384 MB is 11468; at least 8192, at most 32768");
  });
  it('the step gives the builder that heap and says so first', async () => {
    const root = mkdtempSync(join(tmpdir(), 'r80x-heap-'));
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'scripts/plan.txt'), 'dossier --index\n');
    const calls: string[][] = [];
    let out = '';
    const code = await step.run({ root, argv: ['--plan', 'scripts/plan.txt'], heap: { mb: 12345, why: 'a test' }, exec: async (_c: string, args: string[]) => { calls.push(args); return 0; }, log: (s: string) => { out += s; } });
    expect(code).toBe(0);
    expect(calls.find((a) => a.includes('scripts/build-dossiers.ts'))!.slice(0, 2)).toEqual(['--max-old-space-size=12345', '--import']);
    expect(out).toContain("the builder's heap: 12345 MB (a test; CULTIFOLIO_HEAP_MB sets another)");
  });
  it('the full plan, stopped by the build\'s crash, runs the build again with the same command, and nothing before it', async () => {
    const root = mkdtempSync(join(tmpdir(), 'r80x-resume-'));
    mkdirSync(join(root, 'scripts'));
    copyFileSync('scripts/corpus-plan-full.txt', join(root, 'scripts/corpus-plan-full.txt'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ id: 'c14b776c7296ad11' }));
    writeFileSync(join(root, 'static/s/v3/index.json'), '[]');
    const ran: string[] = [];
    let crash = true;
    const exec = async (_c: string, args: string[]) => {
      const i = args.indexOf('scripts/build-dossiers.ts');
      if (i < 0) return 0;
      const what = args.slice(i + 1).join(' ');
      ran.push(what);
      if (what.startsWith('scripts/species-list.txt') && crash) { crash = false; return 134; } // FATAL ERROR: JavaScript heap out of memory
      return 0;
    };
    const argv = ['--plan', 'scripts/corpus-plan-full.txt'];
    const quiet = () => {};
    expect(await step.run({ root, argv, exec, log: quiet, heap: { mb: 8192, why: 'test' } })).toBe(1);
    expect(ran).toEqual(['--list-extra-keys scripts/species-list.txt --bulk bulk --backbone bulk/backbone/simple.txt.gz', 'scripts/species-list.txt --grid climate --bulk bulk --skip inat --renew']);
    const state = JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8')) as { steps: Array<{ status: string }> };
    expect(state.steps.slice(0, 3).map((x) => x.status)).toEqual(['done', 'done', 'failed']);
    ran.length = 0;
    // The same command: the backup and the extra keys are kept, the build runs again and stops at its review.
    expect(await step.run({ root, argv, exec, log: quiet, heap: { mb: 8192, why: 'test' } })).toBe(2);
    expect(ran).toEqual(['scripts/species-list.txt --grid climate --bulk bulk --skip inat --renew']);
  });
});


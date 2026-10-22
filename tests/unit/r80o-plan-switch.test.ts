/**
 * Round eighty, agent O (review C 1, checked after agent V's fix): one corpus-step.json holds one plan's run. A repair
 * plan run on an evening between two days of the full build's fill put the full plan's record aside under a dated name,
 * and the full plan run the next day then started again from its first step (the backup, the build with --renew, a
 * review stop), as review C's simulation showed for a changed plan. V's fix keeps the place when only comments change;
 * this keeps it across a run of another plan, and when the plan's path is typed with Windows' backslash.
 *
 * On r80f the third run below starts with "step 1 of 4: backup".
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from '../../scripts/corpus-step.mjs';

const FULL = '# the full build\nbackup\ndossier scripts/species-list.txt --grid climate --bulk bulk --skip inat --renew\ndossier --fill inat --bulk bulk\ndossier --index\n';
const REPAIR = '# a repair\ndossier --keys repair-keys.txt --grid climate --bulk bulk\n';

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'r80o-plans-'));
  mkdirSync(join(root, 'static/s/v3'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', built: 'x', species: 1, buckets: 32, postings: 64, files: {} }));
  writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }]));
  writeFileSync(join(root, 'scripts/corpus-plan-full.txt'), FULL);
  writeFileSync(join(root, 'scripts/corpus-plan-r80-repair.txt'), REPAIR);
  // The owner's PC: the backup and the build done, the fill under way (it stopped at the day's allowance, exit 3).
  writeFileSync(join(root, 'corpus-step.json'), JSON.stringify({ plan: createHash('sha1').update(FULL).digest('hex'), planFile: 'scripts/corpus-plan-full.txt', steps: [
    { line: 'backup', status: 'done' },
    { line: 'dossier scripts/species-list.txt --grid climate --bulk bulk --skip inat --renew', status: 'done' },
    { line: 'dossier --fill inat --bulk bulk', status: 'unfinished' },
    { line: 'dossier --index', status: 'to do' }
  ] }));
  const builder: string[] = [];
  let out = '';
  const go = (argv: string[]) => run({ root, argv, exec: async (_c: string, args: string[], onOutput: (s: string) => void) => { const i = args.indexOf('scripts/build-dossiers.ts'); if (i >= 0) builder.push(args.slice(i + 1).join(' ')); onOutput('  done.\n'); return 0; }, fetchCorpus: async () => 'aaaa1111', log: (s: string) => { out += s; }, waitMs: 0, heap: { mb: 1, why: 'test' } });
  return { root, go, builder, out: () => out };
}

describe('a run of another plan keeps the full plan\'s place (round eighty; review C 1)', () => {
  it('the repair runs, and the full plan then carries on at its fill, not at its backup', async () => {
    const t = setup();
    expect(await t.go(['--plan', 'scripts/corpus-plan-r80-repair.txt'])).toBe(0);
    expect(t.builder).toEqual(['--keys repair-keys.txt --grid climate --bulk bulk']);
    expect(t.out()).toContain('the unfinished run of scripts/corpus-plan-full.txt is kept in corpus-step.plan-corpus-plan-full.json');
    expect(existsSync(join(t.root, 'corpus-step.plan-corpus-plan-full.json'))).toBe(true);
    t.builder.length = 0;
    expect(await t.go(['--plan', 'scripts/corpus-plan-full.txt'])).toBe(0);
    expect(t.out()).not.toContain('step 1 of 4: backup');
    expect(t.out()).toContain('step 3 of 4: dossier --fill inat --bulk bulk');
    expect(t.builder).toEqual(['--fill inat --bulk bulk', '--index']);
    // the kept record is taken up once, and the repair's finished record is kept under a dated name, as a finished run's is
    expect(existsSync(join(t.root, 'corpus-step.plan-corpus-plan-full.json'))).toBe(false);
    expect(JSON.parse(readFileSync(join(t.root, 'corpus-step.json'), 'utf8')).steps.map((s: { status: string }) => s.status)).toEqual(['done', 'done', 'done', 'done']);
  });

  it('with no --plan after the repair, the kept full plan is the one carried on, never the default plan', async () => {
    const t = setup();
    writeFileSync(join(t.root, 'scripts/corpus-plan.txt'), 'backup\ndossier --rekey\n');
    await t.go(['--plan', 'scripts/corpus-plan-r80-repair.txt']);
    t.builder.length = 0;
    await t.go([]);
    expect(t.builder).toEqual(['--fill inat --bulk bulk', '--index']);
    expect(t.out()).toContain('carrying on with scripts/corpus-plan-full.txt');
  });

  it('the plan typed with a backslash is the same plan, and keeps its place', async () => {
    const t = setup();
    // (here on Linux the backslash is part of a file's name, so the plan is put there too; on Windows it is the same file)
    writeFileSync(join(t.root, 'scripts\\corpus-plan-full.txt'), FULL);
    await t.go(['--plan', 'scripts\\corpus-plan-full.txt']);
    expect(t.builder).toEqual(['--fill inat --bulk bulk', '--index']);
    expect(existsSync(join(t.root, 'corpus-step.plan-corpus-plan-full.json'))).toBe(false);
  });
});

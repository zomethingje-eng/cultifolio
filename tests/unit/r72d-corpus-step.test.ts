/**
 * Round seventy-two (the owner's process change 2; reviewer D's trial): the corpus step as one command,
 * `node scripts/corpus-step.mjs`. Driven here with a fake runner in a folder of its own: it runs the plan in order,
 * records each step in corpus-step.json, writes corpus-step.log, carries on where it stopped, and stops with a sentence
 * and the command to type at a source that did not answer, at drops, at a dossier it cannot read, before the upload,
 * and at Ctrl-C. Every case FAILED on r72base (there was no such script).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, parsePlan, classify, uploadCommands, collapse, UNFINISHED, EXIT, builderHeap } from '../../scripts/corpus-step.mjs';

type Call = { cmd: string; args: string[]; env?: Record<string, string | undefined> };
let root: string;
let calls: Call[];
let out: string;
const manifest = (id: string) => JSON.stringify({ v: 3, id, built: 'x', species: 3, buckets: 32, postings: 64, files: {} });

function setup(plan: string) {
  root = mkdtempSync(join(tmpdir(), 'corpus-step-'));
  mkdirSync(join(root, 'static/s/v3'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'static/s/v3/manifest.json'), manifest('aaaa1111'));
  writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }, { key: 'g2' }, { key: 'g3' }]));
  writeFileSync(join(root, 'scripts/corpus-plan.txt'), plan);
  calls = [];
  out = '';
}
/** A runner whose builder steps answer as `answers` says, by the builder's arguments joined. */
function runner(answers: Record<string, { code?: number; output?: string; drops?: boolean; then?: () => void }>) {
  return async (cmd: string, args: string[], onOutput: (s: string) => void, opts: { env?: Record<string, string | undefined> }) => {
    calls.push({ cmd, args, env: opts?.env });
    const key = args.includes('scripts/build-dossiers.ts') ? args.slice(args.indexOf('scripts/build-dossiers.ts') + 1).join(' ') : `${cmd} ${args[0]}`;
    const a = answers[key] ?? {};
    if (a.drops) writeFileSync(join(root, 'drops.txt'), 'Aus bus [1]: photographs dropped to none (2 before)\n');
    onOutput(a.output ?? '  done.\n');
    a.then?.();
    return a.code ?? 0;
  };
}
const go = (argv: string[] = [], exec = runner({}), fetchCorpus = async () => 'aaaa1111') => run({ root, argv, exec, fetchCorpus, log: (s: string) => { out += s; }, waitMs: 0 });
const state = () => JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8'));
const builderSteps = () => calls.filter((c) => c.args.includes('scripts/build-dossiers.ts')).map((c) => c.args.slice(c.args.indexOf('scripts/build-dossiers.ts') + 1).join(' '));

describe('the plan', () => {
  it('reads steps, comments and if-exists; refuses a line it does not know before anything runs', () => {
    expect(parsePlan('# a comment\nbackup\nif-exists rebuild-wd.txt dossier --keys rebuild-wd.txt --grid climate\n\nreview Read drops.txt.\nupload')).toEqual([
      { line: 'backup', kind: 'backup', args: [] },
      { line: 'if-exists rebuild-wd.txt dossier --keys rebuild-wd.txt --grid climate', kind: 'dossier', args: ['--keys', 'rebuild-wd.txt', '--grid', 'climate'], when: 'rebuild-wd.txt' },
      { line: 'review Read drops.txt.', kind: 'review', args: ['Read drops.txt.'] },
      { line: 'upload', kind: 'upload', args: [] }
    ]);
    expect(() => parsePlan('dosier --index')).toThrow(/line 1: "dosier --index" is not a step/);
  });
  it('the plan in the repository parses', () => {
    // A round's plan is as long as its round needs (round seventy-six's is a backup, one re-index, a review, the upload and the live check)
    const steps = parsePlan(readFileSync('scripts/corpus-plan.txt', 'utf8'));
    expect(steps.length).toBeGreaterThan(3);
    expect(steps.map((s) => s.kind)).toEqual(expect.arrayContaining(['backup', 'dossier', 'review', 'upload', 'live-check']));
  });
});

describe('what a builder step\'s run says', () => {
  it('every "run it again" sentence the builder prints is a source that did not answer', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    for (const s of ['run --fill kew-links again: it picks up where it stopped', 'run --fill gbif-basis again: it picks up where it stopped', 'run --fill commons-kind again: it picks up where it stopped', 'run --fill wikidata again later', 'not checked (run again)', 'Run --names again later']) {
      expect(src, s).toContain(s);
      expect(UNFINISHED.test(`  ${s}`), s).toBe(true);
    }
    expect(UNFINISHED.test("  85 dossiers had no photograph: 2 were given 48 from GBIF's openly licensed records, 75 have none there, 0 not answered (asked again by a later fill)")).toBe(false);
    expect(UNFINISHED.test("  85 dossiers had no photograph: 2 were given 48 from GBIF's openly licensed records, 75 have none there, 3 not answered (asked again by a later fill)")).toBe(true);
  });
  it('drops are a review; a dossier that cannot be read, or an index that shrank, blocks; another exit fails', () => {
    expect(classify({ code: 1, output: '', dropsWritten: true })).toEqual({ status: 'review', why: 'drops' });
    expect(classify({ code: 1, output: '  1 dossier on disk could not be read: 7720070.json. Do not upload', dropsWritten: false })).toEqual({ status: 'blocked', why: 'unreadable' });
    expect(classify({ code: 0, output: '  index: 8946 species\n', dropsWritten: false, speciesBefore: 8947 })).toEqual({ status: 'blocked', why: 'index 8946 < 8947' });
    expect(classify({ code: 1, output: 'Error: boom', dropsWritten: false })).toEqual({ status: 'failed', why: 'exit 1' });
    expect(classify({ code: 0, output: '  index: 8947 species\n', dropsWritten: false, speciesBefore: 8947 })).toEqual({ status: 'done' });
  });
  it('the builder says a dossier it cannot read in the words the script reads', () => {
    expect(readFileSync('scripts/build-dossiers.ts', 'utf8')).toMatch(/on disk could not be read: \$\{unreadable\.join/);
  });
  it('the log keeps a progress line in its last form', () => {
    expect(collapse('\r  50 of 100…   \r  100 of 100…   \n  done.\n')).toBe('  100 of 100…   \n  done.\n');
  });
});

describe('the run', () => {
  beforeEach(() => setup('backup\ndossier --fill gbif-open\ndossier --fill kew-links\ndossier --index\nreview Read drops.txt.\nupload\nlive-check\n'));

  it('runs every step in order, backs up once, uploads with a check before the manifest, and checks the site serves the corpus on disk', async () => {
    expect(await go()).toBe(EXIT.review);
    expect(builderSteps()).toEqual(['--fill gbif-open', '--fill kew-links', '--index']);
    expect(existsSync(join(root, 'backups/v3-aaaa1111/manifest.json'))).toBe(true);
    expect(out).toMatch(/Review before going on: Read drops\.txt\. \(corpus on disk aaaa1111, was aaaa1111; 3 species; 0 dossiers differ from the backup of corpus aaaa1111; drops\.txt not there\)\. When it is as expected, carry on with: node scripts\/corpus-step\.mjs --go-on/);
    // Run again without --go-on: the same stop, and nothing run.
    calls = [];
    expect(await go()).toBe(EXIT.review);
    expect(calls).toEqual([]);
    expect(await go(['--go-on'])).toBe(EXIT.done);
    // Round eighty-four (G, A21): the upload asks first whether the index is the one the dossiers on disk would write.
    expect(calls.map((c) => `${c.cmd} ${c.args[0]}`)).toEqual([`${process.execPath} --import`, 'rclone copy', 'rclone check', 'rclone copy', 'rclone lsf', `${process.execPath} scripts/live-check.mjs`]);
    expect(builderSteps()).toEqual(['--index-ready']);
    expect(calls[3].args.slice(1, 3)).toEqual(['static/s/v3/manifest.json', 'r2:cultifolio/s/v3']); // the manifest last
    expect(state().steps.every((s: { status: string }) => s.status === 'done')).toBe(true);
    expect(readFileSync(join(root, 'corpus-step.log'), 'utf8')).toMatch(/step 2 of 7: dossier --fill gbif-open[\s\S]*every step is done/);
  });

  it('a source that did not answer stops the run; the next run starts at that step', async () => {
    let first = true;
    const exec = runner({ '--fill kew-links': { output: "  GBIF did not answer (api.gbif.org 503); run --fill kew-links again: it picks up where it stopped.\n", then: () => { first = false; } } });
    expect(await go([], exec)).toBe(EXIT.unfinished);
    expect(out).toMatch(/Stopped at "dossier --fill kew-links": a source did not answer \(GBIF did not answer \(api\.gbif\.org 503\)\)\. Nothing is lost and what was read stands\. Run the same command again in an hour or so: node scripts\/corpus-step\.mjs/);
    expect(first).toBe(false);
    calls = [];
    await go();
    expect(builderSteps()).toEqual(['--fill kew-links', '--index']);
  });

  it('drops stop for review; --go-on carries on past that stop only', async () => {
    const exec = runner({ '--fill gbif-open': { code: 1, drops: true } });
    expect(await go([], exec)).toBe(EXIT.review);
    expect(out).toMatch(/drops\.txt in the project folder lists them\. Read every line\. When each one is expected, carry on with: node scripts\/corpus-step\.mjs --go-on/);
    calls = [];
    expect(await go(['--go-on'])).toBe(EXIT.review); // past drops, then stopped again at the plan's own review
    expect(builderSteps()).toEqual(['--fill kew-links', '--index']);
  });

  it('a dossier that cannot be read is not passed by --go-on; once put right, the step runs again', async () => {
    let broken = true;
    const exec = async (cmd: string, args: string[], onOutput: (s: string) => void, opts: object) => {
      if (args.includes('--index') && broken) { calls.push({ cmd, args }); onOutput('  1 dossier on disk could not be read: 7720070.json. Do not upload: rebuild it with --keys, or copy it back from the backup, then run --index again.\n'); return 1; }
      return runner({})(cmd, args, onOutput, opts as never);
    };
    expect(await go([], exec)).toBe(EXIT.review);
    expect(out).toMatch(/a dossier on disk could not be read \(the line above names it\), so the index left it out\. Do not upload/);
    calls = [];
    expect(await go(['--go-on'], exec)).toBe(EXIT.review);
    expect(builderSteps()).toEqual(['--index']); // run again, still broken: never passed
    broken = false;
    calls = [];
    expect(await go([], exec)).toBe(EXIT.review); // the --index again, then the plan's review
    expect(builderSteps()).toEqual(['--index']);
  });

  it('an upload whose check finds the bucket short does not send the manifest', async () => {
    const exec = runner({ 'rclone check': { code: 1 } });
    await go([], exec);
    calls = [];
    expect(await go(['--go-on'], exec)).toBe(EXIT.failed);
    expect(calls.map((c) => `${c.cmd} ${c.args[0]}`)).toEqual([`${process.execPath} --import`, 'rclone copy', 'rclone check']);
    expect(out).toMatch(/the manifest was not uploaded, so the site still serves the corpus before/);
  });

  it('a site still serving the corpus before after the upload fails the step', async () => {
    await go();
    expect(await go(['--go-on'], runner({}), async () => 'bbbb2222')).toBe(EXIT.failed);
    expect(out).toMatch(/the site serves corpus bbbb2222, not aaaa1111/);
  });

  it('Ctrl-C during a step: the state says so, and the next run runs that step again', async () => {
    const exec = runner({ '--fill kew-links': { code: 130, then: () => process.emit('SIGINT' as never) } });
    expect(await go([], exec)).toBe(EXIT.interrupted);
    expect(out).toMatch(/Stopped by Ctrl-C during "dossier --fill kew-links"\. Nothing is lost: run the same command to carry on: node scripts\/corpus-step\.mjs/);
    expect(state().steps[2].status).toBe('interrupted');
    calls = [];
    await go();
    expect(builderSteps()).toEqual(['--fill kew-links', '--index']);
  });

  it('runs the builder with no shell, by node itself, so a folder with a space in its path needs no quoting', async () => {
    await go();
    const c = calls.find((x) => x.args.includes('scripts/build-dossiers.ts'))!;
    expect(c.cmd).toBe(process.execPath);
    // The heap is sized from the machine since round eighty (X).
    expect(c.args.slice(0, 4)).toEqual([`--max-old-space-size=${builderHeap().mb}`, '--import', 'tsx', 'scripts/build-dossiers.ts']);
    expect(c.env?.CORPUS_STEP).toBe('1');
  });

  it('a new plan starts over, keeping the old record', async () => {
    await go();
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), 'dossier --index\n');
    utimesSync(join(root, 'scripts/corpus-plan.txt'), new Date(), new Date());
    calls = [];
    expect(await go()).toBe(EXIT.done);
    expect(builderSteps()).toEqual(['--index']);
  });
});

describe('the upload commands', () => {
  it('everything but the manifest, a one-way check of the same files, then the manifest alone', () => {
    const [copy, check, man] = uploadCommands();
    expect(copy[1].slice(0, 3)).toEqual(['copy', 'static/s/v3', 'r2:cultifolio/s/v3']);
    for (const x of ['report.txt', 'manifest.json', 'manifest.prev.json']) { expect(copy[1]).toContain(x); expect(check[1]).toContain(x); }
    expect(check[1].slice(0, 4)).toEqual(['check', 'static/s/v3', 'r2:cultifolio/s/v3', '--one-way']);
    expect(man[1].slice(0, 3)).toEqual(['copy', 'static/s/v3/manifest.json', 'r2:cultifolio/s/v3']);
  });
});

describe('the review before the upload', () => {
  it('names the dossiers the steps changed, against the backup', async () => {
    setup('backup\ndossier --fill gbif-basis\nreview Read what changed.\n');
    writeFileSync(join(root, 'static/s/v3/g7720070.json'), '{"key":7720070}');
    writeFileSync(join(root, 'static/s/v3/g7438714.json'), '{"key":7438714}');
    const exec = runner({ '--fill gbif-basis': { then: () => writeFileSync(join(root, 'static/s/v3/g7720070.json'), '{"key":7720070,"photos":[]}') } });
    expect(await go([], exec)).toBe(EXIT.review);
    expect(out).toMatch(/1 dossier differs from the backup of corpus aaaa1111 \(g7720070\)/);
  });
});

describe('the prune (--prune)', () => {
  const H = (n: number) => n.toString(16).padStart(32, '0');
  const live = { v: 3, id: 'live0001', built: 'x', species: 3, buckets: 32, postings: 64, files: { 'index.json': H(1), 'entries/00.json': H(2) } };
  function bucket(files: string[], o: { copyFails?: boolean; dry?: string } = {}) {
    return async (cmd: string, args: string[], onOutput: (s: string) => void) => {
      calls.push({ cmd, args });
      if (args[0] === 'copyto') { if (o.copyFails) return 1; writeFileSync(join(root, 'live-manifest.json'), JSON.stringify(live)); return 0; }
      if (args.includes('--keep-list')) { writeFileSync(join(root, 'keep.txt'), Object.values(live.files).map((h) => `/${h}.json`).join('\n') + '\n'); return 0; }
      if (args[0] === 'lsf') { onOutput(files.join('\n') + '\n'); return 0; }
      if (args[0] === 'delete' && args.includes('--dry-run')) { onOutput(o.dry ?? `NOTICE: ${H(9)}.json: Skipped delete as --dry-run is set (size 10)\n`); return 0; }
      return 0;
    };
  }
  beforeEach(() => setup('dossier --index\n'));

  it('the dry run is a stop of its own, with counts; --go-on deletes, reading the live manifest again first', async () => {
    const exec = bucket([`${H(1)}.json`, `${H(2)}.json`, `${H(9)}.json`]);
    expect(await go(['--prune'], exec as never, async () => 'live0001')).toBe(EXIT.review);
    expect(out).toMatch(/the bucket's p\/ holds 3 files; keep\.txt keeps 2 \(every file the live manifest live0001 and this folder's two manifests name\); named by none: 1, of which 1 more than a day old would be deleted now\./);
    expect(calls.some((c) => c.args[0] === 'delete' && !c.args.includes('--dry-run'))).toBe(false);
    calls = [];
    expect(await go(['--prune', '--go-on'], exec as never, async () => 'live0001')).toBe(EXIT.done);
    expect(calls.map((c) => c.args[0])).toEqual(['node_modules/@sveltejs/kit/svelte-kit.js', 'copyto', '--import', 'lsf', 'delete']);
    expect(calls[4].args).toEqual(['delete', 'r2:cultifolio/s/v3/p', '--files-from-raw', 'prune.txt', '--stats-one-line']); // round seventy-nine: the files to delete, not keep.txt (tests/unit/r79z-prune.test.ts)
  });

  it('a live manifest that cannot be read deletes nothing, and an earlier prune\'s copy is not used', async () => {
    writeFileSync(join(root, 'live-manifest.json'), JSON.stringify({ ...live, id: 'stale' }));
    expect(await go(['--prune', '--go-on'], bucket([], { copyFails: true }) as never, async () => 'live0001')).toBe(EXIT.failed);
    expect(out).toMatch(/the live manifest could not be read from the bucket\. Nothing was deleted\./);
    expect(calls.map((c) => c.args[0])).toEqual(['node_modules/@sveltejs/kit/svelte-kit.js', 'copyto']);
  });

  it('a site serving another corpus than the bucket\'s manifest deletes nothing', async () => {
    expect(await go(['--prune', '--go-on'], bucket([`${H(1)}.json`, `${H(2)}.json`]) as never, async () => 'older001')).toBe(EXIT.failed);
    expect(out).toMatch(/the site serves corpus older001, and the bucket's manifest names live0001/);
    expect(calls.some((c) => c.args[0] === 'delete')).toBe(false);
  });

  it('a live manifest naming a file the bucket lacks deletes nothing', async () => {
    expect(await go(['--prune', '--go-on'], bucket([`${H(1)}.json`]) as never, async () => 'live0001')).toBe(EXIT.failed);
    expect(out).toMatch(/the live manifest names 1 files the bucket does not hold/);
    expect(calls.some((c) => c.args[0] === 'delete')).toBe(false);
  });
});

describe('svelte-kit sync first (B11)', () => {
  it('runs once, before the first builder step, and a failure stops the run with what to do', async () => {
    setup('dossier --fill gbif-open\ndossier --index\n');
    await go();
    const syncs = calls.filter((c) => c.args[0] === 'node_modules/@sveltejs/kit/svelte-kit.js');
    expect(syncs).toHaveLength(1);
    expect(calls[0].args).toEqual(['node_modules/@sveltejs/kit/svelte-kit.js', 'sync']);
    setup('dossier --index\n');
    const exec = runner({ [`${process.execPath} node_modules/@sveltejs/kit/svelte-kit.js`]: { code: 1 } });
    expect(await go([], exec)).toBe(EXIT.failed);
    expect(out).toMatch(/svelte-kit sync failed \(exit 1\), so the builder cannot find its own modules\. Run npm install, then this command again\./);
    expect(builderSteps()).toEqual([]);
  });
});

describe('the bucket\'s dossiers the index does not list', () => {
  it('are reported after the upload, written to bucket-unlisted.txt, and nothing is deleted', async () => {
    setup('upload\n');
    const exec = async (cmd: string, args: string[], onOutput: (s: string) => void) => {
      calls.push({ cmd, args });
      if (args[0] === 'lsf') onOutput('g1.json\ng2.json\ng3.json\ng4242.json\nk9999.json\n1.json\nindex.json\nmanifest.json\n');
      return 0;
    };
    expect(await go([], exec as never)).toBe(EXIT.done);
    expect(out).toMatch(/2 dossiers in the bucket are not in the index \(keys in bucket-unlisted\.txt: g4242, k9999\)\. They are left as they are: a report only, nothing deleted\./);
    expect(readFileSync(join(root, 'bucket-unlisted.txt'), 'utf8')).toBe('g4242\nk9999\n');
    expect(calls.some((c) => c.args[0] === 'delete' || c.args[0] === 'deletefile' || c.args[0] === 'purge')).toBe(false);
    expect(calls.find((c) => c.args[0] === 'lsf')!.args).toEqual(['lsf', 'r2:cultifolio/s/v3', '--files-only']);
  });
});

describe('a quiet step (the merge, after the dry run: --fill kew-links printed nothing for 40 minutes)', () => {
  it('says it is still working while a step prints nothing, and stops saying so when it ends', async () => {
    setup('dossier --fill kew-links\n');
    const slow = async (cmd: string, args: string[], onOutput: (s: string) => void) => {
      calls.push({ cmd, args });
      if (args.includes('scripts/build-dossiers.ts')) await new Promise((r) => setTimeout(r, 120));
      onOutput('  done.\n');
      return 0;
    };
    await run({ root, argv: [], exec: slow, fetchCorpus: async () => 'aaaa1111', log: (s: string) => { out += s; }, waitMs: 0, heartbeatMs: 20 });
    expect(out).toMatch(/… still working: \d+ min on this step so far\. Leave it running\./);
    expect(readFileSync(join(root, 'corpus-step.log'), 'utf8')).toMatch(/still working/);
    const n = out.match(/still working/g)!.length;
    await new Promise((r) => setTimeout(r, 80));
    expect(out.match(/still working/g)!.length).toBe(n);
  });
});

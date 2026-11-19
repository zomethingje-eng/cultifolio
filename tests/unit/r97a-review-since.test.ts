/**
 * Round ninety-seven: a review compares with the backup only the dossiers written since the backup began (docs/PLAN-97.md,
 * 2). Round ninety-six's stop took about ten minutes: `facts` read the whole corpus three times (the error rows, then
 * each dossier and its backup copy), 4.9 GB a time, after the build had streamed the 62 GB GBIF download through the
 * machine's memory. The backup step now records when its copy began (`state.backupAt`); `facts` reads each dossier once,
 * for its error rows, and reads its backup copy only where the dossier's file was written since. A file not written since
 * the copy began is the copy, byte for byte (nothing in the builder or the fills keeps a file's old time). Without that
 * moment (`--compare`, or a backup already there before the run) every dossier is compared, as before.
 *
 * On a8bb7e8: `facts` took no fourth argument and named every dossier that differs, k2 among them (r97a 1's first case,
 * FAILED); the backup step recorded no moment (r97a 2's first case, FAILED). The two cases without a moment passed there,
 * as they should: they are what was before.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { facts, run, EXIT } from '../../scripts/corpus-step.mjs';

const page = (id: string, extra: Record<string, unknown> = {}) => JSON.stringify({ id, upstream: { gbif: { status: 'ok' } }, ...extra });
const error = { upstream: { gbif: { status: 'ok' }, inat: { status: 'error' } } };

describe('r97a 1: facts with the moment the backup began', () => {
  const setup = () => {
    const root = mkdtempSync(join(tmpdir(), 'r97a-facts-'));
    const v3 = join(root, 'static/s/v3');
    const back = join(root, 'backups/v3-before');
    mkdirSync(v3, { recursive: true });
    mkdirSync(back, { recursive: true });
    writeFileSync(join(v3, 'manifest.json'), JSON.stringify({ v: 3, id: 'after' }));
    writeFileSync(join(v3, 'index.json'), JSON.stringify([{}, {}, {}]));
    for (const id of ['k1', 'k2', 'k3']) writeFileSync(join(back, `${id}.json`), page(id));
    // k1 the backup's bytes; k2 different bytes in a file last written an hour before the backup (with an error row);
    // k3 different bytes written after it.
    writeFileSync(join(v3, 'k1.json'), page('k1'));
    writeFileSync(join(v3, 'k2.json'), page('k2', error));
    writeFileSync(join(v3, 'k3.json'), page('k3', { more: 1 }));
    const since = Date.now() - 60_000;
    utimesSync(join(v3, 'k1.json'), new Date(since - 3_600_000), new Date(since - 3_600_000));
    utimesSync(join(v3, 'k2.json'), new Date(since - 3_600_000), new Date(since - 3_600_000));
    return { root, since };
  };

  it('compares only what was written since, and still counts every page\'s error rows', () => {
    const { root, since } = setup();
    const f = facts(root, 'before', 'backups/v3-before', since);
    expect(f).toContain('; 1 dossier differs from the backup of corpus before (k3)');
    expect(f).toContain('; 1 page holds a row a source did not answer ("error": inat 1; k2)');
  });

  it('without it, every dossier is compared, as before', () => {
    const { root } = setup();
    const f = facts(root, 'before', 'backups/v3-before');
    expect(f).toContain('; 2 dossiers differ from the backup of corpus before (k2, k3)');
    expect(f).toContain('; 1 page holds a row a source did not answer ("error": inat 1; k2)');
  });
});

describe('r97a 2: the backup step records when its copy began', () => {
  let root = '', out = '';
  const setup = () => {
    root = mkdtempSync(join(tmpdir(), 'r97a-run-'));
    mkdirSync(join(root, 'static/s/v3'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', files: {} }));
    writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 'g1' }]));
    writeFileSync(join(root, 'static/s/v3/k1.json'), page('k1'));
    writeFileSync(join(root, 'static/s/v3/k2.json'), page('k2'));
    writeFileSync(join(root, 'scripts/corpus-plan.txt'), 'backup\ndossier --keys x.txt\nstop Read the page.\n');
    out = '';
  };
  // The build writes k2 again, changed.
  const go = () => run({
    root, argv: [],
    exec: async (_cmd: string, _args: string[], onOutput: (s: string) => void) => { writeFileSync(join(root, 'static/s/v3/k2.json'), page('k2', { more: 1 })); onOutput('  1 built, 0 kept of 1\n'); return 0; },
    fetchCorpus: async () => 'aaaa1111', log: (s: string) => { out += s; }, waitMs: 0, heap: { mb: 1024, why: 'test' }
  });
  const state = () => JSON.parse(readFileSync(join(root, 'corpus-step.json'), 'utf8'));

  it('a backup made by the run: its moment kept, and the stop names the page the build wrote', async () => {
    setup();
    const t0 = Date.now();
    expect(await go()).toBe(EXIT.review);
    expect(existsSync(join(root, 'backups/v3-aaaa1111/k1.json'))).toBe(true);
    expect(state().backupAt).toBeGreaterThanOrEqual(t0);
    expect(out).toContain('; 1 dossier differs from the backup of corpus aaaa1111 (k2)');
  });

  it('a backup already there: no moment, so every dossier is compared', async () => {
    setup();
    mkdirSync(join(root, 'backups/v3-aaaa1111'), { recursive: true });
    for (const id of ['k1', 'k2']) writeFileSync(join(root, `backups/v3-aaaa1111/${id}.json`), page(id));
    expect(await go()).toBe(EXIT.review);
    expect(state().backupAt).toBeUndefined();
    expect(out).toContain('; 1 dossier differs from the backup of corpus aaaa1111 (k2)');
  });
});

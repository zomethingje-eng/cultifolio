/**
 * Round 73, K: the corpus step and the two pages merged away on purpose (scripts/merged-pages.txt). `--prune-followed`
 * deletes them, and the index holds two species fewer; the step blocked any shrink, and `--go-on` could not pass it.
 * The cases FAIL on r73base (no `mergedAway`; the run stopped "the index now holds fewer species than before").
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run, mergedAway, EXIT } from '../../scripts/corpus-step.mjs';

function setup(plan: string) {
  const root = mkdtempSync(join(tmpdir(), 'corpus-step-73-'));
  mkdirSync(join(root, 'static/s/v3'), { recursive: true });
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'static/s/v3/manifest.json'), JSON.stringify({ v: 3, id: 'aaaa1111', built: 'x', species: 3, buckets: 32, postings: 64, files: {} }));
  writeFileSync(join(root, 'static/s/v3/index.json'), JSON.stringify([{ key: 1 }, { key: 2 }, { key: 3 }, { key: 4 }]));
  writeFileSync(join(root, 'scripts/corpus-plan.txt'), plan);
  return root;
}
const runner = (answers: Record<string, string>) => async (_cmd: string, args: string[], onOutput: (s: string) => void) => {
  const key = args.includes('scripts/build-dossiers.ts') ? args.slice(args.indexOf('scripts/build-dossiers.ts') + 1).join(' ') : '';
  onOutput(answers[key] ?? '  done.\n');
  return 0;
};

describe('pages merged away on purpose', () => {
  it('reads the prune\'s count, and nothing else as one', () => {
    expect(mergedAway("  0 dossiers under synonym names deleted; …\n  2 dossiers of pages merged into another deleted (3084426, 7906297); each kept page reads its key and answers its old address.\n  index: 8945 species\n")).toBe(2);
    expect(mergedAway('  1 dossier of pages merged into another deleted (3084426); …\n')).toBe(1);
    expect(mergedAway('  index: 8945 species\n  0 dossiers under synonym names deleted\n')).toBe(0);
  });
  it('the index two species fewer after the merge goes on, through --index; one more lost still blocks (guard)', async () => {
    const root = setup('backup\ndossier --prune-followed\ndossier --index\n');
    let out = '';
    const code = await run({ root, argv: [], exec: runner({ '--prune-followed': '  2 dossiers of pages merged into another deleted (3, 4); each kept page reads its key and answers its old address.\n  index: 2 species\n', '--index': '  index: 2 species\n' }), fetchCorpus: async () => 'aaaa1111', log: (s: string) => { out += s; }, waitMs: 0 });
    expect(out).toMatch(/2 pages merged into another left the index on purpose: 2 species expected from here on/);
    expect(out).not.toMatch(/fewer species than before/);
    expect(code).toBe(EXIT.done);
    const r2 = setup('backup\ndossier --prune-followed\ndossier --index\n');
    let out2 = '';
    await run({ root: r2, argv: [], exec: runner({ '--prune-followed': '  1 dossier of pages merged into another deleted (4); …\n  index: 3 species\n', '--index': '  index: 2 species\n' }), fetchCorpus: async () => 'aaaa1111', log: (s: string) => { out2 += s; }, waitMs: 0 });
    expect(out2).toMatch(/Stopped at "dossier --index": the index now holds fewer species than before \(2, was 3\)/);
  });
});

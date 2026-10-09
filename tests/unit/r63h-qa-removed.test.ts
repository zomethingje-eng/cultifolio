/**
 * Round sixty-three, the harness (H1): the QA probes are gone. They lived in a folder of their own under tests, ran only
 * when an environment switch was set, and had been stale since before round sixty-two (fourteen failures on its base,
 * docs/REVIEW-ROUND-62.md section 11). The owner's decision was to remove them with every reference in code, configs and
 * scripts; this checks the folder is absent and that neither runner, nor any script or the package's scripts, names it.
 * (The history in docs/ keeps its mentions: a record of what was, not a pointer to run.)
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const root = resolve(__dirname, '../..');
const SWITCH = ['QA', 'PROBES'].join('_'); // spelt apart, so this file does not name what it looks for
const FOLDER = ['tests', 'qa'].join('/');

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (['node_modules', '.svelte-kit', '.wrangler', 'docs', 'test-results', 'playwright-report', '.git', 'static', 'fixtures', 'corpus', 'climate', 'bulk', 'dist', '__pycache__'].includes(name) || name.startsWith('.r6')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) files(p, out);
    else if (/\.(ts|mjs|js|cjs|json|jsonc|svelte|py|md|html)$/.test(name) && st.size < 2_000_000) out.push(p);
  }
  return out;
}

describe('the QA probes are removed (H1)', () => {
  it('the folder is gone', () => {
    expect(existsSync(join(root, FOLDER))).toBe(false);
  });
  it('no file outside docs/ names the folder or the switch that ran it', () => {
    const hits = files(root)
      .filter((p) => !p.endsWith('r63h-qa-removed.test.ts'))
      .filter((p) => { const s = readFileSync(p, 'utf8'); return s.includes(SWITCH) || s.includes(FOLDER) || s.includes(FOLDER.replace('/', '\\\\')); })
      .map((p) => relative(root, p));
    expect(hits).toEqual([]);
  });
  it('the unit runner includes only the unit tests and the sources\' own', async () => {
    const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    const include = /include:\s*(\[[^\]]*\])/.exec(vite)?.[1];
    expect(include).toBe("['tests/unit/**/*.test.ts', 'src/**/*.test.ts']");
  });
  it('the browser runner reads tests/e2e alone', () => {
    const pw = readFileSync(join(root, 'playwright.config.ts'), 'utf8');
    expect([...pw.matchAll(/testDir:\s*'([^']+)'/g)].map((m) => m[1])).toEqual(['tests/e2e']);
  });
});

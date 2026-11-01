/**
 * Round eighty-five, Q (outside review A23): tests that read the app's source for a line of code, where they guard
 * behaviour, are to become tests of the behaviour. A test that reads a page's words (a sentence a reader sees, a seam
 * between /about and the code) guards a written promise and stays; one that reads code (`toContain('{#if excerpt?.more ||
 * d.summary.cut}')`) passes when the code is kept and the behaviour broken, and fails when the behaviour is kept under
 * another spelling.
 *
 * This round made the named ones and the species page's behavioural (r85q-behaviour, r85q-species-page, r85q-guards).
 * The rest are counted here, file by file, against tests/unit/fixtures/r85q-source-text.json: a file's count may fall,
 * never rise, and a file not listed may hold none. So no new test of this kind is written, and each one made
 * behavioural lowers the ceiling (rewrite the file with the counts this test prints when they fall).
 *
 * What counts: an `expect(…)` on the text of a file under src/ or scripts/ (not the about pages, which are written
 * promises), with `toContain` or `toMatch`, whose expected text reads as code (brackets, an arrow, an assignment, a call)
 * rather than as words.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CODE_PATH = /['"`]((?:src|scripts)\/[^'"`]+?\.(?:ts|svelte|mjs|js))['"`]/;
const CODEY = /=>|\\\(|\\\{|\(\)|[{};]|\w\.\w+\(|\bconst\b|\bawait\b|\bif\b|===|!==|\$\{|\w\(/;

/** Each code-shaped assertion on source text, as `file:line`. */
export function sourceTextAssertions(dir = 'tests/unit'): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.ts')).sort()) {
    const s = readFileSync(join(dir, f), 'utf8');
    const names = new Map<string, string>();
    for (const m of s.matchAll(new RegExp(String.raw`(?:const|let)\s+(\w+)\s*=\s*(?:\(\)\s*=>\s*)?readFileSync\(\s*` + CODE_PATH.source, 'g'))) names.set(m[1], m[2]);
    s.split('\n').forEach((l, i) => {
      const a = /\.(?:not\.)?(?:toContain|toMatch)\((.*)\)\s*;?\s*(?:\/\/.*)?$/.exec(l);
      if (!a) return;
      const direct = new RegExp(String.raw`expect\(\s*readFileSync\(\s*` + CODE_PATH.source).exec(l)?.[1];
      const bound = /expect\(\s*(\w+)\s*[,)]/.exec(l)?.[1];
      const path = direct ?? (bound ? names.get(bound) : undefined);
      if (!path || path.startsWith('src/routes/about/')) return;
      if (CODEY.test(a[1])) out.push(`${f}:${i + 1}`);
    });
  }
  return out;
}

describe('source-text tests of code only fall in number (A23)', () => {
  const ceiling = JSON.parse(readFileSync('tests/unit/fixtures/r85q-source-text.json', 'utf8')) as Record<string, number>;
  const now = sourceTextAssertions();
  const byFile = new Map<string, number>();
  for (const at of now) { const f = at.split(':')[0]; byFile.set(f, (byFile.get(f) ?? 0) + 1); }
  it('the reader finds them (it works)', () => {
    expect(now.length).toBeGreaterThan(50);
  });
  it('no file holds more than its ceiling, and no other file holds any', () => {
    const over = [...byFile].filter(([f, n]) => n > (ceiling[f] ?? 0)).map(([f, n]) => `${f}: ${n} (ceiling ${ceiling[f] ?? 0}): ${now.filter((a) => a.startsWith(`${f}:`)).join(', ')}`);
    expect(over).toEqual([]);
  });
  it('the ceilings are the counts now (lowered as tests are made behavioural)', () => {
    const fell = Object.entries(ceiling).filter(([f, n]) => (byFile.get(f) ?? 0) < n).map(([f, n]) => `${f}: ${byFile.get(f) ?? 0} < ${n}`);
    expect(fell, `lower these ceilings in tests/unit/fixtures/r85q-source-text.json: ${JSON.stringify(Object.fromEntries(byFile))}`).toEqual([]);
  });
});

/**
 * Round eighty-two (O): no raw NUL byte in the app's sources (the independent review's 30).
 *
 * `src/lib/core/log.ts` held eight raw NUL bytes in its string literals and a comment (the bookkeeping keys of the
 * log's fold, `key + NUL + field`), where two lines beside them wrote the escape `'\0'`. A raw NUL is invisible in most
 * editors and diff views, and some tools take a file holding one for binary. They are escapes now. The change computes
 * the same: esbuild's output for the file is byte-identical before and after, and every string literal's value is the
 * same (247 literals, 9 holding a NUL; proved in the round's notes). This test keeps the escapes meaning NUL.
 *
 * On r82base: 1 FAILED (src/lib/core/log.ts holds 8 NUL bytes).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (/\.(ts|svelte|mjs|js|json|css|html)$/.test(n)) out.push(p);
  }
  return out;
}

describe('r82o source bytes', () => {
  it('1: no source file under src/ or scripts/ holds a raw NUL byte', () => {
    const held = [...files('src'), ...files('scripts')].filter((p) => readFileSync(p).includes(0));
    expect(held).toEqual([]);
  });
  it('2: the log fold\'s bookkeeping keys are still joined by NUL, written as escapes', () => {
    const s = readFileSync('src/lib/core/log.ts', 'utf8');
    for (const lit of ["'\\0held\\0'", "'\\0'", "'\\0_deleted='", "'\\0*'", "'\\0_deleted'"]) expect(s, lit).toContain(lit);
    // And an escape followed by a digit, a legacy octal escape, is never written.
    expect(s).not.toMatch(/\\0[0-9]/);
  });
});

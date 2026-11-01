/**
 * Round eighty-five, merge: every file the repository holds must be one Windows can hold.
 *
 * The owner works on Windows. Round 85's per-region maps were first written as `static/app/maps/r/CON.svg` (Congo's
 * TDWG code), and Windows reserves CON, PRN, AUX, NUL, COM1-9 and LPT1-9 under any extension: the file could not be
 * opened and `git add` stopped. The maps are now `w-<code>.svg` and `r-<code>.svg`. This walks the trees the
 * repository ships and fails on any name Windows refuses, so the next generated file cannot repeat it.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src', 'static', 'tests', 'scripts', 'docs', 'worker'];
const SKIP = new Set(['node_modules', '.svelte-kit', '.wrangler', 'test-results', 'playwright-report']);
const RESERVED = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(\..*)?$/i;
const BAD_CHAR = /[<>:"|?*\x00-\x1f\\]/;

function walk(dir: string, out: string[]) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name) || e.name.startsWith('.r75h-harness-')) continue;
    const p = join(dir, e.name);
    out.push(p);
    if (e.isDirectory()) walk(p, out);
  }
}

function windowsRefuses(name: string): string | null {
  if (RESERVED.test(name)) return 'a reserved device name';
  if (BAD_CHAR.test(name)) return 'a character Windows refuses';
  if (/[. ]$/.test(name)) return 'a trailing dot or space';
  return null;
}

describe('every file is one Windows can hold', () => {
  it('the rule knows the names that stopped the owner', () => {
    expect(windowsRefuses('CON.svg')).toBe('a reserved device name');
    expect(windowsRefuses('con')).toBe('a reserved device name');
    expect(windowsRefuses('LPT1.txt')).toBe('a reserved device name');
    expect(windowsRefuses('r-CON.svg')).toBeNull();
    expect(windowsRefuses('CONSOLE.svg')).toBeNull();
    expect(windowsRefuses('a:b.txt')).toBe('a character Windows refuses');
    expect(windowsRefuses('notes.')).toBe('a trailing dot or space');
  });
  it('no file or folder in the shipped trees has such a name', () => {
    const all: string[] = [];
    for (const r of ROOTS) if (existsSync(r)) walk(r, all);
    expect(all.length).toBeGreaterThan(1000);
    const bad = all.map((p) => [p, windowsRefuses(p.split(/[\\/]/).pop()!)] as const).filter(([, why]) => why);
    expect(bad).toEqual([]);
  });
  it('the Congo maps are under their prefixed names', () => {
    expect(existsSync('static/app/maps/w/w-CON.svg')).toBe(true);
    expect(existsSync('static/app/maps/r/r-CON.svg')).toBe(true);
  });
});

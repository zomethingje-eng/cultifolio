/**
 * Every `<details>` in the source is on the single-tap check's list (round sixty-nine; triage-68 P5, R46-31): the check
 * tested 3 of the source's 26, and a disclosure added since was pressed by no test at all. The list is
 * tests/e2e/helpers/disclosure-list.ts; the spec that presses each is tests/e2e/r69p-disclosure.spec.ts. Failed on the
 * base, where the list did not exist.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DISCLOSURES } from '../e2e/helpers/disclosure-list';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (f.endsWith('.svelte')) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
/** Each `<details>` of a component, by its static class attribute, comments left out. */
function detailsIn(file: string): string[] {
  const src = readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  return [...src.matchAll(/<details\b([^>]*)>/g)].map((m) => /\bclass="([^"]*)"/.exec(m[1])?.[1] ?? '');
}
const key = (file: string, cls: string) => `${file} | ${cls}`;

describe('the single-tap check covers every <details> in the source', () => {
  const inSource = walk('src').flatMap((f) => detailsIn(f).map((c) => key(f, c))).sort();
  const listed = DISCLOSURES.map((d) => key(d.file, d.cls)).sort();
  it('the list is the source, one entry for each, no more and no fewer', () => {
    expect(inSource.length).toBeGreaterThan(20);
    expect(listed).toEqual(inSource);
  });
  it('each one is pressed, but for one whose reason is said', () => {
    const unreached = DISCLOSURES.filter((d) => d.unreached);
    expect(unreached.map((d) => d.sel)).toEqual(['#clock-ahead details']);
    for (const d of unreached) expect(d.unreached!.length).toBeGreaterThan(40);
  });
  it('the spec presses every listed disclosure through the list', () => {
    const spec = readFileSync('tests/e2e/r69p-disclosure.spec.ts', 'utf8');
    expect(spec).toMatch(/for \(const \[at, list\] of Object\.entries\(byPage\)\)/);
    const setups = [...spec.matchAll(/^\s{2}'?([a-z-]+)'?: async \(page/gm)].map((m) => m[1]).sort();
    expect([...new Set(DISCLOSURES.map((d) => d.at))].sort()).toEqual(setups);
  });
});

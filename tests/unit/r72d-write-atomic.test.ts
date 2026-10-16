/**
 * Round seventy-two (REVIEW-TRIAGE-71 D3): dossiers, the index and the manifest are written to a temporary file and
 * renamed over the old one, so a stopped run never leaves one cut off. FAILED on r72base (no such helper; the script
 * wrote each file in place).
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeAtomic, tmpOf, type AtomicFs } from '../../scripts/write-atomic';

const dir = () => mkdtempSync(join(tmpdir(), 'r72d-atomic-'));

describe('write then rename', () => {
  it('replaces the file whole and leaves no temporary file', () => {
    const d = dir();
    writeFileSync(join(d, '1.json'), '{"old":true}');
    writeAtomic(join(d, '1.json'), '{"new":true}');
    expect(readFileSync(join(d, '1.json'), 'utf8')).toBe('{"new":true}');
    expect(readdirSync(d)).toEqual(['1.json']);
    expect(tmpOf(join(d, '1.json'))).not.toMatch(/\d+\.json$/);
  });
  it('a write that fails half way leaves the old file as it was', () => {
    const d = dir();
    const p = join(d, '1.json');
    writeFileSync(p, '{"old":true}');
    const fs: AtomicFs = { writeFileSync: (f, s) => { writeFileSync(f, s.slice(0, 3)); throw Object.assign(new Error('killed'), { code: 'EIO' }); }, renameSync: () => { throw new Error('never'); }, unlinkSync: (f) => require('node:fs').unlinkSync(f) };
    expect(() => writeAtomic(p, '{"new":true}', fs)).toThrow('killed');
    expect(readFileSync(p, 'utf8')).toBe('{"old":true}'); // r72base: '{"n', a dossier the scan could not read
    expect(readdirSync(d)).toEqual(['1.json']);
  });
  it('a rename Windows refuses for a moment (a reader holds the file) is tried again', () => {
    const d = dir();
    const p = join(d, '1.json');
    let refusals = 2;
    const real = require('node:fs');
    const fs: AtomicFs = { writeFileSync: real.writeFileSync, unlinkSync: real.unlinkSync, renameSync: (a, b) => { if (refusals-- > 0) throw Object.assign(new Error('EPERM'), { code: 'EPERM' }); real.renameSync(a, b); } };
    writeAtomic(p, 'x', fs);
    expect(readFileSync(p, 'utf8')).toBe('x');
  });
  it('the corpus script writes every dossier, the index and the manifest so', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    for (const re of [/write: \(file: string, d: unknown\) => writeAtomic\(/, /writeAtomic\(`\$\{idxDir\}\/manifest\.json`/, /writeAtomic\(`\$\{idxDir\}\/index\.json`, indexText\)/, /if \(st\) \{ d\.changed = st; writeAtomic\(/]) expect(src, String(re)).toMatch(re);
    // No dossier is written in place any more: every JSON.stringify(d) goes through writeAtomic.
    expect(src).not.toMatch(/writeFileSync\([^)]*JSON\.stringify\(d\)\)/);
    expect(readFileSync('scripts/names-step.ts', 'utf8')).toMatch(/writeAtomic\(path, JSON\.stringify\(d\)\)/);
  });
});

/**
 * Round sixty-seven, the harness (triage-66 H7, R45-29): no browser test writes the collection's database by hand. Writes
 * go through tests/e2e/helpers/inject.ts (`inject`, `injectChanges`, `injectTail`, `wipe`), which keep the vault's own
 * write contract: the arrival rows with the changes, the ledger, and the snapshot dropped with the counter moved when the
 * log is not what it was. Two smoke tests cleared `changes` and `photos` themselves and left the snapshot and the arrival
 * rows, the race class of the last review's A44.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(__dirname, '../e2e');
const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
/** A read-write transaction opened in a spec, or a store cleared or written in one. */
const RAW = /\.transaction\([^)]*['"]readwrite['"]|objectStore\([^)]*\)\.(clear|put|add|delete)\(/;

describe('the browser tests write the vault only through helpers/inject.ts (round sixty-seven; triage-66 H7)', () => {
  it('the guard reads the specs', () => {
    expect(specs.length).toBeGreaterThan(20);
  });
  for (const f of specs) {
    it(`${f}: no raw database write`, () => {
      const lines = readFileSync(join(dir, f), 'utf8').split('\n');
      // A line marked `raw-ok:` writes no change and no arrival row (a mark in meta, taken away to stand in for an older
      // build's state) and says why; the log itself is never written by hand (round sixty-seven, at the merge).
      const raw = lines.map((l, i) => (RAW.test(l) && !/raw-ok:/.test(l) ? `${f}:${i + 1}: ${l.trim().slice(0, 120)}` : '')).filter(Boolean);
      expect(raw).toEqual([]);
    });
  }
  it('the helper\'s wipe drops the snapshot and the arrival rows with the log, in one transaction', () => {
    const src = readFileSync(join(dir, 'helpers', 'inject.ts'), 'utf8');
    const wipe = src.slice(src.indexOf('export async function wipe('));
    expect(wipe).toMatch(/\['changes', 'photos', 'outbox', 'order', 'meta'\]/);
    expect(wipe).toMatch(/meta\.delete\('fold'\)/);
    expect(wipe).toMatch(/meta\.put\(gen \+ 1, 'foldGen'\)/);
  });
});

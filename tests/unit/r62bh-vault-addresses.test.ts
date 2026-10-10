/**
 * Round sixty-two, second pass, the harness: the per-address vault limit cannot be met by accident (the machine's limit).
 * The server allows five new vaults a day from one address; every e2e request came from 127.0.0.1, so the full suite,
 * run again the same day against the same state, met it and failed tests that had nothing to do with it. Every test
 * that makes a vault now sends a documentation address of its own through tests/e2e/helpers/address.ts, and this guard
 * reads the specs: a test that makes a vault (clicks `#sync-start`, or posts `create: true` to /api/sync/vault) and does
 * not take its address from that helper fails here, before it can fail a run.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = resolve(__dirname, '../e2e');
const specs = readdirSync(dir).filter((f) => f.endsWith('.spec.ts'));
/** A click on `#sync-start` (not a check that it is absent), or a creation posted straight to the API. */
const MAKES = /click\('#sync-start'\)|create: true/;
const HELPER = /\b(fromAddress|docAddress|limitAddress)\(/;
/** Each top-level `test(` block of a spec, by its title, with its source. */
function blocks(src: string): { title: string; body: string }[] {
  const starts = [...src.matchAll(/^test(?:\.\w+)?\((['"`])(.*?)\1/gm)].map((m) => ({ at: m.index!, title: m[2] }));
  return starts.map((s, i) => ({ title: s.title, body: src.slice(s.at, starts[i + 1]?.at ?? src.length) }));
}

describe('every e2e test that makes a vault sends an address of its own (round sixty-two second pass; the machine\'s limit)', () => {
  it('finds the tests that make vaults (the guard reads something)', () => {
    const makers = specs.flatMap((f) => blocks(readFileSync(join(dir, f), 'utf8')).filter((b) => MAKES.test(b.body)));
    expect(makers.length).toBeGreaterThanOrEqual(4);
  });

  for (const f of specs) {
    it(`${f}: each vault it makes is made from a documentation address`, () => {
      const src = readFileSync(join(dir, f), 'utf8');
      const bare = blocks(src).filter((b) => MAKES.test(b.body) && !HELPER.test(b.body));
      expect(bare.map((b) => b.title)).toEqual([]);
    });
  }

  // No exemptions any more (round sixty-seven; triage-66 H9, IND-9): the two server specs sent .62 and .63 by hand, one
  // vault a run each, and a reused server refused Firefox's creation with 429. A fixed address written into a spec is
  // what that was, so none may be.
  it('no spec writes a documentation address by hand', () => {
    const fixed = specs.filter((f) => /['"`]198\.51\.100\.\d+['"`]/.test(readFileSync(join(dir, f), 'utf8')));
    expect(fixed).toEqual([]);
  });

  it('only the limit\'s own test spends an address\'s five, and it takes the address kept for it', () => {
    const smoke = readFileSync(join(dir, 'smoke.spec.ts'), 'utf8');
    const users = specs.filter((f) => /limitAddress\(/.test(readFileSync(join(dir, f), 'utf8')));
    expect(users).toEqual(['smoke.spec.ts']);
    const limit = blocks(smoke).filter((b) => /limitAddress\(/.test(b.body));
    expect(limit.map((b) => b.title)).toHaveLength(1);
    expect(limit[0].body).toContain('toBe(429)');
  });
});

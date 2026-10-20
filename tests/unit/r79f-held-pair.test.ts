/**
 * Round seventy-nine (F): the live check's held pair (round seventy-eight), tested without the network. The Worker's
 * cache is each data centre's own; from the owner's PC two requests a moment apart were answered by Ashburn and Newark
 * by turns, so the second found no copy where it landed. The pair is asked again, up to five pairs a second apart, and
 * a failure names the two centres. Both pairs the check asks, the species page's and the front page's, go through it.
 *
 * FAILED on the base: `scripts/live-check-pair.mjs` was not there (the pair was inside live-check.mjs, which runs its
 * checks against the live site as soon as it is imported, so it could not be tested).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { heldPair, centres, colo } from '../../scripts/live-check-pair.mjs';

type R = { status: number; text: string; h: (k: string) => string };
const answer = (page: 'rendered' | 'held' | '', centre: string): R => ({ status: 200, text: '<html>', h: (k) => (k === 'x-cultifolio-page' ? page : k === 'cf-ray' ? `8d2f0c1a2b3c4d5e-${centre}` : '') });
/** A site answering the given answers in turn, recording each request and each wait. */
function site(answers: R[]) {
  const asked: string[] = [];
  const waits: number[] = [];
  let i = 0;
  return { asked, waits, get: async (path: string) => { asked.push(path); return answers[Math.min(i++, answers.length - 1)]; }, sleep: async (ms: number) => { waits.push(ms); } };
}

describe('heldPair', () => {
  it('a second request held at once: one pair, no wait', async () => {
    const s = site([answer('rendered', 'IAD'), answer('held', 'IAD')]);
    const r = await heldPair(s.get, '/species/aloe-vera', {}, { sleep: s.sleep });
    expect(r.tries).toBe(1);
    expect(s.asked).toHaveLength(2);
    expect(s.waits).toEqual([]);
  });
  it('two centres by turns, then one centre twice: asked again a second apart until the second is held', async () => {
    const s = site([answer('rendered', 'IAD'), answer('rendered', 'EWR'), answer('held', 'EWR'), answer('rendered', 'IAD'), answer('held', 'IAD'), answer('held', 'IAD')]);
    const r = await heldPair(s.get, '/species/aloe-vera', {}, { sleep: s.sleep });
    expect(r.tries).toBe(3);
    expect(s.asked).toEqual(Array(6).fill('/species/aloe-vera'));
    expect(s.waits).toEqual([1000, 1000]);
    expect(colo(r.a)).toBe('IAD');
    expect(r.b.h('x-cultifolio-page')).toBe('held');
  });
  it('never held: five pairs, then the last pair, which the check fails naming the two centres', async () => {
    const alternate = Array.from({ length: 10 }, (_, i) => answer('rendered', i % 2 ? 'EWR' : 'IAD'));
    const s = site(alternate);
    const r = await heldPair(s.get, '/', {}, { sleep: s.sleep });
    expect(r.tries).toBe(5);
    expect(s.asked).toHaveLength(10);
    expect(s.waits).toEqual([1000, 1000, 1000, 1000]);
    expect(centres(r.a, r.b)).toBe(' (answered by IAD, then EWR, after five pairs)');
    // a local wrangler dev names no centre
    expect(centres(answer('rendered', ''), answer('rendered', ''))).toBe(' (after five pairs)');
  });
  it('passes the request\'s headers on each time', async () => {
    const inits: unknown[] = [];
    await heldPair(async (_p: string, init: unknown) => { inits.push(init); return answer('held', 'IAD'); }, '/', { headers: { accept: 'text/html' } }, { sleep: async () => {} });
    expect(inits).toEqual([{ headers: { accept: 'text/html' } }, { headers: { accept: 'text/html' } }]);
  });
});

describe('the live check asks both of its held pairs through it', () => {
  const src = readFileSync('scripts/live-check.mjs', 'utf8');
  it('the species page and the front page', () => {
    expect(src).toContain("import { heldPair as askHeld, centres } from './live-check-pair.mjs';");
    expect(src).toMatch(/if \(b\.h\('x-cultifolio-page'\) !== 'held'\) \(\{ a, b \} = await heldPair\(path, \{ headers: \{ accept: 'text\/html' \} \}\)\);/);
    expect(src).toMatch(/if \(r2\.h\('x-cultifolio-page'\) !== 'held'\) \(\{ a: first, b: r2 \} = await heldPair\('\/', \{ headers: \{ accept: 'text\/html' \} \}\)\);/);
    // guard: no pair of its own is left in the check
    expect(src).not.toMatch(/async function heldPair/);
  });
});

/**
 * Round eighty-eight (the speed round), 1: GBIF's gap follows its throttle. The owner's dry run of 11 November 2026 met
 * 3,663 429s from GBIF's occurrence search at a fixed 250 ms, each answered after 3 s retries: a first try met with a 429
 * now doubles the gap, and first tries answered ease it back, never below 250 ms. Only the timing changes.
 *
 * On r87 (7e37f38): 1 FAILED (no gapFor; the gap stayed 250 ms).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeFetcher, resetPacing, gapFor } from '$dossier/fetch';

const URL_ = 'https://api.gbif.org/v1/occurrence/search?taxonKey=1&limit=300';
const answer = (status: number) => new Response(status === 200 ? '{"results":[],"endOfRecords":true,"count":0}' : 'slow down', { status, headers: status === 429 ? { 'retry-after': '0' } : {} });

describe('r88s 1: GBIF\'s gap widens on a 429 and eases back as answers come', () => {
  beforeEach(() => { resetPacing(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); resetPacing(); });
  const ask = async (f: ReturnType<typeof makeFetcher>) => { const p = f(URL_); await vi.runAllTimersAsync(); return p; };

  it('a 429 on the first try doubles the gap (500 ms at least), and the retry is answered', async () => {
    const seq = [429, 200];
    const f = makeFetcher((async () => answer(seq.shift() ?? 200)) as typeof fetch);
    expect(gapFor('api.gbif.org')).toBe(250);
    const r = await ask(f);
    expect(r.status).toBe('ok');
    expect(gapFor('api.gbif.org')).toBe(500);
  });
  it('twenty answers in a row take a fifth off, back to 250 ms and no lower', async () => {
    const seq = [429, 200];
    const f = makeFetcher((async () => answer(seq.shift() ?? 200)) as typeof fetch);
    await ask(f);
    const gaps: number[] = [];
    for (let i = 0; i < 100; i++) { await ask(f); if ((i + 1) % 20 === 0) gaps.push(gapFor('api.gbif.org')); }
    expect(gaps).toEqual([400, 320, 256, 250, 250]);
  });
  it('the gap stops at 4 s however many requests meet a 429 first', async () => {
    const seq = [429, 200, 429, 200, 429, 200, 429, 200, 429, 200];
    const f = makeFetcher((async () => answer(seq.shift() ?? 200)) as typeof fetch);
    const gaps: number[] = [];
    for (let i = 0; i < 5; i++) { expect((await ask(f)).status).toBe('ok'); gaps.push(gapFor('api.gbif.org')); }
    expect(gaps).toEqual([500, 1000, 2000, 4000, 4000]);
  });
  it('another host keeps its own fixed gap', async () => {
    const f = makeFetcher((async () => answer(429)) as typeof fetch);
    const p = f('https://www.ipni.org/api/1/id/1'); await vi.runAllTimersAsync(); await p;
    expect(gapFor('www.ipni.org')).toBe(1100);
  });
});

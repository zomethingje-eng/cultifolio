/**
 * Round seventy-two (the owner's process change 5; reviewer D's trial): the day's upstream answers kept, so a rerun the
 * same day does not ask again (`day-cache.ts`). An answer and a settled absence are kept by the exact URL; a refusal, a
 * failure and a MediaWiki error in an HTTP 200 never are, so what did not answer is asked again and said not checked.
 * FAILED on r72base (no such module).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dayCached, type DayStore } from '$dossier/day-cache';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';

function world(answers: Record<string, FetchResult<unknown>>) {
  const asked: string[] = [];
  const f = (async (url: string) => { asked.push(url); return answers[url] ?? { status: 'refused', detail: 'no answer' }; }) as unknown as JsonFetcher;
  const kept = new Map<string, string>();
  const store: DayStore = { get: (k) => kept.get(k) ?? null, set: (k, v) => { kept.set(k, v); } };
  return { asked, f, kept, store };
}
const key = (u: string) => u; // a test's key: the URL itself

describe('the day\'s answers', () => {
  it('an answer and a 404 are asked once a day; a refusal and a failure every time', async () => {
    const w = world({ 'https://api.gbif.org/v1/species/1': { status: 'ok', data: { key: 1 } }, 'https://api.gbif.org/v1/species/2': { status: 'none' }, 'https://api.gbif.org/v1/species/3': { status: 'error', detail: 'api.gbif.org timeout' } });
    const f = dayCached(w.f, w.store, key);
    for (let i = 0; i < 2; i++) {
      expect(await f('https://api.gbif.org/v1/species/1')).toEqual({ status: 'ok', data: { key: 1 } });
      expect(await f('https://api.gbif.org/v1/species/2')).toEqual({ status: 'none' });
      expect(await f('https://api.gbif.org/v1/species/3')).toEqual({ status: 'error', detail: 'api.gbif.org timeout' });
      expect(await f('https://api.gbif.org/v1/species/4')).toEqual({ status: 'refused', detail: 'no answer' });
    }
    expect(w.asked).toEqual(['https://api.gbif.org/v1/species/1', 'https://api.gbif.org/v1/species/2', 'https://api.gbif.org/v1/species/3', 'https://api.gbif.org/v1/species/4', 'https://api.gbif.org/v1/species/3', 'https://api.gbif.org/v1/species/4']);
    expect(f.hits()).toBe(2);
  });
  it('a MediaWiki error answered with HTTP 200 (a lag, a rate limit) is never kept', async () => {
    const u = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=File:A.jpg&maxlag=5';
    const w = world({ [u]: { status: 'ok', data: { error: { code: 'maxlag', info: 'Waiting for 10.64.16.149: 6 seconds lagged.' } } } });
    const f = dayCached(w.f, w.store, key);
    await f(u);
    await f(u);
    expect(w.asked).toHaveLength(2);
    expect(w.kept.size).toBe(0);
  });
  it('an answer kept under another URL\'s key is not served for it', async () => {
    const w = world({ a: { status: 'ok', data: 'A' }, b: { status: 'ok', data: 'B' } });
    const f = dayCached(w.f, w.store, () => 'same');
    expect(await f('a')).toEqual({ status: 'ok', data: 'A' });
    expect(await f('b')).toEqual({ status: 'ok', data: 'B' });
    expect(w.asked).toEqual(['a', 'b']);
  });
  it('the corpus script keeps them by the day, outside static/, and --no-cache asks everything', () => {
    const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
    expect(src).toMatch(/const CACHE_ROOT = 'cache\/upstream';/);
    expect(src).toMatch(/if \(d !== day\) rmSync\(/);
    expect(src).toMatch(/if \(process\.argv\.includes\('--no-cache'\)\) return f;/);
    // Every upstream a fill or a build asks goes through it; NASA POWER keeps its own cache of cells.
    expect(src.match(/makeFetcher\(\)/g)).toHaveLength(2); // the climate provider's, and the one inside upstream()
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\/cache\/$/m);
  });
});

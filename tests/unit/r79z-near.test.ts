import { describe, it, expect, vi, afterEach } from 'vitest';
import { climateDistance, nearestByClimate, type MonthLike } from '$core/near';

// Round seventy-nine (Z): the nearest climates at the full list's size. The lists are the same as a pair-by-pair
// climateDistance gives (ties in the same order), and the rain's logarithm is taken once a species, not twice a pair.

/** The rule as it was before this round: climateDistance for every pair, admitted in order. */
function pairByPair<K>(items: Array<{ key: K; months: MonthLike[] }>, n = 6): Map<K, K[]> {
  const best = items.map(() => [] as Array<[number, K]>);
  const admit = (i: number, d: number, key: K) => {
    const arr = best[i];
    if (arr.length >= n && d >= arr[n - 1][0]) return;
    let j = arr.length;
    while (j > 0 && arr[j - 1][0] > d) j--;
    arr.splice(j, 0, [d, key]);
    if (arr.length > n) arr.length = n;
  };
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const d = climateDistance(items[i].months, items[j].months); admit(i, d, items[j].key); admit(j, d, items[i].key); }
  return new Map(items.map((it, i) => [it.key, best[i].map((x) => x[1])]));
}

let seed = 79;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const climate = (): MonthLike[] => { const t = Math.round(rnd() * 300) / 10, r = Math.round(rnd() * 2000) / 10; return Array.from({ length: 12 }, (_, m) => ({ tmax: Math.round((t + 6 * Math.cos(m / 2)) * 10) / 10, tmin: Math.round((t - 9 + 5 * Math.cos(m / 2)) * 10) / 10, precipMm: m % 5 === 0 ? 0 : Math.round(r * (1 + Math.sin(m)) * 10) / 10 })); };

afterEach(() => vi.restoreAllMocks());

describe('nearest climates at full size (round seventy-nine)', () => {
  it('gives the lists climateDistance gives pair by pair, ties included', () => {
    const items = Array.from({ length: 400 }, (_, i) => ({ key: `k${i + 1}`, months: climate() }));
    // Ties: copies of one climate, which keep the order the items come in.
    for (let i = 0; i < 20; i++) items.push({ key: `k${1000 + i}`, months: items[i % 3].months.map((m) => ({ ...m })) });
    expect(nearestByClimate(items)).toEqual(pairByPair(items));
    expect(nearestByClimate(items, 2)).toEqual(pairByPair(items, 2));
  });

  it('takes each rain logarithm once a species, not twice a pair', () => {
    const items = Array.from({ length: 200 }, (_, i) => ({ key: i, months: climate() }));
    const log = vi.spyOn(Math, 'log1p');
    nearestByClimate(items);
    // 200 species, 12 months: 2,400. Pair by pair it was 24 a pair, 477,600.
    expect(log.mock.calls.length).toBeLessThanOrEqual(200 * 12);
  });
});

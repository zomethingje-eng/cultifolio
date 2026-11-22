/**
 * Round 105 (docs/PLAN-105.md; the first hand-off's round 3): a browse view's default order puts the species with a
 * habitat climate first, most grown within each part, then the alphabet ('grownc'); "most grown" alone is still an order
 * (`sort=grown`), and the default is the bare address.
 *
 * On a78a3d0 (round 104's engine put back in place): FAILED, all four. The default was most grown alone, so a species
 * marked "no habitat climate" with the most cultivated observations (Hibiscus rosa-sinensis on cultifolio.com's /browse)
 * was the first tile; the address wrote `sort=` for no order but "most grown", and `sortOf` knew no 'grownc'.
 */
import { describe, it, expect } from 'vitest';
import { browseTableOf } from '$lib/browse/table';
import { prepared, runQuery, parseQuery, queryString, sortOf, EMPTY } from '$lib/browse/engine';

type E = { key: string; slug: string; name: string; family?: string; origin: string[]; climate: string; grown?: number };
const e = (key: string, name: string, climate: string, grown?: number): E => ({ key, slug: name.toLowerCase().replace(/ /g, '-'), name, family: 'Malvaceae', origin: ['China Southeast'], climate, ...(grown === undefined ? {} : { grown }) });
const INDEX: E[] = [
  e('k1', 'Hibiscus rosa-sinensis', 'none', 900),
  e('k2', 'Hibiscus syriacus', 'ok', 40),
  e('k3', 'Hibiscus mutabilis', 'ok', 200),
  e('k4', 'Hibiscus trionum', 'pending', 500),
  e('k5', 'Hibiscus acetosella', 'ok'),
  e('k6', 'Hibiscus tiliaceus', 'ok', 40)
];
const names = (p: ReturnType<typeof prepared>, sort: typeof EMPTY.sort) => runQuery(p, { ...EMPTY, sort }).rows.map((i) => p.t.name[i]);

describe('r105a 1: the default order, habitat climate first', () => {
  const p = prepared(browseTableOf(INDEX as never));
  it('puts every species with a habitat climate first, most grown among them, then the rest by most grown', () => {
    expect(names(p, 'grownc')).toEqual(['Hibiscus mutabilis', 'Hibiscus syriacus', 'Hibiscus tiliaceus', 'Hibiscus acetosella', 'Hibiscus rosa-sinensis', 'Hibiscus trionum']);
  });
  it('is the order of an address with no sort, and writes none', () => {
    expect(EMPTY.sort).toBe('grownc');
    expect(parseQuery(new URLSearchParams('')).sort).toBe('grownc');
    expect(parseQuery(new URLSearchParams('sort=nonsense')).sort).toBe('grownc');
    expect(queryString({ ...EMPTY })).toBe('');
    expect(names(p, parseQuery(new URLSearchParams('')).sort)[0]).toBe('Hibiscus mutabilis');
  });
});

describe('r105a 2: most grown alone is still an order', () => {
  const p = prepared(browseTableOf(INDEX as never));
  it('ignores the habitat climate, and keeps its address', () => {
    expect(names(p, 'grown')).toEqual(['Hibiscus rosa-sinensis', 'Hibiscus trionum', 'Hibiscus mutabilis', 'Hibiscus syriacus', 'Hibiscus tiliaceus', 'Hibiscus acetosella']);
    expect(parseQuery(new URLSearchParams('sort=grown')).sort).toBe('grown');
    expect(queryString({ ...EMPTY, sort: 'grown' })).toBe('?sort=grown');
    expect(queryString({ ...EMPTY, sort: 'az' })).toBe('?sort=az');
  });
});

describe('r105a 3: where nothing is counted as grown', () => {
  const p = prepared(browseTableOf(INDEX.map(({ grown: _, ...x }) => x) as never));
  it('both "most grown" orders are the alphabet, as most grown was', () => {
    expect(sortOf(p, 'grownc')).toBe('az');
    expect(sortOf(p, 'grown')).toBe('az');
    expect(names(p, 'grownc')).toEqual([...INDEX.map((x) => x.name)].sort());
  });
});

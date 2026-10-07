/**
 * Round sixty-one, agent A: spending per currency (the grower review, 12), one rule for "no photograph in twelve months"
 * shared by Today's line and the plants list's chip (the grower review, 11), and the toast that waits for a reader on it,
 * but not for good (the accessibility review, 1).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { spendOf, spendWords, amountWords } from '$lib/ui/grow/spend';
import { photoDue, photoDueDays } from '$lib/ui/photo-due';
import { toast, HOLD_MAX_MS } from '$lib/ui/toast.svelte';

describe('spending, per currency', () => {
  it('gives a total for each currency, the prices with none named apart, instead of no total at all', () => {
    const prices = [...Array(180).fill('£12'), '€15', '€30', ...Array(12).fill('10'), 'a swap', 'gift', '?'];
    const s = spendOf(prices);
    expect(s.parts).toEqual([{ cur: '£', total: 2160, counted: 180 }, { cur: '€', total: 45, counted: 2 }, { cur: null, total: 120, counted: 12 }]);
    expect(s.skipped).toBe(3);
    expect(amountWords(s)).toBe('£2,160 on 180 plants, €45 on 2 plants and 120 on 12 plants with no currency given');
  });
  it('says one currency, or prices with none named, as before', () => {
    expect(amountWords(spendOf(['£5', '£10']))).toBe('£15 on 2 plants');
    expect(amountWords(spendOf(['5', '10.5']))).toBe('15.50 on 2 plants');
    expect(spendOf(['6 EUR', '€4']).parts.map((p) => p.cur).sort()).toEqual(['EUR', '€'].sort()); // as written: no currency is merged or converted
    expect(amountWords(spendOf(['a swap']))).toBe('nothing counted');
  });
  it('orders the parts by the number of plants, never by the order they were entered', () => {
    expect(spendOf(['€1', '£1', '£2']).parts.map((p) => p.cur)).toEqual(['£', '€']);
    expect(spendOf(['£1', '€1']).parts.map((p) => p.cur)).toEqual(spendOf(['€1', '£1']).parts.map((p) => p.cur));
  });
  it('a single € plant among the £ ones no longer hides the year', () => {
    const w = spendWords(spendOf(['£5', '€3']), spendOf(['£5', '€3', '£7']), '2026');
    expect(w).toEqual({ year: '£5 on 1 plant and €3 on 1 plant (2026)', all: '£12 on 2 plants and €3 on 1 plant', left: '' });
  });
});

describe('no photograph in twelve months: one rule for Today and the list', () => {
  const days = photoDueDays(new Date(2026, 9, 6, 12));
  const src = (photos: Record<string, string[]>, made: Record<string, string>) => ({ photos: (id: string) => (photos[id] ?? []).map((d) => ({ d })), madeOn: (_k: 'accession', id: string) => made[id] ?? null });
  it('counts a growing plant had six months or more with no photograph dated in the last year', () => {
    expect(days).toEqual({ yearAgo: '2025-10-06', halfYearAgo: '2026-04-06' });
    const c = src({ b: ['2026-01-01'], d: ['2025-06-01'] }, { a: '2026-09-01' });
    expect(photoDue({ id: 'a', status: 'growing', acquired: '2015-03-01' }, c, days)).toBe(true); // had since 2015, never photographed
    expect(photoDue({ id: 'a', status: 'growing', acquired: null }, c, days)).toBe(false); // recorded last month, nothing acquired: not yet
    expect(photoDue({ id: 'b', status: 'growing', acquired: '2015-03-01' }, c, days)).toBe(false); // photographed this year
    expect(photoDue({ id: 'd', status: 'growing', acquired: '2015-03-01' }, c, days)).toBe(true); // last photographed sixteen months ago
    expect(photoDue({ id: 'e', status: 'archived', acquired: '2015-03-01' }, c, days)).toBe(false);
  });
});

describe('the toast waits for a reader on it, but not for good', () => {
  afterEach(() => { toast.hide(); vi.useRealTimers(); });
  it('goes HOLD_MAX_MS after focus or the pointer came to rest on it', () => {
    vi.useFakeTimers();
    toast.show('2 watered.', 8000, { label: 'Undo', run: () => {} });
    toast.hold();
    vi.advanceTimersByTime(HOLD_MAX_MS - 100);
    expect(toast.text).toBe('2 watered.');
    vi.advanceTimersByTime(200);
    expect(toast.text).toBeNull();
  });
  it('a release ends the cap: the rest of the timer, at least two seconds, then it goes', () => {
    vi.useFakeTimers();
    toast.show('2 watered.', 8000, { label: 'Undo', run: () => {} });
    toast.hold();
    vi.advanceTimersByTime(5000);
    toast.release();
    vi.advanceTimersByTime(7900);
    expect(toast.text).toBe('2 watered.');
    vi.advanceTimersByTime(200);
    expect(toast.text).toBeNull();
  });
  it('a new toast forgets the old way back', () => {
    toast.show('one');
    toast.entry = {} as HTMLElement;
    toast.show('two');
    expect(toast.entry).toBeNull();
    expect(toast.wayBack()).toBeNull();
  });
});

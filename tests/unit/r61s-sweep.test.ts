/**
 * Round sixty-one, agent S (decision 6, smaller fixes): the counter object's midnight sweep reads its keys a page at a
 * time and goes on from where it stopped, so an object grown past what one listing can hold is still swept (the server
 * review, 8); and a place written before this round (no last-upload day) starts its 90 days at the sweep.
 */
import { describe, it, expect } from 'vitest';
import { Counters, SWEEP_PAGE, SWEEP_PAGES, nextMidnight, RECLAIM_DAYS } from '$lib/server/counters';
import { pagedStorage } from './helpers/r61s-fake';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 10); // a midnight
const OLD = '2026-10-01';

describe('the paged sweep', () => {
  it('never lists more than a page at once, stops at its budget, re-arms within seconds and finishes from where it stopped', async () => {
    const storage = pagedStorage();
    const c = new Counters({ storage } as never, {} as never);
    const stale = SWEEP_PAGE * SWEEP_PAGES + 2_500; // past one run's budget
    for (let i = 0; i < stale; i++) storage.m.set(`c:vault/X/photo/p${String(i).padStart(7, '0')}.bin`, { at: 1, day: OLD });
    for (let i = 0; i < 10; i++) storage.m.set(`c:vault/Y/photo/p${i}.bin`, { at: NOW, day: '2026-10-10' });
    await c.tick(NOW);
    expect(storage.lists.every((o) => o.limit != null && o.limit <= SWEEP_PAGE)).toBe(true);
    const left = [...storage.m.keys()].filter((k) => k.startsWith('c:vault/X/')).length;
    expect(left).toBeGreaterThan(0); // stopped short at its budget
    expect(storage.alarmAt()).toBeLessThanOrEqual(NOW + 5_000); // and runs again in a moment, not at the next midnight
    storage.fired();
    await c.tick(NOW + 1_000);
    expect([...storage.m.keys()].filter((k) => k.startsWith('c:vault/X/'))).toEqual([]);
    expect([...storage.m.keys()].filter((k) => k.startsWith('c:vault/Y/'))).toHaveLength(10);
    expect([...storage.m.keys()].filter((k) => k.startsWith('s:'))).toEqual([]); // no cursor left once done
    expect(storage.alarmAt()).toBe(nextMidnight(NOW + 1_000)); // fresh claims remain: the next midnight
  });

  it('a place from before (the counted day alone) starts its 90 days at the sweep, then is reclaimed', async () => {
    const storage = pagedStorage();
    const c = new Counters({ storage } as never, {} as never);
    storage.m.set('all', 2);
    storage.m.set('f:OLDSTRING', '2026-01-01');
    storage.m.set('f:OLDONE', 1);
    await c.sweep(NOW);
    expect([storage.m.get('all'), (storage.m.get('f:OLDSTRING') as { w: string }).w, (storage.m.get('f:OLDONE') as { w: string }).w]).toEqual([2, '2026-10-10', '2026-10-10']);
    await c.sweep(NOW + (RECLAIM_DAYS + 1) * DAY);
    expect([storage.m.get('all'), storage.m.has('f:OLDSTRING'), storage.m.has('f:OLDONE')]).toEqual([0, false, false]);
  });

  it('unfill reads every form of a place: the day it was counted is given back', async () => {
    const storage = pagedStorage();
    const c = new Counters({ storage } as never, {} as never);
    expect(await c.fill('V', 10, 0, '2026-10-10', 10, NOW)).toBe('counted');
    expect(storage.m.get('f:V')).toEqual({ d: '2026-10-10', w: '2026-10-10' });
    expect(await c.unfill('V')).toBe(true);
    expect([storage.m.get('all'), storage.m.get('day:2026-10-10')]).toEqual([0, 0]);
    storage.m.set('f:W', '2026-10-09'); storage.m.set('day:2026-10-09', 3); storage.m.set('all', 4);
    expect(await c.unfill('W')).toBe(true);
    expect([storage.m.get('all'), storage.m.get('day:2026-10-09')]).toEqual([3, 2]);
  });
});

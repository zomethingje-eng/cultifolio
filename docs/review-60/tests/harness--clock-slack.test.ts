/**
 * Harness review of round sixty: the five minutes of slack in `trustedAge` (src/lib/core/hlc.ts) and the stored
 * correction's own age check had no unit test at their edges.
 *   - Narrowing the slack to one minute (`age > -1 * 60_000`) passed every unit test; only an end-to-end test, by its
 *     timing, needed more than a minute (REVIEW-ROUND-60 1.3).
 *   - The stored correction read at load (`readStored`) is judged by the same rule; in Node there is no localStorage, so
 *     only a test that installs one reaches that path.
 * PASSES on the round-sixty code; FAILS under `age > -1 * 60_000` (first test) and under readStored accepting a
 * confirmation dated after the clock (second test). Run: copy to tests/unit/ and `npx vitest run tests/unit/harness--clock-slack.test.ts`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ls = new Map<string, string>();
const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  ls.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => void ls.set(k, v), removeItem: (k: string) => void ls.delete(k) } });
});
afterEach(() => {
  vi.useRealTimers();
  if (had) Object.defineProperty(globalThis, 'localStorage', had); else delete (globalThis as { localStorage?: unknown }).localStorage;
});
async function hlc() {
  vi.resetModules();
  return import('$core/hlc');
}

describe('a server reading dated after the clock (harness review)', () => {
  it('confirms the clock within five minutes of slack, and not past it', async () => {
    const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    const h = await hlc();
    h._resetClockOffset();
    h.trustServerTime(T0, T0);
    expect(h.clockChecked()).toBe(true);
    vi.setSystemTime(T0 - 2 * 60_000); // a time sync nudged the clock back two minutes
    expect(h.clockChecked()).toBe(true);
    vi.setSystemTime(T0 - 4 * 60_000 - 59_000);
    expect(h.clockChecked()).toBe(true);
    vi.setSystemTime(T0 - 5 * 60_000 - 1000); // set back past the slack: the reading confirms a clock no longer in force
    expect(h.clockChecked()).toBe(false);
    vi.setSystemTime(T0 - 3 * 86_400_000);
    expect(h.clockChecked()).toBe(false);
  });

  it('a stored correction confirmed "in the future" (the clock was set back since) is dropped at load, not used', async () => {
    const T0 = Date.UTC(2026, 9, 5, 12, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
    ls.set('cultifolio.clockOffsetMs', JSON.stringify({ offset: 3 * 3_600_000, confirmedAt: T0 + 3 * 86_400_000 }));
    const h = await hlc();
    expect(h.clockChecked()).toBe(false);
    expect(h.nowMs() - Date.now()).toBe(0); // no correction stamped by
    expect(ls.has('cultifolio.clockOffsetMs')).toBe(false);
    // the same correction confirmed a minute ago is kept
    ls.set('cultifolio.clockOffsetMs', JSON.stringify({ offset: 3 * 3_600_000, confirmedAt: T0 - 60_000 }));
    const h2 = await hlc();
    expect(h2.clockChecked()).toBe(true);
    expect(h2.nowMs() - Date.now()).toBe(3 * 3_600_000);
  });
});

/**
 * Round eighty-six, the final review's U1: the species page draws every map and asks for every photograph once the lead
 * photograph has come and the browser is idle (`idleAfterLead`), so a print taken with no scroll holds them; Chromium's
 * print waits for neither a file asked for in `beforeprint` (tests/e2e/r86m-maps.spec.ts 2 reads the print itself).
 *
 * 1. Nothing while the lead is on its way, nor before the browser is idle; once both, `go` runs once.
 * 2. A lead that fails lets it go too; one that never comes, after 15 s; none, or one already finished, at the next idle.
 * 3. The undo stops it at any point.
 *
 * On the final review's base (bac6183): FAILED (no `idleAfterLead`; the maps waited for a scroll or `beforeprint`).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { idleAfterLead } from '../../src/lib/ui/ref/after-lead';

/** A window whose idle callbacks run when `idle()` is called; its timers are vitest's. */
function fakeWin() {
  const waiting = new Map<number, () => void>();
  let n = 0;
  const win = {
    requestIdleCallback: (f: () => void) => { waiting.set(++n, f); return n; },
    cancelIdleCallback: (id: number) => { waiting.delete(id); },
    setTimeout, clearTimeout
  } as unknown as Window & typeof globalThis;
  const idle = () => { const fs = [...waiting.values()]; waiting.clear(); for (const f of fs) f(); };
  return { win, idle, waiting: () => waiting.size };
}
/** A lead photograph: an event target with `complete`. */
const leadOf = (complete = false) => Object.assign(new EventTarget(), { complete }) as unknown as HTMLImageElement;

describe('idleAfterLead', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('1. nothing while the lead is on its way, nor before idle; then once', () => {
    const { win, idle, waiting } = fakeWin();
    const lead = leadOf();
    const go = vi.fn();
    idleAfterLead(lead, go, 15_000, win);
    vi.advanceTimersByTime(14_000);
    idle();
    expect(go).not.toHaveBeenCalled();
    expect(waiting()).toBe(0);
    lead.dispatchEvent(new Event('load'));
    expect(go).not.toHaveBeenCalled();
    expect(waiting()).toBe(1);
    idle();
    expect(go).toHaveBeenCalledTimes(1);
    lead.dispatchEvent(new Event('load'));
    vi.advanceTimersByTime(20_000);
    idle();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it('2. a failed lead, a lead that never comes (15 s), no lead, a finished lead', () => {
    const { win, idle } = fakeWin();
    const failed = leadOf(), stalled = leadOf();
    const go = { failed: vi.fn(), stalled: vi.fn(), none: vi.fn(), done: vi.fn() };
    idleAfterLead(failed, go.failed, 15_000, win);
    idleAfterLead(stalled, go.stalled, 15_000, win);
    idleAfterLead(null, go.none, 15_000, win);
    idleAfterLead(leadOf(true), go.done, 15_000, win);
    failed.dispatchEvent(new Event('error'));
    idle();
    expect([go.failed, go.stalled, go.none, go.done].map((f) => f.mock.calls.length)).toEqual([1, 0, 1, 1]);
    vi.advanceTimersByTime(14_999);
    idle();
    expect(go.stalled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    idle();
    expect(go.stalled).toHaveBeenCalledTimes(1);
  });

  it('3. the undo, before the lead and between the lead and idle', () => {
    const { win, idle } = fakeWin();
    const a = leadOf(), b = leadOf();
    const goA = vi.fn(), goB = vi.fn();
    idleAfterLead(a, goA, 15_000, win)();
    const undoB = idleAfterLead(b, goB, 15_000, win);
    a.dispatchEvent(new Event('load'));
    b.dispatchEvent(new Event('load'));
    undoB();
    idle();
    vi.advanceTimersByTime(20_000);
    idle();
    expect(goA).not.toHaveBeenCalled();
    expect(goB).not.toHaveBeenCalled();
  });

  it('without requestIdleCallback, a short timer after the lead', () => {
    const go = vi.fn();
    const lead = leadOf();
    idleAfterLead(lead, go, 15_000, { setTimeout, clearTimeout } as unknown as Window & typeof globalThis);
    lead.dispatchEvent(new Event('load'));
    expect(go).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(go).toHaveBeenCalledTimes(1);
  });
});

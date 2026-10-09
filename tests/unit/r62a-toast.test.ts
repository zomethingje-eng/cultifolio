/**
 * Round sixty-two, agent A: the toast (the outside review's A38; the accessibility review, 7 and 9). A sentence said again
 * is announced again (the live region empties, then says it a frame later); a new toast clears the earlier one's cap, so
 * that cap cannot cut it short; a toast raised while focus is inside it is held at once; and the cap is the pointer's
 * only: focus resting on Undo holds the toast for as long as it stays.
 *
 * Reproductions (fail on the base): all but the guards marked so.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { toast, HOLD_MAX_MS } from '$lib/ui/toast.svelte';

const g = globalThis as unknown as Record<string, unknown>;
afterEach(() => { toast.hide(); vi.useRealTimers(); delete g.document; delete g.Element; delete g.HTMLElement; });

describe('the toast, round sixty-two', () => {
  it('a sentence said again empties the live region for a frame, then says it again', () => {
    vi.useFakeTimers();
    toast.show('Already recorded as watered today.');
    expect(toast.said).toBe('Already recorded as watered today.');
    toast.show('Already recorded as watered today.');
    expect(toast.said).toBe(''); // emptied: the next words are a change a screen reader hears
    expect(toast.text).toBe('Already recorded as watered today.'); // the toast itself stays up meanwhile
    vi.advanceTimersByTime(20);
    expect(toast.said).toBe('Already recorded as watered today.');
  });
  it('another sentence is said at once', () => {
    toast.show('one');
    toast.show('two');
    expect(toast.said).toBe('two');
  });
  it('a new toast clears the earlier one\'s cap: it lasts its own time', () => {
    vi.useFakeTimers();
    toast.show('2 watered.', 8000, { label: 'Undo', run: () => {} });
    toast.hold('pointer'); // the cap starts: 30 s
    vi.advanceTimersByTime(HOLD_MAX_MS - 5000);
    toast.show('2 moved to Bench 3.', 8000, { label: 'Undo', run: () => {} }); // raised while the first is still held
    vi.advanceTimersByTime(6000); // past where the first toast's cap would have ended
    expect(toast.text).toBe('2 moved to Bench 3.');
    vi.advanceTimersByTime(2100);
    expect(toast.text).toBeNull();
  });
  it('a toast raised while focus is inside the toast is held at once', () => {
    vi.useFakeTimers();
    class El { closest(sel: string) { return sel === '.toastregion' ? this : null; } }
    g.Element = El; g.HTMLElement = El;
    const undo = new El();
    g.document = { activeElement: undo, body: {}, querySelector: () => null, getElementById: () => null };
    toast.show('Undone: back where they were.', 2400);
    expect(toast.held).toBe(true);
    vi.advanceTimersByTime(60_000);
    expect(toast.text).toBe('Undone: back where they were.');
  });
  it('focus holds the toast for as long as it stays; the cap is the pointer\'s alone', () => {
    vi.useFakeTimers();
    toast.show('2 watered.', 8000, { label: 'Undo', run: () => {} });
    toast.hold('focus');
    vi.advanceTimersByTime(HOLD_MAX_MS * 3);
    expect(toast.text).toBe('2 watered.');
    toast.hold('pointer'); // focus and the pointer: still no cap
    vi.advanceTimersByTime(HOLD_MAX_MS * 2);
    expect(toast.text).toBe('2 watered.');
    toast.release('focus'); // the pointer alone now: the cap runs from here
    vi.advanceTimersByTime(HOLD_MAX_MS - 100);
    expect(toast.text).toBe('2 watered.');
    vi.advanceTimersByTime(200);
    expect(toast.text).toBeNull();
  });
  it('the pointer alone is capped, as before (guard)', () => {
    vi.useFakeTimers();
    toast.show('2 watered.', 8000, { label: 'Undo', run: () => {} });
    toast.hold();
    vi.advanceTimersByTime(HOLD_MAX_MS + 100);
    expect(toast.text).toBeNull();
  });
  it('focus leaving gives back what was left, at least two seconds, however long it stayed', () => {
    vi.useFakeTimers();
    toast.show('2 watered.', 8000, { label: 'Undo', run: () => {} });
    vi.advanceTimersByTime(7000);
    toast.hold('focus');
    vi.advanceTimersByTime(50_000);
    toast.release('focus');
    vi.advanceTimersByTime(1900);
    expect(toast.text).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(toast.text).toBeNull();
  });
});

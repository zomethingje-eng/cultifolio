/**
 * Harness review of round sixty-one, mutation A2: a toast raised with focus nowhere (no `origin`) takes its way back from
 * where focus entered it (`entry`, set by ToastBar's focusin), so Tab past its last button and "Back to where you were"
 * return there (`wayBack`, src/lib/ui/toast.svelte.ts). Removing the `entry` branch passed every unit test
 * (r61a-spend-photo-toast checks only that a new toast forgets it), and the e2e r61a 1b passes too, since with no way
 * back Tab simply goes on through the page; nothing checks that the way back, when there is one, is the entry.
 *
 * PASSES on f4ab4f8 (a guard; it fails under the mutation). Adopted in round sixty-two (agent H; triage decision 10) from docs/review-61/tests/harness--toast-wayback.test.ts.
 */
import { it, expect, afterEach } from 'vitest';
import { toast } from '$lib/ui/toast.svelte';

afterEach(() => toast.hide());

it('with no origin, the way back is where focus entered the toast, while that is still on the page; the origin comes first', () => {
  toast.show('2 watered.', 8000, { label: 'Undo', run: () => {} });
  expect(toast.origin).toBeNull(); // no document here: raised with focus nowhere
  const entry = { isConnected: true } as unknown as HTMLElement;
  toast.entry = entry;
  expect(toast.wayBack()).toBe(entry);
  const origin = { isConnected: true } as unknown as HTMLElement;
  toast.origin = origin;
  expect(toast.wayBack()).toBe(origin);
  (origin as unknown as { isConnected: boolean }).isConnected = false;
  expect(toast.wayBack()).toBe(entry);
  (entry as unknown as { isConnected: boolean }).isConnected = false;
  expect(toast.wayBack()).toBeNull();
});

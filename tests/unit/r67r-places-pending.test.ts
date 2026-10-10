/**
 * Round sixty-seven, triage-66 R12 (IND-5, the self-review's E12 and E14, the outside review's 18): a form settles only
 * its own place picker, and a place that cannot be made rejects to the form that waits for it. The first case failed on
 * the round-sixty-six base: every open picker was settled (and `holdPlacePicker` took no id).
 */
import { describe, it, expect } from 'vitest';
import { holdPlacePicker, settlePlaces } from '$lib/ui/places-pending';

describe('settlePlaces (R12)', () => {
  it('base: Move settles the Move panel\'s picker, not the Edit form\'s', async () => {
    const made: string[] = [];
    const offEd = holdPlacePicker('ed-loc', async () => void made.push('Unsaved edit shelf'));
    const offMv = holdPlacePicker('mv-loc', async () => void made.push('Move destination'));
    await settlePlaces('mv-loc');
    expect(made).toEqual(['Move destination']);
    offEd(); offMv();
  });
  it('a place that cannot be made rejects to the form, which can stop', async () => {
    const off = holdPlacePicker('mv-loc', async () => { throw new Error('The place it was to go inside is no longer here'); });
    await expect(settlePlaces('mv-loc')).rejects.toThrow(/no longer here/);
    off();
  });
  it('a picker that closed is not settled; with no id, a page with one picker settles it', async () => {
    const made: string[] = [];
    const off = holdPlacePicker('p-loc', async () => void made.push('x'));
    off();
    await settlePlaces('p-loc');
    expect(made).toEqual([]);
    const off2 = holdPlacePicker('imp-loc', async () => void made.push('y'));
    await settlePlaces();
    expect(made).toEqual(['y']);
    off2();
  });
});

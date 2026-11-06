/**
 * Round eighty-six (outside review B's sync journey): a backup replaced the collection, turning sync off, and the sync
 * page reopened on the new-key form with a key made before the replace, saying nothing of the replace. A key made before
 * the replace is now dropped and the page explains; a key made after it, or with no replace, comes back as before
 * (round forty-nine, 3).
 *
 * On r86base: the kept key was a bare string with no moment, so "a key made before the replace" FAILED (it came back).
 */
import { describe, expect, it } from 'vitest';
import { keepFresh, resumeFresh } from '$lib/sync/fresh-key';

const replacedAt = '2026-11-05T12:00:00Z';
const was = { vaultId: 'v1', at: replacedAt, why: 'replaced' as const };

describe('the kept new-vault key', () => {
  it('made before the replace: not shown again', () => {
    expect(resumeFresh(keepFresh('AAAAA-BBBBB', Date.parse(replacedAt) - 60_000), was)).toBeNull();
  });
  it('made after the replace (the grower pressed "Set up a new vault for the restored collection", then reloaded): shown again', () => {
    expect(resumeFresh(keepFresh('AAAAA-BBBBB', Date.parse(replacedAt) + 60_000), was)).toBe('AAAAA-BBBBB');
  });
  it('no replace since: shown again, as round forty-nine made it', () => {
    expect(resumeFresh(keepFresh('AAAAA-BBBBB'), null)).toBe('AAAAA-BBBBB');
    expect(resumeFresh(keepFresh('AAAAA-BBBBB'), { vaultId: 'v1', at: replacedAt, why: 'stopped' })).toBe('AAAAA-BBBBB');
  });
  it("an earlier version's bare key: kept unless a replace came since", () => {
    expect(resumeFresh('AAAAA-BBBBB', null)).toBe('AAAAA-BBBBB');
    expect(resumeFresh('AAAAA-BBBBB', was)).toBeNull();
  });
  it('nothing kept: nothing', () => expect(resumeFresh(null, was)).toBeNull());
});

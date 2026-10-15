/**
 * Round seventy-one, agent E (self-review E6): the sync page's refusal notice said "Your changes are kept here meanwhile"
 * of every refusal, straight after the server's own sentence for the vault's hour of photographs ("…changes to your
 * records still go"), and of the day's upload allowance, under which a record's small bundles still go. Now what is kept
 * is said by the refusal's kind. FAILED on the base: `refusalKept` and `checkAgainWords` did not exist, and the page's
 * sentence was fixed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as words from '$lib/ui/sync-words';

describe('E6: what the refusal notice says is kept', () => {
  it('the hour of photographs: photographs kept, records still go', () => {
    const t = words.refusalKept({ photos: true });
    expect(t).toMatch(/^Photographs are kept here meanwhile; changes to your records still go/);
    expect(t).not.toMatch(/Your changes are kept/);
  });
  it('the day\'s allowance: photographs and bundles over 16 KB kept, smaller bundles still go', () => {
    expect(words.refusalKept({ day: true })).toMatch(/^Photographs, and sync bundles of changes over 16 KB, are kept here meanwhile; smaller bundles of changes still go/);
  });
  it('guard: any other refusal keeps every change here', () => {
    expect(words.refusalKept({})).toBe('Your changes are kept here meanwhile, and changes from your other devices still come in.');
  });
  it('the sync page says it through refusalKept, not a fixed sentence', () => {
    const page = readFileSync('src/routes/sync/+page.svelte', 'utf8');
    expect(page).toMatch(/\{refusalKept\(sync\.refusal\)\}/);
    expect(page).not.toMatch(/Your changes are kept here meanwhile, and changes from your other devices still come in\.<\/p>/);
  });
  it('E8: the status card says when a device that did not reach the server checks again', () => {
    const now = Date.UTC(2026, 9, 16, 12);
    expect(words.checkAgainWords(null, now)).toBe('again in a minute');
    expect(words.checkAgainWords(now + 60_000, now)).toBe('again in a minute');
    expect(words.checkAgainWords(now + 4 * 60_000, now)).toBe('again in about 4 minutes');
  });
});

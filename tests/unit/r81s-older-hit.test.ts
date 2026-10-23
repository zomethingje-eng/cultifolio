/**
 * Round eighty-one (S; review-w 5): a catalogue hit found by an older name says which. "Sansevieria trifasciata" listed
 * Dracaena trifasciata with nothing to say why, and "Lobivia" thirty species of four other genera. The front page shows
 * "older name: …" on the hit and opens its page with `?was=` (the species page says whose name it is, and checks it).
 *
 * FAILS on r81base: `olderNameOf` does not exist there.
 */
import { describe, it, expect } from 'vitest';
import { olderNameOf } from '$lib/ui/ref/searched';

const dracaena = { name: 'Dracaena trifasciata', family: 'Asparagaceae', common: 'Snake plant', commons: ["Mother-in-law's tongue"], origin: ['Nigeria'], syn: ['Sansevieria trifasciata', 'Sansevieria laurentii'] };
const echinopsis = { name: 'Echinopsis arachnacantha', family: 'Cactaceae', origin: ['Bolivia'], syn: ['Echinopsis ancistrophora subsp. arachnacantha'], older: ['Lobivia arachnacantha'] };
const kewOnly = { name: 'Ferocactus chrysacanthus', family: 'Cactaceae', kew: ['Echinocactus chrysacanthus'] };

describe('the older name a hit was found by (review-w 5)', () => {
  it('is named when the words typed are an older name of the hit', () => {
    expect(olderNameOf('Sansevieria trifasciata', dracaena)).toBe('Sansevieria trifasciata');
    expect(olderNameOf('sansevieria laur', dracaena)).toBe('Sansevieria laurentii');
    expect(olderNameOf('Lobivia', echinopsis)).toBe('Lobivia arachnacantha');
    expect(olderNameOf('Echinocactus chrysacanthus', kewOnly)).toBe('Echinocactus chrysacanthus');
    expect(olderNameOf('Sansevieria trifasciata Prain', dracaena)).toBe('Sansevieria trifasciata'); // the author, as the search sets it aside
  });
  it('is not named when the hit was found by its own name, a common name, its family or a region', () => {
    for (const q of ['Dracaena trifasciata', 'dracaena', 'trifasciata', 'snake plant', 'mother in law', 'asparagaceae', 'nigeria']) expect(olderNameOf(q, dracaena)).toBeNull();
    expect(olderNameOf('Echinopsis', echinopsis)).toBeNull();
    expect(olderNameOf('', dracaena)).toBeNull();
    // Two words of two older names are no older name typed.
    expect(olderNameOf('trifasciata laurentii', dracaena)).toBeNull();
  });
});

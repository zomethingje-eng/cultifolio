/**
 * Round eighty, agent A (review-w 4): a grower's plant whose species page has no GBIF key said GBIF's records "were not
 * asked" whenever the page had no key, while Echinopsis crassicaulis's page reads GBIF's records under the seven keys
 * Kew's synonymy gives it, 5623025 (the plant's own key) among them. The notice now says what the page did. FAILED on
 * r80f: no `keylessPlantNotice`, and the sheet carried no keys.
 */
import { describe, it, expect } from 'vitest';
import { keylessPlantNotice, NO_GBIF_WHY } from '../../src/lib/core/no-gbif';
import { sheetOf } from '../../src/lib/dossier/sheet';
import type { Dossier } from '../../src/lib/dossier/schema';

const read = { ids: { gbif: null }, occurrences: { keys: [{ key: 5623025 }, { key: 7268451 }] } };
const none = { ids: { gbif: null }, occurrences: { keys: [] } };

describe('the notice on a plant whose species page has no GBIF key', () => {
  it('a page that read the plant\'s key says the records are on it, never "not asked"', () => {
    const t = keylessPlantNotice(read, 'Echinopsis crassicaulis', 5623025);
    expect(t).not.toContain('not asked');
    expect(t).toContain('one of those keys');
    expect(t).toContain("Kew's World Checklist");
  });
  it('a page that read other keys says the plant\'s is not one of them', () => {
    const t = keylessPlantNotice(read, 'Echinopsis crassicaulis', 999);
    expect(t).not.toContain('not asked');
    expect(t).toContain('is not one of them');
  });
  it('a page that read no key keeps the reason the records were not asked (rule 2)', () => {
    expect(keylessPlantNotice(none, 'Agave igni', 12)).toContain(NO_GBIF_WHY);
  });
  it('a sheet carries the keys a keyless page read, and the notice reads them from it', () => {
    const d = { key: 'k2783357', ids: {}, slug: 'echinopsis-crassicaulis', name: { scientific: 'Echinopsis crassicaulis', family: 'Cactaceae' }, centroid: null, climate: { status: 'none', detail: 'x' }, occurrences: { keys: [{ key: 5623025, n: 0 }] } } as unknown as Dossier;
    const s = sheetOf(d);
    expect(s.keys).toEqual([5623025]);
    expect(keylessPlantNotice(s, 'Echinopsis crassicaulis', 5623025)).toContain('one of those keys');
    const keyed = sheetOf({ ...d, ids: { gbif: 1 } } as unknown as Dossier);
    expect(keyed.keys).toBeUndefined();
  });
});

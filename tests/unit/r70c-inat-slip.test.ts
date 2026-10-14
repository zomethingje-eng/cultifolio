/**
 * Round seventy, the owner's second run (on 70b): `--fill inat-ids` refused two right follows, 81 photographs between
 * them. Echinocereus chisoensis was followed to 438545, iNaturalist's "Echinocereus chisosensis", and Othonna cakilefolia
 * to 591068, "Othonna cakilifolia": "GBIF holds X as X, not of this reference, and its epithet is not this species'".
 * Each is this plant spelt one letter otherwise. The last step of the rule now reads C's uploader's slip (`slip`, the
 * Commons rule: one letter added, dropped, changed or moved, five letters or more), where no species of the reference
 * holds the name; and the give-back reads 70b's refusals, so a rerun restores the two. GBIF's, Kew's and iNaturalist's
 * answers are of 2026-10-14 (fixtures/r70c-slip.json). Each case FAILED on m70b unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fillInatIds } from '$dossier/corpus-fills';
import { judgeTaxon } from '$dossier/sources/inat';
import { ownNames } from '$dossier/own-names';
import { referenceOf } from '$dossier/reference';
import type { JsonFetcher } from '$dossier/fetch';

const W: { reference: Array<{ key: number; name: string; family: string }>; answers: Record<string, unknown> } = JSON.parse(readFileSync('tests/unit/fixtures/r70c-slip.json', 'utf8'));
const f = (async (url: string) => W.answers[url] ?? { status: 'refused', detail: `no fixture: ${url}` }) as unknown as JsonFetcher;
const CASES = [
  { key: 3084103, name: 'Echinocereus chisoensis', taxon: 438545, taxonName: 'Echinocereus chisosensis', photos: 41 },
  { key: 4252157, name: 'Othonna cakilefolia', taxon: 591068, taxonName: 'Othonna cakilifolia', photos: 40 }
];
type D = { key: number; name: { scientific: string; family?: string }; ids: { inat?: number }; links: Record<string, string>; photos: Array<{ src: string }>; upstream: Record<string, { status: string; at?: string; detail?: string }> };
const inatPhotos = (n: number) => Array.from({ length: n }, (_, i) => ({ src: 'inat', id: String(i), url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${i}/large.jpg`, thumb: '', licence: 'by', attribution: 'a' }));
function corpus(mode: 'found' | 'left'): Record<string, D> {
  const docs: Record<string, D> = {};
  for (const e of W.reference) docs[`${e.key}.json`] = { key: e.key, name: { scientific: e.name, family: e.family }, ids: {}, links: {}, photos: [], upstream: {} };
  for (const c of CASES) {
    const d = docs[`${c.key}.json`];
    const before = `iNaturalist's taxon 1 (${c.name}) is inactive; followed to its current taxon ${c.taxon}`;
    if (mode === 'found') {
      Object.assign(d, { ids: { inat: c.taxon }, links: { inat: `https://www.inaturalist.org/taxa/${c.taxon}` }, photos: inatPhotos(c.photos) });
      d.upstream['inat.taxon'] = { status: 'ok', at: 'x', detail: before };
    } else {
      // As 70b's fill left it (the owner's second run).
      d.upstream['inat.taxon'] = { status: 'none', at: 'x', detail: `${before}; read again 2026-10-14: ${c.taxon} (${c.taxonName}) is not this species: GBIF holds ${c.taxonName} as ${c.taxonName}, not of this reference, and its epithet is not this species': not taken, and its ${c.photos} photographs removed (2026-10-14); asked by name: no iNaturalist taxon of this name` };
      d.upstream['inat.photos.wild'] = { status: 'none', at: 'x', detail: 'no iNaturalist taxon is taken for this species (2026-10-14); see its taxon row' };
    }
  }
  return docs;
}
const store = (docs: Record<string, D>) => ({ files: () => Object.keys(docs), read: <T,>(k: string) => structuredClone(docs[k]) as T, write: (k: string, d: unknown) => { docs[k] = d as D; } });

describe('a follow to this species spelt one letter otherwise is taken', () => {
  it('as the run found them: both follows are read again and kept, with their photographs', async () => {
    const docs = corpus('found');
    const c = await fillInatIds(store(docs), f, () => '2026-10-15T00:00:00Z');
    expect(c.failed).toBeUndefined();
    expect(c).toMatchObject({ refused: 0, kept: 2 }); // m70b: refused 2, 81 photographs removed
    for (const x of CASES) {
      expect(docs[`${x.key}.json`].ids.inat).toBe(x.taxon);
      expect(docs[`${x.key}.json`].photos).toHaveLength(x.photos);
      expect(docs[`${x.key}.json`].upstream['inat.taxon'].detail).toMatch(/this species' epithet, spelt one letter otherwise$/);
    }
  });
  it('as 70b left them: a rerun gives both ids back and asks for their photographs again', async () => {
    const docs = corpus('left');
    const c = await fillInatIds(store(docs), f, () => '2026-10-15T00:00:00Z');
    expect(c.followed).toBe(2); // m70b: 0, the 70b words not read
    for (const x of CASES) {
      const d = docs[`${x.key}.json`];
      expect(d.ids.inat).toBe(x.taxon);
      expect(d.upstream['inat.photos.wild'].status).toBe('skipped');
      expect(d.upstream['inat.taxon'].detail).toMatch(/; taken back$/);
    }
  });
});

describe('the slip is read only where it can be (guards)', () => {
  const reference = referenceOf([{ key: 1, name: 'Echinocereus scheeri', family: 'Cactaceae' }, { key: 2, name: 'Echinocereus schereri', family: 'Cactaceae' }, { key: 3, name: 'Aloe vera', family: 'Asphodelaceae' }]);
  const none = (async () => ({ status: 'ok', data: { matchType: 'NONE' } })) as unknown as JsonFetcher;
  const held = (k: number) => (n: string) => { const x = reference.keyOf(n); return x != null && x !== k; };
  it('another species of the reference one letter away is never the species\'', async () => {
    const r = await judgeTaxon(none, 'Echinocereus schereri', { key: 1, scientific: 'Echinocereus scheeri', family: 'Cactaceae', own: ownNames({ scientific: 'Echinocereus scheeri' }), heldElsewhere: held(1), reference });
    expect(r.status === 'ok' && r.data.take).toBe(false);
  });
  it('an epithet under five letters is no slip', async () => {
    const r = await judgeTaxon(none, 'Aloe vara', { key: 3, scientific: 'Aloe vera', family: 'Asphodelaceae', own: ownNames({ scientific: 'Aloe vera' }), heldElsewhere: held(3), reference });
    expect(r.status === 'ok' && r.data.take).toBe(false);
  });
});

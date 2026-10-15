/**
 * Round 71, B (self-review 70): the follow/carry rule's slip step takes a sister species one letter apart, which GBIF and Kew both
 * accept as a species of its own, when only one of the two is in the reference. Answers of GBIF (species/match) and of
 * GBIF's copy of WCVP for Salvia aurea L. and Salvia azurea Michx. ex Vahl, 2026-10-15, cut to the fields read.
 */
import { describe, it, expect } from 'vitest';
import { judgeTaxon } from '$dossier/sources/inat';
import { ownNames } from '$dossier/own-names';
import { referenceOf } from '$dossier/reference';
import type { JsonFetcher } from '$dossier/fetch';

const reference = referenceOf([{ key: 8283204, name: 'Salvia azurea', family: 'Lamiaceae' }, { key: 2927016, name: 'Salvia apiana', family: 'Lamiaceae' }]);
const f = (async (url: string) => {
  if (url.includes('/species/match')) return { status: 'ok', data: { usageKey: 3884533, scientificName: 'Salvia aurea L.', canonicalName: 'Salvia aurea', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT', speciesKey: 3884533, species: 'Salvia aurea' } };
  if (url.includes('name=Salvia%20aurea')) return { status: 'ok', data: { results: [{ canonicalName: 'Salvia aurea', taxonomicStatus: 'ACCEPTED' }] } };
  if (url.includes('name=Salvia%20azurea')) return { status: 'ok', data: { results: [{ canonicalName: 'Salvia azurea', taxonomicStatus: 'ACCEPTED' }] } };
  return { status: 'refused', detail: `no fixture: ${url}` };
}) as unknown as JsonFetcher;

describe('a sister species one letter apart is not a slip', () => {
  it('Salvia aurea (Kew and GBIF accept it, a South African sage) is not Salvia azurea\'s', async () => {
    const r = await judgeTaxon(f, 'Salvia aurea', { key: 8283204, scientific: 'Salvia azurea', family: 'Lamiaceae', own: ownNames({ scientific: 'Salvia azurea' }), heldElsewhere: (n) => { const k = reference.keyOf(n); return k != null && k !== 8283204; }, reference });
    expect(r.status === 'ok' && r.data).toMatchObject({ take: false });
  });
});

describe('an unrelated species of the family with the epithet is not a genus transfer', () => {
  const ref2 = referenceOf([{ key: 2979128, name: 'Acacia longifolia', family: 'Fabaceae' }]);
  const g = (async (url: string) => {
    if (url.includes('/species/match')) return { status: 'ok', data: { usageKey: 2964236, canonicalName: 'Lupinus longifolius', rank: 'SPECIES', status: 'ACCEPTED', matchType: 'EXACT', speciesKey: 2964236, species: 'Lupinus longifolius' } };
    if (url.includes('name=Lupinus%20longifolius')) return { status: 'ok', data: { results: [{ canonicalName: 'Lupinus longifolius', taxonomicStatus: 'ACCEPTED' }] } };
    if (url.includes('name=Acacia%20longifolia')) return { status: 'ok', data: { results: [{ canonicalName: 'Acacia longifolia', taxonomicStatus: 'ACCEPTED' }] } };
    return { status: 'refused', detail: `no fixture: ${url}` };
  }) as unknown as JsonFetcher;
  it('Lupinus longifolius is not Acacia longifolia\'s', async () => {
    const r = await judgeTaxon(g, 'Lupinus longifolius', { key: 2979128, scientific: 'Acacia longifolia', family: 'Fabaceae', own: ownNames({ scientific: 'Acacia longifolia' }), heldElsewhere: () => false, reference: ref2 });
    expect(r.status === 'ok' && r.data).toMatchObject({ take: false });
  });
});

import { slipTaken, transferTaken } from '$dossier/sources/inat';
describe('the slip and transfer rules on what Kew and GBIF say (S-B7, S-C9, S-F13)', () => {
  it.each([
    ['Salvia aurea', 'Salvia azurea', { kew: 'accepted', gbif: 'accepted' }, false],
    ['Othonna cakilifolia', 'Othonna cakilefolia', { kew: 'none', gbif: 'accepted', kewOurs: 'accepted' }, true], // GBIF's own spelling duplicate
    ['Ceropegia maritae', 'Ceropegia mariae', { kew: 'none', gbif: 'accepted', kewOurs: 'none' }, false],
    ['Echinocereus chisosensis', 'Echinocereus chisoensis', { kew: 'none', gbif: 'none' }, true],
    ['Aloe vara', 'Aloe vera', { kew: 'none', gbif: 'none' }, false] // under five letters (guard)
  ] as const)('%s for %s', (a, b, w, take) => expect(slipTaken(a, b, w)).toBe(take));
  it('a transfer is refused only when Kew accepts both', () => {
    expect(transferTaken({ kew: 'accepted', kewOurs: 'accepted' })).toBe(false);
    expect(transferTaken({ kew: 'accepted', kewOurs: 'none' })).toBe(true);
    expect(transferTaken({ kew: 'none' })).toBe(true);
  });
});

describe('the guards round seventy\'s tests left undriven (mutation survivors, S-B11; guards: they pass on r71base and kill the mutations)', () => {
  const none = (async (url: string) => (url.includes('/species/match') ? { status: 'ok', data: { matchType: 'NONE' } } : { status: 'ok', data: { results: [] } })) as unknown as JsonFetcher;
  const judge = (name: string, key: number, scientific: string, family: string, entries: Array<{ key: number; name: string; family: string }>, held = false) => {
    const reference = referenceOf(entries);
    return judgeTaxon(none, name, { key, scientific, family, own: ownNames({ scientific }), heldElsewhere: held ? (n) => { const k = reference.keyOf(n); return k != null && k !== key; } : undefined, reference });
  };
  it('a slip the reference holds as another species is refused even without heldElsewhere', async () => {
    const r = await judge('Echinocereus schereri', 1, 'Echinocereus scheeri', 'Cactaceae', [{ key: 1, name: 'Echinocereus scheeri', family: 'Cactaceae' }, { key: 2, name: 'Echinocereus schereri', family: 'Cactaceae' }]);
    expect(r.status === 'ok' && r.data.take).toBe(false);
  });
  it('a slip whose epithet another species of the family here has is refused', async () => {
    const r = await judge('Ferocactus matudae', 1, 'Mammillaria mabudae', 'Cactaceae', [{ key: 1, name: 'Mammillaria mabudae', family: 'Cactaceae' }, { key: 2, name: 'Coryphantha matudae', family: 'Cactaceae' }]);
    expect(r.status === 'ok' && r.data).toMatchObject({ take: false, why: expect.stringMatching(/Coryphantha matudae here has its epithet/) });
  });
  it('a genus transfer whose epithet another species of the family here has is refused', async () => {
    const r = await judge('Ferocactus elegans', 1, 'Mammillaria elegans', 'Cactaceae', [{ key: 1, name: 'Mammillaria elegans', family: 'Cactaceae' }, { key: 2, name: 'Echinocereus elegans', family: 'Cactaceae' }]);
    expect(r.status === 'ok' && r.data).toMatchObject({ take: false, why: expect.stringMatching(/Echinocereus elegans here has its epithet too/) });
  });
});

describe('more of the slip rule\'s guards (S-B11)', () => {
  it('a slip the reference holds in another family is refused (the family-epithet guard does not see it)', async () => {
    const reference = referenceOf([{ key: 1, name: 'Ehretia microphylla', family: 'Ehretiaceae' }, { key: 2, name: 'Ehretia macrophylla', family: 'Boraginaceae' }]);
    const none = (async (url: string) => (url.includes('/species/match') ? { status: 'ok', data: { matchType: 'NONE' } } : { status: 'ok', data: { results: [] } })) as unknown as JsonFetcher;
    const r = await judgeTaxon(none, 'Ehretia macrophylla', { key: 1, scientific: 'Ehretia microphylla', family: 'Ehretiaceae', own: ownNames({ scientific: 'Ehretia microphylla' }), reference });
    expect(r.status === 'ok' && r.data).toMatchObject({ take: false, why: 'Ehretia macrophylla is another species of this reference' });
  });
  it('Kew accepting the name refuses the slip whatever GBIF says', () => expect(slipTaken('Salvia aurea', 'Salvia azurea', { kew: 'accepted', gbif: 'none' })).toBe(false));
});

/**
 * Round eighty-six, names (review-s S1's truncation; plan A8): `canonicalSynonym` reads every rank word below the species,
 * so GBIF's "Sorbus aria proles latifolia" is that name, never "Sorbus aria", the binomial of another species, which the
 * index then made an older name of the page (`olderNamesOf`).
 *
 * On r86base: FAILED (each of the five names came back as its first two words; "Sorbus aria" was an older name of
 * Sorbus latifolia).
 */
import { describe, it, expect } from 'vitest';
import { canonicalSynonym } from '$core/names';
import { olderNamesOf } from '$dossier/index-entry';

describe('every rank word below the species (A8)', () => {
  it("GBIF's names under proles, subvar., nothosubsp., nothovar., subf., lusus, race, convar. and grex keep their rank", () => {
    expect(canonicalSynonym('Sorbus aria proles latifolia Rouy')).toBe('Sorbus aria proles latifolia');
    expect(canonicalSynonym('Pteris aquilina subvar. latiuscula Moore')).toBe('Pteris aquilina subvar. latiuscula');
    expect(canonicalSynonym('Paeonia corallina proles ovatifolia (Boiss. & Reut.) Rouy')).toBe('Paeonia corallina proles ovatifolia');
    expect(canonicalSynonym('Poterium sanguisorba proles spachianum (Coss.) Rouy & Camus')).toBe('Poterium sanguisorba proles spachianum');
    expect(canonicalSynonym('Antirrhinum murale proles barrelieri Rouy')).toBe('Antirrhinum murale proles barrelieri');
    expect(canonicalSynonym('Mentha longifolia nothosubsp. mollissima (Borkh.) Rouy')).toBe('Mentha longifolia nothosubsp. mollissima');
    expect(canonicalSynonym('Mentha spicata nothovar. crispata Rouy')).toBe('Mentha spicata nothovar. crispata');
    expect(canonicalSynonym('Rosa canina subf. glandulosa Rouy')).toBe('Rosa canina subf. glandulosa');
    expect(canonicalSynonym('Rosa canina lusus glabra Rouy')).toBe('Rosa canina lusus glabra');
    expect(canonicalSynonym('Festuca ovina race duriuscula Hack.')).toBe('Festuca ovina race duriuscula');
    expect(canonicalSynonym('Brassica oleracea convar. capitata (L.) Alef.')).toBe('Brassica oleracea convar. capitata');
    expect(canonicalSynonym('Cymbidium lowianum grex concolor Rolfe')).toBe('Cymbidium lowianum grex concolor');
    expect(canonicalSynonym('Sedum album fo. micranthum (Bast.) Hamet')).toBe('Sedum album f. micranthum');
  });
  it('the binomial of a name below the species is no older name of the page', () => {
    const o = olderNamesOf('Sorbus latifolia', ['Sorbus aria proles latifolia Rouy', 'Pyrus latifolia (Lam.) Syme']);
    expect([...o.syn, ...o.older]).not.toContain('Sorbus aria');
    expect(o.syn).toContain('Sorbus aria proles latifolia');
  });
  it('guard: the usual ranks, authors and what is no name read as before', () => {
    expect(canonicalSynonym('Haworthia attenuata var. radula (Jacq.) Baker')).toBe('Haworthia attenuata var. radula');
    expect(canonicalSynonym('Lithops lesliei ssp. burchellii D.T.Cole')).toBe('Lithops lesliei subsp. burchellii');
    expect(canonicalSynonym('Haworthia attenuata (Haw.) Haw.')).toBe('Haworthia attenuata');
    expect(canonicalSynonym('Opuntia sect. Tuna')).toBeNull();
    expect(canonicalSynonym('Echinopsis sp.')).toBeNull();
    expect(canonicalSynonym('Aloe vera auct.')).toBeNull();
  });
});

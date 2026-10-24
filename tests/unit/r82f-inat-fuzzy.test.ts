/**
 * Round eighty-two: the independent review's 5 read GBIF's FUZZY match in `judgeTaxon` as a breach of the no-guessing rule,
 * and a hotfix that refused it was reverted the same day: the owner's own cases (tests/unit/r70b2-follow-42.test.ts) need it.
 * iNaturalist and Kew spell Othonna linearifolia (DC.) Sch.Bip. so; GBIF's backbone, and this reference's page, spell it
 * Othonna lineariifolia; GBIF's species/match corrects the one to the other (FUZZY, this species' key). Refused, the page
 * lost its taxon and its photographs. The rule stays: a FUZZY match is taken only where it lands on this very species, and
 * /about/how says so. Guards.
 */
import { describe, it, expect } from 'vitest';
import { judgeTaxon } from '$dossier/sources/inat';
import { ownNames } from '$dossier/own-names';
import { referenceOf } from '$dossier/reference';
import type { JsonFetcher } from '$dossier/fetch';

const reference = referenceOf([{ key: 1, name: 'Othonna lineariifolia', family: 'Asteraceae' }, { key: 2, name: 'Othonna capensis', family: 'Asteraceae' }]);
const s = { key: 1, scientific: 'Othonna lineariifolia', family: 'Asteraceae', own: ownNames({ scientific: 'Othonna lineariifolia' }), heldElsewhere: () => false, reference };
const answering = (match: unknown) => (async (url: string) => (url.includes('/species/match') ? { status: 'ok', data: match } : { status: 'none', detail: 'nothing here' })) as unknown as JsonFetcher;

describe("GBIF's FUZZY match to this very species", () => {
  it("is taken: Kew's spelling of the page's own plant", async () => {
    const r = await judgeTaxon(answering({ usageKey: 1, speciesKey: 1, matchType: 'FUZZY', rank: 'SPECIES', status: 'ACCEPTED', canonicalName: 'Othonna lineariifolia' }), 'Othonna linearifolia', s);
    expect(r.status === 'ok' && r.data).toMatchObject({ take: true });
  });
  it('is not taken when it lands on another species of the reference', async () => {
    const r = await judgeTaxon(answering({ usageKey: 2, speciesKey: 2, matchType: 'FUZZY', rank: 'SPECIES', status: 'ACCEPTED', canonicalName: 'Othonna capensis' }), 'Othonna capensiss', s);
    expect(r.status === 'ok' && r.data.take).not.toBe(true);
  });
});

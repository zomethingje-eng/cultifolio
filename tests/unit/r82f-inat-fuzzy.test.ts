/**
 * Round eighty-two (the independent review's 5): `judgeTaxon` took an iNaturalist taxon when GBIF's species/match answered
 * FUZZY with this species' key, and wrote "GBIF holds X as this species", where /about/how's rules take a name only where
 * GBIF holds that very name as this species. A FUZZY match is now no answer: the name goes on to Kew's word and the slip
 * rule, which say what they decide. FAILED on 8f2b495 (taken, "GBIF holds Echinopsis pachonoii as this species").
 */
import { describe, it, expect } from 'vitest';
import { judgeTaxon } from '$dossier/sources/inat';
import { ownNames } from '$dossier/own-names';
import { referenceOf } from '$dossier/reference';
import type { JsonFetcher } from '$dossier/fetch';

const reference = referenceOf([{ key: 1, name: 'Echinopsis pachanoi', family: 'Cactaceae' }]);
const s = { key: 1, scientific: 'Echinopsis pachanoi', family: 'Cactaceae', own: ownNames({ scientific: 'Echinopsis pachanoi' }), heldElsewhere: () => false, reference };
const answering = (match: unknown) => (async (url: string) => (url.includes('/species/match') ? { status: 'ok', data: match } : { status: 'none', detail: 'nothing here' })) as unknown as JsonFetcher;

describe('a FUZZY match is no answer', () => {
  it('two letters away, FUZZY to this species: not taken as "GBIF holds"', async () => {
    const r = await judgeTaxon(answering({ usageKey: 1, speciesKey: 1, matchType: 'FUZZY', rank: 'SPECIES', status: 'ACCEPTED', canonicalName: 'Echinopsis pachanoi' }), 'Echinopsis pachonoii', s);
    const taken = r.status === 'ok' && r.data.take;
    expect(taken && /GBIF holds/.test(r.data.why)).toBe(false);
    expect(taken).toBe(false);
  });
  it('guard: EXACT to this species is still taken', async () => {
    const r = await judgeTaxon(answering({ usageKey: 9, speciesKey: 1, matchType: 'EXACT', rank: 'SPECIES', status: 'SYNONYM', canonicalName: 'Trichocereus pachanoi' }), 'Trichocereus pachanoi', s);
    expect(r.status === 'ok' && r.data).toMatchObject({ take: true, why: 'GBIF holds Trichocereus pachanoi as this species' });
  });
});

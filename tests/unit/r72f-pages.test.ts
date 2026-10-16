// Round seventy-two, reviewer F: what a first visitor sees on a species page, read against the real corpus.
import { describe, it, expect } from 'vitest';

describe('r72f registers', () => {
  it('a page whose Wikidata row failed says its register links were not checked (Agave wendtii: "GBIF iNaturalist" and nothing else)', async () => {
    const { registersNotChecked } = await import('$lib/ui/ref/upstream');
    expect(registersNotChecked({ wikidata: { status: 'error', detail: 'carried from build of 2026-09-19 (rederive)' } })).toMatch(/^Wikidata did not answer .*not checked/);
    expect(registersNotChecked({ wikidata: { status: 'refused' } })).toMatch(/^Wikidata refused the request/);
    expect(registersNotChecked({ wikidata: { status: 'ok' } })).toBeNull();
    expect(registersNotChecked({ wikidata: { status: 'none' } })).toBeNull();
    expect(registersNotChecked({})).toBeNull();
  });
});

/**
 * Round eighty-one, agent B: two sentences the pages say, made true of what is live (rule 5).
 *   - D4: a page whose only Wikidata name is a word the page does not show ("Cactus" on Ferocactus tiburonensis) said
 *     "English names from Wikidata, item Q1407505, read …" under a name with no English name. It now says what Wikidata
 *     gave, and that it is searched, not shown.
 *   - D1: /about/how said round eighty's repair (the regions' shapes, the default points, Kew's older names in the search)
 *     in the present tense from 22 October, while the repair goes up only with the upload after the cultivated fill.
 * Each case FAILED on r81base.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { namesSource } from '$lib/ui/ref/upstream';

const page = (vernacular: Array<{ name: string; source?: string; lang?: string }>) => ({
  ids: { wikidata: 'Q1407505' },
  name: { vernacular },
  upstream: { 'wikidata.names': { status: 'ok', at: '2026-10-23T00:10:00.000Z', detail: 'Wikidata\'s item Q1407505; 1 English name taken: "Cactus"' } }
});

describe('D4: the Wikidata names line over a name the page does not show', () => {
  it('Ferocactus tiburonensis: Wikidata gives only "Cactus", which is not shown', () => {
    // r81base: { item, day }, said "English names from Wikidata, item Q1407505".
    expect(namesSource(page([{ name: 'Cactus', lang: 'eng', source: 'Wikidata' }]), [])).toEqual({ item: 'Q1407505', day: '2026-10-23', hidden: ['Cactus'] });
  });
  it('a name shown from Wikidata is said as before, whatever its case (guard)', () => {
    expect(namesSource(page([{ name: 'garden leek', lang: 'eng', source: 'Wikidata' }]), ['Garden leek'])).toEqual({ item: 'Q1407505', day: '2026-10-23' });
    expect(namesSource(page([{ name: 'Cactus', lang: 'eng', source: 'Wikidata' }]))).toEqual({ item: 'Q1407505', day: '2026-10-23' }); // no names given: as before
  });
  it('the species page gives the names it shows, and says the hidden ones as searched, not shown', () => {
    const svelte = readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8');
    expect(svelte).toMatch(/namesSource\(d as never, common\)/);
    expect(svelte).toMatch(/\{#if wdNames && 'item' in wdNames && wdNames\.hidden\}<p class="small muted" id="names-source">Wikidata's <a [^>]*>item \{wdNames\.item\}<\/a> gives \{wdNames\.hidden\.map/);
    expect(svelte).toMatch(/which the search finds and this page does not show as the species' English name\./);
  });
});

describe("D1: /about/how says round eighty's repair as what it is until it is live", () => {
  const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
  it("the regions' shapes and the default points", () => {
    // Round eighty-three (C): the repair was uploaded on 29 October 2026; round eighty-three's corrections wait for a page's next derivation.
    expect(how).toMatch(/The regions' shapes and the default points above are round eighty's rules, applied to the live pages by a repair uploaded on 29 October 2026; the corrections to both of round eighty-three \(the countries placed and the islets kept, and the records stated to within 10 km kept at a default point\) reach a page when it is next derived/);
  });
  it("Kew's older names in the search", () => {
    expect(how).toMatch(/Kew's older names reach the search with the index uploaded after the daily fill of cultivated photographs \(due at the end of October 2026\); until that upload, a search by one of Kew's names that GBIF's names do not hold finds nothing\./);
  });
});

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
    // Round eighty-four (W12): said under Names & registers, in a grower's words.
    expect(svelte).toMatch(/\{#if wdNames && 'item' in wdNames && wdNames\.hidden\}<p class="small muted names" id="names-source"><b>Found by search as<\/b> \{wdNames\.hidden\.map/);
    expect(svelte).toMatch(/a search for it finds this page\. It is not among the English names under the heading/);
  });
});

describe("D1: /about/how says the repairs as what they are, now they are live (round eighty-four; review S's 4)", () => {
  const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
  it("the regions' shapes and the default points: in the present tense, a page's own day deciding its rules", () => {
    // Round eighty-four: round eighty-three's repair is live (29 October 2026), so "until then" and "when it is next derived" are gone.
    expect(how).not.toMatch(/reach a page when it is next derived|repair uploaded on 29 October 2026; the corrections/);
    expect(how).toContain("A page's record of its sources gives the day it was built, and its records were tested by the rules of that day.");
  });
  it("Kew's older names in the search: searched now, with no upload awaited", () => {
    expect(how).not.toMatch(/due at the end of October 2026|until that upload/);
    expect(how).toContain("Kew's older names for the plant are searched only as a name typed");
  });
});

/**
 * Round eighty-one, agent A: review D5 and the owner's queued item. A one-word name for a whole genus or family, from
 * GBIF or Wikidata ("Cycad" headed 39 live pages of six genera; Wikidata's "Sumac", "Pipevine", "Flameflower" on keyless
 * pages), is searched but never shown as the species' name or heading; a generic noun beside a fuller name is not shown
 * either. Wikidata's own spelling is kept as written and the page says whose it is. A blank pre-treatment is "not stated"
 * (review W8).
 * FAILED on r81base: "Cycad" headed Ceratozamia becerrae and stood beside "Pago sago"; "Sumac", "Pipevine" and
 * "Flameflower" headed their pages; the line read "English names from Wikidata"; the batch page said "Pre-treatment none".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { englishNames, indexNames } from '$dossier/index-entry';
import { GENERIC_NOUNS, prepare, search } from '$core/search';

const wd = (name: string) => ({ name, lang: 'eng', source: 'Wikidata' });

describe('r81a D5: one-word names of a whole genus or family', () => {
  it('Wikidata\'s alone: searched, no English name shown', () => {
    for (const [sp, n] of [['Ceratozamia becerrae', 'Cycad'], ['Rhus taitensis', 'Sumac'], ['Aristolochia thwaitesii', 'Pipevine'], ['Talinum afrum', 'Flameflower'], ['Galanthus peshmenii', 'Snowdrop']]) {
      expect(englishNames([wd(n)], { genus: sp }), sp).toEqual({});
      expect(indexNames([wd(n)], { genus: sp }), sp).toEqual({ spellings: [n] });
    }
  });
  it('GBIF\'s beside a fuller name: the fuller name heads and the group word is not among the names', () => {
    const v = [{ name: 'Cycad', lang: 'eng', sources: 3 }, { name: 'Pago sago', lang: 'eng' }];
    expect(englishNames(v, { genus: 'Cycas bougainvilleana' })).toEqual({ common: 'Pago sago' });
    expect(indexNames(v, { genus: 'Cycas bougainvilleana' })).toEqual({ common: 'Pago sago', spellings: ['Cycad'] });
    const snow = [{ name: 'Snowdrop', lang: 'eng', sources: 4 }, { name: 'Common snowdrop', lang: 'eng' }];
    expect(englishNames(snow, { genus: 'Galanthus nivalis' })).toEqual({ common: 'Common snowdrop' });
    // "Fig" is Ficus carica's own name, not on the list: it still heads its page
    expect(englishNames([{ name: 'Fig', lang: 'eng', sources: 4 }, { name: 'Edible fig', lang: 'eng' }], { genus: 'Ficus carica' }).common).toBe('Fig');
  });
  it('the search still finds them, after every species with a fuller name', () => {
    for (const w of ['cycad', 'sumac', 'pipevine', 'flameflower', 'snowdrop']) expect(GENERIC_NOUNS.has(w), w).toBe(true);
    const p = prepare([
      { name: 'Ceratozamia becerrae', family: 'Zamiaceae', spellings: ['Cycad'], photos: 90 },
      { name: 'Cycas revoluta', family: 'Cycadaceae', common: 'Sago cycad', photos: 10 }
    ]);
    expect(search(p, 'cycad').map((h) => h.name)).toEqual(['Cycas revoluta', 'Ceratozamia becerrae']);
  });
  it('a two-word name that holds the word is still shown', () => {
    expect(englishNames([{ name: 'Smooth sumac', lang: 'eng' }], { genus: 'Rhus glabra' })).toEqual({ common: 'Smooth sumac' });
  });
  it('/about/how lists the words', () => {
    const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
    expect(how).toContain('cycad, daisy, fern, flameflower, flower');
    expect(how).toContain('which is never shown, neither as the heading nor among the names');
  });
});

describe("r81a: Wikidata's spelling is kept, and said to be Wikidata's", () => {
  it('a slip is not corrected', () => {
    expect(englishNames([wd('Sierrra shootingstar')], { genus: 'Primula jeffreyi' })).toEqual({ common: 'Sierrra shootingstar' });
  });
  it('the page and /about/how say whose spelling it is', () => {
    expect(readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8')).toContain('id="names-source">English names as Wikidata spells them, <a');
    expect(readFileSync('src/routes/about/how/+page.svelte', 'utf8')).toContain('spelt as Wikidata spells them');
  });
});

describe('r81a W8: a blank pre-treatment', () => {
  it('is "not stated", as the medium and the container are', () => {
    const src = readFileSync('src/routes/propagation/[id]/+page.svelte', 'utf8');
    expect(src).toContain("<b>Pre-treatment</b>{s.treatment ?? 'not stated'}");
    expect(src).not.toContain("{s.treatment ?? 'none'}");
  });
});

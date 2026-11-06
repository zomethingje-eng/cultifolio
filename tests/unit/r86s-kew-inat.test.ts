/**
 * Round eighty-six, the sources agent: the plan's B6. A page without a GBIF key (built from Kew's file, `build-kew.ts`)
 * reads iNaturalist's taxon against Kew's names for it (`kewOwnNames`), and Kew's names were compared with their rank word:
 * Kew's "Trichocereus macrogonus var. pachanoi", a homotypic synonym of Echinopsis pachanoi, never matched iNaturalist's
 * "Trichocereus macrogonus pachanoi", so San Pedro took no taxon and no photograph. Its live record (k2783547) says "not
 * taken: iNaturalist files Echinopsis pachanoi as Trichocereus macrogonus pachanoi, which is neither this species' name nor
 * one of Kew's names for it"; so do Opuntia nicholii, Coffea dewevrei and Solanum wallacei (`D-s/dos/`, copied to
 * `fixtures/r86s/kew-inat.json`, cut to the fields read). Now Kew's names are read without the rank word, as iNaturalist
 * writes a name, and `--list-kew-inat` lists, offline, the pages the rule would give a taxon to, for `--keys`.
 *
 * On r86base (9cf3077): the first two FAILED (`isOwnName` false; the taxon "none", not taken) and the third did too
 * (`kew-inat-list.ts` did not exist); "proles" was read as an epithet ("Paeonia corallina proles").
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kewOwnNames, kewInatTaxon } from '$dossier/build-kew';
import { isOwnName, canonicalOf } from '$dossier/own-names';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';

const pages = JSON.parse(readFileSync('tests/unit/fixtures/r86s/kew-inat.json', 'utf8'));
// Kew's file of 2026-06-04: Echinopsis pachanoi (2783547) and the rows filed under it (misapplied rows aside).
const PACHANOI = {
  name: 'Echinopsis pachanoi',
  synonyms: [
    { name: 'Trichocereus macrogonus var. pachanoi', authors: '(Britton & Rose) Albesiano & R.Kiesling', status: 'Synonym', rank: 'Variety', homotypic: true },
    { name: 'Trichocereus macrogonus subsp. pachanoi', authors: '(Britton & Rose) Lodé', status: 'Synonym', rank: 'Subspecies', homotypic: true },
    { name: 'Trichocereus pachanoi', authors: 'Britton & Rose', status: 'Synonym', rank: 'Species', homotypic: true },
    { name: 'Trichocereus schoenii', authors: 'Rauh & Backeb.', status: 'Synonym', rank: 'Species' }
  ]
};

describe('B6: Kew\'s names for a page without a GBIF key are read as iNaturalist writes a name', () => {
  it('Kew\'s "Trichocereus macrogonus var. pachanoi" is iNaturalist\'s "Trichocereus macrogonus pachanoi"', () => {
    const own = kewOwnNames(PACHANOI);
    expect(isOwnName(own, 'Trichocereus macrogonus pachanoi')).toBe(true); // base: false
    expect(isOwnName(own, 'Echinopsis pachanoi')).toBe(true);
    expect(isOwnName(own, 'Trichocereus macrogonus')).toBe(false); // E. macrogona, another page (guard)
    expect(isOwnName(own, 'Trichocereus macrogonus peruvianus')).toBe(false); // Kew's E. macrogona (guard)
    // A rank word GBIF or Kew writes is never an epithet.
    expect(canonicalOf('Paeonia corallina proles ovatifolia (Boiss. & Reut.) Cout.')).toBe('Paeonia corallina ovatifolia'); // base: "Paeonia corallina proles"
    expect(canonicalOf('Echinopsis subdenudata subf. alba')).toBe('Echinopsis subdenudata alba');
  });

  it('San Pedro takes iNaturalist\'s taxon of the variety, its taxon 327669 being inactive', async () => {
    const f = (async <T,>(url: string): Promise<FetchResult<T>> => {
      if (url.includes('/taxa/327669')) return { status: 'ok', data: { results: [{ id: 327669, name: 'Echinopsis pachanoi', rank: 'species', is_active: false, current_synonymous_taxon_ids: [1120003, 81530] }] } as T };
      if (url.includes('/taxa?q=Echinopsis%20pachanoi')) return { status: 'ok', data: { results: [{ id: 1120003, name: 'Trichocereus macrogonus pachanoi', rank: 'variety', matched_term: 'Echinopsis pachanoi' }] } as T };
      return { status: 'refused', detail: `not recorded: ${url}` };
    }) as JsonFetcher;
    const r = await kewInatTaxon(f, { scientific: 'Echinopsis pachanoi', own: kewOwnNames(PACHANOI), id: 327669 });
    expect(r.status).toBe('ok'); // base: none, "not taken: iNaturalist files Echinopsis pachanoi as Trichocereus macrogonus pachanoi …"
    expect(r.status === 'ok' && r.data).toEqual({ id: 1120003, name: 'Trichocereus macrogonus pachanoi' });
  });

  it('--list-kew-inat lists, from each page\'s own record, the pages the rule gives a taxon to, and says why', async () => {
    const mod = await import('$dossier/kew-inat-list').catch(() => null);
    expect(mod).not.toBeNull();
    const r = mod!.kewInatList(pages);
    expect(r.read).toBe(5);
    expect(r.refused).toBe(4);
    expect(r.lines).toEqual(['k2783547 Echinopsis pachanoi', 'k2391670 Opuntia nicholii', 'k45518 Coffea dewevrei', 'k3032815 Solanum wallacei']);
    expect(r.said[0]).toBe("Echinopsis pachanoi [k2783547]: iNaturalist's Trichocereus macrogonus pachanoi is Kew's Trichocereus macrogonus var. pachanoi (Britton & Rose) Albesiano & R.Kiesling without the rank word; rebuild to take its taxon");
    // A page whose record says something else is not listed (Anacampseros schoenlandii, k500397).
    expect(r.lines.join(' ')).not.toContain('k500397');
  });
});

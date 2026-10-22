/**
 * Round eighty, the merge (M): the needs between the agents that the merge settled. Each test fails on the base (2781df6):
 * the photographs' sentence said "iNaturalist was skipped (not asked)" for a page whose build left it to the daily fill
 * (agent I's need); the picker's hint named "Add" on forms whose button reads otherwise (agent S's need), and GBIF's row
 * of a name whose reference page has no GBIF key said nothing of it (agent A's need, the desktop review's 4); a merge into a
 * keyed page became a line of scripts/extra-keys-kew.txt (agent A's merges inside the shared lister); and two sentences of
 * /about/how were untrue of the merged code (agent A's family rule and plant notice).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { photoSourceGaps } from '../../src/lib/ui/ref/photos';
import { INAT_LEFT_TO_FILL, INAT_SETS_LEFT } from '../../src/lib/dossier/build';

const read = (p: string) => readFileSync(p, 'utf8');

describe('r80m merge', () => {
  it("a page whose build left iNaturalist to the daily fill says so, and a plain skip is said as before", () => {
    const left = { 'inat.taxon': { status: 'skipped', detail: INAT_LEFT_TO_FILL }, 'inat.photos.wild': { status: 'skipped', detail: INAT_SETS_LEFT }, 'inat.photos.cultivated': { status: 'skipped', detail: INAT_SETS_LEFT }, commons: { status: 'skipped' } };
    expect(photoSourceGaps(left, 0)!.clause).toBe('Wikimedia Commons was skipped (not asked) and iNaturalist was left to the daily photograph fill (not asked)');
    expect(photoSourceGaps({ 'inat.photos.wild': { status: 'skipped' }, 'inat.photos.cultivated': { status: 'skipped' } }, 0)!.clause).toBe('iNaturalist was skipped (not asked)');
    // A refusal still outranks the fill's skip.
    expect(photoSourceGaps({ ...left, 'inat.photos.wild': { status: 'refused' } }, 0)!.clause).toBe('iNaturalist refused and Wikimedia Commons was skipped (not asked)');
  });
  it("the picker's hint names each form's own button, and GBIF's row says the page of that name holds no key", () => {
    expect(read('src/routes/propagation/new/+page.svelte')).toMatch(/<SpeciesPicker reserve addLabel="Start batch"/);
    expect(read('src/routes/plants/[acc]/+page.svelte')).toMatch(/<SpeciesPicker reserve addLabel="Save"/);
    expect(read('src/lib/ui/SpeciesPicker.svelte')).toMatch(/GBIF's name service, key \$\{s\.key\}; the species page of this name holds no GBIF key/);
  });
  it("the lister's merges are lines only for the pages it lists, and a page that reads a merged key is not one that reads none", () => {
    const src = read('scripts/extra-keys-list.ts');
    expect(src).toMatch(/\.filter\(\(k\) => listed\.has\(k\.pageId \?\? String\(k\.page\)\)\)/);
    expect(src).toMatch(/!forcedPages\.has\(p\.id\)/);
    // The build's own file is kept as the build read it: no merge line of a keyed page in it.
    expect(read('scripts/extra-keys-kew.txt').split('\n').filter((l) => l && !l.startsWith('#') && !l.startsWith('k'))).toEqual([]);
  });
  it('/about/how is true of the family rule and of the plant notice', () => {
    const how = read('src/routes/about/how/+page.svelte');
    expect(how).toContain("or only under a genus it files in another order than Kew's family while its accepted genus of that name is in that order");
    expect(how).toContain("a GBIF key a plant records for it is compared with the keys the page reads GBIF's records under, and the plant's page says whether it is one of them.");
    expect(how).not.toContain('is compared with no page');
  });
});

/**
 * Round eighty-four, the merge (M): what the six branches asked of each other, held by test.
 *
 * - A page whose only GBIF keys are those of pages merged into it (Ferocactus hamatacanthus, which reads Bisnaga
 *   hamatacantha's key) said its records were read "under GBIF's keys for the names Kew's file holds as this plant"
 *   (agent E's report): untrue there. `kewKeysWords` says whose keys were read.
 * - The about pages' sentences that the other agents' code makes true: the coast rule's reach and the regions' count read
 *   from the code and the shapes file; the plant page's "Is it an older name?" in the privacy list, as K's button sends it.
 *
 * FAILED on the base: no `kewKeysWords`; the about page said neither the coast rule nor the older-name press.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { kewKeysWords, KEW_KEYS_WORDS } from '$dossier/build-kew';
import { COAST_DEG, SHAPE_BUFFER_DEG } from '$dossier/tdwg-shapes';

const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8');
const plant = readFileSync('src/routes/plants/[acc]/+page.svelte', 'utf8');

describe('a page without a GBIF key says whose keys its records were read under', () => {
  it('only merged pages\' keys: says so, and not that Kew\'s file holds them as this plant', () => {
    const w = kewKeysWords([{ slug: 'bisnaga-hamatacantha' }]);
    expect(w).toBe('this species has no GBIF key of its own; its records are read under the GBIF key of a page merged into this one, never by a name matched');
    expect(w).not.toMatch(/Kew's file holds/);
    expect(kewKeysWords([{ slug: 'a' }, { slug: 'b' }])).toContain('the GBIF keys of pages merged into this one');
  });
  it('Kew\'s keys and a merged page\'s: both named', () => {
    expect(kewKeysWords([{}, { slug: 'a' }])).toContain("for the names Kew's file holds as this plant, and of the pages merged into this one");
  });
  it('Kew\'s keys alone: the words as before (guard)', () => {
    expect(kewKeysWords([{}, {}])).toBe(KEW_KEYS_WORDS);
    expect(kewKeysWords([])).toBe(KEW_KEYS_WORDS);
  });
});

describe('/about/how says the merged code', () => {
  it('the coast rule\'s reach is the code\'s', () => {
    const km = Math.round(COAST_DEG * 111.2); // a degree of latitude; the code scales longitude by the latitude's cosine
    expect(how).toContain(`counts for the region whose drawn coast is nearest, within about ${km} km (${COAST_DEG}°)`);
    expect(how).toMatch(/A record on another region's land never does/);
  });
  it('the box margin is the shape\'s buffer', () => {
    expect(SHAPE_BUFFER_DEG).toBe(0.05);
    expect(how).toContain('tested with the same 5 km margin as a shape');
  });
  it('the regions with a shape are the shapes file\'s', () => {
    const meta = JSON.parse(readFileSync('scripts/tdwg3-shapes.json', 'utf8')).meta as { regions: number; boxOnly: number };
    expect(how).toContain(`${meta.regions} of the ${meta.regions + meta.boxOnly} regions have a shape`);
  });
  it('the plant page\'s "Is it an older name?" is in the privacy list, and is a press, not a load', () => {
    expect(how).toContain('A plant page\'s "Is it an older name?" sends that plant\'s species name to the catalogue\'s search, as the search box does, only when you press it.');
    expect(plant).toMatch(/<button[^>]*id="look-older" onclick=\{lookOlder\}/);
    // Nothing calls it but the button and its "Try again".
    expect([...plant.matchAll(/lookOlder\b/g)].length).toBe(3);
  });
  it('the frost line and the tray say what the frame does now (U)', () => {
    expect(how).toContain('when a frost is within the next 72 hours');
    expect(how).not.toMatch(/within 72 hours of the forecast/);
    expect(how).toContain('anywhere on the page, the top bar and the footer included');
  });
  it('no merge marker is left on the about pages', () => {
    for (const f of ['how', 'formats']) expect(readFileSync(`src/routes/about/${f}/+page.svelte`, 'utf8')).not.toMatch(/<!-- r84 /);
  });
});

describe('a catalogue hit found by an older name says so, though a common name holds one of its words (review-w W4)', () => {
  // Dracaena trifasciata's live index entry (29 October 2026), its names as the search holds them.
  const dracaena = { name: 'Dracaena trifasciata', family: 'Asparagaceae', common: 'Snake plant', commons: ["Mother-in-law's tongue", "Viper's bowstring hemp", 'Snake Sansevieria', 'Bowstring hemp', 'Good luck plant', "Mother-in-law's nose"], origin: ['Nigeria', 'Tanzania'], syn: ['Aletris hyacinthoides var. zeylanica', 'Sansevieria laurentii', 'Sansevieria trifasciata', 'Sansevieria trifasciata subsp. laurentii'] };
  it('"Sansevieria trifasciata" is the older name it was found by (r84base: none, "Snake Sansevieria" and the epithet took it)', async () => {
    const { olderNameOf } = await import('$lib/ui/ref/searched');
    expect(olderNameOf('Sansevieria trifasciata', dracaena)).toBe('Sansevieria trifasciata');
  });
  it('a common name typed is still a common name, and the own name is still its own (guards)', async () => {
    const { olderNameOf } = await import('$lib/ui/ref/searched');
    expect(olderNameOf('snake sansevieria', dracaena)).toBeNull();
    expect(olderNameOf('snake plant', dracaena)).toBeNull();
    expect(olderNameOf('dracaena trifasciata', dracaena)).toBeNull();
  });
});

describe('no repository path on a page: the default points (outside review A6e, found on every page with records at the merge)', () => {
  const OLD = "GBIF occurrence download https://doi.org/10.15468/dl.x; 3 records at a dataset's default point left out (a coordinate where the records of 20 species or more of this reference lie, nearly all of them with no year: scripts/default-points.txt; a record there its dataset states to within 10 km is kept)";
  it('a page built before says it without the path (r84base: "…no year: scripts/default-points.txt; …" in the record of sources)', async () => {
    const { readerWords } = await import('$lib/ui/ref/words');
    const w = readerWords(OLD);
    expect(w).not.toMatch(/scripts\//);
    expect(w).toContain('nearly all of them with no year, as the reference lists them; a record there its dataset states to within 10 km is kept');
  });
  it('the build writes it so, and the repair still counts it', async () => {
    const { defaultWords } = await import('$dossier/build');
    const { defaultLeftOut } = await import('$dossier/repair-r83');
    expect(defaultWords(3)).not.toMatch(/scripts\//);
    expect(defaultLeftOut({ upstream: { 'gbif.occurrences': { detail: `x; ${defaultWords(14)}` } } })).toBe(14);
  });
});

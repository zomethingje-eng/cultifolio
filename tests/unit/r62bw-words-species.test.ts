/**
 * Reviewer "words", round sixty-two verification (`/tmp/r62rev/out/tests/words--species-words.test.ts`), adopted by agent
 * W in the second pass: each test failed on the second pass's base and passes with its fix. The place page's and
 * Today's held alerts and Today's "use my location" (the words review's 6 and 7) are agent A's and are not here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { coldFloor } from '$core/sheet';
import { photoCredit } from '$lib/ui/ref/head';

/** A source file without its comments, which quote old words as history. */
const code = (f: string) => readFileSync(f, 'utf8').replace(/<!--[^]*?-->/g, '').replace(/\/\*[^]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the species page never says "in the wild" over a modelled figure (A3)', () => {
  it('the glance row (species page and front page feature) is not headed "In the wild"', () => {
    // Over a 1st-percentile night from one NASA POWER reanalysis cell and CHELSA medians across cells.
    expect(code('src/lib/ui/ref/Glance.svelte')).not.toMatch(/>\s*In the wild\s*</);
  });
});

describe('the group is said as the table listing it, everywhere (A4)', () => {
  it('the cultivation card\'s line does not say "by its genus (archetype table)"', () => {
    // Renders "Grouped as a cactus or succulent, by its genus (archetype table)." above the card whose "Group." line
    // says "Listed under the genus Copiapoa in the archetype table".
    expect(code('src/routes/species/[slug]/+page.svelte')).not.toContain('by its {sheet.arch.tier} (archetype table)');
    // And the line it says instead, whole (round sixty-seven; triage-66 P4, R45-13).
    expect(code('src/routes/species/[slug]/+page.svelte')).toContain("<p class=\"small archline\">Grouped as {aLabel(sheet.arch.arch.lab)}, {sheet.arch.why}.");
  });
});

describe('a month\'s mean of its lows is named as the labels name it (A3, visitor-words 3)', () => {
  it('the sheet\'s long floor sentence says "mean nightly low", as its short form and every label do', () => {
    const m = Array.from({ length: 12 }, (_, i) => ({ tmax: 22 - (i % 6), tmin: 9 + (i % 6), tmean: 15, precipMm: 5, dli: 40, rh: 70 }));
    const f = coldFloor(m as never, null, null, undefined, 'refused', 'ok')!;
    expect(f.short).toContain('mean nightly low');
    expect(f.s).not.toMatch(/mean night\b/);
  });
  it('the Climograph\'s description does not call a sum of monthly medians a median', () => {
    expect(code('src/lib/ui/Climograph.svelte')).not.toContain('of rain a year. Medians across the range');
    // And what it says instead, whole (round sixty-seven; triage-66 P4, R45-13).
    expect(code('src/lib/ui/Climograph.svelte')).toContain('of rain in the median year (the twelve monthly medians added). Medians across the range, from CHELSA'); // round sixty-seven (N11)
  });
});

describe('a credit says two licences disagree only when they do (A35)', () => {
  it('"CC BY SA 4.0" in the author\'s line agrees with a source tag of CC BY-SA', () => {
    // licenceTag('cc by sa') reads 'by' (its share-alike test wants a hyphen or underscore), so this prints
    // "… · the source tags it CC BY-SA: the two licences disagree". The base printed the line alone.
    expect(photoCredit({ attribution: 'Jane Doe, CC BY SA 4.0', licence: 'by-sa' })).not.toMatch(/disagree/);
  });
});

describe('the species page\'s fallback link-preview alt says the list\'s whole reach (A2)', () => {
  it('not "for cacti, succulents and bulbs" on a Hoya page', () => {
    expect(code('src/routes/species/[slug]/+page.svelte')).not.toContain('habitat climate for cacti, succulents and bulbs');
  });
});

/**
 * Round sixty-two, second pass, agent G: the label's code. An invisible character inside a word is removed, not made a
 * space (triage-outside 6, A36; the verification grower review, 8: "Gymno calycium"), in the name and in the slug the
 * code carries; a cross's code names its parents (triage-self N10). Adopted from /tmp/r62rev/out/tests/grower--qr-invisible.test.ts
 * (its `speciesSlug` cases are names.ts, Q's).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { plantQrUrl, labelFromHash } from '$lib/ui/grow/qr';

const at = (taxonName: string, more: Record<string, unknown> = {}) => labelFromHash(new URL(plantQrUrl('https://x.test', { id: 'p1', taxonName, cultivar: null, nameKind: 'species', ...more } as never)).hash);

describe('an invisible character inside a word does not split the name', () => {
  it.each([
    ['soft hyphen', 'Gymno\u00adcalycium baldianum'],
    ['zero-width space', 'Gymno\u200bcalycium baldianum'],
    ['word joiner', 'Gymno\u2060calycium baldianum'],
    ['byte order mark', '\ufeffGymnocalycium baldianum'],
    ['tag character', 'Gymnocalycium\u{e0041} baldianum']
  ])('%s', (_w, typed) => {
    const got = at(typed);
    expect(got.name).toBe('Gymnocalycium baldianum'); // base: "Gymno calycium baldianum"
    expect(got.slug).toBe('gymnocalycium-baldianum'); // base: "gymno-calycium-baldianum"
  });
  it('a line separator or a control between words is still a space', () => {
    expect(at('Gymnocalycium\u2028baldianum').name).toBe('Gymnocalycium baldianum');
    expect(at('Gymnocalycium\tbaldianum').name).toBe('Gymnocalycium baldianum');
  });
  it('a joined emoji keeps its joiner', () => {
    expect(at('Aloe vera \u{1f468}\u200d\u{1f469}').name).toBe('Aloe vera \u{1f468}\u200d\u{1f469}');
  });
  it('a stranger\'s scanned code is read the same way', () => {
    expect(labelFromHash('#n=' + encodeURIComponent('Copia\u00adpoa cinerea')).name).toBe('Copiapoa cinerea');
  });
});

describe('a cross in the code (triage-self N10)', () => {
  it('names its parents, as its label does, and carries no species slug', () => {
    const got = at('Astrophytum', { nameKind: 'hybrid', parentage: 'Astrophytum asterias × Astrophytum capricorne' });
    expect(got.name).toBe('Astrophytum asterias × capricorne'); // base: "Astrophytum"
    expect(got.slug).toBeNull();
  });
  it('with a cultivar, the cultivar too', () => {
    expect(at('Astrophytum', { nameKind: 'hybrid', cultivar: 'Super Kabuto', parentage: 'Astrophytum asterias × Astrophytum capricorne' }).name).toBe("Astrophytum asterias × capricorne 'Super Kabuto'");
  });
  it('a cross with no parents stated is its genus, and no slug', () => {
    const got = at('Astrophytum', { nameKind: 'hybrid' });
    expect(got).toEqual({ slug: null, name: 'Astrophytum' });
  });
});

describe('the labels page says what a convention line is (triage-self N10)', () => {
  it('counts the care lines that print a group\'s convention, as careLine writes them', async () => {
    const { careLine } = await import('$core/note');
    const { conventionLines } = await import('$lib/ui/label-sheet');
    const orchid = careLine({ scientific: 'Phalaenopsis amabilis', family: null, climateStatus: 'none', months: null, extremes: null } as never);
    expect(orchid).toContain('(convention, no source)');
    expect(conventionLines([orchid, 'dry rain Jun–Aug · floor 4.5 °C (1 in 100, NASA POWER)', 'climate pending', null, undefined, orchid])).toBe(2);
  });
  it('the page says it, once, with the glossary link', () => {
    const src = readFileSync('src/routes/labels/+page.svelte', 'utf8');
    expect(src).toMatch(/id="lb-convention">.*a group's minimum, marked "convention, no source": the lowest temperature growers conventionally keep that group at indoors, not a figure read from the species' habitat/);
  });
});

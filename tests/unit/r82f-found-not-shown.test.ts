/**
 * Round eighty-two, agent F: review 1's 29. A source's row said "answered" for a result the page does not show: GBIF
 * media on pages with no photograph credited to GBIF (196 of the reviewers' 9,463 live dossiers), NASA POWER's daily
 * extremes where the cold floor is set aside (128: 117 at a cell mostly sea, 11 by the lapse rule), Kew's range with no
 * native region (37). Each row now says what was found, read from the dossier when the page is shown (`foundNotShown`,
 * in "Where this page came from"), so the pages built before say it with the app's deploy. FAILED on r82base: no
 * `foundNotShown`, and Provenance showed a row's own words only.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as up from '$lib/ui/ref/upstream';

const found = (up as unknown as { foundNotShown?: typeof up.foundNotShown }).foundNotShown;
const ok = { status: 'ok' };

describe('an answer the page shows none of says what was found', () => {
  it('GBIF media with no photograph credited to GBIF', () => {
    expect(found?.('gbif.media', ok, { photos: [{ src: 'inat' }, { src: 'commons' }] })).toBe("none of the photographs on this page is credited to GBIF: those shown are other sources', and GBIF's were the same photographs or were set aside by the photograph rules");
    expect(found?.('gbif.media', ok, { photos: [{ src: 'gbif' }] })).toBeNull(); // shown
    expect(found?.('gbif.media', { status: 'none' }, { photos: [] })).toBeNull(); // an absence, said as one
  });
  it('the daily extremes set aside: at a cell mostly sea, and by the lapse rule in its own words', () => {
    expect(found?.('climate.extremes', ok, { climate: { status: 'ok', extremesStatus: 'sea', landFraction: 0.31 } })).toBe("read, and set aside: NASA POWER's cell is mostly sea (31% land), so no cold floor is shown");
    expect(found?.('climate.extremes', ok, { climate: { status: 'ok', extremesStatus: 'lapse', months: [{ tmin: 4 }, { tmin: 2 }], extremesLapse: { minAbs: -3, lapseAppliedM: -1181 } } })).toBe("read, and set aside: the correction for elevation, -1181 m, is beyond the 1,000 m either way that a lapse rate is applied over, so the weather cell's ground is other terrain than the typical spot's, so no cold floor is shown");
    expect(found?.('climate.extremes', ok, { climate: { status: 'ok', extremesStatus: 'ok' } })).toBeNull();
  });
  it("Kew's range with no native region, unless the row says so already", () => {
    expect(found?.('wcvp.distribution', ok, { distribution: { native: [], introduced: [1, 2, 3] } })).toBe("Kew's entry lists no native region, only 3 where it is introduced");
    expect(found?.('wcvp.distribution', ok, { distribution: { native: [], introduced: [] } })).toBe("Kew's entry lists no native region");
    expect(found?.('wcvp.distribution', { status: 'ok', detail: 'Kew holds Lantana × strigocamara R.W.Sanders, with no native range' }, { distribution: { native: [] } })).toBeNull();
    expect(found?.('wcvp.distribution', ok, { distribution: { native: [1] } })).toBeNull();
  });
  it('"Where this page came from" shows it beside the row\'s own words', () => {
    const p = readFileSync('src/lib/ui/Provenance.svelte', 'utf8');
    expect(p).toContain('foundNotShown(src, dossier.upstream[src], dossier)');
    expect(p).toContain('{#if detail(src, u.detail)}');
  });
});

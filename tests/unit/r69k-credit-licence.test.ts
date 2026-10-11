/**
 * Round sixty-nine, triage-68 K2 and K3: Commons' credits and licences. The credits are real `Artist` values from the
 * owner's corpus (R46-2, S-B3, S-B4); the licences are Commons' short names (S-B5, S-B7, IND-3). Each case FAILED on the
 * base (1609c19) unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { commonsPhotos } from '$dossier/sources/commons';
import { fixtureFetcher } from '$dossier/fetch';
import { safeUrls } from '$dossier/schema';
import { licenceTag, licenceLabel, isOpen } from '$core/licence';
import { tileCreditOf, photoCredit, creditParts } from '$lib/ui/ref/head';

const TITLE = 'File:Aloe juvenna, Maui.jpg';
const file = (meta: Record<string, string>) => ({ query: { pages: { '1': { title: TITLE, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Aloe_juvenna%2C_Maui.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Aloe_juvenna%2C_Maui.jpg/960px-Aloe_juvenna%2C_Maui.jpg', width: 3000, height: 2000, extmetadata: Object.fromEntries(Object.entries(meta).map(([k, value]) => [k, { value }])) }] } } } });
const take = async (meta: Record<string, string>) => {
  const r = await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': file(meta) }), 'Aloe juvenna');
  return r.status === 'ok' ? { licence: r.data[0].licence, attribution: r.data[0].attribution } : null;
};
/** A stored Commons photograph, read as the Worker reads a dossier. */
const stored = (attribution: string, licence = 'by-sa', src = 'commons', id = TITLE) => safeUrls({ name: { scientific: 'Aloe juvenna', synonyms: [], vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: [{ src, id, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A.jpg/960px-A.jpg', thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/A.jpg/500px-A.jpg', width: 3000, licence, attribution }] } as never).photos[0] ?? null;

describe('K2: the author is Commons\' Artist, cleaned, and only an author', () => {
  it('"Own work" is Commons\' Credit, the file\'s source, not its author: a CC BY-SA file with no Artist is not published', async () => {
    expect(await take({ LicenseShortName: 'CC BY-SA 4.0', Credit: '<span class="int-own-work">Own work</span>' })).toBeNull();
    expect(await take({ LicenseShortName: 'CC0', Credit: 'Own work' })).toEqual({ licence: 'cc0', attribution: 'author not stated, CC0, via Wikimedia Commons' }); // guard: CC0 asks for no name
  });
  it('entities are decoded, a line break ends the author, and Commons\' assumed author is the author', async () => {
    expect((await take({ LicenseShortName: 'CC BY 2.0', Artist: 'Forest &amp; Kim Starr' }))?.attribution).toBe('Forest & Kim Starr, CC BY 2.0, via Wikimedia Commons');
    expect((await take({ LicenseShortName: 'CC BY-SA 3.0', Artist: 'No machine-readable author provided. Qgroom assumed (based on copyright claims).' }))?.attribution).toBe('Qgroom, CC BY-SA 3.0, via Wikimedia Commons');
    expect((await take({ LicenseShortName: 'CC BY-SA 3.0', Artist: 'This photo has been taken by Matthieu Sontag (User:Mirgolth) and released under the licenses stated below. You are free to use it for any purpose as long as you credit me.' }))?.attribution).toBe('Matthieu Sontag (User:Mirgolth), CC BY-SA 3.0, via Wikimedia Commons');
    expect((await take({ LicenseShortName: 'CC BY-SA 4.0', Artist: '<a href="//commons.wikimedia.org/wiki/User:Natalie-S" title="User:Natalie-S">User:Natalie-S</a>' }))?.attribution).toBe('User:Natalie-S, CC BY-SA 4.0, via Wikimedia Commons'); // guard
    expect((await take({ LicenseShortName: 'CC BY-SA 4.0', Artist: '<a href="//commons.wikimedia.org/wiki/User:Daderot">Daderot</a> (<a href="//commons.wikimedia.org/wiki/User_talk:Daderot">talk</a>)' }))?.attribution).toBe('Daderot, CC BY-SA 4.0, via Wikimedia Commons');
  });
  it('what is not an author leaves a CC BY or CC BY-SA file out', async () => {
    for (const a of ['See above', 'Unknown authorUnknown author', '(talk)', 'https://www.flickr.com/people/12345@N00', 'derivative work: Photohound (talk)\nIncenseWikiVers.jpg: Transferred from en.wikipedia', 'No machine-readable author provided.']) {
      expect(await take({ LicenseShortName: 'CC BY-SA 3.0', Artist: a })).toBeNull();
    }
    expect(await take({ LicenseShortName: 'CC0', Artist: 'See above' })).toEqual({ licence: 'cc0', attribution: 'author not stated, CC0, via Wikimedia Commons' });
  });
  it('a stored credit is read by the same rule, so the deploy corrects every page', () => {
    expect(stored('Own work, CC BY-SA 4.0, via Wikimedia Commons')).toBeNull();
    expect(stored('Forest &amp; Kim Starr, CC BY 2.0, via Wikimedia Commons', 'by')?.attribution).toBe('Forest & Kim Starr, CC BY 2.0, via Wikimedia Commons');
    expect(stored('No machine-readable author provided. Denis Barthel assumed (based on copyright claims)., CC BY-SA 3.0, via Wikimedia Commons')?.attribution).toBe('Denis Barthel, CC BY-SA 3.0, via Wikimedia Commons');
    expect(stored('derivative work: Photohound (talk)\nIncenseWikiVers.jpg: Transferred from en.wikipedia, CC BY-SA 3.0, via Wikimedia Commons')).toBeNull();
    expect(stored('Unknown authorUnknown author, CC0, via Wikimedia Commons', 'cc0')?.attribution).toBe('author not stated, CC0, via Wikimedia Commons');
    expect(stored('Collector:\tBolus, H.M.L., CC BY 4.0, via Wikimedia Commons', 'by')?.attribution).toBe('Collector: Bolus, H.M.L., CC BY 4.0, via Wikimedia Commons'); // guard: a name, said on one line
    expect(stored('A. Grower, CC BY-SA 2.5,2.0,1.0, via Wikimedia Commons')?.attribution).toBe('A. Grower, CC BY-SA 2.5,2.0,1.0, via Wikimedia Commons'); // guard
  });
  it('the tile reads the cleaned author, not "No machine-readable author…"', () => {
    const p = stored('No machine-readable author provided. Qgroom assumed (based on copyright claims)., CC BY-SA 3.0, via Wikimedia Commons');
    expect(tileCreditOf(p)).toBe('CC BY-SA, Qgroom');
    expect(tileCreditOf(stored('A. Grower, CC BY-SA 2.5,2.0,1.0, via Wikimedia Commons'))).toBe('CC BY-SA, A. Grower'); // a version list holds commas
  });
  it('a GBIF photograph is not read by Commons\' rules (guard)', () => {
    const p = stored('Forest &amp; Kim Starr, CC0, via GBIF', 'cc0', 'gbif', '1655981894:0');
    expect(p?.attribution).toBe('Forest &amp; Kim Starr, CC0, via GBIF');
    expect(p?.licence).toBe('cc0');
  });
});

describe('K2: the prune\'s rule is the read\'s', () => {
  it('uncreditedPhoto catches Commons\' non-authors and keeps the old pattern', async () => {
    const { uncreditedPhoto } = await import('$dossier/photo-credit');
    expect(uncreditedPhoto({ src: 'commons', licence: 'by-sa', attribution: 'Own work, CC BY-SA 4.0, via Wikimedia Commons' })).toBe(true);
    expect(uncreditedPhoto({ src: 'commons', licence: 'by', attribution: 'See above, CC BY 4.0, via Wikimedia Commons' })).toBe(true);
    expect(uncreditedPhoto({ licence: 'by-sa', attribution: 'https://example.org/me, CC BY-SA 4.0, via Wikimedia Commons' })).toBe(true); // the index's photographs carry no src
    expect(uncreditedPhoto({ src: 'gbif', licence: 'by', attribution: 'unknown, CC BY, via GBIF' })).toBe(true);
    expect(uncreditedPhoto({ src: 'commons', licence: 'by-sa', attribution: 'User:Natalie-S, CC BY-SA 4.0, via Wikimedia Commons' })).toBe(false);
    expect(uncreditedPhoto({ src: 'commons', licence: 'cc0', attribution: 'Own work, CC0, via Wikimedia Commons' })).toBe(false);
    expect(uncreditedPhoto({ src: 'gbif', licence: 'by', attribution: 'Own work, CC BY, via GBIF' })).toBe(false);
  });
});

describe('K3: public domain is not CC0, and "Attribution" is not CC BY', () => {
  it('a pd tag, shown "Public domain", open as CC0 is', () => {
    expect(licenceLabel('pd' as never)).toBe('Public domain');
    expect(isOpen('pd' as never)).toBe(true);
    expect(licenceTag('Public domain')).toBe('pd');
    expect(licenceTag('http://creativecommons.org/publicdomain/mark/1.0/')).toBe('pd');
    expect(licenceTag('Public Domain Mark 1.0')).toBe('pd');
    expect(licenceTag('http://creativecommons.org/publicdomain/zero/1.0/legalcode')).toBe('cc0'); // guard
    expect(licenceTag('CC0_1_0')).toBe('cc0'); // guard
  });
  it('"Attribution" alone is another licence; Creative Commons\' own words are still CC BY', () => {
    for (const s of ['Attribution', 'Attribution only license', 'Copyrighted, attribution-only', 'Data licence Germany – attribution – version 2.0']) expect(licenceTag(s)).toBe('other');
    for (const s of ['Creative Commons Attribution 4.0 International', 'http://creativecommons.org/licenses/by/4.0/', 'CC_BY_4_0', 'cc-by', 'CC BY 4.0']) expect(licenceTag(s)).toBe('by'); // guard
    expect(licenceTag('Creative Commons Attribution-ShareAlike 4.0')).toBe('by-sa'); // guard
    expect(licenceTag('Creative Commons Attribution-NonCommercial 4.0')).toBe('nc'); // guard
  });
  it('Commons\' short names are read strictly', async () => {
    expect(await take({ LicenseShortName: 'Public domain', Artist: 'US Forest Service' })).toEqual({ licence: 'pd', attribution: 'US Forest Service, Public domain, via Wikimedia Commons' });
    expect((await take({ LicenseShortName: 'PD-old-100', Artist: 'W. Fitch' }))?.licence).toBe('pd');
    expect(await take({ LicenseShortName: 'Attribution', Artist: 'A. Grower' })).toBeNull();
    expect(await take({ LicenseShortName: 'Copyrighted free use', Artist: 'A. Grower' })).toBeNull(); // guard
    expect((await take({ LicenseShortName: 'CC BY-SA 3.0 de', Artist: 'A. Grower' }))?.licence).toBe('by-sa'); // guard
  });
  it('a stored Commons photograph tagged CC0 whose credit says "Public domain" is read as public domain, everywhere it is shown', () => {
    const p = stored('author not stated, Public domain, via Wikimedia Commons', 'cc0');
    expect(p?.licence).toBe('pd');
    expect(creditParts(p!).lic).toBe('Public domain');
    expect(photoCredit(p!)).toBe('author not stated, Public domain, via Wikimedia Commons');
    expect(tileCreditOf(p)).toBe('Public domain, author not stated');
    expect(stored('W. Fitch, PD-old, via Wikimedia Commons', 'cc0')?.licence).toBe('pd');
    expect(stored('A. Grower, Attribution, via Wikimedia Commons', 'by')).toBeNull();
    expect(stored('A. Grower, CC0, via Wikimedia Commons', 'cc0')?.licence).toBe('cc0'); // guard
  });
});

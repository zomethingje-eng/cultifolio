/**
 * Round seventy, REVIEW-TRIAGE-69 C3 (S-C8): what a Commons credit carries around its author is cleaned from it, keeping
 * the person; an unfilled template names no one; `--prune-uncredited` reads the same rule. The `Artist` values and the
 * stored credits are live ones, read on 2026-10-12. Each case FAILED on the base unless it says "guard".
 */
import { describe, it, expect } from 'vitest';
import { commonsPhotos } from '$dossier/sources/commons';
import { fixtureFetcher } from '$dossier/fetch';
import { safeUrls } from '$dossier/schema';
import { commonsAuthor, uncreditedPhoto } from '$dossier/photo-credit';

const TITLE = 'File:Plectocephalus americanus.jpg';
const take = async (artist: string, licence = 'CC BY 2.0') => {
  const data = { query: { pages: { '1': { title: TITLE, imageinfo: [{ url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/P.jpg', thumburl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/P.jpg/960px-P.jpg', width: 3000, height: 2000, extmetadata: { LicenseShortName: { value: licence }, Artist: { value: artist } } }] } } } };
  const r = await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': data }), 'Plectocephalus americanus');
  return r.status === 'ok' ? r.data[0].attribution : null;
};
/** A stored Commons photograph, read as the Worker reads a dossier: its credit as shown, or null when it is not published. */
const stored = (attribution: string, licence = 'by') => safeUrls({ name: { scientific: 'Plectocephalus americanus', synonyms: [], vernacular: [], status: 'accepted' }, climate: { status: 'none' }, literature: [], links: {}, upstream: {}, photos: [{ src: 'commons', id: TITLE, url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/P.jpg/960px-P.jpg', thumb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/P.jpg/500px-P.jpg', width: 3000, licence, attribution }] } as never).photos[0]?.attribution ?? null;

describe('C3: the author, keeping the person', () => {
  it('a new answer: the footnote link and "Uploaded by" in <small> go, and a talk link is not run into the name', async () => {
    expect(await take('Dwight Sipler <a rel="nofollow" class="external autonumber" href="http://www.flickr.com/photos/dwightsipler/">[2]</a><small>Uploaded by <a href="//commons.wikimedia.org/wiki/User:Uleli" title="User:Uleli">uleli</a></small>')).toBe('Dwight Sipler, CC BY 2.0, via Wikimedia Commons');
    expect(await take('<a href="//commons.wikimedia.org/wiki/User:X">X</a> (<a href="//commons.wikimedia.org/wiki/User_talk:X">talk</a> · <a href="//commons.wikimedia.org/wiki/Special:Contributions/X">contribs</a>)')).toBe('X, CC BY 2.0, via Wikimedia Commons');
    expect(await take('<a href="//commons.wikimedia.org/wiki/User:Daderot">Daderot</a> (<a href="//commons.wikimedia.org/wiki/User_talk:Daderot">talk</a>)')).toBe('Daderot, CC BY 2.0, via Wikimedia Commons'); // guard
  });
  it('a stored credit, read by the same rule, so the deploy corrects every page', () => {
    expect(stored('Dwight Sipler [2]Uploaded by uleli, CC BY 2.0, via Wikimedia Commons')).toBe('Dwight Sipler, CC BY 2.0, via Wikimedia Commons');
    expect(stored('Guérin Nicolas (messages) 19:48, 25 September 2008 (UTC), CC BY-SA 3.0, via Wikimedia Commons', 'by-sa')).toBe('Guérin Nicolas, CC BY-SA 3.0, via Wikimedia Commons');
    expect(stored('Marco Schmidt [1], CC BY-SA 2.5, via Wikimedia Commons', 'by-sa')).toBe('Marco Schmidt, CC BY-SA 2.5, via Wikimedia Commons');
    expect(stored('Kurt Stüber [1], CC BY-SA 3.0, via Wikimedia Commons', 'by-sa')).toBe('Kurt Stüber, CC BY-SA 3.0, via Wikimedia Commons');
    expect(stored('The original uploader was Jean-Jacques MILAN at French Wikipedia., CC BY-SA 3.0, via Wikimedia Commons', 'by-sa')).toBe('Jean-Jacques MILAN, CC BY-SA 3.0, via Wikimedia Commons');
    expect(stored('X (talk · contribs), CC BY-SA 4.0, via Wikimedia Commons', 'by-sa')).toBe('X, CC BY-SA 4.0, via Wikimedia Commons');
    expect(stored('Krzysztof Ziarnek, Kenraiz, CC BY-SA 4.0, via Wikimedia Commons', 'by-sa')).toBe('Krzysztof Ziarnek, Kenraiz, CC BY-SA 4.0, via Wikimedia Commons'); // guard
    expect(stored('Ewen Cameron; Craig Sinclair, CC BY 4.0, via Wikimedia Commons')).toBe('Ewen Cameron; Craig Sinclair, CC BY 4.0, via Wikimedia Commons'); // guard
  });
  it('an e-mail address is not published, and alone it is no author: under CC BY or CC BY-SA the photograph is not shown', () => {
    expect(stored('manfred.sause@volloeko.de, CC BY-SA 3.0, via Wikimedia Commons', 'by-sa')).toBeNull();
    expect(commonsAuthor('Hans Hillewaert <a href="mailto:hh@example.be">hh@example.be</a>')).toBe('Hans Hillewaert');
    expect(stored('manfred.sause@volloeko.de, Public domain, via Wikimedia Commons', 'pd')).toBe('author not stated, Public domain, via Wikimedia Commons');
  });
  it('an unfilled template ("(MiNombre") is no author: Agave cocui\'s CC BY 3.0 lead is not shown', () => {
    expect(stored('(MiNombre, CC BY 3.0, via Wikimedia Commons')).toBeNull();
    expect(commonsAuthor('MyName')).toBeNull();
  });
  it('a tag between two words is read as a space', () => {
    expect(commonsAuthor('<a href="//commons.wikimedia.org/wiki/User:J">Jean</a><a href="//commons.wikimedia.org/wiki/User:J">Dupont</a>')).toBe('Jean Dupont');
  });
  it('a line break ends the author (S-C13; guard: kills the mutant that reads no `<br>`, and passes on the base)', () => {
    expect(commonsAuthor('A. Grower<br />Kirstenbosch, 2011')).toBe('A. Grower');
  });
});

describe('C3: --prune-uncredited reads the same rule', () => {
  it('prunes what the read does not publish, and keeps the person whose credit was only dressed', () => {
    expect(uncreditedPhoto({ src: 'commons', licence: 'by', attribution: '(MiNombre, CC BY 3.0, via Wikimedia Commons' })).toBe(true);
    expect(uncreditedPhoto({ src: 'commons', licence: 'by-sa', attribution: 'manfred.sause@volloeko.de, CC BY-SA 3.0, via Wikimedia Commons' })).toBe(true);
    expect(uncreditedPhoto({ src: 'commons', licence: 'by', attribution: 'Dwight Sipler [2]Uploaded by uleli, CC BY 2.0, via Wikimedia Commons' })).toBe(false); // guard
    expect(uncreditedPhoto({ src: 'commons', licence: 'pd', attribution: '(MiNombre, Public domain, via Wikimedia Commons' })).toBe(false); // guard
  });
});

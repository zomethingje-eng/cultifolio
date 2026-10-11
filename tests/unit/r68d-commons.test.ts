/**
 * Round sixty-eight, fourth part: not one photograph in the corpus came from Wikimedia Commons. Commons now answers
 * `imageinfo` with a tracking query on every address and its thumbnails on thumb.wikimedia.org at a standard width
 * (960; 800 answers 400), and the builder tested the file's extension at the very end of the address. Each case FAILED
 * on round sixty-eight's third part unless it says "guard". The shape below is Commons' answer for Crassula socialis on
 * 2026-10-11, in part.
 */
import { describe, it, expect } from 'vitest';
import { commonsPhotos, commonsUrl } from '$dossier/sources/wikimedia';
import { fixtureFetcher } from '$dossier/fetch';
import { shownAt } from '$dossier/photo-size';
import { showable } from '$lib/ui/ref/photos';

const Q = '?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=';
const PATH = 'wikipedia/commons/f/fb/Crassula_socialis_-_Kaisaniemi%2C_Helsinki.JPG';
const THUMB = 'wikipedia/commons/thumb/f/fb/Crassula_socialis_-_Kaisaniemi%2C_Helsinki.JPG/960px-Crassula_socialis_-_Kaisaniemi%2C_Helsinki.JPG';
const file = (o: Record<string, unknown>) => ({ query: { pages: { '1': { title: 'File:Crassula socialis - Kaisaniemi, Helsinki.JPG', imageinfo: [{ url: `https://upload.wikimedia.org/${PATH}${Q}original`, thumburl: `https://thumb.wikimedia.org/${THUMB}${Q}thumbnail`, width: 4000, height: 3000, descriptionurl: 'https://commons.wikimedia.org/wiki/File:Crassula_socialis_-_Kaisaniemi,_Helsinki.JPG', extmetadata: { LicenseShortName: { value: 'CC0' }, Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:Daderot">Daderot</a>' } }, ...o }] } } } });

describe('a Commons address as Commons now gives it', () => {
  it('loses its tracking query, and a thumbnail is given at upload.wikimedia.org', () => {
    expect(commonsUrl(`https://thumb.wikimedia.org/${THUMB}${Q}thumbnail`)).toBe(`https://upload.wikimedia.org/${THUMB}`);
    expect(commonsUrl(`https://upload.wikimedia.org/${PATH}${Q}original`)).toBe(`https://upload.wikimedia.org/${PATH}`);
  });
});

describe('Commons\' photographs reach the dossier', () => {
  it('a file Commons answers in its 2026 shape is taken: shown at 960 pixels, its tile at 500', async () => {
    const r = await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': file({}) }), 'Crassula socialis');
    expect(r.status).toBe('ok'); // base: none, every file failing the extension test
    if (r.status !== 'ok') return;
    expect(r.data[0]).toMatchObject({ src: 'commons', licence: 'cc0', url: `https://upload.wikimedia.org/${THUMB}`, thumb: `https://upload.wikimedia.org/${THUMB.replace('/960px-', '/500px-')}` });
    expect(shownAt(r.data[0])).toBe(`https://upload.wikimedia.org/${THUMB}`); // guard: the page loads the 960, never the original
    expect(showable(r.data[0])).toBe(true);
  });
  it('a file narrower than the thumbnail is shown as it is (guard)', async () => {
    const r = await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': file({ width: 400, height: 300, thumburl: `https://upload.wikimedia.org/${PATH}${Q}original` }) }), 'Crassula socialis');
    expect(r.status === 'ok' && r.data[0]).toMatchObject({ url: `https://upload.wikimedia.org/${PATH}`, thumb: `https://upload.wikimedia.org/${PATH}` });
  });
  it('a licence the site does not show is still left out, and so is a CC BY file with no author (guard)', async () => {
    expect((await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': file({ extmetadata: { LicenseShortName: { value: 'CC BY-NC 4.0' }, Artist: { value: 'A' } } }) }), 'X y')).status).toBe('none');
    expect((await commonsPhotos(fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': file({ extmetadata: { LicenseShortName: { value: 'CC BY 4.0' } } }) }), 'X y')).status).toBe('none');
  });
});

describe('--fill commons', () => {
  it('gives a dossier with none Commons\' photographs, and records the category asked', async () => {
    const { fillCommons } = await import('$dossier/commons-fill');
    const d = { key: 5689989, name: { scientific: 'Crassula socialis' }, photos: [] as unknown[], upstream: {} as Record<string, { status: string; at: string; detail?: string }> };
    expect(await fillCommons(d as never, fixtureFetcher({ 're:gcmtitle=Category%3ACrassula%20socialis': file({}) }), () => 'now')).toEqual({ added: 1 });
    expect(d.photos).toHaveLength(1);
    expect(d.upstream.commons).toEqual({ status: 'ok', at: 'now', detail: 'Category:Crassula socialis' });
  });
  it('one told there is none is passed by the next fill; a refusal leaves the dossier as it was (guard)', async () => {
    const { fillCommons, askedCommons } = await import('$dossier/commons-fill');
    const d = { key: 1, name: { scientific: 'X y' }, photos: [], upstream: { commons: { status: 'none', at: 'x', detail: 'carried from build of 2026-09-19 (rederive)' } } as Record<string, { status: string; at: string; detail?: string }> };
    expect(askedCommons(d as never)).toBe(false); // the build's own "none", made under the bug, is asked again
    expect(await fillCommons(d as never, fixtureFetcher({}, { status: 'refused', detail: 'commons.wikimedia.org 429' }))).toEqual({ failed: 'commons.wikimedia.org 429' });
    expect(d.upstream.commons.detail).toBe('carried from build of 2026-09-19 (rederive)');
    expect(await fillCommons(d as never, fixtureFetcher({ 'https://commons.wikimedia.org/w/api.php': { query: { pages: {} } } }))).toEqual({ none: true });
    expect(askedCommons(d as never)).toBe(true);
  });
});

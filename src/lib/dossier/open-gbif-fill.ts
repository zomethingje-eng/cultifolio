/**
 * Photographs for a dossier that has none, from GBIF's own records under an open licence (round sixty-eight). Of the
 * 8,947 species, 3,429 had no photograph: GBIF's records were read whatever their licence and the first 100 of most were
 * CC BY-NC, and iNaturalist's own openly licensed photographs are few. One request a species, no other source asked.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier } from './schema';
import * as gbif from './sources/gbif';
import { photosFromMedia, mergeGbifPhotos, withoutGivenMedia } from './build';

/** What the fill did for one dossier: photographs added, none there, or the source not answering (the dossier untouched). */
export type OpenFill = { added: number } | { none: true } | { failed: string };

/** What a dossier records when GBIF has no openly licensed photograph for it: a later fill passes it by, so a stopped fill resumes. */
export const OPEN_NONE = 'no GBIF record under an open licence has a photograph';

/**
 * What a dossier records when GBIF's openly licensed records have photographs and none can be shown (under CC BY, none
 * names its author: `photosFromMedia`): settled as none, as above (round seventy-two: eight species of 85 were asked
 * again on every run, and the fill's count left them out).
 */
export const OPEN_NONE_SHOWN = 'GBIF records under an open licence have photographs, none naming the author its licence requires';

/** Whether this fill has already asked for this dossier and been told there is none. */
// Its words, alone or followed by the photographs left out as another page's (round eighty-six, final review S1).
export const askedOpen = (d: Pick<Dossier, 'upstream'>) => { const x = d.upstream?.['gbif.media']?.detail ?? ''; return [OPEN_NONE, OPEN_NONE_SHOWN].some((w) => x === w || x.startsWith(`${w}; `)); };

export async function fillOpenGbif(d: Pick<Dossier, 'key' | 'ids' | 'photos' | 'upstream'>, f: JsonFetcher, now = () => new Date().toISOString(), given?: { keys: ReadonlySet<number> }): Promise<OpenFill> {
  // By the page's GBIF key (round seventy-eight: its `key` is its id). A page without one (round seventy-nine) is not asked.
  if (d.ids.gbif == null) return { failed: 'not asked: the page has no GBIF key' };
  // The photographs of records another page reads by Kew's synonymy left out, as a build leaves them (round eighty-six,
  // final review S1; `withoutGivenMedia`).
  const g = withoutGivenMedia(await gbif.media(f, d.ids.gbif), given);
  const m = g.m;
  const said = (x: string) => [x, g.words].filter(Boolean).join('; ');
  if (m.status === 'ok') {
    const fresh = photosFromMedia(m.data);
    if (!fresh.length) {
      d.upstream['gbif.media'] = { status: 'none', at: now(), detail: said(OPEN_NONE_SHOWN) };
      return { none: true };
    }
    d.photos = mergeGbifPhotos(d.photos ?? [], fresh);
    d.upstream['gbif.media'] = { status: 'ok', at: now(), detail: said('GBIF records under an open licence (CC0, CC BY)') };
    return { added: fresh.length };
  }
  if (m.status === 'none') {
    d.upstream['gbif.media'] = { status: 'none', at: now(), detail: said(OPEN_NONE) };
    return { none: true };
  }
  // A refusal or a failure changes nothing on the page: the dossier keeps what it said, and a later fill asks again.
  return { failed: m.status === 'skipped' ? 'not asked' : m.detail };
}

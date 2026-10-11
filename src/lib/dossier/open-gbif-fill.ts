/**
 * Photographs for a dossier that has none, from GBIF's own records under an open licence (round sixty-eight). Of the
 * 8,947 species, 3,429 had no photograph: GBIF's records were read whatever their licence and the first 100 of most were
 * CC BY-NC, and iNaturalist's own openly licensed photographs are few. One request a species, no other source asked.
 */
import type { JsonFetcher } from './fetch';
import type { Dossier } from './schema';
import * as gbif from './sources/gbif';
import { photosFromMedia, mergeGbifPhotos } from './build';

/** What the fill did for one dossier: photographs added, none there, or the source not answering (the dossier untouched). */
export type OpenFill = { added: number } | { none: true } | { failed: string };

/** What a dossier records when GBIF has no openly licensed photograph for it: a later fill passes it by, so a stopped fill resumes. */
export const OPEN_NONE = 'no GBIF record under an open licence has a photograph';

/** Whether this fill has already asked for this dossier and been told there is none. */
export const askedOpen = (d: Pick<Dossier, 'upstream'>) => d.upstream?.['gbif.media']?.detail === OPEN_NONE;

export async function fillOpenGbif(d: Pick<Dossier, 'key' | 'photos' | 'upstream'>, f: JsonFetcher, now = () => new Date().toISOString()): Promise<OpenFill> {
  const m = await gbif.media(f, d.key);
  if (m.status === 'ok') {
    const fresh = photosFromMedia(m.data);
    d.photos = mergeGbifPhotos(d.photos ?? [], fresh);
    d.upstream['gbif.media'] = { status: 'ok', at: now(), detail: 'GBIF records under an open licence (CC0, CC BY)' };
    return { added: fresh.length };
  }
  if (m.status === 'none') {
    d.upstream['gbif.media'] = { status: 'none', at: now(), detail: OPEN_NONE };
    return { none: true };
  }
  // A refusal or a failure changes nothing on the page: the dossier keeps what it said, and a later fill asks again.
  return { failed: m.status === 'skipped' ? 'not asked' : m.detail };
}

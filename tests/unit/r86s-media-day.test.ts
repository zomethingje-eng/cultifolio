/**
 * Round eighty-six, the sources agent: review D's D5 (rule 4). GBIF's photograph credits said "read from GBIF on
 * 2026-11-01", the offline walk's day, for photographs read from the download of 2026-10-21: the walk wrote the
 * `gbif.media` row with its own time and no word of the files, and `creditDays` reads a photograph with no day of its own by
 * that row. Now a media answer from a download's files says the download and its day (`bulkFetcher`'s `mediaFrom`,
 * `gbif.media`'s `asOf`), the build keeps it on the row, `--fill gbif` writes it, and `--fill gbif-media-day` mends the rows
 * the walk wrote (with `--dry-run`).
 *
 * The record: Kaempferia galanga (k250781) as the live corpus held it on 2026-11-05 (`D-s/dos/`): 15 GBIF photographs with
 * no day of their own, under a row written by the walk of 2026-11-01. The download: 10.15468/dl.hbdw64 of 2026-10-21, as
 * the page's own records name it.
 *
 * On r86base (9cf3077) every `it` but the guard FAILED: the media answer carried no day, `gbif.media` gave no `asOf`, and
 * `media-day.ts` did not exist; the credit line said "from GBIF on 2026-11-01".
 */
import { describe, it, expect } from 'vitest';
import * as gbif from '$dossier/sources/gbif';
import { bulkFetcher } from '$dossier/bulk';
import { creditDays } from '$lib/ui/ref/credit-days';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';

const GALANGA = () => ({
  key: 'k250781',
  name: { scientific: 'Kaempferia galanga' },
  photos: Array.from({ length: 15 }, (_, i) => ({ src: 'gbif', id: `g${i}`, attribution: 'Pierre Bonnet, CC BY-SA, via GBIF' })),
  upstream: {
    'gbif.species': { status: 'ok', at: '2026-11-01T14:56:44.568Z', detail: 'carried from build of 2026-10-30 (offline re-derivation; the backbone was not asked)' },
    'gbif.media': { status: 'ok', at: '2026-11-01T14:56:44.599Z' } as { status: string; at: string; detail?: string; asOf?: string }
  }
});
const FROM = { doi: '10.15468/dl.hbdw64', day: '2026-10-21' };

describe('D5: GBIF photographs read from a download say the download\'s day', () => {
  it('the files\' answer says the download and its day, and gbif.media keeps it as the row\'s asOf', async () => {
    const page = { results: [{ key: 4242, datasetKey: 'd', basisOfRecord: 'HUMAN_OBSERVATION', media: [{ type: 'StillImage', identifier: 'https://example.org/a.jpg', license: 'http://creativecommons.org/licenses/by/4.0/', creator: 'A' }] }], endOfRecords: true, count: 1 };
    const none: JsonFetcher = (async () => ({ status: 'refused', detail: 'not asked' })) as JsonFetcher;
    const f = bulkFetcher(none, { media: { page: (k: number) => (k === 1 ? page : undefined) } as never, mediaFrom: FROM } as never);
    const r = await gbif.media(f, 1);
    expect(r.status).toBe('ok');
    expect(r.asOf).toBe('2026-10-21');
    expect((r as { detail?: string }).detail).toBe('from the GBIF download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21');
    // A species the files hold no photograph of: none, from the same download, of the same day.
    const n = await gbif.media(f, 2);
    expect(n).toMatchObject({ status: 'none', asOf: '2026-10-21' });
  });

  it('GBIF\'s API answer carries no download and no day (guard)', async () => {
    const api = (async <T,>(): Promise<FetchResult<T>> => ({ status: 'ok', data: { results: [], endOfRecords: true, count: 0 } as T })) as JsonFetcher;
    const r = await gbif.media(api, 1);
    expect(r).toEqual({ status: 'none' });
  });

  it('--fill gbif-media-day: the walk\'s row gains the download\'s day, so the credit says 2026-10-21; a dry run writes nothing', async () => {
    const mod = await import('$dossier/media-day').catch(() => null);
    expect(mod).not.toBeNull();
    const { mediaDay } = mod!;
    const before = GALANGA();
    expect(creditDays(before.photos, before.upstream)).toBe('Credits as read from GBIF on 2026-11-01'); // what the page said
    const dry = GALANGA();
    const c0 = { read: 0, changed: 0, photographs: 0, left: 0, lines: [] as string[] };
    expect(mediaDay(dry, FROM, c0, true)).toBe(true);
    expect(dry).toEqual(GALANGA());
    expect(c0).toMatchObject({ changed: 1, photographs: 15 });
    expect(c0.lines).toEqual(['Kaempferia galanga [k250781]: 15 GBIF photographs would be said as of 2026-10-21, not 2026-11-01']);
    const d = GALANGA();
    const c = { read: 0, changed: 0, photographs: 0, left: 0, lines: [] as string[] };
    expect(mediaDay(d, FROM, c)).toBe(true);
    expect(d.upstream['gbif.media']).toEqual({ status: 'ok', at: '2026-11-01T14:56:44.599Z', asOf: '2026-10-21', detail: 'from the GBIF download https://doi.org/10.15468/dl.hbdw64, of 2026-10-21' });
    expect(creditDays(d.photos, d.upstream)).toBe('Credits as read from GBIF on 2026-10-21');
    // A second run changes nothing; a row an online build wrote (GBIF's API asked) is left as it is.
    expect(mediaDay(d, FROM, c)).toBe(false);
    const online = GALANGA();
    online.upstream['gbif.species'] = { status: 'ok', at: '2026-10-22T08:00:00.000Z', detail: '' };
    online.upstream['gbif.media'] = { status: 'ok', at: '2026-10-22T08:00:01.000Z' };
    expect(mediaDay(online, FROM, c)).toBe(false);
    // A row read before the download in the folder was made says nothing of it, and is left.
    const older = GALANGA();
    older.upstream['gbif.media'].at = '2026-10-01T00:00:00.000Z';
    older.upstream['gbif.species'].at = '2026-10-01T00:00:00.000Z';
    expect(mediaDay(older, FROM, c)).toBe(false);
    expect(c.left).toBe(1);
  });
});

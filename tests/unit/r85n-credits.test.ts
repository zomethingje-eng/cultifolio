/**
 * Round eighty-five (N): credits carry their day (the owner's decision 7; outside review B2) and summaries their revision
 * (decision 8).
 *
 * 1. A photograph a build or fill reads is stamped with the day (`stampRead`, `stampNew`); one carried keeps its own day,
 *    or none, never today's.
 * 2. `--fill credits` reads each iNaturalist and Commons credit again (`applyCredits`): B2's two Hibiscus rosa-sinensis
 *    photographs, credited to "Vreni Gem O. Caasi" where iNaturalist now names "Casey Clark G. Sumalinog", are corrected,
 *    by the observation's uuid (a wild photograph read from the open data); a photograph whose licence is no longer open,
 *    or whose file is gone, is dropped and said; one the source did not answer stays as it was, unstamped.
 * 3. A summary records the revision it was read at; `--fill summary-revisions` records it, refreshes a lead that changed,
 *    and leaves a moved article to `--fill summaries` (`readRevision`).
 *
 * FAILS on r85base: `photo-read.ts` and `revision-fill.ts` do not exist, and `summary` gives no revision. Checked by
 * running this file on a checkout of r85base.
 */
import { describe, it, expect } from 'vitest';
import { stampRead, stampNew, applyCredits, observationOf, inatCredit, commonsFileCredit, CREDIT_OBS_URL, type CreditCounts } from '$dossier/photo-read';
import { readRevision, revisionWanted, type RevisionCounts, type RevisionPage } from '$dossier/revision-fill';
import { summary } from '$dossier/sources/wikipedia';
import type { JsonFetcher } from '$dossier/fetch';

const counts = (): CreditCounts => ({ pages: 0, read: 0, changed: 0, dropped: 0, unread: 0, lines: [] });
/** B2's two photographs as the live dossier k2850448 held them on 31 October 2026, and iNaturalist's answer that day. */
const hibiscus = () => ({
  key: 'k2850448',
  name: { scientific: 'Hibiscus rosa-sinensis' },
  photos: [
    { src: 'inat', id: '480095081', page: 'https://www.inaturalist.org/observations/d9575432-eacd-408e-803e-95a9e323953f', licence: 'by', attribution: '(c) Vreni Gem O. Caasi, some rights reserved (CC BY)' },
    { src: 'inat', id: '480095850', page: 'https://www.inaturalist.org/observations/d9575432-eacd-408e-803e-95a9e323953f', licence: 'by', attribution: '(c) Vreni Gem O. Caasi, some rights reserved (CC BY)' },
    { src: 'gbif', id: 'g1', page: 'https://www.gbif.org/occurrence/1', licence: 'by', attribution: 'X, CC BY, via GBIF' }
  ] as Array<{ src: string; id: string; page?: string; licence: string; attribution: string; read?: string }>
});
const answered = { id: 267166782, uuid: 'd9575432-eacd-408e-803e-95a9e323953f', photos: [{ id: 480095081, license_code: 'cc-by', attribution: '(c) Casey Clark G. Sumalinog, some rights reserved (CC BY)' }, { id: 480095850, license_code: 'cc-by', attribution: '(c) Casey Clark G. Sumalinog, some rights reserved (CC BY)' }], user: { login: 'caseyfication', name: 'Casey Clark G. Sumalinog' } };

describe('the day a credit was read (decision 7)', () => {
  it('a build stamps what it read; a write stamps only what the page did not hold', () => {
    expect(stampRead([{ id: 'a' }], '2026-11-02')).toEqual([{ id: 'a', read: '2026-11-02' }]);
    const before = [{ src: 'inat', id: 'a', read: '2026-10-01' }, { src: 'inat', id: 'b' }];
    expect(stampNew(before, [{ src: 'inat', id: 'a' }, { src: 'inat', id: 'b' }, { src: 'commons', id: 'c' }], '2026-11-02')).toEqual([{ src: 'inat', id: 'a', read: '2026-10-01' }, { src: 'inat', id: 'b' }, { src: 'commons', id: 'c', read: '2026-11-02' }]);
  });
  it("B2's Hibiscus credits are read again by the observation's uuid and corrected", () => {
    expect(observationOf('https://www.inaturalist.org/observations/D9575432-eacd-408e-803e-95a9e323953f')).toBe('d9575432-eacd-408e-803e-95a9e323953f');
    expect(observationOf('https://www.inaturalist.org/observations/267166782')).toBe('267166782');
    expect(CREDIT_OBS_URL(['d9575432-eacd-408e-803e-95a9e323953f'])).toMatch(/observations\?uuid=d9575432/);
    expect(CREDIT_OBS_URL(['267166782'])).toMatch(/observations\?id=267166782/);
    const d = hibiscus();
    const c = counts();
    expect(applyCredits(d, new Map([[answered.uuid, answered]]), new Map(), '2026-11-02', c)).toBe(true);
    expect(d.photos.slice(0, 2).map((p) => [p.attribution, p.read])).toEqual([['(c) Casey Clark G. Sumalinog, some rights reserved (CC BY)', '2026-11-02'], ['(c) Casey Clark G. Sumalinog, some rights reserved (CC BY)', '2026-11-02']]);
    expect(c).toMatchObject({ read: 2, changed: 2, dropped: 0 });
    // GBIF's photograph is `--fill gbif-licence`'s, untouched.
    expect(d.photos[2].read).toBeUndefined();
  });
  it('drops a photograph no longer open or gone, and leaves one not answered as it was', () => {
    expect(inatCredit('1', { id: 9, photos: [{ id: 1, license_code: 'cc-by-nc', attribution: '(c) A' }] })).toEqual({ drop: expect.stringMatching(/no longer under an open licence/) });
    expect(inatCredit('1', { id: 9, photos: [] })).toEqual({ drop: expect.stringMatching(/no longer holds photograph 1/) });
    expect(commonsFileCredit({ title: 'File:X.jpg', missing: true })).toEqual({ drop: 'Commons no longer holds File:X.jpg' });
    expect(commonsFileCredit({ title: 'File:X.jpg', artist: '<a href="//commons.wikimedia.org/wiki/User:Ann">Ann Smith</a>', licence: 'CC BY-SA 4.0' })).toEqual({ credit: 'Ann Smith, CC BY-SA 4.0, via Wikimedia Commons', licence: 'by-sa' });
    const d = hibiscus();
    const c = counts();
    expect(applyCredits(d, new Map(), new Map(), '2026-11-02', c)).toBe(false);
    expect(c.unread).toBe(2);
    expect(d.photos[0].read).toBeUndefined();
  });
});

describe('the revision of a summary (decision 8)', () => {
  const fetcher = (answer: Record<string, unknown> | null): JsonFetcher => (async () => (answer ? { status: 'ok', data: answer } : { status: 'error', detail: 'timed out' })) as unknown as JsonFetcher;
  const page = (): RevisionPage => ({ key: 'k298116', name: { scientific: 'Aloe vera' }, summary: { text: 'Aloe vera is a succulent plant species of the genus Aloe.', url: 'https://en.wikipedia.org/wiki/Aloe_vera', title: 'Aloe vera' }, upstream: { wikipedia: { status: 'ok', at: '2026-10-20T00:00:00.000Z' } } });
  it('a build reads the revision with the lead', async () => {
    const r = await summary(fetcher({ title: 'Aloe vera', extract: 'Aloe vera is a succulent plant species of the genus Aloe.', revision: '1381175077', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Aloe_vera' } } }), 'Aloe vera');
    expect(r.status === 'ok' && r.data.revision).toBe(1381175077);
  });
  it('records the revision of an unchanged lead, refreshes a changed one, and leaves a moved one', async () => {
    const c: RevisionCounts = { read: 0, same: 0, refreshed: 0, left: 0, unanswered: 0, lines: [] };
    const same = page();
    expect(revisionWanted(same)).toBe(true);
    expect(await readRevision(fetcher({ title: 'Aloe vera', extract: 'Aloe vera is a succulent plant species of the genus Aloe.', revision: '1381175077' }), same, '2026-11-02', c)).toBe(true);
    expect(same.summary).toMatchObject({ revision: 1381175077, read: '2026-11-02', text: 'Aloe vera is a succulent plant species of the genus Aloe.' });
    expect(revisionWanted(same)).toBe(false);
    const changed = page();
    await readRevision(fetcher({ title: 'Aloe vera', extract: 'Aloe vera is a succulent plant of the genus Aloe, grown widely.', revision: '1390000000' }), changed, '2026-11-02', c);
    expect(changed.summary).toMatchObject({ revision: 1390000000, text: 'Aloe vera is a succulent plant of the genus Aloe, grown widely.' });
    expect(changed.upstream?.wikipedia?.detail).toMatch(/read again at revision 1390000000 of 2026-11-02, it had changed/);
    const moved = page();
    expect(await readRevision(fetcher({ title: 'Aloe barbadensis', extract: 'Another.', revision: '1' }), moved, '2026-11-02', c)).toBe(false);
    expect(moved.summary?.revision).toBeUndefined();
    const silent = page();
    expect(await readRevision(fetcher(null), silent, '2026-11-02', c)).toBe(false);
    expect(c).toMatchObject({ same: 1, refreshed: 1, left: 1, unanswered: 1 });
  });
});

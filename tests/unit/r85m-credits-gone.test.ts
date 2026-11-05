/**
 * Round eighty-five, the owner's credits run of 5 November 2026: the last 501 pages were read, every request answered, and
 * the fill still said "950 not answered" and stopped unfinished, for good. Two faults:
 *
 * 1. Three observations were deleted on iNaturalist (Ardisia villosa's 1b615c14-…, Cordia collococca's 311613547,
 *    Eupatorium formosanum's 53954286-…; each answers HTTP 410 Gone, and the API returns no result for it). A whole answer
 *    that lacks an observation asked now says iNaturalist no longer holds it, and its photographs are dropped and said, as
 *    one whose licence closed is. A partial answer says nothing of the rest.
 * 2. A photograph read on an earlier day was counted "not answered" on every page that held one still to read: 940 of the
 *    950. It was not asked, so it is passed by, uncounted.
 *
 * FAILS on 5abb307: `gone` is not set, the photographs stay, and the count of photographs not answered includes those read before.
 */
import { describe, it, expect } from 'vitest';
import { readObservations, inatCredit, applyCredits, type CreditCounts, type CreditObs } from '$dossier/photo-read';
import type { JsonFetcher } from '$dossier/fetch';

const counts = (): CreditCounts => ({ pages: 0, read: 0, changed: 0, dropped: 0, unread: 0, lines: [] });
const answering = (data: unknown): JsonFetcher => (async () => ({ status: 'ok', data })) as unknown as JsonFetcher;
const kept: CreditObs = { id: 311613540, photos: [{ id: 1, license_code: 'cc-by', attribution: '(c) A, some rights reserved (CC BY)' }] };

describe('an observation iNaturalist no longer holds', () => {
  it('absent from a whole answer: gone, and its photographs are dropped with the reason', async () => {
    const m = (await readObservations(answering({ total_results: 1, results: [kept] }), ['311613540', '311613547']))!;
    expect(m.get('311613540')).toBe(kept);
    expect(m.get('311613547')).toEqual({ id: 0, gone: '311613547' });
    expect(inatCredit('562541871', m.get('311613547'))).toEqual({ drop: 'iNaturalist no longer holds observation 311613547 (deleted, or no longer public)' });
  });
  it('by uuid too, whatever its case', async () => {
    const m = (await readObservations(answering({ total_results: 0, results: [] }), ['1b615c14-e59a-49f9-8cdd-a21a96d08d3f']))!;
    expect(m.get('1b615c14-e59a-49f9-8cdd-a21a96d08d3f')?.gone).toBe('1b615c14-e59a-49f9-8cdd-a21a96d08d3f');
  });
  it('guard: a partial answer (more counted than given) says nothing of those it lacks', async () => {
    const m = (await readObservations(answering({ total_results: 2, results: [kept] }), ['311613540', '311613547']))!;
    expect(m.has('311613547')).toBe(false);
    expect(inatCredit('562541871', m.get('311613547'))).toBeNull(); // not answered: left as it was, unstamped
  });
  it("Cordia collococca's five photographs of the deleted observation go, and are said", async () => {
    const m = (await readObservations(answering({ total_results: 0, results: [] }), ['311613547']))!;
    const page = 'https://www.inaturalist.org/observations/311613547';
    const d = { key: 'k2736663', name: { scientific: 'Cordia collococca' }, photos: ['562541871', '562541881', '562541895', '562541907', '562541933'].map((id) => ({ src: 'inat', id, page, licence: 'by', attribution: '(c) A, some rights reserved (CC BY)' })) };
    const c = counts();
    expect(applyCredits(d, m, new Map(), '2026-11-05', c)).toBe(true);
    expect(d.photos).toEqual([]);
    expect(c).toMatchObject({ dropped: 5, unread: 0 });
    expect(c.lines[0]).toBe('Cordia collococca [k2736663]: dropped: iNaturalist no longer holds observation 311613547 (deleted, or no longer public)');
  });
});

describe('a photograph read on an earlier day', () => {
  const page = (o: number) => `https://www.inaturalist.org/observations/${o}`;
  const d = () => ({
    key: 'k1',
    name: { scientific: 'Euphorbia hyberna' },
    photos: [
      { src: 'inat', id: '1', page: page(311613540), licence: 'by', attribution: '(c) A, some rights reserved (CC BY)' },
      { src: 'inat', id: '2', page: page(200), licence: 'by', attribution: '(c) B, some rights reserved (CC BY)', read: '2026-11-03' }
    ] as Array<{ src: string; id: string; page?: string; licence: string; attribution: string; read?: string }>
  });
  it('is not asked, not counted "not answered", and keeps its day', () => {
    const page_ = d();
    const c = counts();
    applyCredits(page_, new Map([['311613540', kept]]), new Map(), '2026-11-05', c);
    expect(c).toMatchObject({ read: 1, unread: 0 });
    expect(page_.photos.map((p) => p.read)).toEqual(['2026-11-05', '2026-11-03']);
  });
  it('with --again it is asked like the rest, and counted when not answered', () => {
    const page_ = d();
    const c = counts();
    applyCredits(page_, new Map([['311613540', kept]]), new Map(), '2026-11-05', c, { again: true });
    expect(c).toMatchObject({ read: 1, unread: 1 });
  });
});

/**
 * Round eighty-six, final review S3: `--fill genus --force` (the plan's step after the summary leads) wrote
 * `status: 'refused'` over a genus's `ok` lead when Wikipedia refused or did not answer, so a 429 took a genus page's
 * quotation for a request that said nothing of the article. Now an earlier `ok` or `none` record stands over such an
 * answer and is counted; with no settled record before, `refused` is written as before. The other fills of the plan were
 * read for the same overwrite: `--fill summary-leads` leaves a page unanswered as it was (`readLeadsAll`), and
 * `--fill credits` keeps a photograph whose request was not answered with no day (`applyCredits`); both are held here.
 *
 * The step (`fillGenera`) writes `genusAnswer`'s record and counts its outcome; its last line says how many were refused or
 * not answered, how many of them kept the record read before, and how many were written "refused", and the step still
 * ends unfinished when any was. On r85m: the step wrote "refused" over the lead (inline in scripts/build-dossiers.ts).
 */
import { describe, it, expect } from 'vitest';
import { genusAnswer, genusPassedBy, settledGenus } from '$dossier/genus-fill';
import { readLeadsAll, type RevisionCounts, type RevisionPage } from '$dossier/revision-fill';
import { applyCredits, type CreditCounts } from '$dossier/photo-read';
import type { JsonFetcher } from '$dossier/fetch';

const now = new Date('2026-11-08T10:00:00Z');
const okRec = JSON.stringify({ genus: 'Huernia', slug: 'huernia', status: 'ok', summary: { text: 'Huernia is a genus…', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Huernia', licence: 'CC BY-SA 4.0', title: 'Huernia' }, at: '2026-10-01T00:00:00Z' });
const noneRec = JSON.stringify({ genus: 'Xus', slug: 'xus', status: 'none', at: '2026-10-01T00:00:00Z' });
const refusedRec = JSON.stringify({ genus: 'Xus', slug: 'xus', status: 'refused', detail: 'refused: HTTP 429', at: '2026-10-01T00:00:00Z' });
const lead = { status: 'ok' as const, data: { text: 'Huernia is a genus of stem succulents.', url: 'https://en.wikipedia.org/wiki/Huernia', title: 'Huernia', revision: 12, from: 'lead' as const } };

describe('--fill genus --force over a settled record', () => {
  it('a refusal leaves an earlier lead as it was, counted as refused and kept', () => {
    const a = genusAnswer('Huernia', 'huernia', okRec, { status: 'refused', detail: 'HTTP 429' }, now);
    expect(a.write).toBeUndefined(); // r85m: { status: 'refused', detail: 'refused: HTTP 429' } written over the lead
    expect(a).toMatchObject({ outcome: 'refused', keptOnFailure: true });
  });
  it('an error leaves an earlier "no article" as it was', () => {
    const a = genusAnswer('Xus', 'xus', noneRec, { status: 'error', detail: 'timeout' }, now);
    expect(a.write).toBeUndefined();
    expect(a.keptOnFailure).toBe(true);
  });
  it('guard: with no settled record before (none, a refusal, a file not read), "refused" is written as before', () => {
    for (const prev of [undefined, refusedRec, '{not json']) {
      const a = genusAnswer('Xus', 'xus', prev, { status: 'refused', detail: 'HTTP 429' }, now);
      expect(a.write).toMatchObject({ status: 'refused', detail: 'refused: HTTP 429', at: now.toISOString() });
      expect(a.keptOnFailure).toBeFalsy();
    }
  });
  it("guard: Wikipedia's answer, ok or none, is written over the earlier record", () => {
    expect(genusAnswer('Huernia', 'huernia', noneRec, lead, now).write).toMatchObject({ status: 'ok', summary: { title: 'Huernia', revision: 12, read: '2026-11-08', from: 'lead', licence: 'CC BY-SA 4.0' } });
    expect(genusAnswer('Huernia', 'huernia', okRec, { status: 'none' }, now).write).toMatchObject({ status: 'none' });
  });
  it('guard: without --force a settled record is passed by unasked; with it, asked', () => {
    expect(genusPassedBy(okRec, false)).toBe(true);
    expect(genusPassedBy(noneRec, false)).toBe(true);
    expect(genusPassedBy(refusedRec, false)).toBe(false);
    expect(genusPassedBy(okRec, true)).toBe(false);
    expect(settledGenus('{not json')).toBeUndefined();
  });
});

describe('the other fills of the plan keep what a request not answered did not read (guards)', () => {
  it('--fill summary-leads: a refused request leaves the page as it was, counted not answered', async () => {
    const d = { key: 1, name: { scientific: 'Huernia hallii' }, summary: { text: 'Old text.', title: 'Huernia hallii', url: 'u', source: 'wikipedia', licence: 'CC BY-SA 4.0' }, upstream: { wikipedia: { status: 'ok', at: '2026-10-01T00:00:00Z' } } } as unknown as RevisionPage;
    const before = JSON.stringify(d);
    const c: RevisionCounts = { read: 0, same: 0, refreshed: 0, left: 0, unanswered: 0, lines: [] };
    const seen: boolean[] = [];
    await readLeadsAll((async () => ({ status: 'refused', detail: 'HTTP 429' })) as unknown as JsonFetcher, [d], '2026-11-08', c, (_, changed) => seen.push(changed));
    expect(seen).toEqual([false]);
    expect(c.unanswered).toBe(1);
    expect(JSON.stringify(d)).toBe(before);
  });
  it('--fill credits: a photograph whose observation was not read stays, with no day', () => {
    const d = { key: 1, name: { scientific: 'Huernia hallii' }, photos: [{ src: 'inat', id: '9', page: 'https://www.inaturalist.org/observations/5', attribution: '(c) a', licence: 'cc-by' }] };
    const c: CreditCounts = { pages: 0, read: 0, changed: 0, dropped: 0, unread: 0, lines: [] };
    expect(applyCredits(d as never, new Map(), new Map(), '2026-11-08', c)).toBe(false);
    expect(d.photos).toHaveLength(1);
    expect(c.unread).toBe(1);
  });
});

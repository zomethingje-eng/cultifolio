/**
 * Round 108's second follow-up. BHL answering with its own error proves BHL is up, so that answer no longer ends the day's
 * fill.
 *
 * On 22 November 2026 BHL's resolver answered Status 2, "String or binary data would be truncated", for each citation of
 * "Pap. & Proc. Roy. Soc. Tasmania" (cache/upstream/2026-11-22). The fill counted each as not answered, which r87l keeps:
 * it is asked again by the next run, never recorded as "no page". But it also counted each toward the five in a row that end
 * the day. Those citations are asked first on every run, so five of them stopped each day's fill before any other citation
 * was asked (corpus-step.log, 14:33 and 16:14). On 16bd0c7 the fill below stops at the fifth error: FAILED.
 */
import { describe, it, expect } from 'vitest';
import { bhlUrl, bhlPage, bhlError, fillBhl, bhlLine } from '$dossier/bhl';
import { fixtureFetcher } from '$dossier/fetch';

const memStore = (pages: Record<string, unknown>) => {
  const m = new Map(Object.entries(pages).map(([k, d]) => [k, structuredClone(d)]));
  return { m, files: () => [...m.keys()], read: <T,>(f: string) => structuredClone(m.get(f)) as T, write: (f: string, d: unknown) => void m.set(f, structuredClone(d)) };
};
const ERR = { Status: 2, Message: 'String or binary data would be truncated.\r\nThe statement has been terminated.', citations: [] };
const ONE = (page: number) => ({ Status: 1, Message: '', citations: [{ Url: `https://www.biodiversitylibrary.org/page/${page}`, Volume: '1', SPage: 'Page 482', Date: '1753', Title: 'Species plantarum' }] });

describe('r108c BHL: its own error answer is asked again, and does not end the day', () => {
  it('the error is read as BHL said it, and is still not an answer for the citation (r87l)', () => {
    expect(bhlError(ERR)).toBe('String or binary data would be truncated.');
    expect(bhlError({ Status: 1, citations: [] })).toBeNull();
    expect(bhlError({ Status: 2, Message: '' })).toBeNull();
    expect(bhlError(null)).toBeNull();
    expect(bhlPage({ title: 'x', volume: '3', page: '294', year: '1859' }, ERR)).toBeNull();
  });
  it('six error answers first, then a citation BHL answers: the fill reaches it, and says how many erred', async () => {
    const pages: Record<string, unknown> = {};
    const answers: Record<string, unknown> = {};
    for (let i = 0; i < 6; i++) {
      pages[`k${i}.json`] = { key: `k${i}`, name: { scientific: `T t${i}` }, elsewhere: { published: { place: 'Pap. & Proc. Roy. Soc. Tasmania', volPage: ` 3: ${290 + i}`, year: '(1859)', row: '1', file: '2026-06-04' } } };
      answers[bhlUrl({ title: 'Pap. & Proc. Roy. Soc. Tasmania', volume: '3', page: String(290 + i), year: '1859' })] = ERR;
    }
    pages['k9.json'] = { key: 'k9', name: { scientific: 'A a' }, elsewhere: { published: { place: 'Sp. Pl.', volPage: ' 1: 482', year: '(1753)', row: '1', file: '2026-06-04' } } };
    answers[bhlUrl({ title: 'Sp. Pl.', volume: '1', page: '482', year: '1753' })] = ONE(358501);
    const s = memStore(pages);
    const c = await fillBhl(s, fixtureFetcher(answers), '2026-11-22', { gapMs: 0 });
    expect(c.held).toBeUndefined();
    expect(c).toMatchObject({ unanswered: 6, erred: 6, linked: 1 });
    expect(s.m.get('k9.json')).toMatchObject({ elsewhere: { published: { bhl: { page: 358501, read: '2026-11-22' } } } });
    // Nothing written for an error: each is asked again by the next run.
    expect((s.m.get('k0.json') as { elsewhere: { published: { bhl?: unknown } } }).elsewhere.published.bhl).toBeUndefined();
    const line = bhlLine(c, '2026-11-22');
    expect(line).toContain("6 not answered (6 of them BHL's resolver answering with an error, asked again by the next run)");
    // The daily plan's expect line still reads the count.
    expect(/BHL on .*?, (\d+) not answered/.exec(line)?.[1]).toBe('6');
  });
  it('requests BHL does not answer at all still end the day at five in a row', async () => {
    const pages: Record<string, unknown> = {};
    for (let i = 0; i < 6; i++) pages[`k${i}.json`] = { key: `k${i}`, name: { scientific: `T t${i}` }, elsewhere: { published: { place: 'Sp. Pl.', volPage: ` 1: ${400 + i}`, year: '(1753)', row: '1', file: '2026-06-04' } } };
    const c = await fillBhl(memStore(pages), fixtureFetcher({}), '2026-11-22', { gapMs: 0 });
    expect(c.held).toBe('5 requests in a row not answered');
  });
});

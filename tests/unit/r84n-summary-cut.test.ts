/**
 * Round eighty-four (N): a quoted summary that does not end a sentence is marked cut (outside review A4: Euphorbia ×
 * martini's summary stopped at "…E. amygdaloides × E. characias subsp. characias", the article going on past a line break
 * Wikipedia's extract ends at, and the page said nothing). At the derivation (`summary`) and when a page is served
 * (`safeUrls`), so the live corpus is right before the re-derivation: 2 of the 617 live dossiers the reviewers read (29
 * October 2026) end so, k293645 and k2704796, besides A's Euphorbia × martini.
 *
 * FAILS on r84base: `sentenceCut` does not exist; `summary` keeps the text as it is with no mark; `safeUrls` serves it so.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sentenceCut, firstSentences } from '$core/text';
import { summary } from '$dossier/sources/wikipedia';
import { safeUrls, type Dossier } from '$dossier/schema';
import type { JsonFetcher } from '$dossier/fetch';

const martini = 'Euphorbia × martini is a hybrid spurge, the cross between E. amygdaloides × E. characias subsp. characias';
const wiki = (extract: string) => (async () => ({ status: 'ok', data: { extract, title: 'Euphorbia × martini', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Euphorbia_%C3%97_martini' } } } })) as unknown as JsonFetcher;

describe('a summary that does not end a sentence', () => {
  it('is cut with an ellipsis and marked; one that ends a sentence is as it was', () => {
    expect(sentenceCut(martini)).toEqual({ text: `${martini}…`, cut: true });
    expect(sentenceCut('Native to Paraguay, Bolivia and, Brazil,')).toEqual({ text: 'Native to Paraguay, Bolivia and, Brazil…', cut: true });
    for (const t of ['A spurge.', 'Is it a spurge?', 'It is called "lechuguilla verde."', 'It flowers (in spring).', 'And more…']) expect(sentenceCut(t), t).toEqual({ text: t, cut: false });
  });
  it('the derivation marks it (`summary`), and the page then links the article', async () => {
    const r = await summary(wiki(martini), 'Euphorbia × martini');
    expect(r.status === 'ok' && r.data).toMatchObject({ text: `${martini}…`, cut: true });
    const whole = await summary(wiki(`${martini}.`), 'Euphorbia × martini');
    expect(whole.status === 'ok' && 'cut' in whole.data).toBe(false);
    expect(firstSentences(`${martini}…`, 4).more).toBe(false); // the page's "More on Wikipedia" then comes from `cut`
  });
  it('a page served from a dossier written before is marked too (the two live dossiers)', () => {
    for (const k of ['k293645', 'k2704796']) {
      const d = JSON.parse(readFileSync(`tests/unit/fixtures/r84n-${k}-summary.json`, 'utf8')) as Pick<Dossier, 'summary'>;
      const shown = safeUrls({ ...minimal(), summary: d.summary } as unknown as Dossier).summary!;
      expect(shown.cut, k).toBe(true);
      expect(shown.text.endsWith('…'), k).toBe(true);
      // Served twice, the same.
      expect(safeUrls({ ...minimal(), summary: shown } as unknown as Dossier).summary).toEqual(shown);
    }
  });
});

/** The fields `safeUrls` reads, empty. */
function minimal() {
  return { climate: { status: 'none' }, photos: [], literature: [], links: {}, upstream: {} };
}

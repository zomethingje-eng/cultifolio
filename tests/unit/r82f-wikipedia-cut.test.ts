/**
 * Round eighty-two, agent F: review 1's 36. The Wikipedia extract was sliced at 1,500 characters before the page's
 * four-sentence cut, so a lead whose four sentences ran past 1,500 characters ended mid-word on the page, with no "More on
 * Wikipedia". Now it is kept to its last whole sentence within 1,500 characters, and marked `cut`, which the page reads as
 * more following. (None of the reviewers' 4,767 live summaries reached 1,500 characters: the longest was 1,465.) FAILED on
 * r82base: the text ended "…specta" and nothing said more followed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { summary } from '$dossier/sources/wikipedia';
import { firstSentences } from '$core/text';
import type { JsonFetcher } from '$dossier/fetch';

const lead = (n: number) => Array.from({ length: n }, (_, i) => `Sentence ${i + 1} of the lead says something about the plant and its habitat in the mountains, with a little more detail than needed to make it long enough to count here, and more, and spectacularly more.`).join(' ');
const wiki = (extract: string) => (async () => ({ status: 'ok', data: { extract, title: 'Aus bus', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Aus_bus' } } } })) as unknown as JsonFetcher;

describe('the summary is cut where a sentence ends', () => {
  it('a long lead keeps its whole sentences within 1,500 characters, and says more followed', async () => {
    const r = await summary(wiki(lead(12)), 'Aus bus');
    expect(r.status).toBe('ok');
    const d = r.status === 'ok' ? r.data : null;
    expect(d!.text.length).toBeLessThanOrEqual(1500);
    expect(d!.text).toMatch(/spectacularly more\.$/);
    expect(d!.text).toBe(lead(Math.floor(1500 / (lead(1).length + 1))));
    expect(d).toMatchObject({ cut: true });
  });
  it('a lead within 1,500 characters is kept whole, and not marked (guard)', async () => {
    const r = await summary(wiki(lead(3)), 'Aus bus');
    expect(r.status === 'ok' && r.data).toEqual(expect.objectContaining({ text: lead(3) }));
    expect(r.status === 'ok' && 'cut' in r.data).toBe(false);
  });
  it('one sentence longer than 1,500 characters is cut at a word, with an ellipsis', async () => {
    const r = await summary(wiki(`${'word '.repeat(400)}end.`), 'Aus bus');
    expect(r.status === 'ok' && r.data.text).toMatch(/word…$/);
  });
  it("the page's four sentences are as before (guard), and the page links Wikipedia for a cut text", () => {
    const s = (n: number) => Array.from({ length: n }, (_, i) => `The sentence numbered ${i + 1} is here.`).join(' ');
    expect(firstSentences(s(5), 4)).toEqual({ text: s(4), more: true });
    expect(firstSentences(s(3), 4)).toEqual({ text: s(3), more: false });
    expect(firstSentences(s(4), 4)).toEqual({ text: s(4), more: false });
    expect(firstSentences('Opuntia stricta subsp. dillenii grows here. Another sentence follows.', 1)).toEqual({ text: 'Opuntia stricta subsp. dillenii grows here.', more: true });
    expect(readFileSync('src/routes/species/[slug]/+page.svelte', 'utf8')).toContain('{#if excerpt?.more || d.summary.cut}');
  });
});

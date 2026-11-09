/**
 * Round eighty-seven, the data agent: item 2's audit, `--check-summaries`, and item 8's `--list-summaries-left`. At round
 * eighty-six's second stop a read of every summary's title found four pages quoting another plant's article, reached
 * through Wikipedia's redirect from their own names and carried by walks since 22 October: Mentha ×rotundifolia (Mentha
 * longifolia's), Salix ×pendulina (S. babylonica's), Begonia metallica (B. incarnata's), Amelanchier stolonifera (A.
 * ×spicata's). The check finds them by rule, offline, and says "not checked" where a proof needs the network.
 *
 * New in round eighty-seven: on r86 neither command was there.
 */
import { describe, it, expect } from 'vitest';
import { checkSummaryTitles, summaryVerdict, summaryCheckWords, faultLines, ReferenceNames, type SummaryPage } from '$dossier/summary-check';
import { summariesLeft } from '$dossier/revision-fill';

const page = (key: string, scientific: string, title?: string, detail?: string, o: { synonyms?: string[]; wikidata?: string } = {}): SummaryPage => ({
  key,
  name: { scientific, synonyms: o.synonyms ?? [] },
  ...(o.wikidata ? { ids: { wikidata: o.wikidata } } : {}),
  ...(title ? { summary: { title } } : {}),
  ...(detail ? { upstream: { wikipedia: { status: 'ok', detail } } } : {})
});

// The reference: the four redirected pages, the four plants whose articles they quoted, and pages for each other verdict.
const PAGES: SummaryPage[] = [
  page('k1', 'Mentha × rotundifolia', 'Mentha longifolia', 'carried from build of 2026-10-22; this build: skipped'),
  page('k2', 'Mentha longifolia', 'Mentha longifolia'),
  page('k3', 'Salix × pendulina', 'Salix babylonica', 'carried from build of 2026-10-22 (rederive); that build: Wikipedia redirects Salix × pendulina to Salix babylonica'),
  page('k4', 'Salix babylonica', 'Salix babylonica'),
  page('k5', 'Begonia metallica', 'Begonia incarnata', 'Wikipedia redirects Begonia metallica to Begonia incarnata'),
  page('k6', 'Begonia incarnata', 'Begonia incarnata'),
  page('k7', 'Amelanchier stolonifera', 'Amelanchier × spicata', 'Wikipedia redirects Amelanchier stolonifera to Amelanchier × spicata'),
  page('k8', 'Amelanchier × spicata', undefined),
  // Fine: an older name, the item's own article, the species of a subspecies' page.
  page('k9', 'Aloiampelos ciliaris', 'Aloe ciliaris', undefined, { synonyms: ['Aloe ciliaris Haw.'] }),
  page('k10', 'Lithops lesliei', 'Living stone', "carried from build of 2026-10-22 (rederive); that build: Wikipedia's article Living stone, the English article of this species' Wikidata item (Q2601467)", { wikidata: 'Q2601467' }),
  page('k11', 'Conophytum calculus subsp. vanzylii', 'Conophytum calculus'),
  // Listed: a proof recorded (a genus of one species), and none recorded (not checked).
  page('k12', 'Fenestraria rhopalophylla', 'Fenestraria', "Wikipedia's article Fenestraria, whose one accepted species in Kew's WCVP is this species"),
  page('k13', 'Ceropegia elegans', 'Ceropegia', 'carried from build of 2026-10-22; this build: skipped'),
  // An item's article, but not of the item the page holds now.
  page('k14', 'Drosera montana', 'Sundew of the mountains', "Wikipedia's article Sundew of the mountains, the English article of this species' Wikidata item (Q5308558)", { wikidata: 'Q999' })
];

describe('--check-summaries: each summary by the rule, offline', () => {
  const c = checkSummaryTitles(PAGES);
  const line = (key: string) => c.lines.find((l) => l.startsWith(`${key} `));
  it('the four redirected pages of round eighty-six are another plant\'s article, each said with the page it is', () => {
    expect(line('k1')).toBe("k1 Mentha × rotundifolia\tMentha longifolia: ANOTHER PLANT: the article of Mentha longifolia [k2], another page of the reference");
    expect(line('k3')).toBe("k3 Salix × pendulina\tSalix babylonica: ANOTHER PLANT: the article of Salix babylonica [k4], another page of the reference, reached through Wikipedia's redirect from Salix × pendulina");
    expect(line('k5')).toContain('ANOTHER PLANT: the article of Begonia incarnata [k6]');
    expect(line('k7')).toBe("k7 Amelanchier stolonifera\tAmelanchier × spicata: ANOTHER PLANT: the article of Amelanchier × spicata [k8], another page of the reference, reached through Wikipedia's redirect from Amelanchier stolonifera");
    expect(c.by['another-plant']).toBe(4);
    expect(faultLines(c)).toHaveLength(4);
  });
  it("the page's name, an older name and its own item's article are not listed; the species of a subspecies is, as its rank", () => {
    for (const k of ['k2', 'k4', 'k6', 'k9', 'k10']) expect(line(k), k).toBeUndefined();
    expect(c.by.name).toBe(3);
    expect(c.by['older-name']).toBe(1);
    expect(c.by.item).toBe(1);
    expect(line('k11')).toBe("k11 Conophytum calculus subsp. vanzylii\tConophytum calculus: the article of the species of this page's name");
  });
  it('a proof recorded is listed with its words; none recorded is "not checked", never none (rule 2)', () => {
    expect(line('k12')).toBe('k12 Fenestraria rhopalophylla\tFenestraria: its record names the proof "whose one accepted species in Kew\'s WCVP is this species"');
    expect(line('k13')).toBe('k13 Ceropegia elegans\tCeropegia: no proof is recorded; not checked: reading one needs Wikidata and Wikipedia (--fill summaries asks them)');
    expect(line('k14')).toContain("the English article of Wikidata's Q5308558, not the page's item (Q999)");
    expect(c.by['not-checked']).toBe(1);
    expect(c.by.proof).toBe(2);
    expect(c.withSummary).toBe(13);
  });
  it('the lines it prints, and "not ready" for another plant\'s article', () => {
    const w = summaryCheckWords(c, 'check-summaries.txt');
    expect(w[0]).toBe("  14 dossiers read, 13 with a Wikipedia summary: 3 under the page's name, 1 an older name of it, 1 its Wikidata item's article; 1 the species of a page below species, 2 with another proof recorded (a genus of one species, a product, the same type, IPNI), 1 not checked (no proof recorded: --fill summaries asks Wikidata and Wikipedia), 4 another plant's article → check-summaries.txt (8 pages)");
    expect(w[1]).toMatch(/^  Not ready to upload: 4 pages quote another plant's article/);
    // Round eighty-seven's review (S5): Ceropegia elegans' summary was not checked, so "no page" is not said.
    expect(summaryCheckWords(checkSummaryTitles(PAGES.filter((p) => !['k1', 'k3', 'k5', 'k7'].includes(p.key))), 'x')[1]).toBe("  None of the 8 summaries checked quotes another plant's article; 1 not checked (no proof recorded) → check-summaries-unchecked.txt: read them, or run --fill summaries, which asks Wikidata and Wikipedia, and this check again.");
    expect(summaryCheckWords(checkSummaryTitles(PAGES.filter((p) => !['k1', 'k3', 'k5', 'k7', 'k13'].includes(p.key))), 'x')[1]).toBe("  No page quotes another plant's article.");
  });
  it("another page's older name, and none of this one's, is another plant's too", () => {
    const names = new ReferenceNames();
    const a = page('k20', 'Kniphofia uvaria', 'Tritoma uvaria'), b = page('k21', 'Kniphofia linearifolia', undefined, undefined, { synonyms: ['Tritoma uvaria Ker Gawl.'] });
    names.add(a); names.add(b);
    expect(summaryVerdict(a, names)).toEqual({ verdict: 'another-plant', words: 'an older name of Kniphofia linearifolia [k21], and none of this page\'s' });
    // Both pages' older name: the page's own, not a fault.
    const c2 = page('k22', 'Kniphofia uvaria', 'Tritoma uvaria', undefined, { synonyms: ['Tritoma uvaria'] });
    expect(summaryVerdict(c2, names)?.verdict).toBe('older-name');
  });
});

describe('--list-summaries-left: the summaries --fill summary-leads left for --fill summaries', () => {
  it('every summary not read as its opening paragraph, one id a line as --keys reads it', () => {
    const pages = [
      { key: 'k1', name: { scientific: 'A a' }, summary: { text: 't', url: 'u', title: 'A a', from: 'lead' as const, revision: 5 } },
      { key: 'k2', name: { scientific: 'B b' }, summary: { text: 't', url: 'u', title: 'B (plant)' } },
      { key: 'k3', name: { scientific: 'C c' } },
      { key: 'k4', name: { scientific: 'D d' }, summary: { text: 't', url: 'u', title: 'D d', revision: 7 } }
    ];
    expect(summariesLeft(pages)).toEqual(['k2 B b\tsummary of B (plant) not read as its opening paragraph', 'k4 D d\tsummary of D d not read as its opening paragraph, revision 7 recorded before']);
  });
});

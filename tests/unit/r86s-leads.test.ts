/**
 * Round eighty-six, the sources agent: the plan's B7 (outside review B's 5; our finding that the revision fill,
 * `src/lib/dossier/revision-fill.ts:29`, read Wikipedia's REST summary, which leaves out words in brackets: 33 of the 36
 * summaries round eighty-five's fill found "changed" differed only by brackets). The summary is now the article's opening
 * paragraph, read by the MediaWiki action API (`prop=extracts&exintro&explaintext`) with the article's revision id read in
 * the same request (`prop=revisions`, `rvprop=ids`), up to twenty titles a request; the redirect and same-type rules are
 * the summary's as before (`summary`, `titleProof`). `--fill summary-leads` reads every stored summary so, and its
 * `--dry-run` says how many would change and why (brackets, parentheticals, other), writing nothing.
 *
 * The records: Solanum lycopersicum (k2932342) and Melocactus lemairei (k2370690), as the live corpus held them on
 * 2026-11-05 (`/tmp/claude-0/rev86r/D-s/dos/`). Wikipedia's answers here are written in the action API's shape (this
 * sandbox is refused by Wikimedia, review D's "Not checked"); the tomato's opening is the article's, its pronunciation
 * taken out as TextExtracts takes it out.
 *
 * On r86base (9cf3077) every `it` but the guard FAILED: `summary` asked `rest_v1/page/summary/<title>`, `readLeads`, `leadsUrl`,
 * `leadChange`, `readLeadsAll` and `summaryWhat` did not exist, and the fill re-read one REST summary a request.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { JsonFetcher, FetchResult } from '$dossier/fetch';
import * as wp from '$dossier/sources/wikipedia';
import * as fill from '$dossier/revision-fill';
import * as credit from '$lib/ui/ref/credit-days';

const W = wp as unknown as Record<string, any>;
const F = fill as unknown as Record<string, any>;
const C = credit as unknown as Record<string, any>;
const dossier = (id: string) => JSON.parse(readFileSync(`/tmp/claude-0/rev86r/D-s/dos/${id}.json`, 'utf8'));
// The records, as read (kept in the test, so the test stands where that folder is gone).
const TOMATO = { key: 'k2932342', name: { scientific: 'Solanum lycopersicum' }, summary: { text: 'The tomato is a plant whose fruit is an edible berry that is eaten as a vegetable. The tomato is a member of the nightshade family that includes tobacco, potato, and chili peppers. It originated from western South America, and may have been domesticated there, in Mexico, or in Central America. The Spanish introduced tomatoes to Eurasia in the Columbian exchange in the 16th century.', source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Tomato', licence: 'CC BY-SA 4.0', title: 'Tomato', revision: 1380709062, read: '2026-11-03' }, upstream: { wikipedia: { status: 'ok', at: '2026-11-03T00:00:00.000Z', detail: 'carried from build of 2026-10-22; this build: skipped; the lead read again at revision 1380709062 of 2026-11-03, it had changed' } } };
const MELO_TEXT = 'Melocactus lemairei is a species of cactus endemic to the Caribbean island of Hispaniola (split between the Dominican Republic and Haiti). It is named after French botanist and cactus expert Charles Antoine Lemaire.';
const TOMATO_LEAD = 'The tomato (US: , UK: ; Solanum lycopersicum) is a plant whose fruit is an edible berry that is eaten as a vegetable. The tomato is a member of the nightshade family that includes tobacco, potato, and chili peppers. It originated from western South America, and may have been domesticated there, in Mexico, or in Central America. The Spanish introduced tomatoes to Eurasia in the Columbian exchange in the 16th century.\nTomato plants are vines.';

/** The action API, answering each title it holds; records every request. */
function wiki(pages: Record<string, { title?: string; extract?: string; revid?: number; missing?: boolean }>, refuse = false) {
  const asked: string[] = [];
  const f = (async <T,>(url: string): Promise<FetchResult<T>> => {
    asked.push(url);
    if (refuse) return { status: 'refused', detail: 'en.wikipedia.org 429' };
    const titles = (new URL(url).searchParams.get('titles') ?? '').split('|');
    const redirects: Array<{ from: string; to: string }> = [];
    const out: unknown[] = [];
    for (const t of titles) {
      const p = pages[t];
      if (!p || p.missing) { out.push({ title: t, missing: true }); continue; }
      const to = p.title ?? t;
      if (to !== t) redirects.push({ from: t, to });
      out.push({ title: to, extract: p.extract ?? '', revisions: [{ revid: p.revid ?? 1 }] });
    }
    return { status: 'ok', data: { batchcomplete: true, query: { ...(redirects.length ? { redirects } : {}), pages: out } } as T };
  }) as JsonFetcher;
  return { f, asked };
}

describe('B7: the summary is the article\'s opening paragraph, read with its revision in one request', () => {
  it('Solanum lycopersicum: one request to the action API; its bracket kept, the emptied labels closed up; the revision from the same answer', async () => {
    const { f, asked } = wiki({ Tomato: { extract: TOMATO_LEAD, revid: 1381000000 } });
    const r = await W.summary(f, 'Tomato', ['Tomato']);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('action=query');
    expect(asked[0]).toContain('prop=extracts|revisions|pageprops');
    expect(asked[0]).toContain('exintro=1&explaintext=1');
    expect(asked[0]).toContain('rvprop=ids');
    expect(asked[0]).not.toContain('rest_v1');
    expect(r.status).toBe('ok');
    expect(r.data.text.startsWith('The tomato (Solanum lycopersicum) is a plant whose fruit')).toBe(true);
    expect(r.data.text).not.toContain('Tomato plants are vines'); // the opening paragraph only
    expect(r.data.revision).toBe(1381000000);
    expect(r.data.from).toBe('lead');
    expect(r.data.url).toBe('https://en.wikipedia.org/wiki/Tomato');
  });

  it('the redirect rule stands: a title reached by a redirect with no proof is none, said as the redirect', async () => {
    const { f } = wiki({ 'Agave americana': { title: 'Persea americana', extract: 'Persea americana, the avocado, is a tree.' } });
    expect(await W.summary(f, 'Agave americana', ['Agave americana'])).toEqual({ status: 'none', detail: 'Wikipedia redirects Agave americana to Persea americana' });
  });

  it('twenty titles a request, each answered by its own part; a request not answered leaves every title in it unanswered', async () => {
    const titles = Array.from({ length: 20 }, (_, i) => `Planta ${i}`);
    const { f, asked } = wiki(Object.fromEntries(titles.map((t, i) => [t, { extract: `${t} is a plant.`, revid: 100 + i }])));
    const r = await W.readLeads(f, titles);
    expect(asked).toHaveLength(1);
    expect(r.status).toBe('ok');
    expect(r.data.get('Planta 7')).toEqual({ status: 'ok', title: 'Planta 7', text: 'Planta 7 is a plant.', revision: 107 });
    expect(W.LEAD_TITLES).toBe(20);
    const no = await W.readLeads(wiki({}, true).f, titles);
    expect(no).toEqual({ status: 'refused', detail: 'en.wikipedia.org 429' });
  });
});

describe('B7: --fill summary-leads and its dry run', () => {
  it('why a stored text differs: brackets, parentheticals, other', () => {
    expect(F.leadChange(TOMATO.summary.text, 'The tomato (Solanum lycopersicum) is a plant whose fruit is an edible berry that is eaten as a vegetable. The tomato is a member of the nightshade family that includes tobacco, potato, and chili peppers. It originated from western South America, and may have been domesticated there, in Mexico, or in Central America. The Spanish introduced tomatoes to Eurasia in the Columbian exchange in the 16th century.')).toBe('brackets');
    expect(F.leadChange('A tree, a palm, grows here.', 'A tree – a palm – grows here.')).toBe('parentheticals');
    expect(F.leadChange(MELO_TEXT, MELO_TEXT.replace('Hispaniola', 'Haiti'))).toBe('other');
    expect(F.leadChange(MELO_TEXT, MELO_TEXT)).toBeNull();
  });

  it('a dry run counts the tomato as changed by brackets and the cactus as the same, and writes nothing', async () => {
    const tomato = structuredClone(TOMATO);
    const melo = { key: 'k2370690', name: { scientific: 'Melocactus lemairei' }, summary: { text: MELO_TEXT, source: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Melocactus_lemairei', licence: 'CC BY-SA 4.0', title: 'Melocactus lemairei', revision: 1371478320, read: '2026-11-03' }, upstream: {} };
    const before = JSON.stringify([tomato, melo]);
    const { f, asked } = wiki({ Tomato: { extract: TOMATO_LEAD, revid: 1381000000 }, 'Melocactus lemairei': { extract: MELO_TEXT, revid: 1371478320 } });
    const c = { read: 0, same: 0, refreshed: 0, left: 0, unanswered: 0, lines: [] as string[] };
    const changed: string[] = [];
    await F.readLeadsAll(f, [tomato, melo], '2026-11-07', c, (d: { key: string }, x: boolean) => { if (x) changed.push(d.key); }, { dry: true });
    expect(asked).toHaveLength(1); // both titles, one request
    expect(c).toMatchObject({ read: 2, same: 1, refreshed: 1, left: 0, unanswered: 0, why: { brackets: 1, parentheticals: 0, other: 0 } });
    expect(c.lines).toEqual(['Solanum lycopersicum [k2932342]: would read the opening paragraph of Tomato at revision 1381000000: brackets (the article\'s "(Solanum lycopersicum)")']);
    expect(JSON.stringify([tomato, melo])).toBe(before); // nothing written
    expect(changed).toEqual(['k2932342', 'k2370690']);
  });

  it('the fill writes the opening paragraph with its revision and day, says so in the record, and passes it by after', async () => {
    const tomato = structuredClone(TOMATO);
    const { f } = wiki({ Tomato: { extract: TOMATO_LEAD, revid: 1381000000 } });
    const c = { read: 0, same: 0, refreshed: 0, left: 0, unanswered: 0, lines: [] as string[] };
    await F.readLeadsAll(f, [tomato], '2026-11-07', c, () => {});
    expect(tomato.summary).toMatchObject({ title: 'Tomato', revision: 1381000000, read: '2026-11-07', from: 'lead' });
    expect(tomato.summary.text.startsWith('The tomato (Solanum lycopersicum) is')).toBe(true);
    expect(tomato.upstream.wikipedia.detail).toBe('carried from build of 2026-10-22; this build: skipped; the opening paragraph read again at revision 1381000000 of 2026-11-07, it differed (brackets)');
    expect(F.revisionWanted(tomato)).toBe(false);
    expect(F.revisionWanted(tomato, true)).toBe(true);
    // A summary read by round eighty-five's fill (a revision, no `from`) is read again.
    expect(F.revisionWanted(structuredClone(TOMATO))).toBe(true);
  });

  it('a moved title is left for --fill summaries; a request not answered leaves the page as it was', async () => {
    const tomato = structuredClone(TOMATO);
    const c = { read: 0, same: 0, refreshed: 0, left: 0, unanswered: 0, lines: [] as string[] };
    await F.readLeadsAll(wiki({ Tomato: { title: 'Garden tomato', extract: TOMATO_LEAD } }).f, [tomato], '2026-11-07', c, () => {});
    expect(c.left).toBe(1);
    expect(c.lines[0]).toBe('Solanum lycopersicum [k2932342]: Wikipedia moves Tomato to Garden tomato: left for --fill summaries');
    await F.readLeadsAll(wiki({}, true).f, [tomato], '2026-11-07', c, () => {});
    expect(c.unanswered).toBe(1);
    expect(tomato.summary).toEqual(TOMATO.summary);
  });

  // Read only where the walk's copy of the record is (the sandbox the round was built in); elsewhere it is skipped, never
  // failed: the owner's run read C:\tmp\claude-0\… on 8 November (round eighty-six, the second stop).
  it.skipIf(!existsSync('/tmp/claude-0/rev86r/D-s/dos/k2932342.json'))('the live record is the one the test holds (guard)', () => {
    const d = dossier('k2932342');
    expect(d.summary).toEqual(TOMATO.summary);
    expect(d.summary.text).not.toContain('(');
  });
});

describe('B7: the credit says which text it is, so /about/how stays true before the fill', () => {
  it('"its opening paragraph" where read so; the summary service named where not', () => {
    expect(C.summaryWhat({ from: 'lead' })).toBe(', its opening paragraph');
    expect(C.summaryWhat(TOMATO.summary)).toBe(", as Wikipedia's summary service gives it");
  });
});

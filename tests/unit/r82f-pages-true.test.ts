/**
 * Round eighty-two, agent F: /about/how true of the code (rule 5).
 *   - Review 1's 6: "A page with a Kew id … is matched by those identifiers and never by its label", while k2781134
 *     (Echeveria elegans) says "found by its label; its IPNI identifier 86934-2 is Kew's", a record carried from before
 *     round eighty, and a page whose name Kew gives no identifier (Mentha × piperita, k125188, built 2026-10-22) is found by
 *     its alias. On the reviewers' 9,442 live k pages, 442 say found by their label or alias, 440 of them proved by an IPNI
 *     or POWO number. The sentence now says when the label is read; the code is unchanged (the smaller true fix).
 *   - Review 1's 39: "a coastal cell averaged with sea floor", where scripts/pack-climate.py leaves the sea out.
 * Each case FAILED on r82base, where the two sentences were the old ones (the code checks are guards).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { crossIds } from '../../src/lib/dossier/sources/wikimedia';
import { KewRows, kewRowsFetcher } from '../../src/lib/dossier/kew-rows';
import type { JsonFetcher } from '../../src/lib/dossier/fetch';

const how = readFileSync('src/routes/about/how/+page.svelte', 'utf8').replace(/<[^>]+>/g, '');

describe("Wikidata: when a page with a Kew id is matched by its label", () => {
  it('the sentence names the cases, and no longer says "never"', () => {
    expect(how).not.toContain('is matched by those identifiers and never by its label');
    expect(how).toContain("is matched by those identifiers wherever Kew's file gives its name and author one");
    expect(how).toContain('Its label is read only where Kew gives its name and author no identifier');
    expect(how).toContain('or on a page whose Wikidata record was made before this rule (round eighty) and is carried');
    expect(how).toContain('"found by its label; its IPNI identifier 86934-2 is Kew\'s for Echeveria elegans Rose"');
  });
  // The code as the sentence says it (guards): with Kew's identifier the label is never read (tests/unit/r80a-wikidata-ids),
  // and with none for the name and author it is, and the item is taken only once proved.
  const item = { claims: { P31: [{ mainsnak: { datavalue: { value: { id: 'Q16521' } } } }], P225: [{ mainsnak: { datavalue: { value: 'Mentha piperita' } } }], P846: [{ mainsnak: { datavalue: { value: '3029894' } } }] } };
  const wikidata = (asked: string[]): JsonFetcher => kewRowsFetcher((async (url: string) => {
    asked.push(url);
    const u = decodeURIComponent(url);
    if (u.includes('haswbstatement:P846=')) return { status: 'ok', data: { query: { search: [] } } };
    if (u.includes('wbsearchentities')) return { status: 'ok', data: { search: [{ id: 'Q156811', label: 'Mentha piperita' }] } };
    if (/ids=Q156811/.test(u)) return { status: 'ok', data: { entities: { Q156811: item } } };
    return { status: 'none' };
  }) as unknown as JsonFetcher, new KewRows(['Mentha']));
  it('a page with a Kew id whose name Kew gives no identifier is found by its label, and proved', async () => {
    const asked: string[] = [];
    const r = await crossIds(wikidata(asked), 'Mentha piperita', 3029894, [], { authorship: 'L.', family: 'Lamiaceae', kewPage: true });
    expect(asked.some((u) => u.includes('wbsearchentities'))).toBe(true);
    expect(r.status === 'ok' && r.data.wikidata).toBe('Q156811');
  });
});

describe("the climate's elevation: the land's, the sea floor left out", () => {
  it('the sentence says what scripts/pack-climate.py does', () => {
    expect(how).not.toContain('a coastal cell averaged with sea floor');
    expect(how).toContain("the grid cell's elevation is its land's alone (the sea floor ETOPO gives under water is left out of a coastal cell's mean, and a cell with no land has no elevation)");
    expect(readFileSync('scripts/pack-climate.py', 'utf8')).toContain('band[band < 0] = np.nan'); // guard: the mask
  });
});

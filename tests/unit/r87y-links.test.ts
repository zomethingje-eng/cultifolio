/**
 * Round eighty-seven's review of stage 2, the links' items and the browse table: BHL's answer taken only where its title
 * is the one Kew abbreviates (S2: BHL answers "Bot. Mag." with the Tokyo Botanical Magazine, which Kew cites as "Bot. Mag.
 * (Tokyo)"), a hybrid formula's words not read as a parent (M4), "Q.muehlenbergii" read, and browse.json without the
 * first-seen column nothing read. Each test fails on the base (9311e8b).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { bhlAsk, bhlPage, titleAgrees, fillBhl } from '$dossier/bhl';
import { formulaParts, partName } from '$dossier/kew-published';
import { browseTableOf } from '$lib/browse/table';
import { fixtureFetcher } from '$dossier/fetch';
import { bhlUrl } from '$dossier/bhl';

// BHL's answer for Bot. Mag. 29: 267, as its resolver gave it on 2026-11-09 (one of its two citations, trimmed to the fields read).
const TOKYO = { Url: 'https://www.biodiversitylibrary.org/page/41638995', Title: 'The botanical magazine = Shokubutsugaku zasshi', PublisherPlace: 'Tokyo', Authors: ['Nihon Shokubutsu Gakkai', 'Tokyo Shokubutsu Gakkai.'], Date: '1915', Volume: '29', SPage: 'Page 267' };
const answer = (c: object) => ({ Status: 1, Message: '', citations: [c] });
// Kew's places as its file writes them: the same abbreviation with words in parentheses is another journal.
const PLACES = ['Bot. Mag.', 'Bot. Mag. (Tokyo)', 'Bot. Mag. (Kew Mag.)', 'Sp. Pl.'];

describe('S2: BHL\'s title against Kew\'s abbreviation', () => {
  it('the rule: each word of the abbreviation starts a word of the title, in order', () => {
    expect(titleAgrees('Sp. Pl.', { Title: 'Caroli Linnaei ... Species plantarum :exhibentes plantas' })).toBeNull();
    expect(titleAgrees('Bull. Misc. Inform. Kew', { Title: 'Bulletin of miscellaneous information (Royal Gardens, Kew)' })).toBeNull();
    expect(titleAgrees('Kew Bull.', { Title: 'Bulletin of miscellaneous information (Royal Gardens, Kew)' })).toMatch(/is not “Kew Bull\.” word for word/);
    expect(titleAgrees('Pl. Sp.', { Title: 'Species plantarum' })).not.toBeNull(); // the order counts
    expect(titleAgrees('Fl. Bras.', { Title: 'Flora brasiliensis' })).toBeNull();
    expect(titleAgrees('Sp. Pl.', {})).toBe("BHL's answer gives no title");
  });
  it('"Bot. Mag." answered with the Tokyo journal, which Kew cites as "Bot. Mag. (Tokyo)": nothing taken', () => {
    const a = { title: 'Bot. Mag.', volume: '29', page: '267', year: '1915' };
    expect(bhlPage(a, answer(TOKYO), PLACES)).toEqual({ none: "BHL's title “The botanical magazine = Shokubutsugaku zasshi” (Tokyo) is the one Kew cites as “Bot. Mag. (Tokyo)”, not “Bot. Mag.”" });
    // Asked as Kew writes the Tokyo journal, the same answer is taken.
    expect(bhlPage({ ...a, title: 'Bot. Mag. (Tokyo)' }, answer(TOKYO), PLACES)).toEqual({ page: 41638995 });
    // The words in parentheses must be BHL's: Curtis's magazine is not the Tokyo one.
    expect(bhlPage({ ...a, title: 'Bot. Mag. (Tokyo)' }, answer({ ...TOKYO, Title: "Curtis's botanical magazine", PublisherPlace: 'London', Authors: [] }), PLACES)).toMatchObject({ none: expect.stringContaining('is not the one Kew writes “Bot. Mag. (Tokyo)”') });
  });
  it('the fill reads every page\'s place first, and takes nothing for the Tokyo answer to "Bot. Mag."', async () => {
    const pub = (place: string) => ({ key: 'k1', name: { scientific: 'X y' }, elsewhere: { published: { place, volPage: ' 29: 267', year: '(1915)', row: '1' } } });
    const files: Record<string, unknown> = { 'k1.json': pub('Bot. Mag.'), 'k2.json': { ...pub('Bot. Mag. (Tokyo)'), key: 'k2' } };
    const store = { files: () => Object.keys(files), read: <T,>(f: string) => structuredClone(files[f]) as T, write: (f: string, d: unknown) => { files[f] = d; } };
    const a1 = bhlAsk({ place: 'Bot. Mag.', volPage: ' 29: 267', year: '(1915)' }) as { title: string; volume?: string; page: string; year: string };
    const a2 = bhlAsk({ place: 'Bot. Mag. (Tokyo)', volPage: ' 29: 267', year: '(1915)' }) as { title: string; volume?: string; page: string; year: string };
    const c = await fillBhl(store as never, fixtureFetcher({ [bhlUrl(a1)]: answer(TOKYO), [bhlUrl(a2)]: answer(TOKYO) }), '2026-11-10', { gapMs: 0 });
    expect(c).toMatchObject({ linked: 1, none: 1 });
    expect((files['k1.json'] as { elsewhere: { published: { bhl: object } } }).elsewhere.published.bhl).toMatchObject({ none: expect.stringContaining('Bot. Mag. (Tokyo)') });
    expect((files['k2.json'] as { elsewhere: { published: { bhl: object } } }).elsewhere.published.bhl).toEqual({ page: 41638995, read: '2026-11-10' });
  });
});

describe('M4: a hybrid formula\'s words are not a parent', () => {
  it('"as stabilized hybrids derived from …" (Prunus domestica, Acorus calamus): the parents only', () => {
    expect(formulaParts('as stabilized hybrids derived from P. cerasifera × P. spinosa')).toEqual(['P. cerasifera', 'P. spinosa']);
    expect(formulaParts('as stabilized hybrids derived from A. americanus × A. verus').map((p) => partName(p, 'Acorus').name)).toEqual(['Acorus americanus', 'Acorus verus']);
    expect(formulaParts('perhaps T. ferreyrae × T. minus')).toEqual(['T. ferreyrae', 'T. minus']);
    // Words alone are one part, said as Kew's words.
    expect(formulaParts('perhaps a hybrid of unknown parentage').map((p) => partName(p, 'Aloe'))).toEqual([{ name: 'perhaps a hybrid of unknown parentage', why: "Kew's words, not a name" }]);
    expect(partName('sphegodes subsp. passionis', 'Ophrys').why).toBe("Kew's words, not a name");
  });
  it('"Q.muehlenbergii", the initial without its space (Quercus × introgressa), is read', () => {
    expect(formulaParts('Q. bicolor × Q.muehlenbergii × Q. prinoides').map((p) => partName(p, 'Quercus'))).toEqual([{ name: 'Quercus bicolor' }, { name: 'Quercus muehlenbergii' }, { name: 'Quercus prinoides' }]);
    expect(partName('A.cepa', 'Allium')).toEqual({ name: 'Allium cepa' });
  });
});

describe('browse.json: no first-seen column, which nothing read', () => {
  it('the table has no `first`; the index keeps it', () => {
    const t = browseTableOf([{ key: 'k1', slug: 'aloe-a', name: 'Aloe a', origin: [], climate: 'ok', first: 20500 } as never]);
    expect(Object.keys(t)).not.toContain('first');
    // Nothing in the app reads a first day from the table.
    for (const f of ['src/lib/browse/table.ts', 'src/lib/browse/BrowseView.svelte', 'src/lib/browse/engine.ts', 'src/lib/browse/view.ts']) expect(readFileSync(f, 'utf8')).not.toMatch(/firstAt|\.first\[/);
    expect(readFileSync('src/lib/dossier/index-entry.ts', 'utf8')).toMatch(/first\?: number/);
  });
});

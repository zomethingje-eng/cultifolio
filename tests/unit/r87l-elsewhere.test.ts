/**
 * Round eighty-seven, stage 2 (links agent), item 2: "Elsewhere" and the first publication. The identifiers the page's own
 * Wikidata item holds (CC0), read fifty items a request by `--fill elsewhere`, made links by each property's formatter
 * URL, a register the page links itself never twice; where the name was published as Kew's file gives it, linked to BHL
 * only where BHL's resolver answers one page for exactly that citation. Each test fails on the base, where none exists.
 */
import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { ELSEWHERE_PROPERTIES, elsewhereIds, elsewhereLinks, fillElsewhere, elsewhereWanted, elsewhereLine } from '$dossier/elsewhere';
import { bhlAsk, bhlUrl, bhlPage, fillBhl, bhlWanted, bhlLine } from '$dossier/bhl';
import { fixtureFetcher, type JsonFetcher } from '$dossier/fetch';
import { elsewhereView, citationText } from '$lib/ui/ref/links-words';
import Elsewhere from '$lib/ui/ref/Elsewhere.svelte';

const memStore = (pages: Record<string, unknown>) => {
  const m = new Map(Object.entries(pages).map(([k, d]) => [k, structuredClone(d)]));
  return { m, files: () => [...m.keys()], read: <T,>(f: string) => structuredClone(m.get(f)) as T, write: (f: string, d: unknown) => void m.set(f, structuredClone(d)) };
};
const claim = (v: string, rank = 'normal') => ({ rank, mainsnak: { snaktype: 'value', datavalue: { value: v } } });
const html = (dossier: unknown) => render(Elsewhere, { props: { dossier } as never }).body.replace(/<!--[^]*?-->/g, '').replace(/ class="s[0-9a-z]+"/g, '').replace(/\s+/g, ' ');
const words = (h: string) => h.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

describe('the registers read, by the property ids and formatters Wikidata gives (read 2026-11-09)', () => {
  it('names the brief\'s registers by their Wikidata property ids', () => {
    const by = Object.fromEntries(ELSEWHERE_PROPERTIES.map((x) => [x.p, x.label]));
    expect(by).toMatchObject({ P5037: 'POWO', P961: 'IPNI', P960: 'Tropicos', P7715: 'WFO', P3151: 'iNaturalist', P846: 'GBIF', P2040: 'Species+ (CITES)', P627: 'IUCN Red List', P1727: 'Flora of North America', P1772: 'USDA PLANTS', P10701: 'Reflora', P12554: 'CalPhotos', P687: 'BHL' });
    expect(new Set(ELSEWHERE_PROPERTIES.map((x) => x.p)).size).toBe(ELSEWHERE_PROPERTIES.length);
    for (const x of ELSEWHERE_PROPERTIES) expect(x.formatter).toMatch(/^https?:\/\/[^\s]+\$1/);
  });
  it('reads one value a property, preferred first, never a deprecated one or one unfit for an address', () => {
    expect(elsewhereIds({ P960: [claim('100', 'deprecated'), claim('200')], P627: [claim('1'), claim('2', 'preferred')], P1772: [claim('a"b')], P2040: [{ rank: 'normal', mainsnak: { snaktype: 'novalue' } }] })).toEqual([{ p: 'P960', v: '200' }, { p: 'P627', v: '2' }]);
  });
  it('links each by its formatter, and never a second link to a register the page links itself', () => {
    const ids = [{ p: 'P5037', v: 'urn:lsid:ipni.org:names:1-1' }, { p: 'P960', v: '25500035' }, { p: 'P2040', v: '4371' }, { p: 'P12554', v: 'Opuntia basilaris' }, { p: 'P1727', v: '242415285' }];
    const l = elsewhereLinks({ item: 'Q1', read: 'x', ids }, { powo: 'https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1-1' });
    expect(l.map((x) => x.url)).toEqual(['https://www.tropicos.org/name/25500035', 'https://speciesplus.net/#/taxon_concepts/4371', 'https://calphotos.berkeley.edu/cgi/img_query?where-taxon=Opuntia%20basilaris', 'http://www.efloras.org/florataxon.aspx?flora_id=1&taxon_id=242415285']);
    expect(elsewhereLinks({ item: 'Q1', read: 'x', ids }, {}).map((x) => x.label)[0]).toBe('POWO');
  });
});

describe('--fill elsewhere: fifty items a request, the page\'s own item only, resumable', () => {
  const day = '2026-11-09';
  it('reads every page with an item, keeps its identifiers and day, passes by one read, and says why for an item no longer served', async () => {
    const s = memStore({
      'k1.json': { key: 'k1', name: { scientific: 'A a' }, ids: { wikidata: 'Q10' } },
      'k2.json': { key: 'k2', name: { scientific: 'B b' }, ids: { wikidata: 'Q20' } },
      'k3.json': { key: 'k3', name: { scientific: 'C c' }, ids: {} },
      'k4.json': { key: 'k4', name: { scientific: 'D d' }, ids: { wikidata: 'Q40' }, elsewhere: { wikidata: { item: 'Q40', read: '2026-11-01', ids: [] } } }
    });
    const asked: string[] = [];
    const inner = fixtureFetcher({ 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=Q10|Q20&props=claims': { entities: { Q10: { id: 'Q10', claims: { P960: [claim('7')], P627: [claim('99')] } }, Q20: { id: 'Q20', missing: '' } } } });
    const f: JsonFetcher = (u, o) => { asked.push(u); return inner(u, o); };
    const c = await fillElsewhere(s, f, day);
    expect(asked).toHaveLength(1);
    expect(s.m.get('k1.json')).toMatchObject({ elsewhere: { wikidata: { item: 'Q10', read: day, ids: [{ p: 'P960', v: '7' }, { p: 'P627', v: '99' }] } } });
    expect(s.m.get('k2.json')).toMatchObject({ elsewhere: { wikidata: { item: 'Q20', read: day, ids: [], unanswered: 'Wikidata no longer serves Q20 under that id' } } });
    expect((s.m.get('k3.json') as { elsewhere?: unknown }).elsewhere).toBeUndefined();
    expect(c).toMatchObject({ read: 1, withIds: 1, ids: 2, missing: 1, unanswered: 0, noItem: 1, before: 1 });
    expect(elsewhereLine(c, day)).toBe('  1 Wikidata items read on 2026-11-09: 1 hold an identifier of another register, 2 in all (Tropicos 1, IUCN Red List 1); 1 no longer served under the page\'s id; 0 not answered; 1 read before and passed by; 1 pages with no item, not asked.');
  });
  it('an item merged into another (answered under another id) is not read as the page\'s', async () => {
    const s = memStore({ 'k1.json': { key: 'k1', name: { scientific: 'A a' }, ids: { wikidata: 'Q10' } } });
    await fillElsewhere(s, fixtureFetcher({ 're:wbgetentities': { entities: { Q10: { id: 'Q11', claims: { P960: [claim('7')] } } } } }), day);
    expect((s.m.get('k1.json') as { elsewhere: { wikidata: { ids: unknown[]; unanswered?: string } } }).elsewhere.wikidata).toMatchObject({ ids: [], unanswered: expect.stringContaining('no longer serves') });
  });
  it('not answered is "not checked", asked again; a read before is not lost to a refusal', async () => {
    const s = memStore({ 'k1.json': { key: 'k1', name: { scientific: 'A a' }, ids: { wikidata: 'Q10' } }, 'k2.json': { key: 'k2', name: { scientific: 'B b' }, ids: { wikidata: 'Q20' }, elsewhere: { wikidata: { item: 'Q20', read: '2026-11-01', ids: [{ p: 'P960', v: '1' }] } } } });
    const c = await fillElsewhere(s, fixtureFetcher({}), day, { again: true });
    expect(c.unanswered).toBe(2);
    const d1 = s.m.get('k1.json') as never;
    expect(elsewhereWanted(d1)).toBe(true);
    expect(elsewhereView({ ...(d1 as object), links: {} } as never).wikidata.state).toBe('not-checked');
    expect((s.m.get('k2.json') as { elsewhere: { wikidata: { ids: unknown[] } } }).elsewhere.wikidata.ids).toEqual([{ p: 'P960', v: '1' }]);
  });
});

describe('the first publication, and BHL only by an exact citation', () => {
  it('quotes the citation as Kew writes it', () => {
    expect(citationText({ place: 'Kew Bull.', volPage: ' 16: 181', year: '(1962)', row: '1' })).toBe('Kew Bull. 16: 181 (1962)');
    expect(citationText({ place: 'Monogr. Serjania', volPage: ': 293', year: '(1875)', row: '1' })).toBe('Monogr. Serjania: 293 (1875)');
    expect(citationText({ place: 'Bull. Acad. Imp. Sci. Saint-Pétersbourg', volPage: ', sér. 3, 6: 405', year: '(1863)', row: '1' })).toBe('Bull. Acad. Imp. Sci. Saint-Pétersbourg, sér. 3, 6: 405 (1863)');
  });
  it('asks BHL only a citation it can be given whole', () => {
    expect(bhlAsk({ place: 'Kew Bull.', volPage: ' 16: 181', year: '(1962)' })).toEqual({ title: 'Kew Bull.', volume: '16', page: '181', year: '1962' });
    expect(bhlAsk({ place: 'Sp. Pl.', volPage: ': 482', year: '(1753)' })).toEqual({ title: 'Sp. Pl.', page: '482', year: '1753' });
    expect(bhlAsk({ place: 'Ark. Bot.', volPage: ' 5(9): 6', year: '(1906)' })).toHaveProperty('not');
    expect(bhlAsk({ place: 'X', volPage: ' 2: 3', year: '(1862 publ. 1863)' })).toHaveProperty('not');
    expect(bhlUrl({ title: 'Sp. Pl.', volume: '1', page: '482', year: '1753' })).toBe('https://www.biodiversitylibrary.org/openurl?genre=journal&title=Sp.+Pl.&volume=1&spage=482&date=1753&format=json');
  });
  // BHL's answer for Sp. Pl. 1: 482 (1753), as its resolver gave it on 2026-11-09.
  // Round eighty-seven's review of stage 2 (S2): with its title, place and authors, as BHL gave them again on 2026-11-09.
  const SP_PL = { Status: 1, Message: '', citations: [{ Url: 'https://www.biodiversitylibrary.org/page/358501', ItemUrl: 'https://www.biodiversitylibrary.org/item/13829', Title: 'Caroli Linnaei ... Species plantarum :exhibentes plantas rite cognitas, ad genera relatas, cum differentiis specificis, nominibus trivialibus, synonymis selectis, locis natalibus, secundum systema sexuale digestas...', PublisherPlace: 'Holmiae', Authors: ['Linné, Carl von,', 'Salvius, Lars,'], Date: '1753', Volume: '1', SPage: 'Page 482', EPage: '' }] };
  it('takes the one page whose page number, volume and year are the citation\'s, and nothing else', () => {
    const a = { volume: '1', page: '482', year: '1753' };
    expect(bhlPage(a, SP_PL)).toEqual({ page: 358501 });
    expect(bhlPage({ ...a, page: '483' }, SP_PL)).toEqual({ none: "BHL's page is numbered “Page 482”, not page 483" });
    expect(bhlPage({ ...a, volume: '2' }, SP_PL)).toMatchObject({ none: expect.stringContaining('not 2') });
    expect(bhlPage({ ...a, year: '1754' }, SP_PL)).toMatchObject({ none: expect.stringContaining('not 1754') });
    expect(bhlPage(a, { ...SP_PL, citations: [...SP_PL.citations, ...SP_PL.citations] })).toEqual({ none: "BHL's resolver gave 2 citations, not one" });
    expect(bhlPage(a, { Status: 1, citations: [] })).toEqual({ none: "BHL's resolver found no page for the citation" });
    expect(bhlPage(a, { Status: 2, Message: 'error' })).toBeNull();
  });
  it('--fill bhl writes the answer with its day, passes it by after, and leaves a citation not answered to the next run', async () => {
    const pub = (volPage: string) => ({ place: 'Sp. Pl.', volPage, year: '(1753)', row: '1', file: '2026-06-04' });
    const s = memStore({ 'k1.json': { key: 'k1', name: { scientific: 'A a' }, elsewhere: { published: pub(' 1: 482') } }, 'k2.json': { key: 'k2', name: { scientific: 'B b' }, elsewhere: { published: pub(' 5(9): 6') } }, 'k3.json': { key: 'k3', name: { scientific: 'C c' }, elsewhere: { published: pub(' 1: 483') } } });
    const f = fixtureFetcher({ [bhlUrl({ title: 'Sp. Pl.', volume: '1', page: '482', year: '1753' })]: SP_PL });
    const c = await fillBhl(s, f, '2026-11-09', { gapMs: 0 });
    expect(s.m.get('k1.json')).toMatchObject({ elsewhere: { published: { bhl: { page: 358501, read: '2026-11-09' } } } });
    expect((s.m.get('k3.json') as { elsewhere: { published: { bhl?: unknown } } }).elsewhere.published.bhl).toBeUndefined();
    expect(c).toMatchObject({ asked: 2, linked: 1, unanswered: 1, notAskable: 1 });
    expect(bhlWanted(s.m.get('k1.json') as never)).toBe(false);
    expect(bhlWanted(s.m.get('k3.json') as never)).toBe(true);
    expect(bhlLine(c, '2026-11-09')).toContain('1 linked to the one page BHL gives for them');
  });
});

describe('the line under Names and registers', () => {
  const read = { item: 'Q10', read: '2026-11-09', ids: [{ p: 'P960', v: '7' }, { p: 'P2040', v: '4371' }, { p: 'P961', v: '1-1' }] };
  it('"not asked" until the fill reads the item, with why', () => {
    expect(words(html({ ids: { wikidata: 'Q10' }, links: {} }))).toContain("Elsewhere not asked: Wikidata's item Q10 has not been read for them yet.");
    expect(words(html({ ids: {}, links: {} }))).toContain('Elsewhere not asked: this page has no Wikidata item.');
  });
  it('the links, their source and day; a register the page links already left out', () => {
    // The CITES table checked for the page (round eighty-seven, the review of stage 2's pages, 7: Species+ waits for it).
    const h = html({ ids: { wikidata: 'Q10' }, links: { ipni: 'https://www.ipni.org/n/1-1' }, elsewhere: { wikidata: read }, cites: { status: 'none', read: '2026-11-09', validFrom: '2025-02-07' } });
    expect(h).toContain('<a href="https://www.tropicos.org/name/7" rel="noopener">Tropicos</a> · <a href="https://speciesplus.net/#/taxon_concepts/4371" rel="noopener">Species+ (CITES)</a>');
    expect(h).toContain("(identifiers from Wikidata's item Q10, read 2026-11-09, CC0)");
    expect(h).not.toContain('>IPNI<');
  });
  it('an item read for another item than the page\'s is not shown as the page\'s', () => {
    expect(html({ ids: { wikidata: 'Q11' }, links: {}, elsewhere: { wikidata: read } })).toContain('not asked');
  });
  it('the citation credited to WCVP, a BHL link only with BHL\'s one page', () => {
    const p = { place: 'Sp. Pl.', volPage: ' 1: 482', year: '(1753)', row: '1', file: '2026-06-04' };
    const plain = html({ ids: {}, links: {}, elsewhere: { published: p } });
    expect(plain).toContain('<b>Published in</b> Sp. Pl. 1: 482 (1753) <span class="faint">(WCVP, RBG Kew, file of 2026-06-04)</span>');
    expect(plain).not.toContain('biodiversitylibrary');
    const linked = html({ ids: {}, links: {}, elsewhere: { published: { ...p, bhl: { page: 358501, read: '2026-11-09' } } } });
    expect(linked).toContain('<a href="https://www.biodiversitylibrary.org/page/358501" rel="noopener">Sp. Pl. 1: 482 (1753)</a>');
    expect(html({ ids: {}, links: {}, elsewhere: { published: { ...p, bhl: { none: 'x', read: '2026-11-09' } } } })).not.toContain('biodiversitylibrary');
  });
});

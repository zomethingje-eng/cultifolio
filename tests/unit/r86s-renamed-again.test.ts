/**
 * Round eighty-six, the sources agent: review D's D11, applied. The names agent changed `crossIds` so a page Kew's name
 * heads takes Kew's name's own Wikidata item (c8ce956), which reaches the ~508 renamed pages only when they are built again
 * online; `--list-renamed` listed only the pages not yet built by Kew's name, and after round eighty-five that is none.
 * `--list-renamed --again` lists them all, for `--keys rebuild-renamed.txt --grid climate --bulk bulk`.
 *
 * The page: Hoodia alstonii (k506502) as the live corpus held it on 2026-11-05 (`D-s/dos/`), cut to the fields read.
 *
 * On r86base (9cf3077) the first `it` FAILED: `renamedLines` took no `again`, and listed nothing.
 */
import { describe, it, expect } from 'vitest';
import { renamedLines } from '$dossier/kew-heading';

const alstonii = { key: 'k506502', ids: { gbif: 9269454 }, name: { scientific: 'Hoodia alstonii', gbif: { scientific: 'Ceropegia alstonii', authorship: '(N.E.Br.) Bruyns', rank: 'SPECIES', genus: 'Ceropegia', slug: 'ceropegia-alstonii', added: 'Ceropegia alstonii (N.E.Br.) Bruyns' }, kew: { entry: '506502', accepted: { name: 'Hoodia alstonii', authors: '(N.E.Br.) Plowes', rank: 'Species', family: 'Apocynaceae' } } }, upstream: { wikipedia: { detail: "asked by Kew's name Hoodia alstonii first, then by GBIF's Ceropegia alstonii" } } };

describe('D11: the renamed pages listed again, to take Kew\'s name\'s own Wikidata item', () => {
  it('a page built by Kew\'s name already is listed with --again', () => {
    expect((renamedLines as (p: unknown[], again?: boolean) => { lines: string[]; done: number })([alstonii], true)).toEqual({ lines: ['9269454\tHoodia alstonii (GBIF: Ceropegia alstonii)'], done: 1 });
  });
  it('without --again, as round eighty-five wrote it (guard)', () => {
    expect(renamedLines([alstonii] as never)).toEqual({ lines: [], done: 1 });
  });
});

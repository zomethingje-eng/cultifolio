/**
 * Round seventy-eight (I): a page's id is Kew's plant_name_id (`k<id>`) where Kew's file gives the page one accepted taxon
 * no other page holds, else its GBIF key (`g<key>`): the id's form, and the rule, case by case (rule 3: no guessing).
 * Each case FAILED on the base (no ids there).
 */
import { describe, it, expect } from 'vitest';
import { isPageId, kewPage, gbifPage, gbifKeyOf, gbifAlias, idKind, idNumber, byId, PAGE_ID } from '$core/page-id';
import { pageIds, idWords } from '$dossier/page-ids';

describe('the id', () => {
  it('is a letter for the namespace and a whole number: Kew\'s 326701 is k326701, GBIF\'s 2746231 is g2746231', () => {
    expect(kewPage('326701')).toBe('k326701');
    expect(gbifPage(2746231)).toBe('g2746231');
    expect(idKind('k326701')).toBe('kew');
    expect(idKind('g2746231')).toBe('gbif');
    expect(idNumber('k326701')).toBe(326701);
  });
  it('is never a bare number, which could be either namespace\'s (Kew\'s ids run to 3,331,952, GBIF\'s keys past twelve million)', () => {
    for (const x of [326701, '326701', 'K326701', 'k0', 'k01', 'kk1', 'g', 'g12345678901', 'k1.5', ' k1', 'k-1', '@1', '#k1', null, undefined]) expect(isPageId(x), String(x)).toBe(false);
    for (const x of ['k1', 'g1', 'k3331952', 'g12345678', 'g9999999999']) expect(isPageId(x), x).toBe(true);
    expect(PAGE_ID.source).toBe('^[kg][1-9][0-9]{0,9}$');
    expect(() => kewPage('')).toThrow();
    expect(() => kewPage('0123')).toThrow();
    expect(() => gbifPage(0)).toThrow();
  });
  it('a GBIF key in an API path is digits; its alias record is `@<key>`, which no slug begins with', () => {
    expect(gbifKeyOf('2746231')).toBe(2746231);
    expect(gbifKeyOf('0')).toBe(0);
    expect(gbifKeyOf('k326701')).toBeNull();
    expect(gbifKeyOf('12a')).toBeNull();
    expect(gbifKeyOf('')).toBeNull();
    expect(gbifAlias(2746231)).toBe('@2746231');
  });
  it('lists sort Kew\'s ids first, then GBIF\'s, each by number', () => {
    expect((['g10', 'k9', 'g2', 'k10', 'k100'] as const).slice().sort(byId)).toEqual(['k9', 'k10', 'k100', 'g2', 'g10']);
  });
});

describe('the rule (src/lib/dossier/page-ids.ts)', () => {
  it('a Kew entry no other page holds is the page\'s id', () => {
    const [a, b] = pageIds([{ gbif: 2746231, entry: '326701' }, { gbif: 3084426, entry: '3294939' }]);
    expect(a).toEqual({ id: 'k326701', why: 'kew' });
    expect(b).toEqual({ id: 'k3294939', why: 'kew' });
  });
  it('Kew\'s rows not deciding (the entry is ""), or Kew\'s file not read, leaves the GBIF key: never a guess', () => {
    const [a, b] = pageIds([{ gbif: 7410371, entry: '' }, { gbif: 7263987 }]);
    expect(a).toEqual({ id: 'g7410371', why: 'kew-undecided' });
    expect(b).toEqual({ id: 'g7263987', why: 'kew-not-read' });
    expect(idWords(a)).toBe("Kew's rows do not decide which taxon this page is");
  });
  it('two pages holding one entry are each keyed by GBIF\'s key, and each names the other (Ceropegia melanops and C. nigra)', () => {
    const r = pageIds([{ gbif: 3574291, entry: '502875' }, { gbif: 3574112, entry: '502875' }, { gbif: 1, entry: '7' }]);
    expect(r[0]).toEqual({ id: 'g3574291', why: 'kew-shared', with: [3574112] });
    expect(r[1]).toEqual({ id: 'g3574112', why: 'kew-shared', with: [3574291] });
    expect(r[2].id).toBe('k7');
    expect(idWords(r[0], '502875')).toBe("Kew's entry 502875 is also the entry of GBIF's 3574112: a merge decides which page is Kew's");
  });
  it('a merge follows Kew\'s accepted id: the page merged away keeps its GBIF key, the page it joins takes the Kew id', () => {
    const pages = [{ gbif: 3084426, entry: '3294939' }, { gbif: 11798439, entry: '3294939' }];
    const merged = pageIds(pages, [{ from: 3084426, into: 11798439 }]);
    expect(merged[0]).toEqual({ id: 'g3084426', why: 'merged-away', with: [11798439] });
    expect(merged[1]).toEqual({ id: 'k3294939', why: 'kew' });
    // A merge whose kept page is not in the corpus counts for nothing: both pages are as they would be without it.
    expect(pageIds(pages, [{ from: 3084426, into: 5 }]).map((x) => x.id)).toEqual(['g3084426', 'g11798439']);
    // Once the merged page is pruned, the kept page holds the entry alone, and its id does not move.
    expect(pageIds([pages[1]], [{ from: 3084426, into: 11798439 }])[0].id).toBe('k3294939');
  });
  it('a page with neither an unshared entry nor a GBIF key has no id, and is refused', () => {
    const r = pageIds([{ entry: '9' }, { entry: '9' }, { entry: '' }, { entry: '10' }]);
    expect(r.map((x) => x.id)).toEqual([null, null, null, 'k10']);
  });
  it('an entry that is no plant_name_id ("12a", "007") is not read as one', () => {
    expect(pageIds([{ gbif: 1, entry: '12a' }, { gbif: 2, entry: '007' }]).map((x) => x.why)).toEqual(['kew-undecided', 'kew-undecided']);
  });
});

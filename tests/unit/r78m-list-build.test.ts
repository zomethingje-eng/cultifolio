/**
 * Round seventy-eight, the merge (M): the species list read by the build and by the bulk fetch, as S, I and B need it.
 * The build is by GBIF key and names each page by `--index`'s rule (I), so a species of the list is built by the GBIF key
 * the list gives it (S), and the download is asked for those keys with no name matched (S's need of B). On r78base there
 * is no list, and every test fails at import.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { downloadKeysOf, jobsFromList, parseSpeciesList } from '../../scripts/select-species-lib';
import { isPageId } from '../../src/lib/core/page-id';
import { parseMerges } from '../../src/lib/dossier/extra-keys';

const list = parseSpeciesList(readFileSync('scripts/species-list.txt', 'utf8'));

describe('the real list, read as the build and the bulk fetch read it', () => {
  it('names every species by a page id of the form --index gives', () => {
    expect(list.length).toBe(48357); // round eighty (X): 11 held by a reference page through its range left out
    expect(list.every((e) => isPageId(e.pageId) && (e.kewId ? e.pageId === `k${e.kewId}` : e.pageId === `g${e.gbifKey}`))).toBe(true);
  });
  it('gives the download each GBIF key once, matches no name, and names the species with none', () => {
    const { byName, keys, none } = downloadKeysOf(list);
    expect(keys.length).toBe(new Set(list.flatMap((e) => (e.gbifKey ? [e.gbifKey] : []))).size);
    // Round eighty (X): 20 keys Kew's file reads as another species' name, by GBIF's author, not taken (19 lines read none).
    expect(list.filter((e) => e.gbifKey != null).length).toBe(46021); // round eighty (A): Xanthoceras sorbifolium's key refused (familyRefuses)
    expect(none.length).toBe(48357 - 46021);
    expect(Object.values(byName).every((k) => keys.includes(k))).toBe(true);
  });
  it('builds no species by its name: a job has the GBIF key or none', () => {
    const jobs = jobsFromList(list);
    expect(jobs.every((j) => j.key === (j.gbifKey ?? undefined))).toBe(true);
  });
  it('carries no GBIF key that leaves by a merge (the nine of scripts/merged-pages.txt since round seventy-nine)', () => {
    const leaving = new Set(parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8')).map((m) => m.from));
    expect(leaving.size).toBe(11); // round eighty (A): Ceropegia cereiformis joins k505095 too; round eighty-two (M): Bisnaga hamatacantha
    // Round eighty-two (M): the list (of 19 October, not changed mid-fill) still gives Bisnaga hamatacantha its key; the merge
    // takes it into k2808164, a page without a GBIF key, and the build builds no key merged into such a page (`intoKew`).
    const intoKew = new Set(parseMerges(readFileSync('scripts/merged-pages.txt', 'utf8')).filter((m) => m.intoPage).map((m) => m.from));
    expect(list.filter((e) => e.gbifKey != null && leaving.has(e.gbifKey)).map((e) => [e.gbifKey, e.name, intoKew.has(e.gbifKey!)])).toEqual([[7281739, 'Bisnaga hamatacantha', true]]);
  });
});

describe('the build reads the list as the merged code builds', () => {
  const src = readFileSync('scripts/build-dossiers.ts', 'utf8');
  it('takes the page on disk under the id where the list has no GBIF key, and builds a merged key as the page it went into', () => {
    // Round eighty (A): a key merged into a page without a GBIF key is not built; that page reads it.
    expect(src).toMatch(/const g = j\.gbifKey \?\? gbifOfLine\(j\.pageId\); return g == null \|\| intoKew\.has\(g\) \? \[\] : \[\{ name: j\.name, key: mergedInto\.get\(g\) \?\? g \}\]/);
  });
  it('the bulk fetch takes the list\'s keys before any name match', () => {
    const bf = readFileSync('scripts/bulk-fetch.ts', 'utf8');
    // Since round seventy-nine (M) the list is parsed once and its keyless species' synonymy keys are added beside its keys.
    expect(bf.indexOf('downloadKeysOf(listed)')).toBeGreaterThan(0);
    expect(bf.indexOf('const listed = parseSpeciesList(text);')).toBeLessThan(bf.indexOf('downloadKeysOf(listed)'));
    expect(bf.indexOf('downloadKeysOf(listed)')).toBeLessThan(bf.indexOf('await matchName(f, name)'));
  });
});
